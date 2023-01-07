'use strict'; // eslint-disable-line strict

const Extension = require('./Extension').default;
const { inc, listingParamsMasterKeysV0ToV1,
    FILTER_END, FILTER_ACCEPT, FILTER_SKIP, SKIP_NONE } = require('./tools');
const VSConst = require('../../versioning/constants').VersioningConstants;
const { DbPrefixes, BucketVersioningKeyFormat } = VSConst;

export interface FilterState {
    id: number,
};

export interface FilterReturnValue {
    FILTER_ACCEPT,
    FILTER_SKIP,
    FILTER_END,
};

export const enum DelimiterFilterStateId {
    NotSkipping = 1,
    SkippingPrefix = 2,
};

export interface DelimiterFilterState_NotSkipping extends FilterState {
    id: DelimiterFilterStateId.NotSkipping,
};

export interface DelimiterFilterState_SkippingPrefix extends FilterState {
    id: DelimiterFilterStateId.SkippingPrefix,
    prefix: string;
};

type KeyHandler = (key: string, value: string) => FilterReturnValue;

type ResultObject = {
    CommonPrefixes: string[];
    Contents: {
        key: string;
        value: string;
    }[];
    IsTruncated: boolean;
    Delimiter ?: string;
    NextMarker ?: string;
    NextContinuationToken ?: string;
};

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
export class Delimiter extends Extension {

    state: FilterState;
    keyHandlers: { [id: number]: KeyHandler };

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
     * @param {RequestLogger} logger                   - The logger of the
     *                                                   request
     * @param {String} [vFormat]                       - versioning key format
     */
    constructor(parameters, logger, vFormat) {
        super(parameters, logger);
        // original listing parameters
        this.delimiter = parameters.delimiter;
        this.prefix = parameters.prefix;
        this.maxKeys = parameters.maxKeys || 1000;

        if (parameters.v2) {
            this.marker = parameters.continuationToken || parameters.startAfter;
        } else {
            this.marker = parameters.marker;
        }
        this.nextMarker = this.marker;

        this.vFormat = vFormat || BucketVersioningKeyFormat.v0;
        // results
        this.CommonPrefixes = [];
        this.Contents = [];
        this.IsTruncated = false;
        this.keyHandlers = {};

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

        // if there is a delimiter, we may skip ranges by prefix,
        // hence using the NotSkippingPrefix flavor that checks the
        // subprefix up to the delimiter for the NotSkipping state
        if (this.delimiter) {
            this.setKeyHandler(
                DelimiterFilterStateId.NotSkipping,
                this.keyHandler_NotSkippingPrefix.bind(this));
        } else {
            // listing without a delimiter never has to skip over any
            // prefix -> use NeverSkipping flavor for the NotSkipping
            // state
            this.setKeyHandler(
                DelimiterFilterStateId.NotSkipping,
                this.keyHandler_NeverSkipping.bind(this));
        }
        this.setKeyHandler(
            DelimiterFilterStateId.SkippingPrefix,
            this.keyHandler_SkippingPrefix.bind(this));

        this.state = <DelimiterFilterState_NotSkipping> {
            id: DelimiterFilterStateId.NotSkipping,
        };
    }

    genMDParamsV0() {
        const params: { gt ?: string, gte ?: string, lt ?: string } = {};
        if (this.prefix) {
            params.gte = this.prefix;
            params.lt = inc(this.prefix);
        }
        if (this.marker && this.delimiter) {
            const commonPrefix = this.getCommonPrefix(this.marker);
            if (commonPrefix) {
                const afterPrefix = inc(commonPrefix);
                if (!params.gte || afterPrefix > params.gte) {
                    params.gte = afterPrefix;
                }
            }
        }
        if (this.marker && (!params.gte || this.marker >= params.gte)) {
            delete params.gte;
            params.gt = this.marker;
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
    _reachedMaxKeys(): boolean {
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
    addContents(key: string, value: string): void {
        this.Contents.push({ key, value: this.trimMetadata(value) });
        ++this.keys;
        this.nextMarker = key;
    }

    getCommonPrefix(key: string): string | undefined {
        const baseIndex = this.prefix ? this.prefix.length : 0;
        const delimiterIndex = key.indexOf(this.delimiter, baseIndex);
        if (delimiterIndex === -1) {
            return undefined;
        }
        return key.substring(0, delimiterIndex + this.delimiter.length);
    }

    /**
     * Add a Common Prefix in the list
     * @param {String} commonPrefix   - common prefix to add
     * @param {String} key            - full key starting with commonPrefix
     * @return {Boolean}     - indicates if iteration should continue
     */
    addCommonPrefix(commonPrefix: string, key: string): void {
        // add the new prefix to the list
        this.CommonPrefixes.push(commonPrefix);
        ++this.keys;
        this.nextMarker = key;
    }

    addCommonPrefixOrContents(key: string, value: string): string | undefined {
        // add the subprefix to the common prefixes if the key has the delimiter
        const commonPrefix = this.getCommonPrefix(key);
        if (commonPrefix) {
            this.addCommonPrefix(commonPrefix, key);
            return commonPrefix;
        }
        this.addContents(key, value);
        return undefined;
    }

    getObjectKeyV0(obj: { key: string }): string {
        return obj.key;
    }

    getObjectKeyV1(obj: { key: string }): string {
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
    filter(obj: { key: string, value: string }): FilterReturnValue {
        const key = this.getObjectKey(obj);
        const value = obj.value;

        return this.handleKey(key, value);
    }

    setState(state: FilterState): void {
        this.state = state;
    }

    setKeyHandler(stateId: number, keyHandler: KeyHandler): void {
        this.keyHandlers[stateId] = keyHandler;
    }

    handleKey(key: string, value: string): FilterReturnValue {
        return this.keyHandlers[this.state.id](key, value);
    }

    keyHandler_NeverSkipping(key: string, value: string): FilterReturnValue {
        if (this._reachedMaxKeys()) {
            return FILTER_END;
        }
        this.addContents(key, value);
        return FILTER_ACCEPT;
    }

    keyHandler_NotSkippingPrefix(key: string, value: string): FilterReturnValue {
        if (this._reachedMaxKeys()) {
            return FILTER_END;
        }
        const commonPrefix = this.addCommonPrefixOrContents(key, value);
        if (commonPrefix) {
            // transition into SkippingPrefix state to skip all following keys
            // while they start with the same prefix
            this.setState(<DelimiterFilterState_SkippingPrefix> {
                id: DelimiterFilterStateId.SkippingPrefix,
                prefix: commonPrefix,
            });
        }
        return FILTER_ACCEPT;
    }

    keyHandler_SkippingPrefix(key: string, value: string): FilterReturnValue {
        const { prefix } = <DelimiterFilterState_SkippingPrefix> this.state;
        if (key.startsWith(prefix)) {
            return FILTER_SKIP;
        }
        this.setState(<DelimiterFilterState_NotSkipping> {
            id: DelimiterFilterStateId.NotSkipping,
        });
        return this.handleKey(key, value);
    }

    skippingBase(): string | undefined {
        switch (this.state.id) {
        case DelimiterFilterStateId.SkippingPrefix:
            const { prefix } = <DelimiterFilterState_SkippingPrefix> this.state;
            return prefix;

        default:
            return SKIP_NONE;
        }
    }

    skippingV0() {
        return this.skippingBase();
    }

    skippingV1() {
        const skipTo = this.skippingBase();
        if (skipTo === SKIP_NONE) {
            return SKIP_NONE;
        }
        return DbPrefixes.Master + skipTo;
    }

    /**
     *  Return an object containing all mandatory fields to use once the
     *  iteration is done, doesn't show a NextMarker field if the output
     *  isn't truncated
     *  @return {Object} - following amazon format
     */
    result(): ResultObject {
        /* NextMarker is only provided when delimiter is used.
         * specified in v1 listing documentation
         * http://docs.aws.amazon.com/AmazonS3/latest/API/RESTBucketGET.html
         */
        const result: ResultObject = {
            CommonPrefixes: this.CommonPrefixes,
            Contents: this.Contents,
            IsTruncated: this.IsTruncated,
            Delimiter: this.delimiter,
        };
        if (this.parameters.v2) {
            result.NextContinuationToken = this.IsTruncated
                ? this.nextMarker : undefined;
        } else {
            result.NextMarker = (this.IsTruncated && this.delimiter)
                ? this.nextMarker : undefined;
        }
        return result;
    }
}
