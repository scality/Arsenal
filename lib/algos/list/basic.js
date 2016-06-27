'use strict'; // eslint-disable-line strict

const checkLimit = require('./tools').checkLimit;
const DEFAULT_MAX_KEYS = 10000;

/**
 *  Class of an extension doing the simple listing
 */
class List {
    /**
     *  Constructor
     *  Set the logger and the res
     *  @param {Object} parameters - The parameters you sent to DBD
     *  @param {RequestLogger} logger - The logger of the request
     *  @return {undefined}
     */
    constructor(parameters, logger) {
        this.logger = logger;
        this.res = [];
        if (parameters) {
            this.maxKeys = checkLimit(parameters.maxKeys, DEFAULT_MAX_KEYS);
        } else {
            this.maxKeys = DEFAULT_MAX_KEYS;
        }
        this.keys = 0;
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
            return false;
        }
        this.res.push(elem);
        this.keys++;
        return true;
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
