'use strict'; // eslint-disable-line strict

const checkLimit = require('./tools').checkLimit;
const DEFAULT_MAX_KEYS = 10000;

/**
 * Used for advancing the last character of a string for setting upper/lower
 * bounds
 * e.g. _setCharAt('demo1') results in 'demo2',
 * _setCharAt('scality') results in 'scalitz'
 * @param {String} str - string to be advanced
 * @return {String} - modified string
 */
function _setCharAt(str) {
    let chr = str.charCodeAt(str.length - 1);
    chr = String.fromCharCode(chr + 1);
    return str.substr(0, str.length - 1) + chr;
}

/**
 *  Class of an extension doing the simple listing
 */
class List {
    /**
     *  Constructor
     *  Set the logger and the res
     *  @param {Object} params - The parameters you sent to DBD
     *  @param {RequestLogger} logger - The logger of the request
     *  @return {undefined}
     */
    constructor(params, logger) {
        this.logger = logger;
        this.res = [];
        this._listingParams = {
            limit: params.limit,
            gte: params.gte,
            lte: params.lte,
            gt: params.gt,
            lt: params.lt,
            start: params.start,
            keys: params.keys,
            values: params.values,
        };
        if (params.prefix) {
            this._listingParams.start = params.prefix;
            this._listingParams.lt = _setCharAt(params.prefix);
        }
        this.maxKeys = checkLimit(params.maxKeys, DEFAULT_MAX_KEYS);
        this.keys = 0;
    }

    getListingParams() {
        return this._listingParams;
    }

    /**
     *  Function apply on each element
     *  Just add it to the array
     *  @param {Object} elem - The data from the database
     *  @return {Boolean} - True = continue the stream
     */
    filter(elem) {
        // Check first in case of maxkeys <= 0
        if (this.keys >= this.maxKeys) {
            return 0;
        }
        this.res.push(elem);
        this.keys++;
        return 1;
    }

    /**
     *  Function returning the result
     *  @return {Array} - The listed elements
     */
    result() {
        return this.res;
    }
}

module.exports = {
    List,
};
