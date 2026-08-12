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
            this.logger.warn('could not parse Object Metadata while listing', {
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
            this.logger.info('listing stopped due to reaching the maximum scanned entries limit', {
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
     * Move the resume marker forward when the listing scans a PHD master key.
     *
     * BACKGROUND
     * A PHD master is a placeholder. Metadata writes it into the master key
     * when the current version of an object is deleted. A repair job later
     * replaces it with the newest surviving version. A "dangling" PHD is one
     * the repair never fixed.
     *
     * THE BUG THIS FIXES
     * This listing stops after maxScannedLifecycleListingEntries entries and
     * returns a marker so the next call can resume. Only the addKey() paths
     * set that marker (addVersion, or addCommonPrefix when a delimiter is
     * used), and a PHD master never reaches either. So a run of dangling PHDs
     * longer than the scan limit spent the whole budget without ever setting
     * a marker. The listing returned "truncated" with no marker, the next
     * call started from the same place, and nothing beyond the PHDs was ever
     * expired.
     *
     *   scan limit 3, six dangling PHDs in a row:
     *     call 1: scans phd-1, phd-2, phd-3 -> truncated, no NextKeyMarker
     *     call 2: same request -> same result
     *     call 3: same request -> same result    (forever)
     *
     * THE FIX
     * Set the marker here too. Every call now moves forward:
     *
     *     call 1: phd-1, phd-2, phd-3 -> truncated, NextKeyMarker=phd-2
     *     call 2: phd-3, phd-4, phd-5 -> truncated, NextKeyMarker=phd-4
     *     call 3: phd-5, phd-6        -> done
     *
     * WHY THE MARKER POINTS AT THE PREVIOUS PHD, NOT THE ONE JUST SCANNED
     * A marker that carries a key but no version id means "I am done with this
     * key, skip it completely". genMDParamsV0() turns it into the range
     * `gt: <key>\x01`. Version keys look like `<key>\x00<versionId>`, and 0x00
     * sorts below 0x01, so that range starts past every version of the key.
     *
     * The listing is not done with the PHD it just scanned. That PHD may still
     * have surviving versions below it, and NCVE has to see them. If the marker
     * pointed at it, the next call would skip those versions, and NCVE would
     * never expire them.
     *
     * So the marker points at the PREVIOUS PHD, which the listing has finished
     * with. This costs one re-scanned entry per call and loses nothing. It is
     * the same rule as prevKeyName in DelimiterOrphanDeleteMarker.
     *
     * WHAT THIS METHOD MUST NOT TOUCH
     * It changes the marker and nothing else. It leaves prevKey and staleDate
     * alone, on purpose.
     *
     * addVersion() tells current from noncurrent by position: the first entry
     * it sees for a key is the current version, and every later entry for that
     * same key is noncurrent. A PHD master never reaches addVersion(), so the
     * first entry it sees under `apple` is `apple\0v1`, the newest surviving
     * version, the one the repair will promote back to master.
     *
     *   apple (PHD)  -> marker moves, prevKey untouched
     *   apple\0v1    -> first entry seen for apple -> current, not listed
     *   apple\0v2    -> same key again -> noncurrent -> listed, staleDate = v1
     *
     * (`apple\0v1` is not dropped as the master copy the way a normal master
     * would be: a PHD gets its versionId at delete time, and that id matches no
     * version key.)
     *
     * If this method set prevKey = 'apple', addVersion() would see `apple\0v1`
     * as a repeat of a key it already knows, call it noncurrent, and list it.
     * NCVE would then delete the exact version the repair needs to promote.
     * That is data loss.
     *
     *  @param {String} key   - The PHD master key
     *  @return {number} - filter return value
     */
    handlePHDMaster(key) {
        // Only move the marker forward. The range is sorted, so comparing
        // prevPHDKey against nextKeyMarker asks which moved the position more
        // recently: a PHD, or a listed key. prevPHDKey is never reset, so once
        // a listed key has passed it, using it would rewind the marker and
        // re-list versions the previous call already returned. The `|| ''`
        // covers the start of a page, where nextKeyMarker is still undefined
        // and would compare false against every key.
        if (this.prevPHDKey !== undefined && this.prevPHDKey > (this.nextKeyMarker || '')) {
            this.nextKeyMarker = this.prevPHDKey;
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
