'use strict'; // eslint-disable-line strict

function numberDefault(num, defaultNum) {
    const parsedNum = Number.parseInt(num, 10);
    return Number.isNaN(parsedNum) ? defaultNum : parsedNum;
}
/**
 *  Class for the ListMultipartUploads extension
 */
class ListMultipartUploads {
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
        this.maxKeys = numberDefault(params.maxKeys, 1000);
        this.delimiter = params.delimiter;
        this.splitter = params.splitter;
        this.logger = logger;
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
                StorageClass: tmp.storageClass,
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

    /**
     *  This function applies filter on each element
     *  @param {String} obj - The key and value of the element
     *  @return {Boolean} - True: Continue, False: Stop
     */
    filter(obj) {
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
        if (this.keys === this.maxKeys) {
            this.IsTruncated = true;
            return false;
        }
        return true;
    }

    /**
     *  Returns the formatted result
     *  @return {Object} - The result.
     */
    result() {
        const delimiter = this.CommonPrefixes.length > 0 ? this.delimiter : '';
        return {
            CommonPrefixes: this.CommonPrefixes,
            Uploads: this.Uploads,
            IsTruncated: this.IsTruncated,
            NextKeyMarker: this.NextKeyMarker,
            MaxKeys: this.maxKeys,
            NextUploadIdMarker: this.NextUploadIdMarker,
            Delimiter: delimiter,
        };
    }
}

module.exports = {
    ListMultipartUploads,
};
