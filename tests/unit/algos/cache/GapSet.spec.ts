import { OrderedSet } from '@js-sdsl/ordered-set';
import GapSet from '../../../../lib/algos/cache/GapSet';

function genRandomKey(): string {
    const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
    return new Array(16).fill(undefined).map(
        () => CHARS[Math.trunc(Math.random() * CHARS.length)]
    ).join('');
}

function genRandomUnchainedGaps(nGaps) {
    const gapBounds = new Array(nGaps * 2).fill(undefined).map(
        () => genRandomKey()
    );
    gapBounds.sort();
    const gapsArray = new Array(nGaps).fill(undefined).map(
        (_, i) => ({
            firstKey: gapBounds[2 * i],
            lastKey: gapBounds[2 * i + 1],
            weight: 10,
        })
    );
    return gapsArray;
}

function genRandomChainedGaps(nGaps) {
    const gapBounds = new Array(nGaps + 1).fill(undefined).map(
        () => genRandomKey()
    );
    gapBounds.sort();
    const gapsArray = new Array(nGaps).fill(undefined).map(
        (_, i) => ({
            firstKey: gapBounds[i],
            lastKey: gapBounds[i + 1],
            weight: 10,
        })
    );
    return gapsArray;
}

/**
 * Shuffle an array in-place
 *
 * @param {any[]} - The array to shuffle
 * @return {undefined}
 */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const randIndex = Math.trunc(Math.random() * (i + 1));
        const randIndexVal = array[randIndex];
        array[randIndex] = array[i];
        array[i] = randIndexVal;
    }
}

describe('GapSet', () => {
    const INITIAL_GAPSET = [
        { firstKey: 'bar', lastKey: 'baz', weight: 10 },
        { firstKey: 'qux', lastKey: 'quz', weight: 20 },
    ];
    const INITIAL_GAPSET_WITH_CHAIN = [
        // single-key gap
        { firstKey: 'ape', lastKey: 'ape', weight: 1 },
        // start of chain
        { firstKey: 'bar', lastKey: 'baz', weight: 10 },
        { firstKey: 'baz', lastKey: 'qux', weight: 15 },
        { firstKey: 'qux', lastKey: 'quz', weight: 20 },
        { firstKey: 'quz', lastKey: 'rat', weight: 25 },
        { firstKey: 'rat', lastKey: 'yak', weight: 30 },
        // end of chain
    ];

    let gapsArray;
    let gapSet;
    let gapsArrayWithChain;
    let gapSetWithChain;
    beforeEach(() => {
        gapsArray = JSON.parse(
            JSON.stringify(INITIAL_GAPSET)
        );
        gapSet = GapSet.createFromArray(gapsArray, 100);
        gapsArrayWithChain = JSON.parse(
            JSON.stringify(INITIAL_GAPSET_WITH_CHAIN)
        );
        gapSetWithChain = GapSet.createFromArray(gapsArrayWithChain, 100);
    });

    describe('GapSet::size', () => {
        it('should return 0 for an empty gap set', () => {
            const emptyGapSet = new GapSet(100);
            expect(emptyGapSet.size).toEqual(0);
        });

        it('should return the size of the gap set', () => {
            expect(gapSet.size).toEqual(2);
        });

        it('should reflect the new size after removal of gaps', () => {
            gapSet._gaps.eraseElementByKey({ firstKey: 'bar' });
            expect(gapSet.size).toEqual(1);
        });
    });

    describe('GapSet::maxWeight', () => {
        it('getter', () => {
            const emptyGapSet = new GapSet(123);
            expect(emptyGapSet.maxWeight).toEqual(123);
        });

        it('setter', () => {
            const emptyGapSet = new GapSet(123);
            emptyGapSet.maxWeight = 456;
            expect(emptyGapSet.maxWeight).toEqual(456);
        });
    });

    describe('GapSet::setGap()', () => {
        it('should start a gap with a single key in empty gap set', () => {
            const emptyGapSet = new GapSet(100);
            const gap = emptyGapSet.setGap('foo', 'foo', 1);
            expect(gap).toEqual({ firstKey: 'foo', lastKey: 'foo', weight: 1 });
            expect(emptyGapSet.toArray()).toEqual([
                { firstKey: 'foo', lastKey: 'foo', weight: 1 },
            ]);
        });

        it('should start a gap with a single key in non-empty gap set', () => {
            const gap = gapSet.setGap('foo', 'foo', 1);
            expect(gap).toEqual({ firstKey: 'foo', lastKey: 'foo', weight: 1 });
            expect(gapSet.toArray()).toEqual([
                { firstKey: 'bar', lastKey: 'baz', weight: 10 },
                { firstKey: 'foo', lastKey: 'foo', weight: 1 },
                { firstKey: 'qux', lastKey: 'quz', weight: 20 },
            ]);
        });

        it('should start a gap with multiple keys in empty gap set', () => {
            const emptyGapSet = new GapSet(100);
            const gap = emptyGapSet.setGap('foo', 'qux', 5);
            expect(gap).toEqual({ firstKey: 'foo', lastKey: 'qux', weight: 5 });
            expect(emptyGapSet.toArray()).toEqual([
                { firstKey: 'foo', lastKey: 'qux', weight: 5 },
            ]);
        });

        it('should return a new object rather than a gap managed by GapSet', () => {
            const emptyGapSet = new GapSet(100);
            const gap = emptyGapSet.setGap('foo', 'qux', 5);
            gap.lastKey = 'quz';
            // check that modifying the returned gap doesn't affect the GapSet
            expect(emptyGapSet.toArray()).toEqual([
                { firstKey: 'foo', lastKey: 'qux', weight: 5 },
            ]);
        });

        it('should return an existing gap that includes the wanted gap', () => {
            const gap = gapSet.setGap('bat', 'bay', 5);
            expect(gap).toEqual({ firstKey: 'bar', lastKey: 'baz', weight: 10 });
            expect(gapSet.toArray()).toEqual(INITIAL_GAPSET);
        });

        it('should return an existing gap that starts with the wanted gap first key', () => {
            const gap = gapSet.setGap('bar', 'bay', 5);
            expect(gap).toEqual({ firstKey: 'bar', lastKey: 'baz', weight: 10 });
            expect(gapSet.toArray()).toEqual(INITIAL_GAPSET);
        });

        it('should return an existing gap that ends with the wanted gap last key', () => {
            const gap = gapSet.setGap('bat', 'baz', 5);
            expect(gap).toEqual({ firstKey: 'bar', lastKey: 'baz', weight: 10 });
            expect(gapSet.toArray()).toEqual(INITIAL_GAPSET);
        });

        it('should return the existing chained gap that starts with the first key', () => {
            const gap = gapSetWithChain.setGap('baz', 'quo', 10);
            expect(gap).toEqual({ firstKey: 'baz', lastKey: 'qux', weight: 15 });
            expect(gapSetWithChain.toArray()).toEqual(INITIAL_GAPSET_WITH_CHAIN);
        });

        it('should extend a single-key gap with no other gap', () => {
            const singleKeyGap = { firstKey: 'foo', lastKey: 'foo', weight: 1 };
            const singleKeyGapSet = GapSet.createFromArray([singleKeyGap], 100);

            const extendedGap = singleKeyGapSet.setGap('foo', 'qux', 30);
            expect(extendedGap).toEqual({ firstKey: 'foo', lastKey: 'qux', weight: 31 });
            expect(singleKeyGapSet.toArray()).toEqual([
                { firstKey: 'foo', lastKey: 'qux', weight: 31 },
            ]);
        });

        it('should extend a gap with no next gap', () => {
            // existing gap: 'qux' -> 'quz'
            const extendedGap = gapSet.setGap('qux', 'rat', 25);
            expect(extendedGap).toEqual({ firstKey: 'qux', lastKey: 'rat', weight: 25 });
            expect(gapSet.toArray()).toEqual([
                { firstKey: 'bar', lastKey: 'baz', weight: 10 },
                { firstKey: 'qux', lastKey: 'rat', weight: 25 },
            ]);
        });

        it('should extend a gap without overlap with next gap', () => {
            // existing gap: 'bar' -> 'baz'
            const extendedGap = gapSet.setGap('bar', 'dog', 15);
            expect(extendedGap).toEqual({ firstKey: 'bar', lastKey: 'dog', weight: 15 });
            expect(gapSet.toArray()).toEqual([
                { firstKey: 'bar', lastKey: 'dog', weight: 15 },
                { firstKey: 'qux', lastKey: 'quz', weight: 20 },
            ]);
        });

        it('should extend a gap starting from its last key', () => {
            // existing gap: 'qux' -> 'quz'
            const extendedGap = gapSet.setGap('quz', 'rat', 5);
            expect(extendedGap).toEqual({ firstKey: 'qux', lastKey: 'rat', weight: 25 });
            expect(gapSet.toArray()).toEqual([
                { firstKey: 'bar', lastKey: 'baz', weight: 10 },
                { firstKey: 'qux', lastKey: 'rat', weight: 25 },
            ]);
        });

        it('should merge with next gap with single-key overlap if total weight is ' +
        'under maxWeight', () => {
            const extendedGap = gapSet.setGap('bar', 'qux', 80);
            // updated weight is accurately set as the sum of
            // overlapping individual gap weights
            expect(extendedGap).toEqual({ firstKey: 'bar', lastKey: 'quz', weight: 80 + 20 });
            expect(gapSet.toArray()).toEqual([
                { firstKey: 'bar', lastKey: 'quz', weight: 80 + 20 },
            ]);
        });

        it('should chain with next gap with single-key overlap if total weight is ' +
        'above maxWeight', () => {
            const extendedGap = gapSet.setGap('bar', 'qux', 90);
            expect(extendedGap).toEqual({ firstKey: 'qux', lastKey: 'quz', weight: 20 });
            expect(gapSet.toArray()).toEqual([
                { firstKey: 'bar', lastKey: 'qux', weight: 90 },
                { firstKey: 'qux', lastKey: 'quz', weight: 20 },
            ]);
        });

        it('should merge with both previous and next gap if bounds overlap by a ' +
        'single key and total weight is under maxWeight', () => {
            const extendedGap = gapSet.setGap('baz', 'qux', 30);
            // updated weight is accurately set as the sum of
            // overlapping individual gap weights
            expect(extendedGap).toEqual({ firstKey: 'bar', lastKey: 'quz', weight: 10 + 30 + 20 });
            expect(gapSet.toArray()).toEqual([
                { firstKey: 'bar', lastKey: 'quz', weight: 10 + 30 + 20 },
            ]);
        });

        it('should merge with previous gap and chain with next gap if bounds overlap by a ' +
        'single key on either side and weight is above maxWeight when merging on right side', () => {
            const extendedGap = gapSet.setGap('baz', 'qux', 90);
            expect(extendedGap).toEqual({ firstKey: 'qux', lastKey: 'quz', weight: 20 });
            expect(gapSet.toArray()).toEqual([
                { firstKey: 'bar', lastKey: 'qux', weight: 100 },
                { firstKey: 'qux', lastKey: 'quz', weight: 20 },
            ]);
        });

        it('should chain with previous gap and merge with next gap if bounds overlap by a ' +
        'single key on either side and weight is above maxWeight when merging on left side', () => {
            // modified version of the common test set with increased weight
            // for 'bar' -> 'baz'
            const gapSet = GapSet.createFromArray([
                { firstKey: 'bar', lastKey: 'baz', weight: 80 },
                { firstKey: 'qux', lastKey: 'quz', weight: 20 },
            ], 100);
            const extendedGap = gapSet.setGap('baz', 'qux', 70);
            expect(extendedGap).toEqual({ firstKey: 'baz', lastKey: 'quz', weight: 90 });
            expect(gapSet.toArray()).toEqual([
                { firstKey: 'bar', lastKey: 'baz', weight: 80 },
                { firstKey: 'baz', lastKey: 'quz', weight: 90 },
            ]);
        });

        it('should merge with both previous and next gap if left bound overlaps by a ' +
        'single key and total weight is under maxWeight', () => {
            const extendedGap = gapSet.setGap('baz', 'quxxx', 40);
            // updated weight is heuristically set as the sum of the
            // previous chained gap's weight and the new weight
            // (excluding the overlapping gap on right side)
            expect(extendedGap).toEqual({ firstKey: 'bar', lastKey: 'quz', weight: 10 + 40 });
            expect(gapSet.toArray()).toEqual([
                { firstKey: 'bar', lastKey: 'quz', weight: 10 + 40 },
            ]);
        });

        it('should chain with previous gap and merge with next gap if left bound overlaps by a ' +
        'single key and total weight is above maxWeight', () => {
            const extendedGap = gapSet.setGap('baz', 'quxxx', 95);
            // updated weight is accurately set as the sum of
            // overlapping individual gap weights
            expect(extendedGap).toEqual({ firstKey: 'baz', lastKey: 'quz', weight: 95 });
            expect(gapSet.toArray()).toEqual([
                { firstKey: 'bar', lastKey: 'baz', weight: 10 },
                { firstKey: 'baz', lastKey: 'quz', weight: 95 },
            ]);
        });

        it('should extend a gap with overlap with next gap and large weight', () => {
            const extendedGap = gapSet.setGap('bar', 'quxxx', 80);
            // updated weight is heuristically chosen to be the new
            // gap weight which is larger than the sum of the existing merged
            // gap weights
            expect(extendedGap).toEqual({ firstKey: 'bar', lastKey: 'quz', weight: 80 });
            expect(gapSet.toArray()).toEqual([
                { firstKey: 'bar', lastKey: 'quz', weight: 80 },
            ]);
        });

        it('should extend a gap with overlap with next gap and small weight', () => {
            const extendedGap = gapSet.setGap('bar', 'quxxx', 11);
            // updated weight is heuristically chosen to be the sum of the existing merged
            // gap weights which is larger than the new gap weight
            expect(extendedGap).toEqual({ firstKey: 'bar', lastKey: 'quz', weight: 10 + 20 });
            expect(gapSet.toArray()).toEqual([
                { firstKey: 'bar', lastKey: 'quz', weight: 10 + 20 },
            ]);
        });

        it('should extend a gap with overlap beyond last key of next gap', () => {
            const extendedGap = gapSet.setGap('bar', 'rat', 80);
            // updated weight is the new gap weight
            expect(extendedGap).toEqual({ firstKey: 'bar', lastKey: 'rat', weight: 80 });
            expect(gapSet.toArray()).toEqual([
                { firstKey: 'bar', lastKey: 'rat', weight: 80 },
            ]);
        });

        it('should extend a gap with overlap beyond last key of next gap with a chained gap ' +
        'if above maxWeight', () => {
            // gapSet was initialized with maxWeight=100
            const extendedGap = gapSet.setGap('bar', 'rat', 105);
            // returned new gap is the right-side chained gap
            // updated weight is the new gap weight minus the left-side chained gap's weight
            expect(extendedGap).toEqual({ firstKey: 'baz', lastKey: 'rat', weight: 105 - 10 });
            expect(gapSet.toArray()).toEqual([
                { firstKey: 'bar', lastKey: 'baz', weight: 10 },
                { firstKey: 'baz', lastKey: 'rat', weight: 105 - 10 },
            ]);
        });

        it('should extend a single-key gap with overlap on chained gaps', () => {
            // existing gap: 'ape' -> 'ape' (weight=1)
            const extendedGap = gapSetWithChain.setGap('ape', 'dog', 30);
            // updated weight heuristically including the new gap
            // weight, which is larger than the overlapping gaps cumulated
            // weights (10+15=25)
            expect(extendedGap).toEqual({ firstKey: 'ape', lastKey: 'qux', weight: 30 });
            expect(gapSetWithChain.toArray()).toEqual([
                { firstKey: 'ape', lastKey: 'qux', weight: 30 },
                { firstKey: 'qux', lastKey: 'quz', weight: 20 },
                { firstKey: 'quz', lastKey: 'rat', weight: 25 },
                { firstKey: 'rat', lastKey: 'yak', weight: 30 },
            ]);
        });

        it('should merge and extend + update weight a gap with overlap not past end of chained gaps',
            () => {
                const extendedGap = gapSetWithChain.setGap('baz', 'sea', 80);
                expect(extendedGap).toEqual({ firstKey: 'baz', lastKey: 'yak', weight: 90 });
                expect(gapSetWithChain.toArray()).toEqual([
                    { firstKey: 'ape', lastKey: 'ape', weight: 1 },
                    { firstKey: 'bar', lastKey: 'baz', weight: 10 },
                    { firstKey: 'baz', lastKey: 'yak', weight: 90 },
                ]);
            });

        it('should merge and extend + update weight a gap with overlap past end of chained gaps',
            () => {
                const extendedGap = gapSetWithChain.setGap('baz', 'zoo', 95);
                expect(extendedGap).toEqual({ firstKey: 'baz', lastKey: 'zoo', weight: 95 });
                expect(gapSetWithChain.toArray()).toEqual([
                    { firstKey: 'ape', lastKey: 'ape', weight: 1 },
                    { firstKey: 'bar', lastKey: 'baz', weight: 10 },
                    { firstKey: 'baz', lastKey: 'zoo', weight: 95 },
                ]);
            });

        it('should extend gap + update weight with overlap past end of chained gaps and ' +
        'above maxWeight', () => {
            const extendedGap = gapSetWithChain.setGap('baz', 'zoo', 105);
            // updated weight is the new gap weight minus the left-side chained gap's weight
            expect(extendedGap).toEqual({ firstKey: 'qux', lastKey: 'zoo', weight: 105 - 15 });
            expect(gapSetWithChain.toArray()).toEqual([
                { firstKey: 'ape', lastKey: 'ape', weight: 1 },
                { firstKey: 'bar', lastKey: 'baz', weight: 10 },
                { firstKey: 'baz', lastKey: 'qux', weight: 15 },
                { firstKey: 'qux', lastKey: 'zoo', weight: 105 - 15 },
            ]);
        });

        it('should return existing chained gap with overlap above maxWeight', () => {
            const chainedGapsArray = [
                { firstKey: 'ant', lastKey: 'cat', weight: 90 },
                { firstKey: 'cat', lastKey: 'fox', weight: 40 },
            ];
            const chainedGapsSet = GapSet.createFromArray(chainedGapsArray, 100);
            const extendedGap = chainedGapsSet.setGap('bat', 'dog', 105);
            expect(extendedGap).toEqual({ firstKey: 'cat', lastKey: 'fox', weight: 40 });
            expect(chainedGapsSet.toArray()).toEqual([
                { firstKey: 'ant', lastKey: 'cat', weight: 90 },
                { firstKey: 'cat', lastKey: 'fox', weight: 40 },
            ]);
        });

        it('should merge but not extend nor update weight with overlap on chained gaps', () => {
            // existing chained gap: 'baz' -> 'qux'
            const extendedGap = gapSetWithChain.setGap('baz', 'quxxx', 25);
            // updated weight is the sum of the two merged gap's weights
            expect(extendedGap).toEqual({ firstKey: 'baz', lastKey: 'quz', weight: 15 + 20 });
            expect(gapSetWithChain.toArray()).toEqual([
                { firstKey: 'ape', lastKey: 'ape', weight: 1 },
                { firstKey: 'bar', lastKey: 'baz', weight: 10 },
                { firstKey: 'baz', lastKey: 'quz', weight: 15 + 20 },
                { firstKey: 'quz', lastKey: 'rat', weight: 25 },
                { firstKey: 'rat', lastKey: 'yak', weight: 30 },
            ]);
        });
    });

    describe('GapSet::removeOverlappingGaps()', () => {
        describe('with zero key as parameter', () => {
            it('passed in an array: should not remove any gap', () => {
                const nRemoved = gapSet.removeOverlappingGaps([]);
                expect(nRemoved).toEqual(0);
                expect(gapSet.toArray()).toEqual(INITIAL_GAPSET);
            });
            it('passed in a OrderedSet: should not remove any gap', () => {
                const nRemoved = gapSet.removeOverlappingGaps(new OrderedSet());
                expect(nRemoved).toEqual(0);
                expect(gapSet.toArray()).toEqual(INITIAL_GAPSET);
            });
        });
        describe('with an array of one key as parameter', () => {
            it('should not remove any gap if no overlap', () => {
                const nRemoved = gapSet.removeOverlappingGaps(['rat']);
                expect(nRemoved).toEqual(0);
                expect(gapSet.toArray()).toEqual(INITIAL_GAPSET);
            });

            it('should remove a single gap if overlaps', () => {
                const nRemoved = gapSet.removeOverlappingGaps(['bat']);
                expect(nRemoved).toEqual(1);
                expect(gapSet.toArray()).toEqual([
                    // removed: { firstKey: 'bar', lastKey: 'baz', weight: 10 },
                    { firstKey: 'qux', lastKey: 'quz', weight: 20 },
                ]);
            });

            it('should remove a single gap if overlaps with first key of first gap', () => {
                const nRemoved = gapSet.removeOverlappingGaps(['bar']);
                expect(nRemoved).toEqual(1);
                expect(gapSet.toArray()).toEqual([
                    // removed: { firstKey: 'bar', lastKey: 'baz', weight: 10 },
                    { firstKey: 'qux', lastKey: 'quz', weight: 20 },
                ]);
            });

            it('should remove a single gap if overlaps with first key of non-first gap', () => {
                const nRemoved = gapSet.removeOverlappingGaps(['qux']);
                expect(nRemoved).toEqual(1);
                expect(gapSet.toArray()).toEqual([
                    { firstKey: 'bar', lastKey: 'baz', weight: 10 },
                    // removed: { firstKey: 'qux', lastKey: 'quz', weight: 20 },
                ]);
            });

            it('should remove a single gap if overlaps with last key', () => {
                const nRemoved = gapSet.removeOverlappingGaps(['quz']);
                expect(nRemoved).toEqual(1);
                expect(gapSet.toArray()).toEqual([
                    { firstKey: 'bar', lastKey: 'baz', weight: 10 },
                    // removed: { firstKey: 'qux', lastKey: 'quz', weight: 20 },
                ]);
            });

            it('should remove a single gap in chain if overlaps with one chained gap', () => {
                const nRemoved = gapSetWithChain.removeOverlappingGaps(['dog']);
                expect(nRemoved).toEqual(1);
                expect(gapSetWithChain.toArray()).toEqual([
                    { firstKey: 'ape', lastKey: 'ape', weight: 1 },
                    { firstKey: 'bar', lastKey: 'baz', weight: 10 },
                    // removed: { firstKey: 'baz', lastKey: 'qux', weight: 15 },
                    { firstKey: 'qux', lastKey: 'quz', weight: 20 },
                    { firstKey: 'quz', lastKey: 'rat', weight: 25 },
                    { firstKey: 'rat', lastKey: 'yak', weight: 30 },
                ]);
            });

            it('should remove two gaps in chain if overlaps with two chained gap', () => {
                const nRemoved = gapSetWithChain.removeOverlappingGaps(['qux']);
                expect(nRemoved).toEqual(2);
                expect(gapSetWithChain.toArray()).toEqual([
                    { firstKey: 'ape', lastKey: 'ape', weight: 1 },
                    { firstKey: 'bar', lastKey: 'baz', weight: 10 },
                    // removed: { firstKey: 'baz', lastKey: 'qux', weight: 15 },
                    // removed: { firstKey: 'qux', lastKey: 'quz', weight: 20 },
                    { firstKey: 'quz', lastKey: 'rat', weight: 25 },
                    { firstKey: 'rat', lastKey: 'yak', weight: 30 },
                ]);
            });
        });

        describe('with an array of two keys as parameter', () => {
            it('should not remove any gap if no overlap', () => {
                const nRemoved = gapSet.removeOverlappingGaps(['rat', 'rat\0v100']);
                expect(nRemoved).toEqual(0);
                expect(gapSet.toArray()).toEqual(INITIAL_GAPSET);
            });

            it('should remove a single gap if both keys overlap', () => {
                const nRemoved = gapSet.removeOverlappingGaps(['bat', 'bat\0v100']);
                expect(nRemoved).toEqual(1);
                expect(gapSet.toArray()).toEqual([
                    // removed: { firstKey: 'bar', lastKey: 'baz', weight: 10 },
                    { firstKey: 'qux', lastKey: 'quz', weight: 20 },
                ]);
            });

            it('should remove a single gap if min key overlaps with first key of first gap', () => {
                const nRemoved = gapSet.removeOverlappingGaps(['bar\0v100', 'bar']);
                expect(nRemoved).toEqual(1);
                expect(gapSet.toArray()).toEqual([
                    // removed: { firstKey: 'bar', lastKey: 'baz', weight: 10 },
                    { firstKey: 'qux', lastKey: 'quz', weight: 20 },
                ]);
            });

            it('should remove a single gap if max key overlaps with first key of first gap', () => {
                const nRemoved = gapSet.removeOverlappingGaps(['ape', 'bar']);
                expect(nRemoved).toEqual(1);
                expect(gapSet.toArray()).toEqual([
                    // removed: { firstKey: 'bar', lastKey: 'baz', weight: 10 },
                    { firstKey: 'qux', lastKey: 'quz', weight: 20 },
                ]);
            });

            it('should not remove any gap if both keys straddle an existing gap without overlap',
                () => {
                    const nRemoved = gapSet.removeOverlappingGaps(['cow', 'ape']);
                    expect(nRemoved).toEqual(0);
                    expect(gapSet.toArray()).toEqual([
                        { firstKey: 'bar', lastKey: 'baz', weight: 10 },
                        { firstKey: 'qux', lastKey: 'quz', weight: 20 },
                    ]);
                });

            it('should remove the two last gaps in chained gaps if last gap bounds match ' +
            'the two keys', () => {
                const nRemoved = gapSetWithChain.removeOverlappingGaps(['yak', 'rat']);
                expect(nRemoved).toEqual(2);
                expect(gapSetWithChain.toArray()).toEqual([
                    { firstKey: 'ape', lastKey: 'ape', weight: 1 },
                    { firstKey: 'bar', lastKey: 'baz', weight: 10 },
                    { firstKey: 'baz', lastKey: 'qux', weight: 15 },
                    { firstKey: 'qux', lastKey: 'quz', weight: 20 },
                    // removed: { firstKey: 'quz', lastKey: 'rat', weight: 25 },
                    // removed: { firstKey: 'rat', lastKey: 'yak', weight: 30 },
                ]);
            });

            it('should remove first and last gap in chained gaps if their bounds match ' +
            'the two keys', () => {
                const nRemoved = gapSetWithChain.removeOverlappingGaps(['yak', 'bar']);
                expect(nRemoved).toEqual(2);
                expect(gapSetWithChain.toArray()).toEqual([
                    { firstKey: 'ape', lastKey: 'ape', weight: 1 },
                    // removed: { firstKey: 'bar', lastKey: 'baz', weight: 10 },
                    { firstKey: 'baz', lastKey: 'qux', weight: 15 },
                    { firstKey: 'qux', lastKey: 'quz', weight: 20 },
                    { firstKey: 'quz', lastKey: 'rat', weight: 25 },
                    // removed: { firstKey: 'rat', lastKey: 'yak', weight: 30 },
                ]);
            });
        });

        describe('with an array of three keys as parameter', () => {
            it('should remove a single gap if only median key overlaps with gap', () => {
                const nRemoved = gapSet.removeOverlappingGaps(['ape', 'bat', 'cow']);
                expect(nRemoved).toEqual(1);
                expect(gapSet.toArray()).toEqual([
                    // removed: { firstKey: 'bar', lastKey: 'baz', weight: 10 },
                    { firstKey: 'qux', lastKey: 'quz', weight: 20 },
                ]);
            });

            it('should remove a single-key gap and two contiguous chained gaps each overlapping' +
            'with one key', () => {
                const nRemoved = gapSetWithChain.removeOverlappingGaps(['ape', 'bat', 'cow']);
                expect(nRemoved).toEqual(3);
                expect(gapSetWithChain.toArray()).toEqual([
                    // removed: { firstKey: 'ape', lastKey: 'ape', weight: 1 },
                    // removed: { firstKey: 'bar', lastKey: 'baz', weight: 10 },
                    // removed: { firstKey: 'baz', lastKey: 'qux', weight: 15 },
                    { firstKey: 'qux', lastKey: 'quz', weight: 20 },
                    { firstKey: 'quz', lastKey: 'rat', weight: 25 },
                    { firstKey: 'rat', lastKey: 'yak', weight: 30 },
                ]);
            });

            it('should not remove any gap if all keys are intermingled but do not overlap', () => {
                const nRemoved = gapSet.removeOverlappingGaps(['ape', 'rat', 'cow']);
                expect(nRemoved).toEqual(0);
                expect(gapSet.toArray()).toEqual([
                    { firstKey: 'bar', lastKey: 'baz', weight: 10 },
                    { firstKey: 'qux', lastKey: 'quz', weight: 20 },
                ]);
            });

            it('should remove three discontiguous chained gaps each overlapping with one key', () => {
                const nRemoved = gapSetWithChain.removeOverlappingGaps(['bat', 'quxxx', 'tiger']);
                expect(nRemoved).toEqual(3);
                expect(gapSetWithChain.toArray()).toEqual([
                    { firstKey: 'ape', lastKey: 'ape', weight: 1 },
                    // removed: { firstKey: 'bar', lastKey: 'baz', weight: 10 },
                    { firstKey: 'baz', lastKey: 'qux', weight: 15 },
                    // removed: { firstKey: 'qux', lastKey: 'quz', weight: 20 },
                    { firstKey: 'quz', lastKey: 'rat', weight: 25 },
                    // { firstKey: 'rat', lastKey: 'yak', weight: 30 },
                ]);
            });
        });

        describe('with a OrderedSet of three keys as parameter', () => {
            it('should remove a single gap if only median key overlaps with gap', () => {
                const nRemoved = gapSet.removeOverlappingGaps(
                    new OrderedSet(['ape', 'bat', 'cow']));
                expect(nRemoved).toEqual(1);
                expect(gapSet.toArray()).toEqual([
                    // removed: { firstKey: 'bar', lastKey: 'baz', weight: 10 },
                    { firstKey: 'qux', lastKey: 'quz', weight: 20 },
                ]);
            });
        });

        // this helper checks that:
        // - the gaps not overlapping with any key are still present in newGapsArray
        // - and the gaps overlapping with at least one key have been removed from oldGapsArray
        // NOTE: It uses a sorted list of keys for efficiency, otherwise it would require
        // O(n^2) compute time which would be expensive with 50K keys.
        function checkOverlapInvariant(sortedKeys, oldGapsArray, newGapsArray) {
            let oldGapIdx = 0;
            let newGapIdx = 0;
            for (const key of sortedKeys) {
                // for all gaps not overlapping with any key in 'sortedKeys',
                // check that they are still in 'newGapsArray'
                while (oldGapIdx < oldGapsArray.length &&
                       oldGapsArray[oldGapIdx].lastKey < key) {
                    expect(oldGapsArray[oldGapIdx]).toEqual(newGapsArray[newGapIdx]);
                    oldGapIdx += 1;
                    newGapIdx += 1;
                }
                // for the gap(s) overlapping with the current key,
                // check that they have been removed from 'newGapsArray'
                while (oldGapIdx < oldGapsArray.length &&
                       oldGapsArray[oldGapIdx].firstKey <= key) {
                    if (newGapIdx < newGapsArray.length) {
                        expect(oldGapsArray[oldGapIdx]).not.toEqual(newGapsArray[newGapIdx]);
                    }
                    ++oldGapIdx;
                }
            }
            // check the range after the last key in 'sortedKeys'
            while (oldGapIdx < oldGapsArray.length) {
                expect(oldGapsArray[oldGapIdx]).toEqual(newGapsArray[newGapIdx]);
                oldGapIdx += 1;
                newGapIdx += 1;
            }
            // check that no extra range is in newGapsArray
            expect(newGapIdx).toEqual(newGapsArray.length);
        }

        [false, true].forEach(chained => {
            describe(`with 10K random ${chained ? 'chained' : 'unchained'} gaps`, () => {
                let largeGapsArray;
                let largeGapSet;
                beforeEach(() => {
                    largeGapsArray = chained ?
                        genRandomChainedGaps(10000) :
                        genRandomUnchainedGaps(10000);
                    largeGapSet = GapSet.createFromArray(largeGapsArray, 100);
                });

                [{
                    desc: 'equal to their first key',
                    getGapKey: gap => gap.firstKey,
                }, {
                    desc: 'equal to their last key',
                    getGapKey: gap => gap.lastKey,
                }, {
                    desc: 'neither their first nor last key',
                    getGapKey: gap => `${gap.firstKey}/foo`,
                }].forEach(testCase => {
                    it(`should remove the overlapping gap(s) with one key ${testCase.desc}`, () => {
                        const gapIndex = 5000;
                        const gap = largeGapsArray[gapIndex];
                        const overlappingKey = testCase.getGapKey(gap);
                        const nRemoved = largeGapSet.removeOverlappingGaps([overlappingKey]);
                        let firstRemovedGapIndex, lastRemovedGapIndex;
                        if (chained && overlappingKey === gap.firstKey) {
                            expect(nRemoved).toEqual(2);
                            [firstRemovedGapIndex, lastRemovedGapIndex] = [4999, 5000];
                        } else if (chained && overlappingKey === gap.lastKey) {
                            expect(nRemoved).toEqual(2);
                            [firstRemovedGapIndex, lastRemovedGapIndex] = [5000, 5001];
                        } else {
                            expect(nRemoved).toEqual(1);
                            [firstRemovedGapIndex, lastRemovedGapIndex] = [5000, 5000];
                        }
                        const expectedGaps = [
                            ...largeGapsArray.slice(0, firstRemovedGapIndex),
                            ...largeGapsArray.slice(lastRemovedGapIndex + 1)
                        ];
                        const newGaps = largeGapSet.toArray();
                        expect(newGaps).toEqual(expectedGaps);
                    });

                    it(`should remove all gaps when they all overlap with one key ${testCase.desc}`,
                        () => {
                            // simulate a scenario made of 200 batches of 50 operations, each with
                            // random keys scattered across all gaps that each overlaps a distinct gap
                            // (supposedly a worst-case performance scenario for such batch sizes)
                            const overlappingKeys = largeGapsArray.map(testCase.getGapKey);
                            shuffleArray(overlappingKeys);
                            for (let i = 0; i < overlappingKeys.length; i += 50) {
                                const nRemoved = largeGapSet.removeOverlappingGaps(
                                    overlappingKeys.slice(i, i + 50));
                                // with unchained gaps, we expect to have removed exactly
                                // 50 gaps (the size of 'overlappingKeys').
                                if (!chained) {
                                    expect(nRemoved).toEqual(50);
                                }
                            }
                            const newGaps = largeGapSet.toArray();
                            expect(newGaps).toEqual([]);
                        });
                });

                it('should remove only and all overlapping gaps with 50K randomized keys', () => {
                    const randomizedKeys = new Array(50000).fill(undefined).map(
                        () => genRandomKey()
                    );
                    for (let i = 0; i < randomizedKeys.length; i += 50) {
                        largeGapSet.removeOverlappingGaps(
                            randomizedKeys.slice(i, i + 50));
                    }
                    const newGaps = largeGapSet.toArray();
                    randomizedKeys.sort();
                    checkOverlapInvariant(randomizedKeys, largeGapsArray, newGaps);
                });
            });
        });
    });

    describe('GapSet::_coalesceGapChain()', () => {
        afterEach(() => {
            // check that the gap sets were not modified by the operation
            expect(gapSet.toArray()).toEqual(INITIAL_GAPSET);
            expect(gapSetWithChain.toArray()).toEqual(INITIAL_GAPSET_WITH_CHAIN);
        });
        it('should not coalesce if gaps are not chained', async () => {
            const gap = { firstKey: 'bar', lastKey: 'baz', weight: 10 };
            const coalescedGap = await gapSet._coalesceGapChain(gap);
            expect(coalescedGap).toEqual({ firstKey: 'bar', lastKey: 'baz', weight: 10 });
        });

        it('should coalesce one chained gap', async () => {
            const gap = { firstKey: 'quz', lastKey: 'rat', weight: 25 };
            const coalescedGap = await gapSetWithChain._coalesceGapChain(gap);
            expect(coalescedGap).toEqual({ firstKey: 'quz', lastKey: 'yak', weight: 55 });
        });

        it('should coalesce a chain of five gaps', async () => {
            const gap = { firstKey: 'bar', lastKey: 'baz', weight: 10 };
            const coalescedGap = await gapSetWithChain._coalesceGapChain(gap);
            expect(coalescedGap).toEqual({ firstKey: 'bar', lastKey: 'yak', weight: 100 });
        });

        it('should coalesce a chain of one thousand gaps', async () => {
            const getKey = i => `000${i}`.slice(-4);
            const thousandGapsArray = new Array(1000).fill(undefined).map(
                (_, i) => ({ firstKey: getKey(i), lastKey: getKey(i + 1), weight: 10 })
            );
            const thousandGapsSet = GapSet.createFromArray(thousandGapsArray, 100);
            const gap = { firstKey: '0000', lastKey: '0001', weight: 10 };
            const coalescedGap = await thousandGapsSet._coalesceGapChain(gap);
            expect(coalescedGap).toEqual({ firstKey: '0000', lastKey: '1000', weight: 10000 });
        });

        it('should coalesce a single-key gap', async () => {
            const singleKeyGapSet = GapSet.createFromArray([
                { firstKey: '0000', lastKey: '0000', weight: 1 },
            ], 100);
            const gap = { firstKey: '0000', lastKey: '0000', weight: 1 };
            const coalescedGap = await singleKeyGapSet._coalesceGapChain(gap);
            expect(coalescedGap).toEqual({ firstKey: '0000', lastKey: '0000', weight: 1 });
        });

        it('should coalesce a chain of two gaps ending with a single-key gap', async () => {
            const singleKeyGapSet = GapSet.createFromArray([
                { firstKey: '0000', lastKey: '0003', weight: 9 },
                { firstKey: '0003', lastKey: '0003', weight: 1 },
            ], 100);
            const gap = { firstKey: '0000', lastKey: '0003', weight: 9 };
            const coalescedGap = await singleKeyGapSet._coalesceGapChain(gap);
            expect(coalescedGap).toEqual({ firstKey: '0000', lastKey: '0003', weight: 9 });
        });
    });

    describe('GapSet::lookupGap()', () => {
        afterEach(() => {
            // check that the gap sets were not modified by the operation
            expect(gapSet.toArray()).toEqual(INITIAL_GAPSET);
            expect(gapSetWithChain.toArray()).toEqual(INITIAL_GAPSET_WITH_CHAIN);
        });

        it('should return null with empty cache', async () => {
            const emptyGapSet = new GapSet(100);
            const gap = await emptyGapSet.lookupGap('cat', 'dog');
            expect(gap).toBeNull();
        });

        it('should return null if no gap overlaps [minKey, maxKey]', async () => {
            const gap = await gapSet.lookupGap('cat', 'dog');
            expect(gap).toBeNull();
        });

        it('should return the first gap that overlaps if all gaps overlap', async () => {
            const gap = await gapSet.lookupGap('ape', 'zoo');
            expect(gap).toEqual({ firstKey: 'bar', lastKey: 'baz', weight: 10 });
        });

        it('should return an existing gap that contains [minKey, maxKey]', async () => {
            const gap1 = await gapSet.lookupGap('bat', 'bay');
            expect(gap1).toEqual({ firstKey: 'bar', lastKey: 'baz', weight: 10 });
            const gap2 = await gapSet.lookupGap('quxxx', 'quy');
            expect(gap2).toEqual({ firstKey: 'qux', lastKey: 'quz', weight: 20 });
        });

        it('should return an existing gap that overlaps with minKey but not maxKey', async () => {
            const gap = await gapSet.lookupGap('ape', 'bat');
            expect(gap).toEqual({ firstKey: 'bar', lastKey: 'baz', weight: 10 });
        });

        it('should return an existing gap that overlaps just with minKey when no maxKey is provided',
            async () => {
                const gap = await gapSet.lookupGap('ape');
                expect(gap).toEqual({ firstKey: 'bar', lastKey: 'baz', weight: 10 });
            });

        it('should return an existing gap that overlaps with maxKey but not minKey', async () => {
            const gap = await gapSet.lookupGap('bat', 'cat');
            expect(gap).toEqual({ firstKey: 'bar', lastKey: 'baz', weight: 10 });
        });

        it('should return an existing gap that is contained in [minKey, maxKey] strictly', async () => {
            const gap = await gapSet.lookupGap('dog', 'rat');
            expect(gap).toEqual({ firstKey: 'qux', lastKey: 'quz', weight: 20 });
        });

        it('should return a coalesced gap from chained gaps that fully overlaps [minKey, maxKey]', async () => {
            const gap = await gapSetWithChain.lookupGap('bat', 'zoo');
            expect(gap).toEqual({ firstKey: 'bar', lastKey: 'yak', weight: 100 });
        });

        it('should return a coalesced gap from chained gaps that contain [minKey, maxKey] strictly',
            async () => {
                const gap = await gapSetWithChain.lookupGap('bog', 'dog');
                expect(gap).toEqual({ firstKey: 'baz', lastKey: 'yak', weight: 90 });
            });
    });
});
