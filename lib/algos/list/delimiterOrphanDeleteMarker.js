const DelimiterVersions = require('./delimiterVersions').DelimiterVersions;
const { FILTER_END } = require('./tools');
const TRIM_METADATA_MIN_BLOB_SIZE = 10000;
/**
 * Handle object listing with parameters. This extends the base class DelimiterVersions
 * to return the orphan delete markers. Orphan delete markers are also
 * refered as expired object delete marker.
 * They are delete marker with zero noncurrent versions.
 */
class DelimiterOrphanDeleteMarker extends DelimiterVersions {
    /**
     * Delimiter listing of orphan delete markers.
     * @param {Object}  parameters            - listing parameters
     * @param {String}  parameters.beforeDate - limit the response to keys older than beforeDate
     * @param {Number} parameters.maxScannedLifecycleListingEntries - max number of entries to be scanned
     * @param {RequestLogger} logger          - The logger of the request
     * @param {String} [vFormat]              - versioning key format
     */
    constructor(parameters, logger, vFormat) {
        const {
            marker,
            maxKeys,
            prefix,
            beforeDate,
            maxScannedLifecycleListingEntries,
        } = parameters;

        const versionParams = {
            // The orphan delete marker logic uses the term 'marker' instead of 'keyMarker',
            // as the latter could suggest the presence of a 'versionIdMarker'.
            keyMarker: marker,
            maxKeys,
            prefix,
        };
        super(versionParams, logger, vFormat);

        this.maxScannedLifecycleListingEntries = maxScannedLifecycleListingEntries;
        this.beforeDate = beforeDate;
        this.keyName = null;
        this.value = null;
        this.scannedKeys = 0;
    }

    _reachedMaxKeys() {
        if (this.keys >= this.maxKeys) {
            return true;
        }
        return false;
    }

    _addOrphan() {
        const parsedValue = this._parse(this.value);
        // if parsing fails, skip the key.
        if (parsedValue) {
            const lastModified = parsedValue['last-modified'];
            const isDeleteMarker = parsedValue.isDeleteMarker;
            // We then check if the orphan version is a delete marker and if it is older than the "beforeDate"
            if ((!this.beforeDate || (lastModified && lastModified < this.beforeDate)) && isDeleteMarker) {
                // Prefer returning an untrimmed data rather than stopping the service in case of parsing failure.
                const s = this._stringify(parsedValue) || this.value;
                this.Contents.push({ key: this.keyName, value: s });
                this.nextKeyMarker = this.keyName;
                ++this.keys;
            }
        }
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
                method: 'DelimiterOrphanDeleteMarker._parse',
                err: e.toString(),
            });
        }
        return p;
    }

    _stringify(value) {
        const p = value;
        let s = undefined;
        try {
            s = JSON.stringify(p);
        } catch (e) {
            this.logger.warn('could not stringify Object Metadata while listing',
                {
                    method: 'DelimiterOrphanDeleteMarker._stringify',
                    err: e.toString(),
                });
        }
        return s;
    }
    /**
     * The purpose of _isMaxScannedEntriesReached is to restrict the number of scanned entries,
     * thus controlling resource overhead (CPU...).
     * @return {boolean} isMaxScannedEntriesReached - true if the maximum limit on the number
     * of entries scanned has been reached, false otherwise.
    */
    _isMaxScannedEntriesReached() {
        return this.maxScannedLifecycleListingEntries && this.scannedKeys >= this.maxScannedLifecycleListingEntries;
    }

    filter(obj) {
        if (this._isMaxScannedEntriesReached()) {
            this.nextKeyMarker = this.keyName;
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
     * DESCRIPTION: For a given key, the latest version is kept in memory since it is the current version.
     * If the following version reference a new key, it means that the previous one was an orphan version.
     * We then check if the orphan version is a delete marker and if it is older than the "beforeDate"
     * The process stops and returns the available results if either:
     * - no more metadata key is left to be processed
     * - the listing reaches the maximum number of key to be returned
     * - the internal timeout is reached
     * NOTE: we cannot leverage MongoDB to list keys older than "beforeDate"
     * because then we will not be able to assess its orphanage.
     *  @param {String} key   - The object key.
     * @param {String} versionId   - The object version id.
     *  @param {String} value - The value of the key
     *  @return {undefined}
     */
    addContents(key, versionId, value) {
        // For a given key, the youngest version is kept in memory since it represents the current version.
        if (key !== this.keyName) {
            // If this.value is defined, it means that <this.keyName, this.value> pair is "allowed" to be an orphan.
            if (this.value) {
                this._addOrphan();
            }
            this.keyName = key;
            this.value = value;

            return;
        }

        this.keyName = key;
        this.value = null;

        return;
    }

    result() {
        // Only check for remaining last orphan delete marker if the listing is not interrupted.
        // This will help avoid false positives.
        if (!this._isMaxScannedEntriesReached()) {
            // The following check makes sure the last orphan delete marker is not forgotten.
            if (this.keys < this.maxKeys) {
                if (this.value) {
                    this._addOrphan();
                }
            // The following make sure that if makeKeys is reached, isTruncated is set to true.
            // We moved the "isTruncated" from _reachedMaxKeys to make sure we take into account the last entity
            // if listing is truncated right before the last entity and the last entity is a orphan delete marker.
            } else {
                this.IsTruncated = this.maxKeys > 0;
            }
        }

        const result = {
            Contents: this.Contents,
            IsTruncated: this.IsTruncated,
        };

        if (this.IsTruncated) {
            result.NextMarker = this.nextKeyMarker;
        }

        return result;
    }
}

module.exports = { DelimiterOrphanDeleteMarker };
