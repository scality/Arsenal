'use strict'; // eslint-disable-line strict

const Extension = require('./Extension').default;

const { checkLimit, FILTER_END, FILTER_ACCEPT } = require('./tools');
const DEFAULT_MAX_KEYS = 10000;

/**
 *  Class of an extension doing the simple listing
 */
class List extends Extension {
    /**
     *  Constructor
     *  Set the logger and the res
     *  @param {Object} parameters - The parameters you sent to DBD
     *  @param {RequestLogger} logger - The logger of the request
     *  @return {undefined}
     */
    constructor(parameters, logger) {
        super(parameters, logger);
        this.res = [];
        if (parameters) {
            this.maxKeys = checkLimit(parameters.maxKeys, DEFAULT_MAX_KEYS);
        } else {
            this.maxKeys = DEFAULT_MAX_KEYS;
        }
        this.keys = 0;
    }

    genMDParams() {
        const params = {
            gt: this.parameters.gt,
            gte: this.parameters.gte || this.parameters.start,
            lt: this.parameters.lt,
            lte: this.parameters.lte || this.parameters.end,
            keys: this.parameters.keys,
            values: this.parameters.values,
        };
        Object.keys(params).forEach(key => {
            if (params[key] === null || params[key] === undefined) {
                delete params[key];
            }
        });
        return params;
    }

    /**
     *  Function apply on each element
     *  Just add it to the array
     *  @param {Object} elem - The data from the database
     *  @return {number} - > 0 : continue listing
     *                     < 0 : listing done
     */
    filter(elem) {
        // Check first in case of maxkeys <= 0
        if (this.keys >= this.maxKeys) {
            return FILTER_END;
        }
        this.res.push(elem);
        this.keys++;
        return FILTER_ACCEPT;
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
