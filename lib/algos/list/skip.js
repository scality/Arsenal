const assert = require('assert');

const { FILTER_END, FILTER_SKIP, SKIP_NONE } = require('./tools');


const MAX_STREAK_LENGTH = 100;

/**
 * Handle the filtering and the skip mechanism of a listing result.
 */
class Skip {
    /**
     * @param {Object} params                - skip parameters
     * @param {Object} params.extension      - delimiter extension used (required)
     * @param {String | string[]} params.gte - current range gte (greater than or
     *                                         equal) used by the client code
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
        
        // Debug logging
        console.log(`[SKIP_DEBUG] Skip constructor: gteParams=${JSON.stringify(this.gteParams)}, isArray=${Array.isArray(this.gteParams)}`);
    }

    setListingEndCb(cb) {
        this.listingEndCb = cb;
    }

    setSkipRangeCb(cb) {
        this.skipRangeCb = cb;
    }

    /**
     * Compares two ranges for value equality.
     * @param {String | string[]} rangeA - The first range
     * @param {String | string[]} rangeB - The second range
     * @returns {boolean} - True if the ranges are equal by value
     */
    _areRangesEqual(rangeA, rangeB) {
        const isAArray = Array.isArray(rangeA);
        const isBArray = Array.isArray(rangeB);

        if (isAArray && isBArray) {
            if (rangeA.length !== rangeB.length) {
                return false;
            }
            return rangeA.every((val, index) => val === rangeB[index]);
        }

        if (isAArray !== isBArray) {
            return false;
        }

        return rangeA === rangeB;
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

        // Debug logging for every entry
        const entryKey = entry._id || entry.key || 'unknown';
        console.log(`[SKIP_DEBUG] Processing entry: key="${entryKey}", result=${filteringResult}, skipTo=${JSON.stringify(skipTo)}, streak=${this.streakLength}`);

        if (filteringResult === FILTER_END) {
            console.log(`[SKIP_DEBUG] FILTER_END reached, calling listingEndCb`);
            this.listingEndCb();
        } else if (filteringResult === FILTER_SKIP
            && skipTo !== SKIP_NONE) {
            if (++this.streakLength >= MAX_STREAK_LENGTH) {
                console.log(`[SKIP_DEBUG] MAX_STREAK_LENGTH (${MAX_STREAK_LENGTH}) reached!`);
                console.log(`[SKIP_DEBUG] skipTo=${JSON.stringify(skipTo)}, gteParams=${JSON.stringify(this.gteParams)}`);
                
                let newRange;
                if (Array.isArray(skipTo)) {
                    newRange = [];
                    for (let i = 0; i < skipTo.length; ++i) {
                        newRange.push(skipTo[i]);
                    }
                    console.log(`[SKIP_DEBUG] Created array newRange=${JSON.stringify(newRange)}`);
                } else {
                    newRange = skipTo;
                    console.log(`[SKIP_DEBUG] Created string newRange="${newRange}"`);
                }
                
                /* Avoid to loop on the same range again and again. */
                const rangesEqual = newRange === this.gteParams;
                console.log(`[SKIP_DEBUG] Range comparison: newRange=${JSON.stringify(newRange)} === gteParams=${JSON.stringify(this.gteParams)} = ${rangesEqual}`);
                
                if (rangesEqual) {
                    console.log(`[SKIP_DEBUG] Ranges are equal, resetting streak to 1`);
                    this.streakLength = 1;
                } else {
                    console.log(`[SKIP_DEBUG] Ranges are different, calling skipRangeCb with newRange=${JSON.stringify(newRange)}`);
                    this.skipRangeCb(newRange);
                }
            } else {
                console.log(`[SKIP_DEBUG] FILTER_SKIP #${this.streakLength}, continuing...`);
            }
        } else {
            if (this.streakLength > 0) {
                console.log(`[SKIP_DEBUG] FILTER_ACCEPT after streak of ${this.streakLength}, resetting streak`);
            }
            this.streakLength = 0;
        }
    }
}


module.exports = Skip;
