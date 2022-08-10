'use strict'; // eslint-disable-line strict

const Extension = require('./Extension').default;
const { inc, listingParamsMasterKeysV0ToV1,
    FILTER_END, FILTER_ACCEPT, FILTER_SKIP } = require('./tools');
const VSConst = require('../../versioning/constants').VersioningConstants;
const { DbPrefixes, BucketVersioningKeyFormat } = VSConst;

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
class Delimiter extends Extension {
    /**
     * Create a new Delimiter instance
     * @constructor
     * @param {Object}  parameters                     - listing parameters
     * @param {String}  [parameters.delimiter]         - delimiter per amazon
     *                                                   format
     * @param {String}  [parameters.prefix]            - prefix per amazon
     *                                                   format
     * @param {String}  [parameters.marker]            - marker per amazon
     *                                                   format
     * @param {Number}  [parameters.maxKeys]           - number of keys to list
     * @param {Boolean} [parameters.v2]                - indicates whether v2
     *                                                   format
     * @param {String}  [parameters.startAfter]        - marker per amazon
     *                                                   format
     * @param {String}  [parameters.continuationToken] - obfuscated amazon
     *                                                   token
     * @param {Boolean} [parameters.alphabeticalOrder] - Either the result is
     *                                                   alphabetically ordered
     *                                                   or not
     * @param {RequestLogger} logger                   - The logger of the
     *                                                   request
     * @param {String} [vFormat]                       - versioning key format
     */
    constructor(parameters, logger, vFormat) {
        super(parameters, logger);
        // original listing parameters
        this.delimiter = parameters.delimiter;
        this.prefix = parameters.prefix;
        this.marker = parameters.marker;
        this.maxKeys = parameters.maxKeys || 1000;
        this.startAfter = parameters.startAfter;
        this.continuationToken = parameters.continuationToken;
        this.alphabeticalOrder =
          typeof parameters.alphabeticalOrder !== 'undefined' ?
              parameters.alphabeticalOrder : true;

        this.vFormat = vFormat || BucketVersioningKeyFormat.v0;
        // results
        this.CommonPrefixes = [];
        this.Contents = [];
        this.IsTruncated = false;
        this.NextMarker = parameters.marker;
        this.NextContinuationToken =
            parameters.continuationToken || parameters.startAfter;

        this.startMarker = parameters.v2 ? 'startAfter' : 'marker';
        this.continueMarker = parameters.v2 ? 'continuationToken' : 'marker';
        this.nextContinueMarker = parameters.v2 ?
            'NextContinuationToken' : 'NextMarker';

        if (this.delimiter !== undefined &&
            this[this.nextContinueMarker] !== undefined &&
            this[this.nextContinueMarker].startsWith(this.prefix || '')) {
            const nextDelimiterIndex =
                this[this.nextContinueMarker].indexOf(this.delimiter,
                    this.prefix ? this.prefix.length : 0);
            this[this.nextContinueMarker] =
                this[this.nextContinueMarker].slice(0, nextDelimiterIndex +
                                        this.delimiter.length);
        }

        Object.assign(this, {
            [BucketVersioningKeyFormat.v0]: {
                genMDParams: this.genMDParamsV0,
                getObjectKey: this.getObjectKeyV0,
                skipping: this.skippingV0,
            },
            [BucketVersioningKeyFormat.v1]: {
                genMDParams: this.genMDParamsV1,
                getObjectKey: this.getObjectKeyV1,
                skipping: this.skippingV1,
            },
        }[this.vFormat]);
    }

    genMDParamsV0() {
        const params = {};
        if (this.prefix) {
            params.gte = this.prefix;
            params.lt = inc(this.prefix);
        }
        const startVal = this[this.continueMarker] || this[this.startMarker];
        if (startVal) {
            if (params.gte && params.gte > startVal) {
                return params;
            }
            delete params.gte;
            params.gt = startVal;
        }
        return params;
    }

    genMDParamsV1() {
        const params = this.genMDParamsV0();
        return listingParamsMasterKeysV0ToV1(params);
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
     *  @return {number}      - indicates if iteration should continue
     */
    addContents(key, value) {
        if (this._reachedMaxKeys()) {
            return FILTER_END;
        }
        this.Contents.push({ key, value: this.trimMetadata(value) });
        this[this.nextContinueMarker] = key;
        ++this.keys;
        return FILTER_ACCEPT;
    }

    getObjectKeyV0(obj) {
        return obj.key;
    }

    getObjectKeyV1(obj) {
        return obj.key.slice(DbPrefixes.Master.length);
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
     *  @return {number}          - indicates if iteration should continue
     */
    filter(obj) {
        const key = this.getObjectKey(obj);
        const value = obj.value;
        if ((this.prefix && !key.startsWith(this.prefix))
            || (this.alphabeticalOrder
                && typeof this[this.nextContinueMarker] === 'string'
                && key <= this[this.nextContinueMarker])) {
            console.log('skipping v1 here', {
                key,
                prefix: this.prefix,
                marker: this[this.nextContinueMarker],
                alpha: this.alphabeticalOrder,
                lte: key <= this[this.nextContinueMarker],
                prefixStartsWith: this.prefix && !key.startsWith(this.prefix),
                obj,
            });
            return FILTER_SKIP;
        }
        if (this.delimiter) {
            const baseIndex = this.prefix ? this.prefix.length : 0;
            const delimiterIndex = key.indexOf(this.delimiter, baseIndex);
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
                && this[this.nextContinueMarker] !== commonPrefix) {
            if (this._reachedMaxKeys()) {
                return FILTER_END;
            }
            this.CommonPrefixes.push(commonPrefix);
            this[this.nextContinueMarker] = commonPrefix;
            ++this.keys;
            return FILTER_ACCEPT;
        }
        return FILTER_SKIP;
    }

    /**
     * If repd happens to want to skip listing on a bucket in v0
     * versioning key format, here is an idea.
     *
     * @return {string} - the present range (NextMarker) if repd believes
     *                    that it's enough and should move on
     */
    skippingV0() {
        return this[this.nextContinueMarker];
    }

    /**
     * If repd happens to want to skip listing on a bucket in v1
     * versioning key format, here is an idea.
     *
     * @return {string} - the present range (NextMarker) if repd believes
     *                    that it's enough and should move on
     */
    skippingV1() {
        return DbPrefixes.Master + this[this.nextContinueMarker];
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
        const result = {
            CommonPrefixes: this.CommonPrefixes,
            Contents: this.Contents,
            IsTruncated: this.IsTruncated,
            Delimiter: this.delimiter,
        };
        if (this.parameters.v2) {
            result.NextContinuationToken = this.IsTruncated
                ? this.NextContinuationToken : undefined;
        } else {
            result.NextMarker = (this.IsTruncated && this.delimiter)
                ? this.NextMarker : undefined;
        }
        return result;
    }
}

module.exports = { Delimiter };
