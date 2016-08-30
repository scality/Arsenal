'use strict'; // eslint-disable-line strict

const checkLimit = require('./tools').checkLimit;
const DEFAULT_MAX_KEYS = 1000;
/**
 *  Class for the delimiter extension
 */
class Delimiter {
    /**
     *  Constructor of the extension
     *  Init and check parameters
     *  @param {Object} parameters - parameters sent to DBD
     *  @param {RequestLogger} logger - werelogs request logger
     *  @return {undefined}
     */
    constructor(parameters, logger) {
        this.CommonPrefixes = [];
        this.Contents = [];
        this.IsTruncated = false;
        this.NextMarker = undefined;

        this.delimiter = parameters.delimiter;
        this.delimLen = this.delimiter ? this.delimiter.length : 0;
        this.searchStart = this._getStartIndex(parameters);
        this.prefix = parameters.start;
        this.maxKeys = checkLimit(parameters.maxKeys, DEFAULT_MAX_KEYS);

        this.logger = logger;
        this.keys = 0;
    }

    _getStartIndex(params) {
        if (params.gt) {
            return params.gt.length;
        } else if (params.start) {
            return params.start.length;
        }
        return 0;
    }

    /**
     *  This function add the element to the Contents
     *  Set the NextMarker to the current key
     *  Increment the keys counter
     *  @param {String} key - The key to add
     *  @param {String} value - The value of the key
     *  @return {undefined}
     */
    addContents(key, value) {
        const tmp = JSON.parse(value);
        this.Contents.push({
            key,
            value: {
                Size: tmp['content-length'],
                ETag: tmp['content-md5'],
                LastModified: tmp['last-modified'],
                Owner: {
                    DisplayName: tmp['owner-display-name'],
                    ID: tmp['owner-id'],
                },
                StorageClass: tmp['x-amz-storage-class'],
                Initiated: tmp.initiated,
                Initiator: tmp.initiator,
                EventualStorageBucket: tmp.eventualStorageBucket,
                partLocations: tmp.partLocations,
                creationDate: tmp.creationDate,
            },
        });
        this.NextMarker = key;
        ++this.keys;
    }

    /**
     *  This function add a common prefix to the CommonPrefixes
     *  Set the NextMarker to the current commonPrefix
     *  Increment the keys counter
     *  @param {String} commonPrefix - The commonPrefix to process
     *  @return {undefined}
     */
    addCommonPrefix(commonPrefix) {
        if (this.CommonPrefixes.indexOf(commonPrefix) === -1) {
            this.CommonPrefixes.push(commonPrefix);
            this.NextMarker = commonPrefix;
            ++this.keys;
        }
    }

    /**
     *  This function apply the filter to each element
     *  It's looking for the next delimiter
     *  if nextDelim === -1 can mean two things
     *       -> this.delimiter is not present in the key after the prefix
     *  else
     *       -> the key is `${this.prefix}${this.delimiter}${objName}`
     *  @param {Object} obj - The key and value of the element
     *  @param {String} obj.key - The key and value of the element
     *  @param {String} obj.value - The key and value of the element
     *  @return {Boolean} - True: Continue, False: Stop
     */
    filter(obj) {
        // Check first in case of maxkeys <= 0
        if (this.keys >= this.maxKeys) {
            // In cases of maxKeys <= 0 => IsTruncated = false
            this.IsTruncated = this.maxKeys > 0;
            return false;
        }
        const key = obj.key;
        const value = obj.value;
        if (this.prefix && !key.startsWith(this.prefix)) {
            return true;
        }
        if (this.delimiter) {
            const commonPrefixIndex =
                key.indexOf(this.delimiter, this.searchStart);
            if (commonPrefixIndex === -1) {
                this.addContents(key, value);
            } else {
                this.addCommonPrefix(key.substring(0,
                                        commonPrefixIndex + this.delimLen));
            }
        } else {
            this.addContents(key, value);
        }
        return true;
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
            IsTruncated: this.IsTruncated,
            NextMarker: this.IsTruncated ? this.NextMarker : undefined,
            Delimiter: this.delimiter,
        };
    }
}

module.exports = {
    Delimiter,
};
