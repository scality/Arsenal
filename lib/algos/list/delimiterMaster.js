'use strict'; // eslint-disable-line strict

const Delimiter = require('./delimiter').Delimiter;
const Version = require('../../versioning/Version').Version;
const VSConst = require('../../versioning/constants').VersioningConstants;
const { BucketVersioningKeyFormat } = VSConst;
const { inc, FILTER_ACCEPT, FILTER_SKIP, SKIP_NONE } = require('./tools');

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
     */
    constructor(parameters, vFormat, logger) {
        super(parameters, vFormat, logger);
    }

    filter(obj) {
        let key;
        if ([BucketVersioningKeyFormat.v1,
             BucketVersioningKeyFormat.v1mig].includes(this.vFormat)) {
            key = obj.key.slice(2);
        } else {
            key = obj.key;
        }
        const value = obj.value;

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
             *   in the constructor) and comparing to NextMarker is the only
             *   way to know  we should not accept this version. This test is
             *   not redundant with the one at the beginning of this function,
             *   we are comparing here the key without the version suffix,
             * - key startsWith the previous NextMarker happens because we set
             *   NextMarker to the common prefix instead of the whole key
             *   value. (TODO: remove this test once ZENKO-1048 is fixed. ).
             *   */
            if (key === this.prvKey || key === this[this.nextContinueMarker] ||
                (this.delimiter &&
                key.startsWith(this[this.nextContinueMarker]))) {
                /* master version already filtered */
                return FILTER_SKIP;
            }
        }
        // TODO optimize for v1 versioning key format
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

    skipping() {
        if (this[this.nextContinueMarker]) {
            // next marker or next continuation token:
            // - foo/ : skipping foo/
            // - foo  : skipping foo.
            const index = this[this.nextContinueMarker].
                lastIndexOf(this.delimiter);
            if (index === this[this.nextContinueMarker].length - 1) {
                return `${DbPrefixes.Master}${this[this.nextContinueMarker]}`;
            }
            return `${DbPrefixes.Master}${this[this.nextContinueMarker]}${VID_SEP}`;
        }
        return SKIP_NONE;
    }
}

module.exports = { DelimiterMaster };
