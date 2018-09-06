'use strict'; // eslint-disable-line strict

const Delimiter = require('./delimiter').Delimiter;
const Version = require('../../versioning/Version').Version;
const VSConst = require('../../versioning/constants').VersioningConstants;
const { FILTER_ACCEPT, FILTER_SKIP, SKIP_NONE } = require('./tools');

const VID_SEP = VSConst.VersionId.Separator;

/**
 * Handle object listing with parameters. This extends the base class Delimiter
 * to return the raw master versions of existing objects.
 */
class DelimiterMaster extends Delimiter {
    /**
     * Delimiter listing of master versions.
     * @param {Object} parameters           - listing parameters
     * @param {String} parameters.delimiter - delimiter per amazon format
     * @param {String} parameters.prefix    - prefix per amazon format
     * @param {String} parameters.marker    - marker per amazon format
     * @param {Number} parameters.maxKeys   - number of keys to list
     */
    constructor(parameters) {
        super(parameters);
        this.prvPHDKey = undefined;
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
     *  @return {number}         - indicates if iteration should continue
     */
    filter(obj) {
        let key = obj.key;
        const value = obj.value;
        if ((this.prefix && !key.startsWith(this.prefix))
                || (typeof this.NextMarker === 'string' &&
                    key <= this.NextMarker)) {
            return FILTER_SKIP;
        }
        const versionIdIndex = key.indexOf(VID_SEP);
        if (versionIdIndex >= 0) {
            // generally we do not accept a specific version,
            // we only do when the master version is a PHD version
            key = key.slice(0, versionIdIndex);
            if (key !== this.prvPHDKey) {
                return FILTER_ACCEPT; // trick repd to not increase its streak
            }
        }
        if (Version.isPHD(value)) {
            // master version is a PHD version: wait for the next version
            this.prvPHDKey = key;
            return FILTER_ACCEPT; // trick repd to not increase its streak
        }
        if (Version.isDeleteMarker(value)) {
            // version is a delete marker, ignore
            return FILTER_ACCEPT; // trick repd to not increase its streak
        }
        // non-PHD master version or a version whose master is a PHD version
        this.prvPHDKey = undefined;
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
        if (this.NextMarker) {
            // next marker:
            // - foo/ : skipping foo/
            // - foo  : skipping foo.
            const index = this.NextMarker.lastIndexOf(this.delimiter);
            if (index === this.NextMarker.length - 1) {
                return this.NextMarker;
            }
            return this.NextMarker + VID_SEP;
        }
        return SKIP_NONE;
    }
}

module.exports = { DelimiterMaster };
