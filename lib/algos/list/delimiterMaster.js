'use strict'; // eslint-disable-line strict

const Delimiter = require('./delimiter').Delimiter;
const Version = require('../../versioning/Version').Version;
const VSConst = require('../../versioning/constants').VersioningConstants;
const { BucketVersioningKeyFormat } = VSConst;
const { FILTER_ACCEPT, FILTER_SKIP, SKIP_NONE } = require('./tools');

const VID_SEP = VSConst.VersionId.Separator;
const { DbPrefixes } = VSConst;

/**
 * Handle object listing with parameters. This extends the base class Delimiter
 * to return the raw master versions of existing objects.
 */
class DelimiterMaster extends Delimiter {
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
        // non-PHD master version or a version whose master is a PHD version
        this.prvKey = undefined;
        this.prvPHDKey = undefined;
        this.inReplayPrefix = false;

        Object.assign(this, {
            [BucketVersioningKeyFormat.v0]: {
                filter: this.filterV0,
                skipping: this.skippingV0,
            },
            [BucketVersioningKeyFormat.v1]: {
                filter: this.filterV1,
            },
        }[this.vFormat]);
    }

    /**
     *  Filter to apply on each iteration for buckets in v0 format,
     *  based on:
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
        let key = obj.key;
        const value = obj.value;

        if (key.startsWith(DbPrefixes.Replay)) {
            this.inReplayPrefix = true;
            return FILTER_SKIP;
        }
        this.inReplayPrefix = false;

        /* Skip keys not starting with the prefix or not alphabetically
         * ordered. */
        if ((this.prefix && !key.startsWith(this.prefix))
                || (typeof this[this.nextContinueMarker] === 'string' &&
                    key <= this[this.nextContinueMarker])) {
            return FILTER_SKIP;
        }

        /* Skip version keys (<key><versionIdSeparator><version>) if we already
         * have a master version. */
        const versionIdIndex = key.indexOf(VID_SEP);
        if (versionIdIndex >= 0) {
            key = key.slice(0, versionIdIndex);
            /* - key === this.prvKey is triggered when a master version has
             *   been accepted for this key,
             * - key === this.NextMarker or this.NextContinueToken is triggered
             *   when a listing page ends on an accepted obj and the next page
             *   starts with a version of this object.
             *   In that case prvKey is default set to undefined
             *   in the constructor and comparing to NextMarker is the only
             *   way to know  we should not accept this version. This test is
             *   not redundant with the one at the beginning of this function,
             *   we are comparing here the key without the version suffix.
             *   */
            if (key === this.prvKey || key === this[this.nextContinueMarker]) {
                /* master version already filtered */
                return FILTER_SKIP;
            }
        }
        // If addCommonPrefix() gets called in this function, it will
        // set `prefixToSkip` to the current prefix, otherwise in the
        // general case we may skip all further versions of that key.
        this.prefixToSkip = key + VID_SEP;
        if (Version.isPHD(value)) {
            /* master version is a PHD version, we want to wait for the next
             * one:
             * - Set the prvKey to undefined to not skip the next version,
             * - return accept to avoid users to skip the next values in range
             *   (skip scan mechanism in metadata backend like Metadata or
             *   MongoClient). */
            this.prvKey = undefined;
            this.prvPHDKey = key;
            return FILTER_ACCEPT;
        }
        if (Version.isDeleteMarker(value)) {
            /* This entry is a deleteMarker which has not been filtered by the
             * version test. Either :
             * - it is a deleteMarker on the master version, we want to SKIP
             *   all the following entries with this key (no master version),
             * - or a deleteMarker following a PHD (setting prvKey to undefined
             *   when an entry is a PHD avoids the skip on version for the
             *   next entry). In that case we expect the master version to
             *   follow. */
            if (key === this.prvPHDKey) {
                this.prvKey = undefined;
                return FILTER_ACCEPT;
            }
            this.prvKey = key;
            return FILTER_SKIP;
        }

        this.prvKey = key;
        if (this.delimiter) {
            // check if the key has the delimiter
            const baseIndex = this.prefix ? this.prefix.length : 0;
            const delimiterIndex = key.indexOf(this.delimiter, baseIndex);
            if (delimiterIndex >= 0) {
                // try to add the prefix to the list
                return this.addCommonPrefix(key, delimiterIndex);
            }
        }
        return this.addContents(key, value);
    }

    /**
     *  Filter to apply on each iteration for buckets in v1 format,
     *  based on:
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
        // Filtering master keys in v1 is simply listing the master
        // keys, as the state of version keys do not change the
        // result, so we can use Delimiter method directly.
        return super.filter(obj);
    }

    skippingV0() {
        if (this.inReplayPrefix) {
            return DbPrefixes.Replay;
        }
        return super.skippingV0();
    }
}

module.exports = { DelimiterMaster };
