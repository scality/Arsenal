const assert = require('assert');

const { Skip, MAX_STREAK_LENGTH } = require('../../../../lib/algos/list/skip');
const Delimiter =
    require('../../../../lib/algos/list/delimiter').Delimiter;

describe('skip listing algorithm', () => {
    it('should call listing end callback', done => {
        const delimiter = new Delimiter({ maxKeys: 1 });
        const skip = new Skip({ extension: delimiter });

        skip.setListingEndCb(done);
        skip.setSkipRangeCb(() => {});

        /* Filter a first entry to reach MaxKeys and a second one to make the
         * extension filter method returns FILTER_END, triggering the listing
         * end event.  */
        skip.filter({ key: 'key1', value: 'value' });
        skip.filter({ key: 'key2', value: 'value' });
    });

    it('should call skip range callback with the new range value set to the ' +
       'last entry added to result, incremented', done => {
        /* A delimiter with a prefix value is used to easily skip values. */
        const prefix = 'prefix';
        const delimiter = new Delimiter({ prefix });
        const entryAddedKey = `${prefix}key`;

        /* The new range value is the last added entry incremented. */
        const expectedNewRange = Skip._inc(entryAddedKey);

        const skip = new Skip({ extension: delimiter });
        skip.setSkipRangeCb(newRange => {
            assert.strictEqual(expectedNewRange, newRange);
            done();
        });
        skip.setListingEndCb(() => {});

        /* Filter a valid entry. */
        skip.filter({ key: entryAddedKey, value: 'value' });

        /* Filter MAX_STREAK_LENGTH skipped entries to trigger the skip range
         * mechanism. */
        const entries = [];
        for (let i = 0; i < MAX_STREAK_LENGTH; i++) {
            entries.push({
                key: `key${i}`,
                value: '',
            });
        }
        entries.forEach(entry => { skip.filter(entry); });
    });

    it('should not call skip range callback when the new range is the same ' +
       'than the previous one', done => {
        /* To trigger this case we filter a valid entry before to filter
         * STREAK_MAX_LENGTH skipped ones, to:
         * - trigger the skip range callback and get the computed new range,
         * - make extension.skipping function returns a value and not
         *   undefined.
         * Then, to copy what is done by Skip code user, instanciate a new
         * Skip with the new range value used a gte parameter.
         * Finally, we filter STREAK_MAX_LENGTH skipped entries to trigger the
         * skip scan mechanism, but as long as no entry has been accepted this
         * time, the skipping function returns the same value. The new range is
         * the same than the previous one and we don't call the skip range CB
         * to avoid an unfinite loop.
         * */

        /* A delimiter with a prefix value is used to easily skip values. */
        const prefix = 'prefix';
        const entryAddedKey = `${prefix}key`;
        const delimiter = new Delimiter({ prefix });
        let skipRangeCbFirstCall = false;
        const entries = [];

        function skipRangeCb(range) {
            if (!skipRangeCbFirstCall) {
                /* Now we have a new range, instantiate a new Skip object with
                 * this range as gte parameter. */
                skipRangeCbFirstCall = true;
                const skip2 = new Skip({ extension: delimiter, gte: range });

                skip2.setListingEndCb(() => {});
                skip2.setSkipRangeCb(skipRangeCb);

                /* Skip 100 entries. If skip range mechanism is triggered, it
                 * will interrupt the following filtering loop to call the
                 * skipRangeCb function and reaches the next assert. */
                entries.forEach(entry => { skip2.filter(entry); });

                done();
                return;
            }
            assert(false);
        }

        const skip = new Skip({ extension: delimiter });
        skip.setListingEndCb(() => {});
        skip.setSkipRangeCb(skipRangeCb);

        /* Filter a valid entry. */
        skip.filter({ key: entryAddedKey, value: 'value' });

        /* Filter MAX_STREAK_LENGTH entries which will be skipped. */
        for (let i = 0; i < MAX_STREAK_LENGTH; i++) {
            entries.push({
                key: `key${i}`,
                value: '',
            });
        }
        entries.forEach(entry => { skip.filter(entry); });
    });
});
