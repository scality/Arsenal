import { strict as assert } from 'assert';

/**
 * @class
 * @classdesc Implements a key-value in-memory cache with a capped
 * number of items and a Least Recently Used (LRU) strategy for
 * eviction.
 */
class LRUCache {
    /**
     * @constructor
     * @param {number} maxEntries - maximum number of entries kept in
     * the cache
     */
    maxEntries: number;
    private entryCount: number;
    private entryMap: object;
    private lruHead: any; // TODO lruTrail?
    private lruTail: any; // TODO lruTrail?

    constructor(maxEntries: number) {
        assert(maxEntries >= 1);
        this.maxEntries = maxEntries;
        this.clear();
    }

    /**
     * Add or update the value associated to a key in the cache,
     * making it the most recently accessed for eviction purpose.
     *
     * @param {string} key - key to add
     * @param {object} value - associated value (can be of any type)
     * @return {boolean} true if the cache contained an entry with
     * this key, false if it did not
     */
    add(key: string, value: object): boolean {
        let entry = this.entryMap[key];
        if (entry) {
            entry.value = value;
            // make the entry the most recently used by re-pushing it
            // to the head of the LRU list
            this._lruRemoveEntry(entry);
            this._lruPushEntry(entry);
            return true;
        }
        if (this.entryCount === this.maxEntries) {
            // if the cache is already full, abide by the LRU strategy
            // and remove the least recently used entry from the cache
            // before pushing the new entry
            this._removeEntry(this.lruTail);
        }
        entry = { key, value };
        this.entryMap[key] = entry;
        this.entryCount += 1;
        this._lruPushEntry(entry);
        return false;
    }

    /**
     * Get the value associated to a key in the cache, making it the
     * most recently accessed for eviction purpose.
     *
     * @param {string} key - key of which to fetch the associated value
     * @return {object|undefined} - returns the associated value if
     * exists in the cache, or undefined if not found - either if the
     * key was never added or if it has been evicted from the cache.
     */
    get(key: string): object | undefined{
        const entry = this.entryMap[key];
        if (entry) {
            // make the entry the most recently used by re-pushing it
            // to the head of the LRU list
            this._lruRemoveEntry(entry);
            this._lruPushEntry(entry);
            return entry.value;
        }
        return undefined;
    }

    /**
     * Remove an entry from the cache if exists
     *
     * @param {string} key - key to remove
     * @return {boolean} true if an entry has been removed, false if
     * there was no entry with this key in the cache - either if the
     * key was never added or if it has been evicted from the cache.
     */
    remove(key: string): boolean {
        const entry = this.entryMap[key];
        if (entry) {
            this._removeEntry(entry);
            return true;
        }
        return false;
    }

    /**
     * Get the current number of cached entries
     *
     * @return {number} current number of cached entries
     */
    count(): number {
        return this.entryCount;
    }

    /**
     * Remove all entries from the cache
     *
     * @return {undefined}
     */
    clear(): undefined {
        this.entryMap = {};
        this.entryCount = 0;
        this.lruHead = null;
        this.lruTail = null;
    }

    /**
     * Push an entry to the front of the LRU list, making it the most
     * recently accessed
     *
     * @param {object} entry - entry to push
     * @return {undefined}
     */
    _lruPushEntry(entry: object): undefined {
        /* eslint-disable no-param-reassign */
        entry._lruNext = this.lruHead;
        entry._lruPrev = null;
        if (this.lruHead) {
            this.lruHead._lruPrev = entry;
        }
        this.lruHead = entry;
        if (!this.lruTail) {
            this.lruTail = entry;
        }
        /* eslint-enable no-param-reassign */
    }

    /**
     * Remove an entry from the LRU list
     *
     * @param {object} entry - entry to remove
     * @return {undefined}
     */
    _lruRemoveEntry(entry): undefined {
        /* eslint-disable no-param-reassign */
        if (entry._lruPrev) {
            entry._lruPrev._lruNext = entry._lruNext;
        } else {
            this.lruHead = entry._lruNext;
        }
        if (entry._lruNext) {
            entry._lruNext._lruPrev = entry._lruPrev;
        } else {
            this.lruTail = entry._lruPrev;
        }
        /* eslint-enable no-param-reassign */
    }

    /**
     * Helper function to remove an existing entry from the cache
     *
     * @param {object} entry - cache entry to remove
     * @return {undefined}
     */
    _removeEntry(entry: object): undefined {
        this._lruRemoveEntry(entry);
        delete this.entryMap[entry.key];
        this.entryCount -= 1;
    }
}

export default LRUCache;
