'use strict'; // eslint-disable-line strict

const Delimiter = require('./delimiter').Delimiter;
const Version = require('../../versioning/Version').Version;
const VSConst = require('../../versioning/constants').VersioningConstants;
const { inc, FILTER_END, FILTER_ACCEPT, FILTER_SKIP, SKIP_NONE } =
    require('./tools');

const VID_SEP = VSConst.VersionId.Separator;
const { DbPrefixes, BucketVersioningKeyFormat } = VSConst;

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
class DelimiterVersions extends Delimiter {
    constructor(parameters, logger, vFormat) {
        super(parameters, logger, vFormat);
        // specific to version listing
        this.keyMarker = parameters.keyMarker;
        this.versionIdMarker = parameters.versionIdMarker;
        // internal state
        this.masterKey = undefined;
        this.masterVersionId = undefined;
        // listing results
        this.NextMarker = parameters.keyMarker;
        this.NextVersionIdMarker = undefined;
        this.inReplayPrefix = false;

        Object.assign(this, {
            [BucketVersioningKeyFormat.v0]: {
                genMDParams: this.genMDParamsV0,
                filter: this.filterV0,
                skipping: this.skippingV0,
            },
            [BucketVersioningKeyFormat.v1]: {
                genMDParams: this.genMDParamsV1,
                filter: this.filterV1,
                skipping: this.skippingV1,
            },
        }[this.vFormat]);
    }

    genMDParamsV0() {
        const params = {};
        if (this.parameters.prefix) {
            params.gte = this.parameters.prefix;
            params.lt = inc(this.parameters.prefix);
        }
        if (this.parameters.keyMarker) {
            if (params.gte && params.gte > this.parameters.keyMarker) {
                return params;
            }
            delete params.gte;
            if (this.parameters.versionIdMarker) {
                // versionIdMarker should always come with keyMarker
                // but may not be the other way around
                params.gt = this.parameters.keyMarker
                    + VID_SEP
                    + this.parameters.versionIdMarker;
            } else {
                params.gt = inc(this.parameters.keyMarker + VID_SEP);
            }
        }
        return params;
    }

    genMDParamsV1() {
        // return an array of two listing params sets to ask for
        // synchronized listing of M and V ranges
        const params = [{}, {}];
        if (this.parameters.prefix) {
            params[0].gte = DbPrefixes.Master + this.parameters.prefix;
            params[0].lt = DbPrefixes.Master + inc(this.parameters.prefix);
            params[1].gte = DbPrefixes.Version + this.parameters.prefix;
            params[1].lt = DbPrefixes.Version + inc(this.parameters.prefix);
        } else {
            params[0].gte = DbPrefixes.Master;
            params[0].lt = inc(DbPrefixes.Master); // stop after the last master key
            params[1].gte = DbPrefixes.Version;
            params[1].lt = inc(DbPrefixes.Version); // stop after the last version key
        }
        if (this.parameters.keyMarker) {
            if (params[1].gte <= DbPrefixes.Version + this.parameters.keyMarker) {
                delete params[0].gte;
                delete params[1].gte;
                params[0].gt = DbPrefixes.Master + inc(this.parameters.keyMarker + VID_SEP);
                if (this.parameters.versionIdMarker) {
                    // versionIdMarker should always come with keyMarker
                    // but may not be the other way around
                    params[1].gt = DbPrefixes.Version
                        + this.parameters.keyMarker
                        + VID_SEP
                        + this.parameters.versionIdMarker;
                } else {
                    params[1].gt = DbPrefixes.Version
                        + inc(this.parameters.keyMarker + VID_SEP);
                }
            }
        }
        return params;
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
     *  Add a (key, versionId, value) tuple to the listing.
     *  Set the NextMarker to the current key
     *  Increment the keys counter
     *  @param {object} obj             - the entry to add to the listing result
     *  @param {String} obj.key         - The key to add
     *  @param {String} obj.versionId   - versionId
     *  @param {String} obj.value       - The value of the key
     *  @return {Boolean} - indicates if iteration should continue
     */
    addContents(obj) {
        if (this._reachedMaxKeys()) {
            return FILTER_END;
        }
        this.Contents.push({
            key: obj.key,
            value: this.trimMetadata(obj.value),
            versionId: obj.versionId,
        });
        this.NextMarker = obj.key;
        this.NextVersionIdMarker = obj.versionId;
        ++this.keys;
        return FILTER_ACCEPT;
    }

    /**
     *  Filter to apply on each iteration if bucket is in v0
     *  versioning key format, based on:
     *  - prefix
     *  - delimiter
     *  - maxKeys
     *  The marker is being handled directly by levelDB
     *  @param {Object} obj       - The key and value of the element
     *  @param {String} obj.key   - The key of the element
     *  @param {String} obj.value - The value of the element
     *  @return {number}          - indicates if iteration should continue
     */
    filterV0(obj) {
        if (obj.key.startsWith(DbPrefixes.Replay)) {
            this.inReplayPrefix = true;
            return FILTER_SKIP;
        }
        this.inReplayPrefix = false;

        if (Version.isPHD(obj.value)) {
            // return accept to avoid skipping the next values in range
            return FILTER_ACCEPT;
        }
        return this.filterCommon(obj.key, obj.value);
    }

    /**
     *  Filter to apply on each iteration if bucket is in v1
     *  versioning key format, based on:
     *  - prefix
     *  - delimiter
     *  - maxKeys
     *  The marker is being handled directly by levelDB
     *  @param {Object} obj       - The key and value of the element
     *  @param {String} obj.key   - The key of the element
     *  @param {String} obj.value - The value of the element
     *  @return {number}          - indicates if iteration should continue
     */
    filterV1(obj) {
        // this function receives both M and V keys, but their prefix
        // length is the same so we can remove their prefix without
        // looking at the type of key
        return this.filterCommon(obj.key.slice(DbPrefixes.Master.length),
                                 obj.value);
    }

    filterCommon(key, value) {
        if (this.prefix && !key.startsWith(this.prefix)) {
            return FILTER_SKIP;
        }
        let nonversionedKey;
        let versionId = undefined;
        const versionIdIndex = key.indexOf(VID_SEP);
        if (versionIdIndex < 0) {
            nonversionedKey = key;
            this.masterKey = key;
            this.masterVersionId =
                Version.from(value).getVersionId() || 'null';
            versionId = this.masterVersionId;
        } else {
            nonversionedKey = key.slice(0, versionIdIndex);
            versionId = key.slice(versionIdIndex + 1);
            // skip a version key if it is the master version
            if (this.masterKey === nonversionedKey && this.masterVersionId === versionId) {
                return FILTER_SKIP;
            }
            this.masterKey = undefined;
            this.masterVersionId = undefined;
        }
        if (this.delimiter) {
            const baseIndex = this.prefix ? this.prefix.length : 0;
            const delimiterIndex = nonversionedKey.indexOf(this.delimiter, baseIndex);
            if (delimiterIndex >= 0) {
                return this.addCommonPrefix(nonversionedKey, delimiterIndex);
            }
        }
        return this.addContents({ key: nonversionedKey, value, versionId });
    }

    skippingV0() {
        if (this.inReplayPrefix) {
            return DbPrefixes.Replay;
        }
        if (this.NextMarker) {
            const index = this.NextMarker.lastIndexOf(this.delimiter);
            if (index === this.NextMarker.length - 1) {
                return this.NextMarker;
            }
        }
        return SKIP_NONE;
    }

    skippingV1() {
        const skipV0 = this.skippingV0();
        if (skipV0 === SKIP_NONE) {
            return SKIP_NONE;
        }
        // skip to the same object key in both M and V range listings
        return [DbPrefixes.Master + skipV0,
                DbPrefixes.Version + skipV0];
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
            Versions: this.Contents,
            IsTruncated: this.IsTruncated,
            NextKeyMarker: this.IsTruncated ? this.NextMarker : undefined,
            NextVersionIdMarker: this.IsTruncated ?
                this.NextVersionIdMarker : undefined,
            Delimiter: this.delimiter,
        };
    }
}

module.exports = { DelimiterVersions };
