const assert = require('assert');

const { FILTER_END, FILTER_SKIP, SKIP_NONE } = require('./tools');


const MAX_STREAK_LENGTH = 100;

/**
 * Handle the filtering and the skip mechanism of a listing result.
 */
class Skip {
    /**
     * @param {Object} params           - skip parameters
     * @param {Object} params.extension - delimiter extension used (required)
     * @param {String} params.gte       - current range gte (greater than or
     *                                    equal) used by the client code
     */
    constructor(params) {
        assert(params.extension);

        this.extension = params.extension;
        this.gteParams = params.gte;

        this.listingEndCb = null;
        this.skipRangeCb = null;

        /* Used to count consecutive FILTER_SKIP returned by the extension
         * filter method. Once this counter reaches MAX_STREAK_LENGTH, the
         * filter function tries to skip unwanted values by defining a new
         * range. */
        this.streakLength = 0;
    }

    setListingEndCb(cb) {
        this.listingEndCb = cb;
    }

    setSkipRangeCb(cb) {
        this.skipRangeCb = cb;
    }

    /**
     * Filter an entry.
     * @param {Object} entry - entry to filter.
     * @return {undefined}
     *
     * This function calls the listing end or the skip range callbacks if
     * needed.
     */
    filter(entry) {
        assert(this.listingEndCb);
        assert(this.skipRangeCb);

        const filteringResult = this.extension.filter(entry);
        const skipTo = this.extension.skipping();

        if (filteringResult === FILTER_END) {
            this.listingEndCb();
        } else if (filteringResult === FILTER_SKIP
                   && skipTo !== SKIP_NONE) {
            if (++this.streakLength >= MAX_STREAK_LENGTH) {
                let newRange;
                if (Array.isArray(skipTo)) {
                    newRange = [];
                    for (let i = 0; i < skipTo.length; ++i) {
                        newRange.push(skipTo[i]);
                    }
                } else {
                    newRange = skipTo;
                }
                /* Avoid to loop on the same range again and again. */
                if (newRange === this.gteParams) {
                    this.streakLength = 1;
                } else {
                    this.skipRangeCb(newRange);
                }
            }
        } else {
            this.streakLength = 0;
        }
    }
}


module.exports = Skip;
