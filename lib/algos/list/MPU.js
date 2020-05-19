'use strict'; // eslint-disable-line strict

const { inc, checkLimit, listingParamsMasterKeysV0ToV1,
        FILTER_END, FILTER_ACCEPT } = require('./tools');
const DEFAULT_MAX_KEYS = 1000;
const VSConst = require('../../versioning/constants').VersioningConstants;
const { DbPrefixes, BucketVersioningKeyFormat } = VSConst;

function numberDefault(num, defaultNum) {
    const parsedNum = Number.parseInt(num, 10);
    return Number.isNaN(parsedNum) ? defaultNum : parsedNum;
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
     *  @param {String} [vFormat] - versioning key format
     *  @return {undefined}
     */
    constructor(params, logger, vFormat) {
        this.params = params;
        this.vFormat = vFormat || BucketVersioningKeyFormat.v0;
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

        Object.assign(this, {
            [BucketVersioningKeyFormat.v0]: {
                genMDParams: this.genMDParamsV0,
                getObjectKey: this.getObjectKeyV0,
            },
            [BucketVersioningKeyFormat.v1]: {
                genMDParams: this.genMDParamsV1,
                getObjectKey: this.getObjectKeyV1,
            },
        }[this.vFormat]);
    }

    genMDParamsV0() {
        const params = {};
        if (this.params.keyMarker) {
            params.gt = `overview${this.params.splitter}` +
                `${this.params.keyMarker}${this.params.splitter}`;
            if (this.params.uploadIdMarker) {
                params.gt += `${this.params.uploadIdMarker}`;
            }
            // advance so that lower bound does not include the supplied
            // markers
            params.gt = inc(params.gt);
        }
        if (this.params.prefix) {
            if (params.gt === undefined || this.params.prefix > params.gt) {
                delete params.gt;
                params.gte = this.params.prefix;
            }
            params.lt = inc(this.params.prefix);
        }
        return params;
    }

    genMDParamsV1() {
        const v0params = this.genMDParamsV0();
        return listingParamsMasterKeysV0ToV1(v0params);
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

    getObjectKeyV0(obj) {
        return obj.key;
    }

    getObjectKeyV1(obj) {
        return obj.key.slice(DbPrefixes.Master.length);
    }

    /**
     *  This function applies filter on each element
     *  @param {String} obj - The key and value of the element
     *  @return {number} - > 0: Continue, < 0: Stop
     */
    filter(obj) {
        // Check first in case of maxkeys = 0
        if (this.keys >= this.maxKeys) {
            // In cases of maxKeys <= 0 => IsTruncated = false
            this.IsTruncated = this.maxKeys > 0;
            return FILTER_END;
        }
        const key = this.getObjectKey(obj);
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
        return FILTER_ACCEPT;
    }

    skipping() {
        return '';
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
