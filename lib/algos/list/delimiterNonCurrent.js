const { DelimiterVersions } = require('./delimiterVersions');
const { FILTER_END, FILTER_SKIP } = require('./tools');

// TODO: find an acceptable timeout value.
const DELIMITER_TIMEOUT_MS = 10 * 1000; // 10s
const TRIM_METADATA_MIN_BLOB_SIZE = 10000;

/**
 * Handle object listing with parameters. This extends the base class DelimiterVersions
 * to return the raw non-current versions objects.
 */
class DelimiterNonCurrent extends DelimiterVersions {
    /**
     * Delimiter listing of non-current versions.
     * @param {Object}  parameters                  - listing parameters
     * @param {String}  parameters.keyMarker        - key marker
     * @param {String}  parameters.versionIdMarker  - version id marker
     * @param {String}  parameters.beforeDate       - limit the response to keys with stale date older than beforeDate.
     * “stale date” is the date on when a version becomes non-current.
     *  @param {String} parameters.excludedDataStoreName - exclude dataStoreName matches from the versions
     * @param {RequestLogger} logger                - The logger of the request
     * @param {String} [vFormat]                    - versioning key format
     */
    constructor(parameters, logger, vFormat) {
        super(parameters, logger, vFormat);

        this.beforeDate = parameters.beforeDate;
        this.excludedDataStoreName = parameters.excludedDataStoreName;

        // internal state
        this.prevKey = null;
        this.staleDate = null;

        // used for monitoring
        this.scannedKeys = 0;
    }

    genMDParamsV0() {
        // The genMDParamsV1() function calls genMDParamsV0()in the DelimiterVersions class,
        // making sure that this.start is set for both v0 and v1 bucket formats
        this.start = Date.now();
        return super.genMDParamsV0();
    }

    getLastModified(value) {
        let lastModified;
        try {
            const v = JSON.parse(value);
            lastModified = v['last-modified'];
        } catch (e) {
            this.logger.warn('could not parse Object Metadata while listing',
                {
                    method: 'getLastModified',
                    err: e.toString(),
                });
        }
        return lastModified;
    }

    // Overwrite keyHandler_SkippingVersions to include the last version from the previous listing.
    // The creation (last-modified) date of this version will be the stale date for the following version.
    // eslint-disable-next-line camelcase
    keyHandler_SkippingVersions(key, value) {
        const { key: nonversionedKey, versionId } = this.parseKey(key);
        if (nonversionedKey === this.keyMarker) {
            // since the nonversioned key equals the marker, there is
            // necessarily a versionId in this key
            const _versionId = versionId;
            if (_versionId < this.versionIdMarker) {
                // skip all versions until marker
                return FILTER_SKIP;
            }
        }
        this.setState({
            id: 1 /* NotSkipping */,
        });
        return this.handleKey(key, value);
    }

    filter(obj) {
        if (this.start && Date.now() - this.start > DELIMITER_TIMEOUT_MS) {
            this.IsTruncated = true;
            this.logger.info('listing stopped after expected internal timeout',
                {
                    timeoutMs: DELIMITER_TIMEOUT_MS,
                    scannedKeys: this.scannedKeys,
                });
            return FILTER_END;
        }
        ++this.scannedKeys;
        return super.filter(obj);
    }

    /**
     * NOTE: Each version of a specific key is sorted from the latest to the oldest
     * thanks to the way version ids are generated.
     * DESCRIPTION: Skip the version if it represents the master key, but keep its last-modified date in memory,
     * which will be the stale date of the following version.
     * The following version is pushed only:
     * - if the "stale date" (picked up from the previous version) is available (JSON.parse has not failed),
     * - if "beforeDate" is not specified or if specified and the "stale date" is older.
     * - if "excludedDataStoreName" is not specified or if specified and the data store name is different
     * The in-memory "stale date" is then updated with the version's last-modified date to be used for
     * the following version.
     * The process stops and returns the available results if either:
     * - no more metadata key is left to be processed
     * - the listing reaches the maximum number of key to be returned
     * - the internal timeout is reached
     *  @param {String} key   - The key to add
     *  @param {String} versionId - The version id
     *  @param {String} value - The value of the key
     *  @return {undefined}
     */
    addContents(key, versionId, value) {
        this.nextKeyMarker = key;
        this.nextVersionIdMarker = versionId;

        // Skip the version if it represents the non-current version, but keep its last-modified date,
        // which will be the stale date of the following version.
        const isCurrentVersion = key !== this.prevKey;
        if (isCurrentVersion) {
            this.staleDate = this.getLastModified(value);
            this.prevKey = key;
            return;
        }

        // The following version is pushed only:
        // - if the "stale date" (picked up from the previous version) is available (JSON.parse has not failed),
        // - if "beforeDate" is not specified or if specified and the "stale date" is older.
        // - if "excludedDataStoreName" is not specified or if specified and the data store name is different
        let lastModified;
        if (this.staleDate && (!this.beforeDate || this.staleDate < this.beforeDate)) {
            const parsedValue = this._parse(value);
            // if parsing fails, skip the key.
            if (parsedValue) {
                const dataStoreName = parsedValue.dataStoreName;
                lastModified = parsedValue['last-modified'];
                if (!this.excludedDataStoreName || dataStoreName !== this.excludedDataStoreName) {
                    const s = this._stringify(parsedValue, this.staleDate);
                    // check that _stringify succeeds to only push objects with a defined staleDate.
                    if (s) {
                        this.Contents.push({ key, value: s });
                        ++this.keys;
                    }
                }
            }
        }

        // The in-memory "stale date" is then updated with the version's last-modified date to be used for
        // the following version.
        this.staleDate = lastModified || this.getLastModified(value);

        return;
    }

    /**
     * Parses the stringified entry's value and remove the location property if too large.
     * @param {string} s - sringified value
     * @return {object} p - undefined if parsing fails, otherwise it contains the parsed value.
     */
    _parse(s) {
        let p;
        try {
            p = JSON.parse(s);
            if (s.length >= TRIM_METADATA_MIN_BLOB_SIZE) {
                delete p.location;
            }
        } catch (e) {
            this.logger.warn('Could not parse Object Metadata while listing', {
                method: 'DelimiterNonCurrent._parse',
                err: e.toString(),
            });
        }
        return p;
    }

    _stringify(parsedMD, staleDate) {
        const p = parsedMD;
        let s = undefined;
        p.staleDate = staleDate;
        try {
            s = JSON.stringify(p);
        } catch (e) {
            this.logger.warn('could not stringify Object Metadata while listing', {
                method: 'DelimiterNonCurrent._stringify',
                err: e.toString(),
            });
        }
        return s;
    }

    result() {
        const { Versions, IsTruncated, NextKeyMarker, NextVersionIdMarker } = super.result();

        const result = {
            Contents: Versions,
            IsTruncated,
        };

        if (NextKeyMarker) {
            result.NextKeyMarker = NextKeyMarker;
        }

        if (NextVersionIdMarker) {
            result.NextVersionIdMarker = NextVersionIdMarker;
        }

        return result;
    }
}
module.exports = { DelimiterNonCurrent };
