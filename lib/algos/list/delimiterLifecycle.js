'use strict'; // eslint-disable-line strict
const Delimiter = require('./delimiter').Delimiter;
const Version = require('../../versioning/Version').Version;
const VSConst = require('../../versioning/constants').VersioningConstants;
const { BucketVersioningKeyFormat } = VSConst;
const { inc, FILTER_ACCEPT, FILTER_END, FILTER_SKIP, SKIP_NONE } = require('./tools');
const VID_SEP = VSConst.VersionId.Separator;
const { DbPrefixes } = VSConst;
/**
 * Handle object listing with parameters. This extends the base class Delimiter
 * to return the raw master objects.
 */
class DelimiterLifecycle extends Delimiter {
    /**
     * Delimiter listing of master versions.
     * @param {Object}  parameters            - listing parameters
     * @param {String}  parameters.delimiter  - delimiter per amazon format
     * @param {String}  parameters.prefix     - prefix per amazon format
     * @param {String}  parameters.marker     - marker per amazon format
     * @param {Number}  parameters.maxKeys    - number of keys to list
     * @param {Boolean} parameters.v2         - indicates whether v2 format
     * @param {String}  parameters.startAfter - marker per amazon v2 format
     * @param {String}  parameters.continuationToken - obfuscated amazon token
     * @param {RequestLogger} logger          - The logger of the request
     * @param {String} [vFormat]              - versioning key format
     */
    constructor(parameters, logger, vFormat) {
        super(parameters, logger, vFormat);

        this.beforeDate = parameters.beforeDate;
        this.dateMarker = parameters.dateMarker;
        this.keyMarker = parameters.keyMarker;

        this.NextDateMarker = null;
        this.NextKeyMarker = null;

        this.filter = this.filterV1;
        this.skipping = this.skippingV1;
        this.genMDParams = this.genMDParamsV1;
    }
    /**
     *  Filter to apply on each iteration
     *  @param {Object} obj       - The key and value of the element
     *  @param {String} obj.key   - The key of the element
     *  @param {String} obj.value - The value of the element
     *  @return {number}          - indicates if iteration should continue
     */
    filterV1(obj) {
        const key = this.getObjectKey(obj);
        const value = obj.value;
        return this.addContents(key, value);
    }

    skippingV1() {
        return SKIP_NONE;
    }

    genMDParamsV1() {
        const params = {
            sortByLastModified: true,
        };

        if (this.prefix) {
            params.gte = `${DbPrefixes.Master}${this.prefix}`;
            params.lt = inc(`${DbPrefixes.Master}${this.prefix}`);
        }

        if (this.beforeDate || this.dateMarker) {
            params.lastModified = {}
            if (this.beforeDate) {
                params.lastModified.lt = this.beforeDate;
            }
            if (this.dateMarker) {
                if (this.keyMarker) {
                    params.lastModified.gte = this.dateMarker;
                } else {
                    params.lastModified.gt = this.dateMarker;
                }
            }
        }

        return params;
    }

    /**
     *  Add a (key, value) tuple to the listing
     *  Set the NextMarker to the current key
     *  Increment the keys counter
     *  @param {String} key   - The key to add
     *  @param {String} value - The value of the key
     *  @return {number}      - indicates if iteration should continue
     */
    addContents(key, value) {
        if (this._reachedMaxKeys()) {
            // TODO: catch errors
            const lastModified = JSON.parse(value)['last-modified'];
            if (lastModified !== this.NextDateMarker) {
                this.NextKeyMarker = null;
            }
            return FILTER_END;
        }

        if (this.keyMarker) {
            if (key <= this.keyMarker){
                return FILTER_ACCEPT;
            } else {
                this.keyMarker = null;
            }
        } 

        this.Contents.push({ key, value: this.trimMetadata(value) });
        ++this.keys;

        if (this.keys === this.maxKeys) {
            // TODO: catch errors
            this.NextDateMarker = JSON.parse(value)['last-modified'];
            this.NextKeyMarker = key;
        }
        return FILTER_ACCEPT;
    }

    _reachedMaxKeys() {
        if (this.keys >= this.maxKeys) {
            // In cases of maxKeys <= 0 -> IsTruncated = false
            this.IsTruncated = this.maxKeys > 0;
            return true;
        }

        return false;
    }

    result() {
        const result = {
            Contents: this.Contents,
            IsTruncated: this.IsTruncated,
        };

        if (this.IsTruncated) {
            result.NextDateMarker = this.NextDateMarker;
            result.NextKeyMarker = this.NextKeyMarker;
        }

        return result;
    }
}
module.exports = { DelimiterLifecycle };
//# sourceMappingURL=delimiterMaster.js.map
