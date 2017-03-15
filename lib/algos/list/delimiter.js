'use strict'; // eslint-disable-line strict

/**
 * Used for advancing the last character of a string for setting upper/lower
 * bounds
 * e.g. _setCharAt('demo1') results in 'demo2',
 * _setCharAt('scality') results in 'scalitz'
 * @param {String} str - string to be advanced
 * @return {String} - modified string
 */
function _setCharAt(str) {
    let chr = str.charCodeAt(str.length - 1);
    chr = String.fromCharCode(chr + 1);
    return str.substr(0, str.length - 1) + chr;
}

/**
 * Find the next delimiter in the path
 *
 * @param {string} key             - path of the object
 * @param {string} delimiter       - string to find
 * @param {number} index           - index to start at
 * @return {number} delimiterIndex - returns -1 in case no delimiter is found
 */
function nextDelimiter(key, delimiter, index) {
    return key.indexOf(delimiter, index);
}

/**
 * Find the common prefix in the path
 *
 * @param {String} key            - path of the object
 * @param {String} delimiter      - separator
 * @param {Number} delimiterIndex - 'folder' index in the path
 * @return {String}               - CommonPrefix
 */
function getCommonPrefix(key, delimiter, delimiterIndex) {
    return key.substring(0, delimiterIndex + delimiter.length);
}

/**
 * Handle object listing with parameters
 *
 * @prop {String[]} CommonPrefixes     - 'folders' defined by the delimiter
 * @prop {String[]} Contents           - 'files' to list
 * @prop {Boolean} IsTruncated         - truncated listing flag
 * @prop {String|undefined} NextMarker - marker per amazon format
 * @prop {Number} keys                 - count of listed keys
 * @prop {String|undefined} delimiter  - separator per amazon format
 * @prop {String|undefined} prefix     - prefix per amazon format
 * @prop {Number} maxKeys              - number of keys to list
 */
class Delimiter {
    /**
     * Create a new Delimiter instance
     * @constructor
     * @param {Object} parameters           - listing parameters
     * @param {String} parameters.delimiter - delimiter per amazon format
     * @param {String} parameters.start     - prefix per amazon format
     * @param {String} [parameters.gt]      - NextMarker per amazon format
     * @param {Number} [parameters.maxKeys] - number of keys to list
     */
    constructor(parameters) {
        this._listingParams = {
            limit: parameters.limit,
            gte: parameters.gte,
            lte: parameters.lte,
            gt: parameters.gt,
            lt: parameters.lt,
            start: parameters.start,
            keys: parameters.keys,
            values: parameters.values,
        };
        if (parameters.marker) {
            this._listingParams.gt = parameters.marker;
        }
        if (parameters.prefix) {
            this._listingParams.start = parameters.prefix;
            this._listingParams.lt = _setCharAt(parameters.prefix);
        }
        this.CommonPrefixes = [];
        this.Contents = [];
        this.IsTruncated = false;
        this.NextMarker = this._listingParams.gt;
        this.keys = 0;

        this.delimiter = parameters.delimiter;
        this.prefix = this._listingParams.start;
        this.maxKeys = parameters.maxKeys || 1000;
        if (this.delimiter !== undefined &&
            this.NextMarker !== undefined &&
            this.NextMarker.startsWith(this.prefix || '')) {
            const nextDelimiterIndex =
                      this.NextMarker.indexOf(this.delimiter,
                                              this.prefix
                                              ? this.prefix.length
                                              : 0);
            this.NextMarker =
                this.NextMarker.slice(0, nextDelimiterIndex +
                                      this.delimiter.length);
        }
    }

    getListingParams() {
        return this._listingParams;
    }

    /**
     * check if the max keys count has been reached and set the
     * final state of the result if it is the case
     * @return {Boolean} - indicates if the iteration has to stop
     */
    _reachedMaxKeys() {
        if (this.keys >= this.maxKeys) {
            // In cases of maxKeys <= 0 -> IsTruncated = false
            this.IsTruncated = this.maxKeys > 0;
            return true;
        }
        return false;
    }

    /**
     *  Add a (key, value) tuple to the listing
     *  Set the NextMarker to the current key
     *  Increment the keys counter
     *  @param {String} key   - The key to add
     *  @param {String} value - The value of the key
     *  @return {Boolean}     - indicates if iteration should continue
     */
    addContents(key, value) {
        if (this._reachedMaxKeys()) {
            return 0;
        }
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
        return 1;
    }

    /**
     *  Filter to apply on each iteration, based on:
     *  - prefix
     *  - delimiter
     *  - maxKeys
     *  The marker is being handled directly by levelDB
     *  @param {Object} obj       - The key and value of the element
     *  @param {String} obj.key   - The key of the element
     *  @param {String} obj.value - The value of the element
     *  @return {Boolean}         - indicates if iteration should continue
     */
    filter(obj) {
        const key = obj.key;
        const value = obj.value;
        if ((this.prefix && !key.startsWith(this.prefix))
            || (typeof this.NextMarker === 'string' &&
                key <= this.NextMarker)) {
            return 1;
        }
        if (this.delimiter) {
            const baseIndex = this.prefix ? this.prefix.length : 0;
            const delimiterIndex = nextDelimiter(key,
                                                 this.delimiter,
                                                 baseIndex);
            if (delimiterIndex === -1) {
                return this.addContents(key, value);
            }
            return this.addCommonPrefix(key, delimiterIndex);
        }
        return this.addContents(key, value);
    }

    /**
     * Add a Common Prefix in the list
     * @param {String} key   - object name
     * @param {Number} index - after prefix starting point
     * @return {Boolean}     - indicates if iteration should continue
     */
    addCommonPrefix(key, index) {
        const commonPrefix = getCommonPrefix(key, this.delimiter, index);
        if (this.CommonPrefixes.indexOf(commonPrefix) === -1
                && this.NextMarker !== commonPrefix) {
            if (this._reachedMaxKeys()) {
                return 0;
            }
            this.CommonPrefixes.push(commonPrefix);
            this.NextMarker = commonPrefix;
            ++this.keys;
        }
        return 1;
    }

    /**
     *  Return an object containing all mandatory fields to use once the
     *  iteration is done, doesn't show a NextMarker field if the output
     *  isn't truncated
     *  @return {Object} - following amazon format
     */
    result() {
        /* NextMarker is only provided when delimiter is used.
         * specified in v1 listing documentation
         * http://docs.aws.amazon.com/AmazonS3/latest/API/RESTBucketGET.html
         */
        return {
            CommonPrefixes: this.CommonPrefixes,
            Contents: this.Contents,
            IsTruncated: this.IsTruncated,
            NextMarker: (this.IsTruncated && this.delimiter)
                ? this.NextMarker
                : undefined,
            Delimiter: this.delimiter,
        };
    }
}

module.exports = { Delimiter };
