'use strict'; // eslint-disable-line strict

const checkLimit = require('./tools').checkLimit;
const DEFAULT_MAX_KEYS = 1000;

function numberDefault(num, defaultNum) {
    const parsedNum = Number.parseInt(num, 10);
    return Number.isNaN(parsedNum) ? defaultNum : parsedNum;
}

function inc(str) {
    return str ? str.slice(0, str.length - 1)
        + String.fromCharCode(str.charCodeAt(str.length - 1) + 1) : str;
}

/**
 *  Class for the MultipartUploads extension
 */
class MultipartUploads {
    /**
     *  Constructor of the extension
     *  Init and check parameters
     *  @param {Object} params - The parameters you sent to DBD
     *  @param {RequestLogger} logger - The logger of the request
     *  @return {undefined}
     */
    constructor(params, logger) {
        this.CommonPrefixes = [];
        this.Uploads = [];
        this.IsTruncated = false;
        this.NextKeyMarker = '';
        this.NextUploadIdMarker = '';
        this.prefixLength = 0;
        this.queryPrefixLength = numberDefault(params.queryPrefixLength, 0);
        this.keys = 0;
        this.maxKeys = checkLimit(params.maxKeys, DEFAULT_MAX_KEYS);
        this.delimiter = params.delimiter;
        this.splitter = params.splitter;
        this.logger = logger;
        this._listingParams = {
            limit: params.limit,
            gte: params.gte,
            lte: params.lte,
            gt: params.gt,
            lt: params.lt,
            start: params.start,
            keys: params.keys,
            values: params.values,
        };
        if (params.keyMarker) {
            this._listingParams.gt = `overview${params.splitter}` +
                `${params.keyMarker}${params.splitter}`;
            if (params.uploadIdMarker) {
                this._listingParams.gt += `${params.uploadIdMarker}`;
            }
            this._listingParams.gt = inc(this._listingParams.gt);
        }
        if (params.prefix) {
            this._listingParams.start = params.prefix;
            this._listingParams.lt = inc(params.prefix);
        }
    }

    /**
     *  This function adds the elements to the Uploads
     *  Set the NextKeyMarker to the current key
     *  Increment the keys counter
     *  @param {String} value - The value of the key
     *  @return {undefined}
     */
    addUpload(value) {
        const tmp = JSON.parse(value);
        this.Uploads.push({
            key: tmp.key,
            value: {
                UploadId: tmp.uploadId,
                Initiator: {
                    ID: tmp.initiator.ID,
                    DisplayName: tmp.initiator.DisplayName,
                },
                Owner: {
                    ID: tmp['owner-id'],
                    DisplayName: tmp['owner-display-name'],
                },
                StorageClass: tmp['x-amz-storage-class'],
                Initiated: tmp.initiated,
            },
        });
        this.NextKeyMarker = tmp.key;
        this.NextUploadIdMarker = tmp.uploadId;
        ++this.keys;
    }

    getListingParams() {
        return this._listingParams;
    }

    /**
     *  This function adds a common prefix to the CommonPrefixes array
     *  Set the NextKeyMarker to the current commonPrefix
     *  Increment the keys counter
     *  @param {String} commonPrefix - The commonPrefix to add
     *  @return {undefined}
     */
    addCommonPrefix(commonPrefix) {
        if (this.CommonPrefixes.indexOf(commonPrefix) === -1) {
            this.CommonPrefixes.push(commonPrefix);
            this.NextKeyMarker = commonPrefix;
            ++this.keys;
        }
    }

    /**
     *  This function applies filter on each element
     *  @param {String} obj - The key and value of the element
     *  @return {Boolean} - True: Continue, False: Stop
     */
    filter(obj) {
        // Check first in case of maxkeys = 0
        if (this.keys >= this.maxKeys) {
            // In cases of maxKeys <= 0 => IsTruncated = false
            this.IsTruncated = this.maxKeys > 0;
            return 0;
        }
        const key = obj.key;
        const value = obj.value;
        if (this.delimiter) {
            const mpuPrefixSlice = `overview${this.splitter}`.length;
            const mpuKey = key.slice(mpuPrefixSlice);
            const commonPrefixIndex = mpuKey.indexOf(this.delimiter,
                this.queryPrefixLength);

            if (commonPrefixIndex === -1) {
                this.addUpload(value);
            } else {
                this.addCommonPrefix(mpuKey.substring(0,
                    commonPrefixIndex + this.delimiter.length));
            }
        } else {
            this.addUpload(value);
        }
        return 1;
    }

    /**
     *  Returns the formatted result
     *  @return {Object} - The result.
     */
    result() {
        return {
            CommonPrefixes: this.CommonPrefixes,
            Uploads: this.Uploads,
            IsTruncated: this.IsTruncated,
            NextKeyMarker: this.NextKeyMarker,
            MaxKeys: this.maxKeys,
            NextUploadIdMarker: this.NextUploadIdMarker,
            Delimiter: this.delimiter,
        };
    }
}

module.exports = {
    MultipartUploads,
};
