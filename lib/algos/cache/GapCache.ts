import { OrderedSet } from '@js-sdsl/ordered-set';
import {
    default as GapSet,
    GapSetEntry,
} from './GapSet';

// the API is similar but is not strictly a superset of GapSetInterface
// so we don't extend from it
export interface GapCacheInterface {
    exposureDelayMs: number;
    maxGapWeight: number;
    size: number;

    setGap: (firstKey: string, lastKey: string, weight: number) => void;
    removeOverlappingGaps: (overlappingKeys: string[]) => number;
    lookupGap: (minKey: string, maxKey?: string) => Promise<GapSetEntry | null>;
    [Symbol.iterator]: () => Iterator<GapSetEntry>;
    toArray: () => GapSetEntry[];
};

class GapCacheUpdateSet {
    newGaps: GapSet;
    updatedKeys: OrderedSet<string>;

    constructor(maxGapWeight: number) {
        this.newGaps = new GapSet(maxGapWeight);
        this.updatedKeys = new OrderedSet();
    }

    addUpdateBatch(updatedKeys: OrderedSet<string>): void {
        this.updatedKeys.union(updatedKeys);
    }
};

/**
 * Cache of listing "gaps" i.e. ranges of keys that can be skipped
 * over during listing (because they only contain delete markers as
 * latest versions).
 *
 * Typically, a single GapCache instance would be attached to a raft session.
 *
 * The API usage is as follows:
 *
 * - Initialize a GapCache instance by calling start() (this starts an internal timer)
 *
 * - Insert a gap or update an existing one via setGap()
 *
 * - Lookup existing gaps via lookupGap()
 *
 * - Invalidate gaps that overlap a specific set of keys via removeOverlappingGaps()
 *
 * - Shut down a GapCache instance by calling stop() (this stops the internal timer)
 *
 * Gaps inserted via setGap() are not exposed immediately to lookupGap(), but only:
 *
 * - after a certain delay always larger than 'exposureDelayMs' and usually shorter
 *   than twice this value (but might be slightly longer in rare cases)
 *
 * - and only if they haven't been invalidated by a recent call to removeOverlappingGaps()
 *
 * This ensures atomicity between gap creation and invalidation from updates under
 * the condition that a gap is created from first key to last key within the time defined
 * by 'exposureDelayMs'.
 *
 * The implementation is based on two extra temporary "update sets" on top of the main
 * exposed gap set, one called "staging" and the other "frozen", each containing a
 * temporary updated gap set and a list of updated keys to invalidate gaps with (coming
 * from calls to removeOverlappingGaps()). Every "exposureDelayMs" milliseconds, the frozen
 * gaps are invalidated by all key updates coming from either of the "staging" or "frozen"
 * update set, then merged into the exposed gaps set, after which the staging updates become
 * the frozen updates and won't receive any new gap until the next cycle.
 */
export default class GapCache implements GapCacheInterface {
    _exposureDelayMs: number;
    maxGaps: number;

    _stagingUpdates: GapCacheUpdateSet;
    _frozenUpdates: GapCacheUpdateSet;
    _exposedGaps: GapSet;
    _exposeFrozenInterval: NodeJS.Timeout | null;

    /**
     * @constructor
     *
     * @param {number} exposureDelayMs - minimum delay between
     * insertion of a gap via setGap() and its exposure via
     * lookupGap()
     * @param {number} maxGaps - maximum number of cached gaps, after
     * which no new gap can be added by setGap(). (Note: a future
     * improvement could replace this by an eviction strategy)
     * @param {number} maxGapWeight - maximum "weight" of individual
     * cached gaps, which is also the granularity for
     * invalidation. Individual gaps can be chained together,
     * which lookupGap() transparently consolidates in the response
     * into a single large gap.
     */
    constructor(exposureDelayMs: number, maxGaps: number, maxGapWeight: number) {
        this._exposureDelayMs = exposureDelayMs;
        this.maxGaps = maxGaps;

        this._stagingUpdates = new GapCacheUpdateSet(maxGapWeight);
        this._frozenUpdates = new GapCacheUpdateSet(maxGapWeight);
        this._exposedGaps = new GapSet(maxGapWeight);
        this._exposeFrozenInterval = null;
    }

    /**
     * Create a GapCache from an array of exposed gap entries (used in tests)
     *
     * @return {GapCache} - a new GapCache instance
     */
    static createFromArray(
        gaps: GapSetEntry[],
        exposureDelayMs: number,
        maxGaps: number,
        maxGapWeight: number
    ): GapCache {
        const gapCache = new GapCache(exposureDelayMs, maxGaps, maxGapWeight);
        gapCache._exposedGaps = GapSet.createFromArray(gaps, maxGapWeight)
        return gapCache;
    }

    /**
     * Internal helper to remove gaps in the staging and frozen sets
     * overlapping with previously updated keys, right before the
     * frozen gaps get exposed.
     *
     * @return {undefined}
     */
    _removeOverlappingGapsBeforeExpose(): void {
        for (const { updatedKeys } of [this._stagingUpdates, this._frozenUpdates]) {
            if (updatedKeys.size() === 0) {
                continue;
            }
            for (const { newGaps } of [this._stagingUpdates, this._frozenUpdates]) {
                if (newGaps.size === 0) {
                    continue;
                }
                newGaps.removeOverlappingGaps(updatedKeys);
            }
        }
    }

    /**
     * This function is the core mechanism that updates the exposed gaps in the
     * cache. It is called on a regular interval defined by 'exposureDelayMs'.
     *
     * It does the following in order:
     *
     * - remove gaps from the frozen set that overlap with any key present in a
     *   batch passed to removeOverlappingGaps() since the last two triggers of
     *   _exposeFrozen()
     *
     * - merge the remaining gaps from the frozen set to the exposed set, which
     *   makes them visible from calls to lookupGap()
     *
     * - rotate by freezing the currently staging updates and initiating a new
     *   staging updates set
     *
     * @return {undefined}
     */
    _exposeFrozen(): void {
        this._removeOverlappingGapsBeforeExpose();
        for (const gap of this._frozenUpdates.newGaps) {
            // Use a trivial strategy to keep the cache size within
            // limits: refuse to add new gaps when the size is above
            // the 'maxGaps' threshold. We solely rely on
            // removeOverlappingGaps() to make space for new gaps.
            if (this._exposedGaps.size < this.maxGaps) {
                this._exposedGaps.setGap(gap.firstKey, gap.lastKey, gap.weight);
            }
        }
        this._frozenUpdates = this._stagingUpdates;
        this._stagingUpdates = new GapCacheUpdateSet(this.maxGapWeight);
    }

    /**
     * Start the internal GapCache timer
     *
     * @return {undefined}
     */
    start(): void {
        if (this._exposeFrozenInterval) {
            return;
        }
        this._exposeFrozenInterval = setInterval(
            () => this._exposeFrozen(),
            this._exposureDelayMs);
    }

    /**
     * Stop the internal GapCache timer
     *
     * @return {undefined}
     */
    stop(): void {
        if (this._exposeFrozenInterval) {
            clearInterval(this._exposeFrozenInterval);
            this._exposeFrozenInterval = null;
        }
    }

    /**
     * Record a gap between two keys, associated with a weight to
     * limit individual gap's spanning ranges in the cache, for a more
     * granular invalidation.
     *
     * The function handles splitting and merging existing gaps to
     * maintain an optimal weight of cache entries.
     *
     * NOTE 1: the caller must ensure that the full length of the gap
     * between 'firstKey' and 'lastKey' has been built from a listing
     * snapshot that is more recent than 'exposureDelayMs' milliseconds,
     * in order to guarantee that the exposed gap will be fully
     * covered (and potentially invalidated) from recent calls to
     * removeOverlappingGaps().
     *
     * NOTE 2: a usual pattern when building a large gap from multiple
     * calls to setGap() is to start the next gap from 'lastKey',
     * which will be passed as 'firstKey' in the next call, so that
     * gaps can be chained together and consolidated by lookupGap().
     *
     * @param {string} firstKey - first key of the gap
     * @param {string} lastKey - last key of the gap, must be greater
     * or equal than 'firstKey'
     * @param {number} weight - total weight between 'firstKey' and 'lastKey'
     * @return {undefined}
     */
    setGap(firstKey: string, lastKey: string, weight: number): void {
        this._stagingUpdates.newGaps.setGap(firstKey, lastKey, weight);
    }

    /**
     * Remove gaps that overlap with a given set of keys. Used to
     * invalidate gaps when keys are inserted or deleted.
     *
     * @param {OrderedSet<string> | string[]} overlappingKeys - remove gaps that
     * overlap with any of this set of keys
     * @return {number} - how many gaps were removed from the exposed
     * gaps only (overlapping gaps not yet exposed are also invalidated
     * but are not accounted for in the returned value)
     */
    removeOverlappingGaps(overlappingKeys: OrderedSet<string> | string[]): number {
        let overlappingKeysSet;
        if (Array.isArray(overlappingKeys)) {
            overlappingKeysSet = new OrderedSet(overlappingKeys);
        } else {
            overlappingKeysSet = overlappingKeys;
        }
        this._stagingUpdates.addUpdateBatch(overlappingKeysSet);
        return this._exposedGaps.removeOverlappingGaps(overlappingKeysSet);
    }

    /**
     * Lookup the next exposed gap that overlaps with [minKey, maxKey]. Internally
     * chained gaps are coalesced in the response into a single contiguous large gap.
     *
     * @param {string} minKey - minimum key overlapping with the returned gap
     * @param {string} [maxKey] - maximum key overlapping with the returned gap
     * @return {Promise<GapSetEntry | null>} - result of the lookup if a gap
     *   was found, null otherwise, as a Promise
     */
    lookupGap(minKey: string, maxKey?: string): Promise<GapSetEntry | null> {
        return this._exposedGaps.lookupGap(minKey, maxKey);
    }

    /**
     * Get the maximum weight setting for individual gaps.
     *
     * @return {number} - maximum weight of individual gaps
     */
    get maxGapWeight(): number {
        return this._exposedGaps.maxWeight;
    }

    /**
     * Set the maximum weight setting for individual gaps.
     *
     * @param {number} gapWeight - maximum weight of individual gaps
     */
    set maxGapWeight(gapWeight: number) {
        this._exposedGaps.maxWeight = gapWeight;
        // also update transient gap sets
        this._stagingUpdates.newGaps.maxWeight = gapWeight;
        this._frozenUpdates.newGaps.maxWeight = gapWeight;
    }

    /**
     * Get the exposure delay in milliseconds, which is the minimum
     * time after which newly cached gaps will be exposed by
     * lookupGap().
     *
     * @return {number} - exposure delay in milliseconds
     */
    get exposureDelayMs(): number {
        return this._exposureDelayMs;
    }

    /**
     * Set the exposure delay in milliseconds, which is the minimum
     * time after which newly cached gaps will be exposed by
     * lookupGap(). Setting this attribute automatically updates the
     * internal state to honor the new value.
     *
     * @param {number} - exposure delay in milliseconds
     */
    set exposureDelayMs(exposureDelayMs: number) {
        if (exposureDelayMs !== this._exposureDelayMs) {
            this._exposureDelayMs = exposureDelayMs;
            if (this._exposeFrozenInterval) {
                // invalidate all pending gap updates, as the new interval may not be
                // safe for them
                this._stagingUpdates = new GapCacheUpdateSet(this.maxGapWeight);
                this._frozenUpdates = new GapCacheUpdateSet(this.maxGapWeight);

                // reinitialize the _exposeFrozenInterval timer with the updated delay
                this.stop();
                this.start();
            }
        }
    }

    /**
     * Get the number of exposed gaps
     *
     * @return {number} number of exposed gaps
     */
    get size(): number {
        return this._exposedGaps.size;
    }

    /**
     * Iterate over exposed gaps
     *
     * @return {Iterator<GapSetEntry>} an iterator over exposed gaps
     */
    [Symbol.iterator](): Iterator<GapSetEntry> {
        return this._exposedGaps[Symbol.iterator]();
    }

    /**
     * Get an array of all exposed gaps
     *
     * @return {GapSetEntry[]} array of exposed gaps
     */
    toArray(): GapSetEntry[] {
        return this._exposedGaps.toArray();
    }

    /**
     * Clear all exposed and staging gaps from the cache.
     *
     * Note: retains invalidating updates from removeOverlappingGaps()
     * for correctness of gaps inserted afterwards.
     *
     * @return {undefined}
     */
    clear(): void {
        this._stagingUpdates.newGaps = new GapSet(this.maxGapWeight);
        this._frozenUpdates.newGaps = new GapSet(this.maxGapWeight);
        this._exposedGaps = new GapSet(this.maxGapWeight);
    }
}
