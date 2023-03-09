'use strict'; // eslint-disable-line strict

const Delimiter = require('./delimiter').Delimiter;
const Version = require('../../versioning/Version').Version;
const VSConst = require('../../versioning/constants').VersioningConstants;
const { inc, FILTER_END, FILTER_ACCEPT, FILTER_SKIP, SKIP_NONE } =
    require('./tools');

const VID_SEP = VSConst.VersionId.Separator;
const { DbPrefixes, BucketVersioningKeyFormat } = VSConst;

// TODO: when S3C-4682 code is back, cleanup fields, methods and types
// already present in Delimiter class

export interface FilterState {
    id: number,
};

export interface FilterReturnValue {
    FILTER_ACCEPT,
    FILTER_SKIP,
    FILTER_END,
};

export const enum DelimiterVersionsFilterStateId {
    NotSkipping = 1,
    SkippingPrefix = 2,
    WaitForNullKey = 3,
    SkippingVersions = 4,
};

export interface DelimiterVersionsFilterState_NotSkipping extends FilterState {
    id: DelimiterVersionsFilterStateId.NotSkipping,
};

export interface DelimiterVersionsFilterState_SkippingPrefix extends FilterState {
    id: DelimiterVersionsFilterStateId.SkippingPrefix,
    prefix: string;
};

export interface DelimiterVersionsFilterState_WaitForNullKey extends FilterState {
    id: DelimiterVersionsFilterStateId.WaitForNullKey,
};

export interface DelimiterVersionsFilterState_SkippingVersions extends FilterState {
    id: DelimiterVersionsFilterStateId.SkippingVersions,
    gt: string;
};

type KeyHandler = (key: string, value: string) => FilterReturnValue;

type ResultObject = {
    CommonPrefixes: string[],
    Versions: {
        key: string;
        value: string;
        versionId: string;
    }[];
    IsTruncated: boolean;
    Delimiter ?: string;
    NextKeyMarker ?: string;
    NextVersionIdMarker ?: string;
};

type GenMDParamsItem = {
    gt ?: string,
    gte ?: string,
    lt ?: string,
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
export class DelimiterVersions extends Delimiter {

    state: FilterState;
    keyHandlers: { [id: number]: KeyHandler };

    constructor(parameters, logger, vFormat) {
        super(parameters, logger, vFormat);
        // specific to version listing
        this.keyMarker = parameters.keyMarker;
        this.versionIdMarker = parameters.versionIdMarker;
        // internal state
        this.masterKey = undefined;
        this.masterVersionId = undefined;
        this.nullKey = null;
        // listing results
        this.nextKeyMarker = parameters.keyMarker;
        this.nextVersionIdMarker = undefined;

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

        if (this.vFormat === BucketVersioningKeyFormat.v0) {
            this.setKeyHandler(
                DelimiterVersionsFilterStateId.NotSkipping,
                this.keyHandler_NotSkippingV0.bind(this));
        } else {
            this.setKeyHandler(
                DelimiterVersionsFilterStateId.NotSkipping,
                this.keyHandler_NotSkippingV1.bind(this));
        }
        this.setKeyHandler(
            DelimiterVersionsFilterStateId.SkippingPrefix,
            this.keyHandler_SkippingPrefix.bind(this));

        this.setKeyHandler(
            DelimiterVersionsFilterStateId.WaitForNullKey,
            this.keyHandler_WaitForNullKey.bind(this));

        this.setKeyHandler(
            DelimiterVersionsFilterStateId.SkippingVersions,
            this.keyHandler_SkippingVersions.bind(this));

        if (this.versionIdMarker) {
            this.state = <DelimiterVersionsFilterState_WaitForNullKey> {
                id: DelimiterVersionsFilterStateId.WaitForNullKey,
            };
        } else {
            this.state = <DelimiterVersionsFilterState_NotSkipping> {
                id: DelimiterVersionsFilterStateId.NotSkipping,
            };
        }
    }

    genMDParamsV0() {
        const params: GenMDParamsItem = {};
        if (this.prefix) {
            params.gte = this.prefix;
            params.lt = inc(this.prefix);
        }
        if (this.keyMarker && this.delimiter) {
            const commonPrefix = this.getCommonPrefix(this.keyMarker);
            if (commonPrefix) {
                const afterPrefix = inc(commonPrefix);
                if (!params.gte || afterPrefix > params.gte) {
                    params.gte = afterPrefix;
                }
            }
        }
        if (this.keyMarker && (!params.gte || this.keyMarker >= params.gte)) {
            delete params.gte;
            if (this.versionIdMarker) {
                // start from the beginning of versions so we can
                // check if there's a null key and fetch it
                // (afterwards, we can skip the rest of versions until
                // we reach versionIdMarker)
                params.gte = `${this.keyMarker}${VID_SEP}`;
            } else {
                params.gt = `${this.keyMarker}${inc(VID_SEP)}`;
            }
        }
        return params;
    }

    genMDParamsV1() {
        // return an array of two listing params sets to ask for
        // synchronized listing of M and V ranges
        const v0Params: GenMDParamsItem = this.genMDParamsV0();
        const mParams: GenMDParamsItem = {};
        const vParams: GenMDParamsItem = {};
        if (v0Params.gt) {
            mParams.gt = `${DbPrefixes.Master}${v0Params.gt}`;
            vParams.gt = `${DbPrefixes.Version}${v0Params.gt}`;
        } else if (v0Params.gte) {
            mParams.gte = `${DbPrefixes.Master}${v0Params.gte}`;
            vParams.gte = `${DbPrefixes.Version}${v0Params.gte}`;
        } else {
            mParams.gte = DbPrefixes.Master;
            vParams.gte = DbPrefixes.Version;
        }
        if (v0Params.lt) {
            mParams.lt = `${DbPrefixes.Master}${v0Params.lt}`;
            vParams.lt = `${DbPrefixes.Version}${v0Params.lt}`;
        } else {
            mParams.lt = inc(DbPrefixes.Master);
            vParams.lt = inc(DbPrefixes.Version);
        }
        return [mParams, vParams];
    }

    /**
     * Used to synchronize listing of M and V prefixes by object key
     *
     * @param {object} masterObj object listed from first range
     * returned by genMDParamsV1() (the master keys range)
     * @param {object} versionObj object listed from second range
     * returned by genMDParamsV1() (the version keys range)
     * @return {number} comparison result:
     *   * -1 if master key < version key
     *   * 1 if master key > version key
     */
    compareObjects(masterObj, versionObj) {
        const masterKey = masterObj.key.slice(DbPrefixes.Master.length);
        const versionKey = versionObj.key.slice(DbPrefixes.Version.length);
        return masterKey < versionKey ? -1 : 1;
    }

    /**
     * Parse a listing key into its nonversioned key and version ID components
     *
     * @param {string} key - full listing key
     * @return {object} obj
     * @return {string} obj.key - nonversioned part of key
     * @return {string} [obj.versionId] - version ID in the key
     */
    parseKey(fullKey: string): { key: string, versionId ?: string } {
        const versionIdIndex = fullKey.indexOf(VID_SEP);
        if (versionIdIndex === -1) {
            return { key: fullKey };
        }
        const nonversionedKey: string = fullKey.slice(0, versionIdIndex);
        let versionId: string = fullKey.slice(versionIdIndex + 1);
        return { key: nonversionedKey, versionId };
    }

    /**
     *  Add a (key, versionId, value) tuple to the listing.
     *  Set the NextMarker to the current key
     *  Increment the keys counter
     *  @param {String} key         - The key to add
     *  @param {String} versionId   - versionId
     *  @param {String} value       - The value of the key
     *  @return {undefined}
     */
    addContents(key: string, versionId: string, value: string) {
        this.Contents.push({
            key,
            versionId,
            value: this.trimMetadata(value),
        });
        this.nextKeyMarker = key;
        this.nextVersionIdMarker = versionId;
        ++this.keys;
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
     * @return {undefined}
     */
    addCommonPrefix(commonPrefix: string): void {
        // add the new prefix to the list
        this.CommonPrefixes.push(commonPrefix);
        ++this.keys;
        this.nextKeyMarker = commonPrefix;
    }

    /**
     * Cache the current null key, to save it for outputting it later at
     * the correct position
     *
     * @param {String} key        - nonversioned key of the null key
     * @param {String} versionId  - real version ID of the null key
     * @param {String} value      - value of the null key
     * @return {undefined}
     */
    cacheNullKey(key: string, versionId: string, value: string): void {
        this.nullKey = { key, versionId, value };
    }

    /**
     * Add the cached null key to the results. This is called when
     * reaching the correct position for the null key in the output.
     *
     * @return {undefined}
     */
    addCurrentNullKey(): void {
        this.addContents(
            this.nullKey.key,
            this.nullKey.versionId,
            this.nullKey.value,
        );
        this.nullKey = null;
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

    keyHandler_NotSkippingV0(key: string, value: string): FilterReturnValue {
        if (key.startsWith(DbPrefixes.Replay)) {
            // skip internal replay prefix entirely
            this.setState(<DelimiterVersionsFilterState_SkippingPrefix> {
                id: DelimiterVersionsFilterStateId.SkippingPrefix,
                prefix: DbPrefixes.Replay,
            });
            return FILTER_SKIP;
        }
        if (Version.isPHD(value)) {
            return FILTER_ACCEPT;
        }
        return this.filter_onNewKey(key, value);
    }

    keyHandler_NotSkippingV1(key: string, value: string): FilterReturnValue {
        // NOTE: this check on PHD is only useful for Artesca, S3C
        // does not use PHDs in V1 format
        if (Version.isPHD(value)) {
            return FILTER_ACCEPT;
        }
        return this.filter_onNewKey(key, value);
    }

    filter_onNewKey(key: string, value: string): FilterReturnValue {
        if (this._reachedMaxKeys()) {
            return FILTER_END;
        }
        const { key: nonversionedKey, versionId: keyVersionId } = this.parseKey(key);
        if (this.nullKey &&
            (this.nullKey.key !== nonversionedKey
             || this.nullKey.versionId < <string> keyVersionId)) {
            this.addCurrentNullKey();
            if (this._reachedMaxKeys()) {
                // IsTruncated: true is set, which is wanted because
                // there is at least one more key to output: the one
                // being processed here
                return FILTER_END;
            }
        }
        let versionId: string;
        if (keyVersionId === undefined) {
            this.masterKey = key;
            this.masterVersionId = Version.from(value).getVersionId() || 'null';
            versionId = this.masterVersionId;
        } else {
            if (keyVersionId === '') {
                // null key
                this.cacheNullKey(nonversionedKey, Version.from(value).getVersionId(), value);
                return FILTER_ACCEPT;
            }
            if (this.masterKey === nonversionedKey && this.masterVersionId === keyVersionId) {
                // do not add a version key if it is the master version
                return FILTER_ACCEPT;
            }
            versionId = keyVersionId;
        }
        // add the subprefix to the common prefixes if the key has the delimiter
        const commonPrefix = this.getCommonPrefix(nonversionedKey);
        if (commonPrefix) {
            this.addCommonPrefix(commonPrefix);
            // transition into SkippingPrefix state to skip all following keys
            // while they start with the same prefix
            this.setState(<DelimiterVersionsFilterState_SkippingPrefix> {
                id: DelimiterVersionsFilterStateId.SkippingPrefix,
                prefix: commonPrefix,
            });
            return FILTER_ACCEPT;
        }
        this.addContents(nonversionedKey, versionId, value);
        return FILTER_ACCEPT;
    }

    keyHandler_SkippingPrefix(key: string, value: string): FilterReturnValue {
        const { prefix } = <DelimiterVersionsFilterState_SkippingPrefix> this.state;
        if (key.startsWith(prefix)) {
            return FILTER_SKIP;
        }
        this.setState(<DelimiterVersionsFilterState_NotSkipping> {
            id: DelimiterVersionsFilterStateId.NotSkipping,
        });
        return this.handleKey(key, value);
    }

    keyHandler_WaitForNullKey(key: string, value: string): FilterReturnValue {
        const { key: nonversionedKey, versionId } = this.parseKey(key);
        if (nonversionedKey !== this.keyMarker) {
            this.setState(<DelimiterVersionsFilterState_NotSkipping> {
                id: DelimiterVersionsFilterStateId.NotSkipping,
            });
            return this.handleKey(key, value);
        }
        // we may now skip versions until VersionIdMarker
        this.setState(<DelimiterVersionsFilterState_SkippingVersions> {
            id: DelimiterVersionsFilterStateId.SkippingVersions,
            gt: `${this.keyMarker}${VID_SEP}${this.versionIdMarker}`,
        });

        if (versionId === '') {
            // only cache the null key if its version is older than
            // the current version ID marker, otherwise it has already
            // been output in a previous listing output
            const nullVersionId = Version.from(value).getVersionId();
            if (nullVersionId > this.versionIdMarker) {
                this.cacheNullKey(nonversionedKey, nullVersionId, value);
            }
            return FILTER_SKIP;
        }
        return this.handleKey(key, value);
    }

    keyHandler_SkippingVersions(key: string, value: string): FilterReturnValue {
        const { key: nonversionedKey, versionId } = this.parseKey(key);
        if (nonversionedKey === this.keyMarker) {
            // since the nonversioned key equals the marker, there is
            // necessarily a versionId in this key
            const _versionId = <string> versionId;
            if (_versionId < this.versionIdMarker) {
                // skip all versions until marker
                return FILTER_SKIP;
            }
            if (_versionId === this.versionIdMarker) {
                // nothing left to skip, so return ACCEPT, but don't add this version
                return FILTER_ACCEPT;
            }
        }
        this.setState(<DelimiterVersionsFilterState_NotSkipping> {
            id: DelimiterVersionsFilterStateId.NotSkipping,
        });
        return this.handleKey(key, value);
    }

    skippingBase() {
        switch (this.state.id) {
        case DelimiterVersionsFilterStateId.SkippingPrefix:
            const { prefix } = <DelimiterVersionsFilterState_SkippingPrefix> this.state;
            return prefix;

        case DelimiterVersionsFilterStateId.SkippingVersions:
            const { gt } = <DelimiterVersionsFilterState_SkippingVersions> this.state;
            return gt;

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
        // skip to the same object key in both M and V range listings
        return [
            `${DbPrefixes.Master}${skipTo}`,
            `${DbPrefixes.Version}${skipTo}`,
        ];
    }

    /**
     *  Return an object containing all mandatory fields to use once the
     *  iteration is done, doesn't show a NextMarker field if the output
     *  isn't truncated
     *  @return {Object} - following amazon format
     */
    result() {
        // Add the last null key if still in cache (when it is the
        // last version of the last key)
        //
        // NOTE: _reachedMaxKeys sets IsTruncated to true when it
        // returns true. Here we want this because either:
        //
        // - we did not reach the max keys yet so the result is not
        // - truncated, and there is still room for the null key in
        // - the results
        //
        // - OR we reached it already while having to process a new
        //   key (so the result is truncated even without the null key)
        //
        // - OR we are *just* below the limit but the null key to add
        //   does not fit, so we know the result is now truncated
        //   because there remains the null key to be output.
        //
        if (this.nullKey && !this._reachedMaxKeys()) {
            this.addCurrentNullKey();
        }
        const result: ResultObject = {
            CommonPrefixes: this.CommonPrefixes,
            Versions: this.Contents,
            IsTruncated: this.IsTruncated,
        };
        if (this.delimiter) {
            result.Delimiter = this.delimiter;
        }
        if (this.IsTruncated) {
            result.NextKeyMarker = this.nextKeyMarker;
            if (this.nextVersionIdMarker) {
                result.NextVersionIdMarker = this.nextVersionIdMarker;
            }
        };
        return result;
    }
}

module.exports = { DelimiterVersions };
