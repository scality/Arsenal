'use strict'; // eslint-disable-line strict

const Delimiter = require('./delimiter').Delimiter;
const VSUtils = require('../../versioning/utils').VersioningUtils;

/**
 * Extended delimiter class for versioning.
 */
class DelimiterMaster extends Delimiter {
    /**
     * Overriding the base function to extract the versionId of the entry.
     *
     * @param {string} key - the key of the entry
     * @param {object} value - the value of the entry
     * @return {undefined}
     */
    addContents(key, value) {
        this.Contents.push({
            key,
            value: {
                Size: value['content-length'],
                ETag: value['content-md5'],
                LastModified: value['last-modified'],
                // <versioning>
                VersionId: VSUtils.getts(value),
                // </versioning>
                Owner: {
                    DisplayName: value['owner-display-name'],
                    ID: value['owner-id'],
                },
                StorageClass: value['x-amz-storage-class'],
                Initiated: value.initiated,
                Initiator: value.initiator,
                EventualStorageBucket: value.eventualStorageBucket,
                partLocations: value.partLocations,
                creationDate: value.creationDate,
            },
        });
        this.NextMarker = key;
        ++this.keys;
    }

    /**
     * Overriding the filter function that formats the
     * listing results based on the listing algorithm.
     *
     * @param {object} obj - metadata entry in the form of { key, value }
     * @return {boolean} - continue filtering or return the formatted list
     */
    filter(obj) {
        // Check first in case of maxkeys <= 0
        if (this.keys >= this.maxKeys) {
            // In cases of maxKeys <= 0 => IsTruncated = false
            this.IsTruncated = this.maxKeys > 0;
            return false;
        }
        // <versioning>
        const value = VSUtils.decodeVersion(obj.value);
        // ignore it if the master version is a delete marker
        if (VSUtils.isDeleteMarker(value)) {
            return true;
        }
        // use the original object name for delimitering to work correctly
        const key = VSUtils.getObjectNameFromMasterKey(obj.key);
        // </versioning>
        if (this.delimiter) {
            const commonPrefixIndex =
                key.indexOf(this.delimiter, this.searchStart);
            if (commonPrefixIndex === -1) {
                this.addContents(key, value);
            } else {
                this.addCommonPrefix(
                    key.substring(0, commonPrefixIndex + this.delimLen));
            }
        } else {
            this.addContents(key, value);
        }
        return true;
    }
}

module.exports = {
    DelimiterMaster,
};
