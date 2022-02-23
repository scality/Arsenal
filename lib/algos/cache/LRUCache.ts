import assert from 'assert';

/**
 * @class
 * @classdesc Implements a key-value in-memory cache with a capped
 * number of items and a Least Recently Used (LRU) strategy for
 * eviction.
 */
export default class LRUCache {
    _maxEntries;
    _entryMap;
    _entryCount;
    _lruTail;
    _lruHead;

    /**
     * @constructor
     * @param maxEntries - maximum number of entries kept in
     * the cache
     */
    constructor(maxEntries: number) {
        assert(maxEntries >= 1);
        this._maxEntries = maxEntries;
        this.clear();
    }

    /**
     * Add or update the value associated to a key in the cache,
     * making it the most recently accessed for eviction purpose.
     *
     * @param key - key to add
     * @param value - associated value (can be of any type)
     * @return true if the cache contained an entry with
     * this key, false if it did not
     */
    add(key: string, value): boolean {
        let entry = this._entryMap[key];
        if (entry) {
            entry.value = value;
            // make the entry the most recently used by re-pushing it
            // to the head of the LRU list
            this._lruRemoveEntry(entry);
            this._lruPushEntry(entry);
            return true;
        }
        if (this._entryCount === this._maxEntries) {
            // if the cache is already full, abide by the LRU strategy
            // and remove the least recently used entry from the cache
            // before pushing the new entry
            this._removeEntry(this._lruTail);
        }
        entry = { key, value };
        this._entryMap[key] = entry;
        this._entryCount += 1;
        this._lruPushEntry(entry);
        return false;
    }

    /**
     * Get the value associated to a key in the cache, making it the
     * most recently accessed for eviction purpose.
     *
     * @param key - key of which to fetch the associated value
     * @return returns the associated value if
     * exists in the cache, or undefined if not found - either if the
     * key was never added or if it has been evicted from the cache.
     */
    get(key: string) {
        const entry = this._entryMap[key];
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
     * @param key - key to remove
     * @return true if an entry has been removed, false if
     * there was no entry with this key in the cache - either if the
     * key was never added or if it has been evicted from the cache.
     */
    remove(key: string): boolean {
        const entry = this._entryMap[key];
        if (entry) {
            this._removeEntry(entry);
            return true;
        }
        return false;
    }

    /**
     * Get the current number of cached entries
     *
     * @return current number of cached entries
     */
    count(): number {
        return this._entryCount;
    }

    /**
     * Remove all entries from the cache
     */
    clear() {
        this._entryMap = {};
        this._entryCount = 0;
        this._lruHead = null;
        this._lruTail = null;
    }

    /**
     * Push an entry to the front of the LRU list, making it the most
     * recently accessed
     *
     * @param entry - entry to push
     */
    _lruPushEntry(entry) {
        /* eslint-disable no-param-reassign */
        entry._lruNext = this._lruHead;
        entry._lruPrev = null;
        if (this._lruHead) {
            this._lruHead._lruPrev = entry;
        }
        this._lruHead = entry;
        if (!this._lruTail) {
            this._lruTail = entry;
        }
        /* eslint-enable no-param-reassign */
    }

    /**
     * Remove an entry from the LRU list
     *
     * @param entry - entry to remove
     */
    _lruRemoveEntry(entry) {
        /* eslint-disable no-param-reassign */
        if (entry._lruPrev) {
            entry._lruPrev._lruNext = entry._lruNext;
        } else {
            this._lruHead = entry._lruNext;
        }
        if (entry._lruNext) {
            entry._lruNext._lruPrev = entry._lruPrev;
        } else {
            this._lruTail = entry._lruPrev;
        }
        /* eslint-enable no-param-reassign */
    }

    /**
     * Helper function to remove an existing entry from the cache
     *
     * @param entry - cache entry to remove
     */
    _removeEntry(entry) {
        this._lruRemoveEntry(entry);
        delete this._entryMap[entry.key];
        this._entryCount -= 1;
    }
}
