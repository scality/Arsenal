const { Delimiter } = require('./delimiter');
const Version = require('../../versioning/Version').Version;
const VSConst = require('../../versioning/constants').VersioningConstants;
const { BucketVersioningKeyFormat } = VSConst;
const { inc, FILTER_ACCEPT, FILTER_END, FILTER_SKIP, SKIP_NONE } = require('./tools');
const VID_SEP = VSConst.VersionId.Separator;
const { DbPrefixes } = VSConst;
const TRIM_METADATA_MIN_BLOB_SIZE = 10000;
import { MDParams, ResultObject } from './types';

/**
 * Handle object listing with parameters. This extends the base class Delimiter
 * to return the master/current versions.
 */
class DelimiterCurrent extends Delimiter {
    /**
     * Delimiter listing of current versions.
     * @param {Object}  parameters            - listing parameters
     * @param {String}  parameters.beforeDate - limit the response to keys older than beforeDate
     * @param {String}  parameters.keyMarker  - key marker
     * @param {RequestLogger} logger          - The logger of the request
     * @param {String} [vFormat]              - versioning key format
     */
    constructor(parameters, logger, vFormat) {
        super(parameters, logger, vFormat);

        this.beforeDate = parameters.beforeDate;
        this.keyMarker = parameters.keyMarker;
        this.NextKeyMarker = null;

        this.filter = this.filterV1;
        this.skipping = this.skippingV1;
        this.genMDParams = this.genMDParamsV1;
        this.getObjectKey = this.getObjectKeyV1;
    }
    /**
     *  Filter to apply on each iteration
     *  @param {Object} obj       - The key and value of the element
     *  @param {String} obj.key   - The key of the element
     *  @param {String} obj.value - The value of the element
     *  @return {number}          - indicates if iteration should continue
     */
    filterV1(obj: { key: string, value: string }) {
        const key = this.getObjectKey(obj);
        const value = obj.value;
        return this.addContents(key, value);
    }

    skippingV1() {
        return SKIP_NONE;
    }

    genMDParamsV1(): MDParams {
        const params: MDParams = {
            limit: this.maxKeys + 1,
            gte: DbPrefixes.Master,
            lt: inc(DbPrefixes.Master),
        };

        if (this.prefix) {
            params.gte = `${DbPrefixes.Master}${this.prefix}`;
            params.lt = `${DbPrefixes.Master}${inc(this.prefix)}`;
        }

        if (this.keyMarker && params.gte && `${DbPrefixes.Master}${this.keyMarker}` >= params.gte) {
            delete params.gte;
            params.gt = `${DbPrefixes.Master}${this.keyMarker}`;
        }

        if (this.beforeDate) {
            params.lastModified = {
                lt: this.beforeDate,
            };
        }

        this.start = Date.now();

        return params;
    }

    /**
     *  Add a (key, value) tuple to the listing
     *  Set the NextKeyMarker to the current key
     *  Increment the keys counter
     *  @param {String} key   - The key to add
     *  @param {String} value - The value of the key
     *  @return {number}      - indicates if iteration should continue
     */
    addContents(key: string, value: string): void {
        if (this._reachedMaxKeys()) {
            return FILTER_END;
        }

        this.Contents.push({ key, value: this.trimMetadata(value) });
        this.NextKeyMarker = key;
        ++this.keys;

        return FILTER_ACCEPT;
    }

    result(): ResultObject {
        const result: ResultObject = {
            Contents: this.Contents,
            IsTruncated: this.IsTruncated,
        };

        if (this.IsTruncated) {
            result.NextKeyMarker = this.NextKeyMarker;
        }

        return result;
    }
}
module.exports = { DelimiterCurrent };
