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
    constructor(parameters, vFormat, logger) {
        super(parameters, vFormat, logger);
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
