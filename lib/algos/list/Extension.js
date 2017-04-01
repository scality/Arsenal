'use strict'; // eslint-disable-line strict

const { FILTER_SKIP, SKIP_NONE } = require('./tools');

/**
 *  Base class of listing extensions.
 */
class Extension {
    /**
     * This takes a list of parameters and a logger as the inputs.
     * Derivatives should have their own format regarding parameters.
     *
     * @param {Object} parameters - listing parameter from applications
     * @param {RequestLogger} logger - the logger
     * @constructor
     */
    constructor(parameters, logger) {
        // inputs
        this.parameters = parameters;
        this.logger = logger;
        // listing results
        this.res = undefined;
        this.keys = 0;
    }

    /**
     * Generates listing parameters that metadata can understand from the input
     * parameters. What metadata can understand: gt, gte, lt, lte, limit, keys,
     * values, reverse; we use the same set of parameters as levelup's.
     * Derivatives should have their own conversion of their original listing
     * parameters into metadata listing parameters.
     *
     * @return {object} - listing parameters for metadata
     */
    genMDParams() {
        return {};
    }

    /**
     * This function receives a data entry from metadata and decides if it will
     * include the entry in the listing result or not.
     *
     * @param {object} entry - a listing entry from metadata
     *                         expected format: { key, value }
     * @return {number} - result of filtering the entry:
     *                    > 0: entry is accepted and included in the result
     *                    = 0: entry is accepted but not included (skipping)
     *                    < 0: entry is not accepted, listing should finish
     */
    filter(entry) {
        return entry ? FILTER_SKIP : FILTER_SKIP;
    }

    /**
     * Provides the insight into why filter is skipping an entry. This could be
     * because it is skipping a range of delimited keys or a range of specific
     * version when doing master version listing.
     *
     * @return {string} - the insight: a common prefix or a master key,
     *                                 or SKIP_NONE if there is no insight
     */
    skipping() {
        return SKIP_NONE;
    }

    /**
     * Get the listing resutls. Format depends on derivatives' specific logic.
     * @return {Array} - The listed elements
     */
    result() {
        return this.res;
    }
}

module.exports.default = Extension;
