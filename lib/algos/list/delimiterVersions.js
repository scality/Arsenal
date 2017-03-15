'use strict'; // eslint-disable-line strict

const Delimiter = require('./delimiter').Delimiter;
const VSUtils = require('../../versioning/utils').VersioningUtils;

/**
 * Extended delimiter class for versioning.
 */
class DelimiterVersions extends Delimiter {
    /**
     *  Constructor of the extension
     *  Init and check parameters
     *  @param {Object} parameters - parameters sent to DBD
     *  @param {RequestLogger} logger - werelogs request logger
     *  @param {object} latestVersions - latest versions of some keys
     *  @return {undefined}
     */
    constructor(parameters, logger, latestVersions) {
        super(parameters, logger);
        this.NextVersionMarker = undefined; // next version marker
        this.latestVersions = undefined; // final list of the latest versions
        this._latestVersions = latestVersions; // reserved for caching
    }

    /**
     * Overriding the base function to not process the metadata entry here,
     * leaving the job of extracting object's attributes to S3.
     *
     * @param {string} key - key of the entry
     * @param {string} value - value of the entry
     * @return {undefined}
     */
    addContents(key, value) {
        const components =
            VSUtils.getObjectNameAndVersionIdFromVersionKey(key);
        const objectName = components.objectName;
        const versionId = components.versionId;
        this.Contents.push({
            key: objectName,
            value,
        });
        this.NextMarker = objectName;
        this.NextVersionMarker = versionId;
        ++this.keys;
        // only include the latest versions of the keys in the resulting list
        // this is not actually used now, it's reserved for caching in future
        if (this._latestVersions) {
            this.latestVersions[objectName] = this._latestVersions[objectName];
        }
    }

    /**
     * Overriding the base function to only do delimitering, not parsing value.
     *
     * @param {object} obj - the metadata entry in the form of { key, value }
     * @return {boolean} - continue filtering or return the formatted list
     */
    filter(obj) {
        // Check first in case of maxkeys <= 0
        if (this.keys >= this.maxKeys) {
            // In cases of maxKeys <= 0 => IsTruncated = false
            this.IsTruncated = this.maxKeys > 0;
            return 0;
        }
        // <versioning>
        const key = VSUtils.getObjectNameFromVersionKey(obj.key);
        // </versioning>
        if (this.delimiter) {
            const commonPrefixIndex =
                key.indexOf(this.delimiter, this.searchStart);
            if (commonPrefixIndex === -1) {
                this.addContents(obj.key, obj.value);
            } else {
                this.addCommonPrefix(key.substring(0,
                                        commonPrefixIndex + this.delimLen));
            }
        } else {
            this.addContents(obj.key, obj.value);
        }
        return 1;
    }

    /**
     *  This function format the result to return
     *  @return {Object} - The result.
     */
    result() {
        // Unset NextMarker when not truncated
        return {
            CommonPrefixes: this.CommonPrefixes,
            Contents: this.Contents,
            // <versioning>
            LatestVersions: this.latestVersions,
            // </versioning>
            IsTruncated: this.IsTruncated,
            NextMarker: this.IsTruncated ? this.NextMarker : undefined,
            NextVersionMarker: this.IsTruncated ?
                this.NextVersionMarker : undefined,
            Delimiter: this.delimiter,
        };
    }
}

module.exports = {
    DelimiterVersions,
};
