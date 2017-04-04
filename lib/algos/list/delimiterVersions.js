'use strict'; // eslint-disable-line strict

const Delimiter = require('./delimiter').Delimiter;
const Version = require('../../versioning/Version').Version;
const VSConst = require('../../versioning/constants').VersioningConstants;
const { inc, FILTER_END, FILTER_ACCEPT, FILTER_SKIP, SKIP_NONE } =
    require('./tools');

const VID_SEP = VSConst.VersionId.Separator;

function formatVersionKey(key, versionId) {
    return `${key}${VID_SEP}${versionId}`;
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
class DelimiterVersions extends Delimiter {
    constructor(parameters) {
        super(parameters);
        // specific to version listing
        this.keyMarker = parameters.keyMarker;
        this.versionIdMarker = parameters.versionIdMarker;
        // internal state
        this.masterKey = undefined;
        this.masterVersionId = undefined;
        // listing results
        this.NextMarker = parameters.keyMarker;
        this.NextVersionIdMarker = undefined;
    }

    genMDParams() {
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
                params.gt = formatVersionKey(this.parameters.keyMarker,
                        this.parameters.versionIdMarker);
            } else {
                params.gt = inc(this.parameters.keyMarker + VID_SEP);
            }
        }
        return params;
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
        this.Contents.push(obj);
        this.NextMarker = obj.key;
        this.NextVersionIdMarker = obj.versionId;
        ++this.keys;
        return FILTER_ACCEPT;
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
        if (Version.isPHD(obj.value)) {
            return FILTER_ACCEPT; // trick repd to not increase its streak
        }
        if (this.prefix && !obj.key.startsWith(this.prefix)) {
            return FILTER_SKIP;
        }
        let key = obj.key; // original key
        let versionId = undefined; // versionId
        const versionIdIndex = obj.key.indexOf(VID_SEP);
        if (versionIdIndex < 0) {
            this.masterKey = obj.key;
            this.masterVersionId =
                Version.from(obj.value).getVersionId() || 'null';
            versionId = this.masterVersionId;
        } else {
            // eslint-disable-next-line
            key = obj.key.slice(0, versionIdIndex);
            // eslint-disable-next-line
            versionId = obj.key.slice(versionIdIndex + 1);
            if (this.masterKey === key && this.masterVersionId === versionId) {
                return FILTER_ACCEPT; // trick repd to not increase its streak
            }
            this.masterKey = undefined;
            this.masterVersionId = undefined;
        }
        if (this.delimiter) {
            const baseIndex = this.prefix ? this.prefix.length : 0;
            const delimiterIndex = key.indexOf(this.delimiter, baseIndex);
            if (delimiterIndex >= 0) {
                return this.addCommonPrefix(key, delimiterIndex);
            }
        }
        return this.addContents({ key, value: obj.value, versionId });
    }

    skipping() {
        if (this.NextMarker) {
            const index = this.NextMarker.lastIndexOf(this.delimiter);
            if (index === this.NextMarker.length - 1) {
                return this.NextMarker;
            }
        }
        return SKIP_NONE;
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
