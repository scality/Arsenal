'use strict'; // eslint-disable-line strict

const Delimiter = require('./delimiter').Delimiter;
const Version = require('../../versioning/Version').Version;
const VSConst = require('../../versioning/constants').VersioningConstants;
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
    constructor(parameters, logger) {
        super(parameters, logger);
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
        const key = obj.key;
        const value = obj.value;
        if ((this.prefix && !key.startsWith(this.prefix))
            || (this.alphabeticalOrder
                && typeof this[this.nextContinueMarker] === 'string'
                && key <= this[this.nextContinueMarker])) {
            return FILTER_SKIP;
        }
        if (Version.isDeleteMarker(value)) {
            /* Repair task might yield delete markers, so we need to
             * check and skip them even though regular master keys
             * shall not be delete markers. */
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
