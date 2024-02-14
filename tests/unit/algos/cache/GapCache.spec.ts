import GapCache from '../../../../lib/algos/cache/GapCache';

describe('GapCache', () => {
    let gapCache;

    beforeEach(() => {
        // exposureDelayMs=100, maxGaps=10, maxGapWeight=100
        gapCache = new GapCache(100, 10, 100);
        gapCache.start();
    });
    afterEach(() => {
        gapCache.stop();
    });

    describe('getters and setters', () => {
        it('maxGapWeight getter', () => {
            expect(gapCache.maxGapWeight).toEqual(100);
        });

        it('maxGapWeight setter', () => {
            gapCache.maxGapWeight = 123;
            expect(gapCache.maxGapWeight).toEqual(123);
            // check that internal gap sets have also been updated
            expect(gapCache._stagingUpdates.newGaps.maxWeight).toEqual(123);
            expect(gapCache._frozenUpdates.newGaps.maxWeight).toEqual(123);
        });

        it('exposureDelayMs getter', () => {
            expect(gapCache.exposureDelayMs).toEqual(100);
        });

        it('exposureDelayMs setter', async () => {
            // insert a first gap
            gapCache.setGap('bar', 'baz', 10);

            // change the exposure delay to 50ms
            gapCache.exposureDelayMs = 50;
            expect(gapCache.exposureDelayMs).toEqual(50);

            gapCache.setGap('qux', 'quz', 10);

            // wait for more than twice the new exposure delay
            await new Promise(resolve => setTimeout(resolve, 200));

            // only the second gap should have been exposed, due to the change of
            // exposure delay subsequent to the first call to setGap()
            expect(await gapCache.lookupGap('ape', 'zoo')).toEqual(
                { firstKey: 'qux', lastKey: 'quz', weight: 10 }
            );
        });
    });

    describe('clear()', () => {
        it('should clear all exposed gaps', async () => {
            gapCache.setGap('bar', 'baz', 10);
            gapCache.setGap('qux', 'quz', 20);
            await new Promise(resolve => setTimeout(resolve, 300));

            expect(await gapCache.lookupGap('ape', 'zoo')).toEqual(
                { firstKey: 'bar', lastKey: 'baz', weight: 10 }
            );
            gapCache.clear();
            expect(await gapCache.lookupGap('ape', 'zoo')).toBeNull();
        });

        it('should clear all staging gaps', async () => {
            gapCache.setGap('bar', 'baz', 10);
            gapCache.setGap('qux', 'quz', 20);

            gapCache.clear();
            await new Promise(resolve => setTimeout(resolve, 300));

            expect(await gapCache.lookupGap('ape', 'zoo')).toBeNull();
        });

        it('should keep existing invalidating updates against the next new gaps', async () => {
            // invalidate future gaps containing 'dog'
            expect(gapCache.removeOverlappingGaps(['dog'])).toEqual(0);

            // then, clear the cache
            gapCache.clear();

            // wait for 50ms (half of exposure delay of 100ms) before
            // setting a new gap overlapping with 'dog'
            await new Promise(resolve => setTimeout(resolve, 50));
            gapCache.setGap('cat', 'fox', 10);

            // also set a non-overlapping gap to make sure it is not invalidated
            gapCache.setGap('goat', 'hog', 20);

            // wait an extra 250ms to ensure all valid gaps have been exposed
            await new Promise(resolve => setTimeout(resolve, 250));
            // the next gap is indeed 'goat'... because 'cat'... should have been invalidated
            expect(await gapCache.lookupGap('bat', 'zoo')).toEqual(
                { firstKey: 'goat', lastKey: 'hog', weight: 20 });
        });
    });

    it('should expose gaps after at least exposureDelayMs milliseconds', async () => {
        gapCache.setGap('bar', 'baz', 10);
        expect(await gapCache.lookupGap('ape', 'cat')).toBeNull();

        // wait for 50ms which is half of the minimum time to exposure
        await new Promise(resolve => setTimeout(resolve, 50));
        // the gap should not be exposed yet
        expect(await gapCache.lookupGap('ape', 'cat')).toBeNull();

        // wait for an extra 250ms (total 300ms): the upper bound for exposure of any
        // setGap() call is twice the exposureDelayMs value, so 200ms, wait an extra
        // 100ms to cope with scheduling uncertainty and GapSet processing time, after
        // which the gap introduced by setGap() should always be exposed.
        await new Promise(resolve => setTimeout(resolve, 250));
        expect(await gapCache.lookupGap('ape', 'cat')).toEqual(
            { firstKey: 'bar', lastKey: 'baz', weight: 10 });

        // check getters
        expect(gapCache.maxGaps).toEqual(10);
        expect(gapCache.maxGapWeight).toEqual(100);
        expect(gapCache.size).toEqual(1);

        // check iteration over the exposed gaps
        let nGaps = 0;
        for (const gap of gapCache) {
            expect(gap).toEqual({ firstKey: 'bar', lastKey: 'baz', weight: 10 });
            nGaps += 1;
        }
        expect(nGaps).toEqual(1);

        // check toArray()
        expect(gapCache.toArray()).toEqual([
            { firstKey: 'bar', lastKey: 'baz', weight: 10 },
        ]);
    });

    it('removeOverlappingGaps() should invalidate all overlapping gaps that are already exposed',
    async () => {
        gapCache.setGap('cat', 'fox', 10);
        gapCache.setGap('lion', 'seal', 20);
        // wait for 3x100ms to ensure all setGap() calls have been exposed
        await new Promise(resolve => setTimeout(resolve, 300));
        // expect 0 gap removed because 'hog' is not in any gap
        expect(gapCache.removeOverlappingGaps(['hog'])).toEqual(0);
        // expect 1 gap removed because 'cat' -> 'fox' should be already exposed
        expect(gapCache.removeOverlappingGaps(['dog'])).toEqual(1);
        // the gap should have been invalidated permanently
        expect(await gapCache.lookupGap('dog', 'fox')).toBeNull();
        // the other gap should still be present
        expect(await gapCache.lookupGap('rat', 'tiger')).toEqual(
            { firstKey: 'lion', lastKey: 'seal', weight: 20 });
    });

    it('removeOverlappingGaps() should invalidate all overlapping gaps that are not yet exposed',
    async () => {
        gapCache.setGap('cat', 'fox', 10);
        gapCache.setGap('lion', 'seal', 20);
        // make the following calls asynchronous for the sake of the
        // test, but not waiting for the exposure delay
        await new Promise(resolve => setImmediate(resolve));
        // expect 0 gap removed because 'hog' is not in any gap
        expect(gapCache.removeOverlappingGaps(['hog'])).toEqual(0);
        // expect 0 gap removed because 'cat' -> 'fox' is not exposed yet,
        // but internally it should have been removed from the staging or
        // frozen gap set
        expect(gapCache.removeOverlappingGaps(['dog'])).toEqual(0);

        // wait for 3x100ms to ensure all non-invalidated setGap() calls have been exposed
        await new Promise(resolve => setTimeout(resolve, 300));
        // the gap should have been invalidated permanently
        expect(await gapCache.lookupGap('dog', 'fox')).toBeNull();
        // the other gap should now be exposed
        expect(await gapCache.lookupGap('rat', 'tiger')).toEqual(
            { firstKey: 'lion', lastKey: 'seal', weight: 20 });
    });

    it('removeOverlappingGaps() should invalidate gaps created later by setGap() but ' +
    'within the exposure delay', async () => {
        // there is no exposed gap yet, so expect 0 gap removed
        expect(gapCache.removeOverlappingGaps(['dog'])).toEqual(0);

        // wait for 50ms (half of exposure delay of 100ms) before
        // setting a new gap overlapping with 'dog'
        await new Promise(resolve => setTimeout(resolve, 50));
        gapCache.setGap('cat', 'fox', 10);

        // also set a non-overlapping gap to make sure it is not invalidated
        gapCache.setGap('goat', 'hog', 20);

        // wait an extra 250ms to ensure all valid gaps have been exposed
        await new Promise(resolve => setTimeout(resolve, 250));
        // the next gap is indeed 'goat'... because 'cat'... should have been invalidated
        expect(await gapCache.lookupGap('bat', 'zoo')).toEqual(
            { firstKey: 'goat', lastKey: 'hog', weight: 20 });
    });

    it('removeOverlappingGaps() should not invalidate gaps created more than twice ' +
    'the exposure delay later', async () => {
        // there is no exposed gap yet, so expect 0 gap removed
        expect(gapCache.removeOverlappingGaps(['dog'])).toEqual(0);

        // wait for 250ms (more than twice the exposure delay of 100ms) before
        // setting a new gap overlapping with 'dog'
        await new Promise(resolve => setTimeout(resolve, 250));
        gapCache.setGap('cat', 'fox', 10);

        // also set a non-overlapping gap to make sure it is not invalidated
        gapCache.setGap('goat', 'hog', 20);

        // wait for an extra 250ms to ensure the new gap is exposed
        await new Promise(resolve => setTimeout(resolve, 250));
        // should find the inserted gap as it should not have been invalidated
        expect(await gapCache.lookupGap('bat', 'zoo')).toEqual(
            { firstKey: 'cat', lastKey: 'fox', weight: 10 });
    });

    it('exposed gaps should be merged when possible', async () => {
        gapCache.setGap('bar', 'baz', 10);
        gapCache.setGap('baz', 'qux', 10);
        // wait until the merged gap is exposed
        await new Promise(resolve => setTimeout(resolve, 300));
        expect(await gapCache.lookupGap('ape', 'cat')).toEqual(
            { firstKey: 'bar', lastKey: 'qux', weight: 20 });
    });

    it('exposed gaps should be split when above maxGapWeight', async () => {
        gapCache.setGap('bar', 'baz', gapCache.maxGapWeight - 1);
        gapCache.setGap('baz', 'qux', 10);
        // wait until the gaps are exposed
        await new Promise(resolve => setTimeout(resolve, 300));
        expect(await gapCache.lookupGap('cat', 'dog')).toEqual(
            { firstKey: 'baz', lastKey: 'qux', weight: 10 });
    });

    it('gaps should not be exposed when reaching the maxGaps limit', async () => {
        const gapsArray = new Array(gapCache.maxGaps).fill(undefined).map(
            (_, i) => {
                const firstKey = `0000${i}`.slice(-4);
                return {
                    firstKey,
                    lastKey: `${firstKey}foo`,
                    weight: 10,
                };
            }
        );
        for (const gap of gapsArray) {
            gapCache.setGap(gap.firstKey, gap.lastKey, gap.weight);
        }
        // wait until the gaps are exposed
        await new Promise(resolve => setTimeout(resolve, 300));
        expect(gapCache.size).toEqual(gapCache.maxGaps);

        gapCache.setGap('noroomforthisgap', 'noroomforthisgapfoo');
        // wait until the gaps are exposed
        await new Promise(resolve => setTimeout(resolve, 300));

        // the number of gaps should still be 'maxGaps'
        expect(gapCache.size).toEqual(gapCache.maxGaps);
        // the gaps should correspond to the original array
        expect(gapCache.toArray()).toEqual(gapsArray);
    });
});
