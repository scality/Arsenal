import { strict as assert } from 'assert';

import { FILTER_END, FILTER_SKIP, SKIP_NONE } from './tools';


const MAX_STREAK_LENGTH = 100;

interface SkipParams {
    extension: any;
    gte: any;
}

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

    extension: any;
    gteParams: any;
    listingEndCb?: Function;
    skipRangeCb?: Function;
    streakLength: number;

    constructor(params: SkipParams) {
        // TODO - once we're in strict TS everywhere, we no longer need these
        //        assertions
        assert(params.extension);

        this.extension = params.extension;
        this.gteParams = params.gte;

        this.listingEndCb = undefined;
        this.skipRangeCb = undefined;

        /* Used to count consecutive FILTER_SKIP returned by the extension
         * filter method. Once this counter reaches MAX_STREAK_LENGTH, the
         * filter function tries to skip unwanted values by defining a new
         * range. */
        this.streakLength = 0;
    }

    setListingEndCb(cb: Function) {
        this.listingEndCb = cb;
    }

    setSkipRangeCb(cb: Function) {
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
    filter(entry: object): undefined {
        assert(this.listingEndCb !== undefined);
        assert(this.skipRangeCb !== undefined);

        const filteringResult = this.extension.filter(entry);
        const skippingRange = this.extension.skipping();

        if (filteringResult === FILTER_END) {
            this.listingEndCb();
        } else if (filteringResult === FILTER_SKIP
                   && skippingRange !== SKIP_NONE) {
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

    _inc(str: string): string {
        if (!str) {
            return str;
        }
        const lastCharValue = str.charCodeAt(str.length - 1);
        const lastCharNewValue = String.fromCharCode(lastCharValue + 1);

        return `${str.slice(0, str.length - 1)}${lastCharNewValue}`;
    }
}

export {
    Skip,
    SkipParams
}
