const DelimiterVersions = require('./delimiterVersions').DelimiterVersions;
// const VSConst = require('../../versioning/constants').VersioningConstants;
const { FILTER_ACCEPT, FILTER_END, FILTER_SKIP } = require('./tools');
// const VID_SEP = VSConst.VersionId.Separator;
// const Version = require('../../versioning/Version').Version;
// const { DbPrefixes } = VSConst;

// TODO: find an acceptable timeout value.
const DELIMITER_TIMEOUT_MS = 10 * 1000; // 10s
const TRIM_METADATA_MIN_BLOB_SIZE = 10000;

/**
 * Handle object listing with parameters. This extends the base class Delimiter
 * to return the raw non-current versions objects.
 */
class DelimiterNonCurrent extends DelimiterVersions {
    /**
     * Delimiter listing of non-current versions.
     * @param {Object}  parameters                  - listing parameters
     * @param {String}  parameters.versionIdMarker  - version id marker
     * @param {String}  parameters.beforeDate       - limit the response to keys with stale date older than beforeDate
     * “stale date” is the date on when a version becomes non-current.
     * @param {String}  parameters.keyMarker        - key marker
     * @param {RequestLogger} logger                - The logger of the request
     * @param {String} [vFormat]                    - versioning key format
     */
    constructor(parameters, logger, vFormat) {
        super(parameters, logger, vFormat);

        this.versionIdMarker = parameters.versionIdMarker;
        this.beforeDate = parameters.beforeDate;
        this.keyMarker = parameters.keyMarker;
        this.excludedDataStoreName = parameters.excludedDataStoreName;
        this.NextKeyMarker = null;

        this.skipping = this.skippingV1;
        this.genMDParams = this.genMDParamsV1;

        // internal state
        this.staleDate = null;

        // used for monitoring
        this.evaluatedKeys = 0;
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
            // if (_versionId === this.versionIdMarker) {
            //     // nothing left to skip, so return ACCEPT, but don't add this version
            //     return FILTER_ACCEPT;
            // }
        }
        this.setState({
            id: 1 /* NotSkipping */,
        });
        return this.handleKey(key, value);
    }

    /**
     * NOTE: Each version of a specific key is sorted from the latest to the oldest
     * thanks to the way version ids are generated.
     * DESCRIPTION: For a given key, the latest version is skipped since it represents the current version or
     * the last version of the previous truncated listing.
     * The current last-modified date is kept in memory and used as a "stale date" for the following version.
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
     *  @return {number}      - indicates if iteration should continue
     */
    addContents(key, versionId, value) {
        if (this._reachedMaxKeys()) {
            return FILTER_END;
        }

        if (this.start && Date.now() - this.start > DELIMITER_TIMEOUT_MS) {
            this.IsTruncated = true;
            this.logger.info('listing stopped after expected internal timeout',
                {
                    timeoutMs: DELIMITER_TIMEOUT_MS,
                    evaluatedKeys: this.evaluatedKeys,
                });
            return FILTER_END;
        }
        ++this.evaluatedKeys;

        this.NextKeyMarker = key;
        this.NextVersionIdMarker = versionId;

        // The master key serves two purposes:
        // - It retrieves the expiration date for the previous version that is no longer current.
        // - It excludes the current version from the list.
        const isMasterKey = this.masterKey === key && this.masterVersionId === versionId;
        if (isMasterKey) {
            this.staleDate = this.getLastModified(value);
            return FILTER_ACCEPT;
        }

        // const isCurrentVersion = this.masterKey === key && this.masterVersionId === versionId;
        // if (isCurrentVersion) {
        //     // filter out the master version
        //     return FILTER_ACCEPT;
        // }

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

        return FILTER_ACCEPT;
    }

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
        const result = {
            Contents: this.Contents,
            IsTruncated: this.IsTruncated,
        };

        if (this.IsTruncated) {
            result.NextKeyMarker = this.NextKeyMarker;
            result.NextVersionIdMarker = this.NextVersionIdMarker;
        }

        return result;
    }
}
module.exports = { DelimiterNonCurrent };
