const { DelimiterVersions } = require('./delimiterVersions');
const { FILTER_END, FILTER_SKIP, FILTER_ACCEPT } = require('./tools');

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
     * @param {Number} parameters.maxScannedLifecycleListingEntries - max number of entries to be scanned
     * @param {String} parameters.excludedDataStoreName - exclude dataStoreName matches from the versions
     * @param {RequestLogger} logger                - The logger of the request
     * @param {String} [vFormat]                    - versioning key format
     */
    constructor(parameters, logger, vFormat) {
        super(parameters, logger, vFormat);

        this.beforeDate = parameters.beforeDate;
        this.excludedDataStoreName = parameters.excludedDataStoreName;
        this.maxScannedLifecycleListingEntries = parameters.maxScannedLifecycleListingEntries;

        // internal state
        this.prevKey = null;
        this.staleDate = null;
        // Last PHD master key scanned. handlePHDMaster keeps the resume marker one
        // PHD key behind. See there for why.
        this.prevPHDKey = undefined;

        this.scannedKeys = 0;
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
    keyHandler_SkippingVersions(key, versionId, value) {
        if (key === this.keyMarker) {
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
        return this.handleKey(key, versionId, value);
    }

    filter(obj) {
        if (this.maxScannedLifecycleListingEntries && this.scannedKeys >= this.maxScannedLifecycleListingEntries) {
            this.IsTruncated = true;
            this.logger.info('listing stopped due to reaching the maximum scanned entries limit',
                {
                    maxScannedLifecycleListingEntries: this.maxScannedLifecycleListingEntries,
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
    addVersion(key, versionId, value) {
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
                        this.Versions.push({ key, value: s });
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
     * Advance the resume marker over a scanned PHD master key.
     *
     * THE BUG IT FIXES: a run of dangling PHD masters longer than
     * maxScannedLifecycleListingEntries truncated the listing with no
     * NextKeyMarker. The next page then repeated the first page, and the
     * listing never moved forward.
     *
     * THE RULE: the marker moves to the PREVIOUS PHD key. It never points at
     * the key being scanned. A marker on the scanned key gives the next listing
     * a key-marker with no version-id-marker. S3 reads that as "start after
     * every version of this key". The listing would then skip the versions of a
     * PHD master that still has some, and NCVE would never see them. One key
     * behind costs one re-scanned entry per truncation, and skips nothing.
     *
     * Example, scan limit 3, dangling PHD masters phd-1 ... phd-6:
     *   page 1: phd-1, phd-2, phd-3 -> truncated, NextKeyMarker=phd-2
     *   page 2: phd-3, phd-4, phd-5 -> truncated, NextKeyMarker=phd-4
     *   page 3: phd-5, phd-6        -> done
     *
     * THE FALLBACK: on the first PHD of a listing there is no previous PHD key,
     * and no version key has set a marker yet. The rule above would leave the
     * marker empty, and the listing would loop again. The marker points at
     * `key` instead. This one key loses its versions for this pass, and the
     * listing moves forward.
     *
     * WHAT IT DOES NOT TOUCH: the method updates the marker only. It leaves
     * prevKey and staleDate alone. The next version key scanned is the newest
     * surviving version under the PHD, and the repair promotes it back to
     * master. Untouched state keeps that version classified as current, so the
     * listing never returns it as an expirable noncurrent version.
     *
     * Example, a PHD master with two surviving versions:
     *   apple (PHD)  -> marker stays behind apple, prevKey untouched
     *   apple\0v1    -> first version seen for apple -> current, protected
     *   apple\0v2    -> noncurrent -> expirable, staleDate = v1's date
     *
     * apple\0v1 is not deduplicated as the master copy: a PHD gets its
     * versionId at delete time, and that id matches no version key. Setting
     * prevKey='apple' here would classify apple\0v1 as noncurrent. NCVE would
     * then expire the very version the repair needs to promote: data loss.
     *
     *  @param {String} key   - The PHD master key
     *  @param {String} versionId - always undefined for a master key
     *  @param {String} value - The PHD placeholder value
     *  @return {number} - filter return value
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    handlePHDMaster(key, versionId, value) {
        if (this.prevPHDKey !== undefined && this.prevPHDKey > (this.nextKeyMarker || '')) {
            // Move the marker forward only. prevPHDKey can hold a key from an
            // earlier run of PHDs that the listing already passed.
            this.nextKeyMarker = this.prevPHDKey;
            this.nextVersionIdMarker = undefined;
        } else if (!this.nextKeyMarker) {
            // No previous PHD, and no marker yet. Skip this key's versions
            // rather than leave the listing unable to move forward.
            this.nextKeyMarker = key;
            this.nextVersionIdMarker = undefined;
        }
        this.prevPHDKey = key;
        return FILTER_ACCEPT;
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
