import assert from 'assert';
import { FILTER_END, FILTER_SKIP, SKIP_NONE } from './tools';

const MAX_STREAK_LENGTH = 100;

/**
 * Handle the filtering and the skip mechanism of a listing result.
 */
export class Skip {
    extension;
    gteParams;
    listingEndCb;
    skipRangeCb;
    streakLength;

    /**
     * @param {Object} params           - skip parameters
     * @param {Object} params.extension - delimiter extension used (required)
     * @param {String} params.gte       - current range gte (greater than or
     *                                    equal) used by the client code
     */
    constructor(params: { extension: any; gte: string }) {
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
    filter(entry): void {
        assert(this.listingEndCb);
        assert(this.skipRangeCb);

        const filteringResult = this.extension.filter(entry);
        const skippingRange = this.extension.skipping();

        if (filteringResult === FILTER_END) {
            this.listingEndCb();
        } else if (
            filteringResult === FILTER_SKIP &&
            skippingRange !== SKIP_NONE
        ) {
            if (++this.streakLength >= MAX_STREAK_LENGTH) {
                const newRange = this._inc(skippingRange);

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

    _inc(str: string) {
        if (!str) {
            return str;
        }
        const lastCharValue = str.charCodeAt(str.length - 1);
        const lastCharNewValue = String.fromCharCode(lastCharValue + 1);

        return `${str.slice(0, str.length - 1)}${lastCharNewValue}`;
    }
}
