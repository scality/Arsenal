'use strict'; // eslint-disable-line strict

const Extension = require('./Extension').default;

const { checkLimit, FILTER_END, FILTER_ACCEPT, FILTER_SKIP } = require('./tools');
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
            this.filterKey = parameters.filterKey;
            this.filterKeyStartsWith = parameters.filterKeyStartsWith;
        } else {
            this.maxKeys = DEFAULT_MAX_KEYS;
        }
        this.keys = 0;
    }

    genMDParams() {
        const params = this.parameters ? {
            gt: this.parameters.gt,
            gte: this.parameters.gte || this.parameters.start,
            lt: this.parameters.lt,
            lte: this.parameters.lte || this.parameters.end,
            keys: this.parameters.keys,
            values: this.parameters.values,
        } : {};
        Object.keys(params).forEach(key => {
            if (params[key] === null || params[key] === undefined) {
                delete params[key];
            }
        });
        return params;
    }

    /**
     * Filters customAttributes sub-object if present
     *
     * @param {String} value - The JSON value of a listing item
     *
     * @return {String} The value that may have been trimmed of some
     * heavy unused fields, or left untouched (depending on size
     * heuristics)
     */
    customFilter(value) {
        let ret = false;
        try {
            const _value = JSON.parse(value);
            if (_value.customAttributes !== undefined) {
                const keys = Object.keys(_value.customAttributes);
                let i;
                for (i = 0; i < keys.length; i++) {
                    const key = keys[i];
                    if (this.filterKey !== undefined) {
                        if (key === this.filterKey) {
                            ret = true;
                            break;
                        }
                    } else if (this.filterKeyStartsWith !== undefined) {
                        const patternLength = this.filterKeyStartsWith.length;
                        const keyPrefix = key.substring(0, patternLength);
                        if (keyPrefix === this.filterKeyStartsWith) {
                            ret = true;
                            break;
                        }
                    }
                }
            }
        } catch (e) {
            // Prefer returning an unfiltered data rather than
            // stopping the service in case of parsing failure.
            // The risk of this approach is a potential
            // reproduction of MD-692, where too much memory is
            // used by repd.
            this.logger.warn(
                'Could not parse Object Metadata while listing',
                { err: e.toString() });
        }
        return ret;
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
        if (this.filterKey !== undefined ||
            this.filterKeyStartsWith !== undefined) {
            if (typeof elem === 'object' &&
                !this.customFilter(elem.value)) {
                return FILTER_SKIP;
            }
        }
        if (typeof elem === 'object') {
            this.res.push({
                key: elem.key,
                value: this.trimMetadata(elem.value),
            });
        } else {
            this.res.push(elem);
        }
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
