'use strict'; // eslint-disable-line strict

import { FILTER_SKIP, SKIP_NONE } from './tools';

// Use a heuristic to amortize the cost of JSON
// serialization/deserialization only on largest metadata where the
// potential for size reduction is high, considering the bulk of the
// blob size is due to the "location" field containing a large number
// of MPU parts.
//
// Measured on some standard metadata:
// - 100 parts -> 9K blob
// - 2000 parts -> 170K blob
//
// Using a 10K threshold should lead to a worst case of about 10M to
// store a raw listing of 1000 entries, even with some growth
// multiplication factor due to some internal memory duplication, it
// should stay within reasonable memory limits.

const TRIM_METADATA_MIN_BLOB_SIZE = 10000;

/**
 *  Base class of listing extensions.
 */
export class Extension {
    /**
     * This takes a list of parameters and a logger as the inputs.
     * Derivatives should have their own format regarding parameters.
     *
     * @param {Object} parameters - listing parameter from applications
     * @param {RequestLogger} logger - the logger
     * @constructor
     */

    parameters: any;
    logger: any;
    res: any;
    keys: number;

    constructor(parameters: any, logger: any) {
        // inputs
        this.parameters = parameters;
        this.logger = logger;
        // listing results
        this.res = undefined;
        this.keys = 0;
    }

    /**
     * Filters-out non-requested optional fields from the value. This function
     * shall be applied on any value that is to be returned as part of the
     * result of a listing extension.
     *
     * @param {String} value - The JSON value of a listing item
     *
     * @return {String} The value that may have been trimmed of some
     * heavy unused fields, or left untouched (depending on size
     * heuristics)
     */
    trimMetadata(value: string): string {
        let ret = undefined;
        if (value.length >= TRIM_METADATA_MIN_BLOB_SIZE) {
            try {
                ret = JSON.parse(value);
                delete ret.location;
                ret = JSON.stringify(ret);
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
        }
        return ret || value;
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
    genMDParams(): object {
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
    filter(entry: any): number {
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
    skipping(): string {
        return SKIP_NONE;
    }

    /**
     * Get the listing resutls. Format depends on derivatives' specific logic.
     * @return {Array} - The listed elements
     */
    result(): any {
        return this.res;
    }
}
