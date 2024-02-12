import assert from 'assert';
import { OrderedSet } from '@js-sdsl/ordered-set';

import errors from '../../errors';

export type GapSetEntry = {
    firstKey: string,
    lastKey: string,
    weight: number,
};

export interface GapSetInterface {
    maxWeight: number;
    size: number;

    setGap: (firstKey: string, lastKey: string, weight: number) => GapSetEntry;
    removeOverlappingGaps: (overlappingKeys: string[]) => number;
    lookupGap: (minKey: string, maxKey?: string) => Promise<GapSetEntry | null>;
    [Symbol.iterator]: () => Iterator<GapSetEntry>;
    toArray: () => GapSetEntry[];
};

/**
 * Specialized data structure to support caching of listing "gaps",
 * i.e. ranges of keys that can be skipped over during listing
 * (because they only contain delete markers as latest versions)
 */
export default class GapSet implements GapSetInterface, Iterable<GapSetEntry> {
    _gaps: OrderedSet<GapSetEntry>;
    _maxWeight: number;

    /**
     * @constructor

     * @param {number} maxWeight - weight threshold for each cached
     * gap (unitless). Triggers splitting gaps when reached
     */
    constructor(maxWeight: number) {
        this._gaps = new OrderedSet(
            [],
            (left: GapSetEntry, right: GapSetEntry) => (
                left.firstKey < right.firstKey ? -1 :
                left.firstKey > right.firstKey ? 1 : 0
            )
        );
        this._maxWeight = maxWeight;
    }

    /**
     * Create a GapSet from an array of gap entries (used in tests)
     */
    static createFromArray(gaps: GapSetEntry[], maxWeight: number): GapSet {
        const gapSet = new GapSet(maxWeight);
        for (const gap of gaps) {
            gapSet._gaps.insert(gap);
        }
        return gapSet;
    }

    /**
     * Record a gap between two keys, associated with a weight to limit
     * individual gap sizes in the cache.
     *
     * The function handles splitting and merging existing gaps to
     * maintain an optimal weight of cache entries.
     *
     * @param {string} firstKey - first key of the gap
     * @param {string} lastKey - last key of the gap, must be greater
     * or equal than 'firstKey'
     * @param {number} weight - total weight between 'firstKey' and 'lastKey'
     * @return {GapSetEntry} - existing or new gap entry
     */
    setGap(firstKey: string, lastKey: string, weight: number): GapSetEntry {
        assert(lastKey >= firstKey);

        // Step 1/4: Find the closest left-overlapping gap, and either re-use it
        // or chain it with a new gap depending on the weights if it exists (otherwise
        // just creates a new gap).
        const curGapIt = this._gaps.reverseLowerBound(<GapSetEntry>{ firstKey });
        let curGap;
        if (curGapIt.isAccessible()) {
            curGap = curGapIt.pointer;
            if (curGap.lastKey >= lastKey) {
                // return fully overlapping gap already cached
                return curGap;
            }
        }
        let remainingWeight = weight;
        if (!curGap                         // no previous gap
            || curGap.lastKey < firstKey    // previous gap not overlapping
            || (curGap.lastKey === firstKey // previous gap overlapping by one key...
                && curGap.weight + weight > this._maxWeight) // ...but we can't extend it
           ) {
            // create a new gap indexed by 'firstKey'
            curGap = { firstKey, lastKey: firstKey, weight: 0 };
            this._gaps.insert(curGap);
        } else if (curGap.lastKey > firstKey && weight > this._maxWeight) {
            // previous gap is either fully or partially contained in the new gap
            // and cannot be extended: substract its weight from the total (heuristic
            // in case the previous gap doesn't start at 'firstKey', which is the
            // uncommon case)
            remainingWeight -= curGap.weight;

            // there may be an existing chained gap starting with the previous gap's
            // 'lastKey': use it if it exists
            const chainedGapIt = this._gaps.find(<GapSetEntry>{ firstKey: curGap.lastKey });
            if (chainedGapIt.isAccessible()) {
                curGap = chainedGapIt.pointer;
            } else {
                // no existing chained gap: chain a new gap to the previous gap
                curGap = {
                    firstKey: curGap.lastKey,
                    lastKey: curGap.lastKey,
                    weight: 0,
                };
                this._gaps.insert(curGap);
            }
        }
        // Step 2/4: Cleanup existing gaps fully included in firstKey -> lastKey, and
        // aggregate their weights in curGap to define the minimum weight up to the
        // last merged gap.
        let nextGap;
        while (true) {
            const nextGapIt = this._gaps.upperBound(<GapSetEntry>{ firstKey: curGap.firstKey });
            nextGap = nextGapIt.isAccessible() && nextGapIt.pointer;
            // stop the cleanup when no more gap or if the next gap is not fully
            // included in curGap
            if (!nextGap || nextGap.lastKey > lastKey) {
                break;
            }
            this._gaps.eraseElementByIterator(nextGapIt);
            curGap.lastKey = nextGap.lastKey;
            curGap.weight += nextGap.weight;
        }

        // Step 3/4: Extend curGap to lastKey, adjusting the weight.
        // At this point, curGap weight is the minimum weight of the finished gap, save it
        // for step 4.
        let minMergedWeight = curGap.weight;
        if (curGap.lastKey === firstKey && firstKey !== lastKey) {
            // extend the existing gap by the full amount 'firstKey -> lastKey'
            curGap.lastKey = lastKey;
            curGap.weight += remainingWeight;
        } else if (curGap.lastKey <= lastKey) {
            curGap.lastKey = lastKey;
            curGap.weight = remainingWeight;
        }

        // Step 4/4: Find the closest right-overlapping gap, and if it exists, either merge
        // it or chain it with curGap depending on the weights.
        if (nextGap && nextGap.firstKey <= lastKey) {
            // nextGap overlaps with the new gap: check if we can merge it
            minMergedWeight += nextGap.weight;
            let mergedWeight;
            if (lastKey === nextGap.firstKey) {
                // nextGap is chained with curGap: add the full weight of nextGap
                mergedWeight = curGap.weight + nextGap.weight;
            } else {
                // strict overlap: don't add nextGap's weight unless
                // it's larger than the sum of merged ranges (as it is
                // then included in `minMergedWeight`)
                mergedWeight = Math.max(curGap.weight, minMergedWeight);
            }
            if (mergedWeight <= this._maxWeight) {
                // merge nextGap into curGap
                curGap.lastKey = nextGap.lastKey;
                curGap.weight = mergedWeight;
                this._gaps.eraseElementByKey(nextGap);
            } else {
                // adjust the last key to chain with nextGap and substract the next
                // gap's weight from curGap (heuristic)
                curGap.lastKey = nextGap.firstKey;
                curGap.weight = Math.max(mergedWeight - nextGap.weight, 0);
                curGap = nextGap;
            }
        }
        // return a copy of curGap
        return Object.assign({}, curGap);
    }

    /**
     * Remove gaps that overlap with one or more keys in a given array or
     * OrderedSet. Used to invalidate gaps when keys are inserted or deleted.
     *
     * @param {OrderedSet<string> | string[]} overlappingKeys - remove gaps that overlap
     * with any of this set of keys
     * @return {number} - how many gaps were removed
     */
    removeOverlappingGaps(overlappingKeys: OrderedSet<string> | string[]): number {
        // To optimize processing with a large number of keys and/or gaps, this function:
        //
        // 1. converts the overlappingKeys array to a OrderedSet (if not already a OrderedSet)
        // 2. queries both the gaps set and the overlapping keys set in a loop, which allows:
        //    - skipping ranges of overlapping keys at once when there is no new overlapping gap
        //    - skipping ranges of gaps at once when there is no overlapping key
        //
        // This way, it is efficient when the number of non-overlapping gaps is large
        // (which is the most common case in practice).

        let overlappingKeysSet;
        if (Array.isArray(overlappingKeys)) {
            overlappingKeysSet = new OrderedSet(overlappingKeys);
        } else {
            overlappingKeysSet = overlappingKeys;
        }
        const firstKeyIt = overlappingKeysSet.begin();
        let currentKey = firstKeyIt.isAccessible() && firstKeyIt.pointer;
        let nRemoved = 0;
        while (currentKey) {
            const closestGapIt = this._gaps.reverseUpperBound(<GapSetEntry>{ firstKey: currentKey });
            if (closestGapIt.isAccessible()) {
                const closestGap = closestGapIt.pointer;
                if (currentKey <= closestGap.lastKey) {
                    // currentKey overlaps closestGap: remove the gap
                    this._gaps.eraseElementByIterator(closestGapIt);
                    nRemoved += 1;
                }
            }
            const nextGapIt = this._gaps.lowerBound(<GapSetEntry>{ firstKey: currentKey });
            if (!nextGapIt.isAccessible()) {
                // no more gap: we're done
                return nRemoved;
            }
            const nextGap = nextGapIt.pointer;
            // advance to the last key potentially overlapping with nextGap
            let currentKeyIt = overlappingKeysSet.reverseLowerBound(nextGap.lastKey);
            if (currentKeyIt.isAccessible()) {
                currentKey = currentKeyIt.pointer;
                if (currentKey >= nextGap.firstKey) {
                    // currentKey overlaps nextGap: remove the gap
                    this._gaps.eraseElementByIterator(nextGapIt);
                    nRemoved += 1;
                }
            }
            // advance to the first key potentially overlapping with another gap
            currentKeyIt = overlappingKeysSet.lowerBound(nextGap.lastKey);
            currentKey = currentKeyIt.isAccessible() && currentKeyIt.pointer;
        }
        return nRemoved;
    }

    /**
     * Internal helper to coalesce multiple chained gaps into a single gap.
     *
     * It is only used to construct lookupGap() return values and
     * doesn't modify the GapSet.
     *
     * NOTE: The function may take a noticeable amount of time and CPU
     * to execute if a large number of chained gaps have to be
     * coalesced, but it should never take more than a few seconds. In
     * most cases it should take less than a millisecond. It regularly
     * yields to the nodejs event loop to avoid blocking it during a
     * long execution.
     *
     * @param {GapSetEntry} firstGap - first gap of the chain to coalesce with
     * the next ones in the chain
     * @return {Promise<GapSetEntry>} - a new coalesced entry, as a Promise
     */
    _coalesceGapChain(firstGap: GapSetEntry): Promise<GapSetEntry> {
        return new Promise(resolve => {
            const coalescedGap: GapSetEntry = Object.assign({}, firstGap);
            const coalesceGapChainIteration = () => {
                // efficiency trade-off: 100 iterations of log(N) complexity lookups should
                // not block the event loop for too long
                for (let opCounter = 0; opCounter < 100; ++opCounter) {
                    const chainedGapIt = this._gaps.find(
                            <GapSetEntry>{ firstKey: coalescedGap.lastKey });
                    if (!chainedGapIt.isAccessible()) {
                        // chain is complete
                        return resolve(coalescedGap);
                    }
                    const chainedGap = chainedGapIt.pointer;
                    if (chainedGap.firstKey === chainedGap.lastKey) {
                        // found a single-key gap: chain is complete
                        return resolve(coalescedGap);
                    }
                    coalescedGap.lastKey = chainedGap.lastKey;
                    coalescedGap.weight += chainedGap.weight;
                }
                // yield to the event loop before continuing the process
                // of coalescing the gap chain
                return process.nextTick(coalesceGapChainIteration);
            };
            coalesceGapChainIteration();
        });
    }

    /**
     * Lookup the next gap that overlaps with [minKey, maxKey]. Internally chained
     * gaps are coalesced in the response into a single contiguous large gap.
     *
     * @param {string} minKey - minimum key overlapping with the returned gap
     * @param {string} [maxKey] - maximum key overlapping with the returned gap
     * @return {Promise<GapSetEntry | null>} - result of the lookup if a gap
     *   was found, null otherwise, as a Promise
     */
    async lookupGap(minKey: string, maxKey?: string): Promise<GapSetEntry | null> {
        let firstGap: GapSetEntry | null = null;
        const minGapIt = this._gaps.reverseLowerBound(<GapSetEntry>{ firstKey: minKey });
        const minGap = minGapIt.isAccessible() && minGapIt.pointer;
        if (minGap && minGap.lastKey >= minKey) {
            firstGap = minGap;
        } else {
            const maxGapIt = this._gaps.upperBound(<GapSetEntry>{ firstKey: minKey });
            const maxGap = maxGapIt.isAccessible() && maxGapIt.pointer;
            if (maxGap && (maxKey === undefined || maxGap.firstKey <= maxKey)) {
                firstGap = maxGap;
            }
        }
        if (!firstGap) {
            return null;
        }
        return this._coalesceGapChain(firstGap);
    }

    /**
     * Get the maximum weight setting for individual gaps.
     *
     * @return {number} - maximum weight of individual gaps
     */
    get maxWeight(): number {
        return this._maxWeight;
    }

    /**
     * Set the maximum weight setting for individual gaps.
     *
     * @param {number} gapWeight - maximum weight of individual gaps
     */
    set maxWeight(gapWeight: number) {
        this._maxWeight = gapWeight;
    }

    /**
     * Get the number of gaps stored in this set.
     *
     * @return {number} - number of gaps stored in this set
     */
    get size(): number {
        return this._gaps.size();
    }

    /**
     * Iterate over each gap of the set, ordered by first key
     *
     * @return {Iterator<GapSetEntry>} - an iterator over all gaps
     *   Example:
     *     for (const gap of myGapSet) { ... }
     */
    [Symbol.iterator](): Iterator<GapSetEntry> {
        return this._gaps[Symbol.iterator]();
    }

    /**
     * Return an array containing all gaps, ordered by first key
     *
     * NOTE: there is a toArray() method in the OrderedSet implementation
     * but it does not scale well and overflows the stack quickly. This is
     * why we provide an implementation based on an iterator.
     *
     * @return {GapSetEntry[]} - an array containing all gaps
     */
    toArray(): GapSetEntry[] {
        return [...this];
    }
}
