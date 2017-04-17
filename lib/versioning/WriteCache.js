'use strict'; // eslint-disable-line

const errors = require('../errors');

function formatCacheKey(db, key) {
    return `${db}\0\0${key}`;
}

/**
 * The WriteCache class provides an isolation" layer for versioning updates,
 * which involve a read (GET), a computation based on the read value, and a
 * subsequent write (PUT) of the computation result. This layer ensures that
 * there are no other concurrent operations changing the value of the target
 * object between these steps of a versioning update on the object.
 * "Isolation: ensures the result of executing concurrent operations being as
 * if we execute them sequentially.
 * What it does to achieve the isolation is to put concurrent updates into a
 * queue, get the target object from either the cache or the database, do the
 * computation and store the result to the cache, then move on with the next
 * request in the queue, finally write the batch of the generated updates to
 * the database.
 * WriteCache also caches the latest value of the object it's writing to ensure
 * the next update (which comes while WriteCache is writing) to be able to see
 * the latest value of that object, thus ensuring isolation. This cached entry
 * remains only until the write is done and no other update is using it.
 */
class WriteCache {
    constructor(wgm) {
        this.wgm = wgm;
        // internal state
        this.cache = {};
        this.queue = {};
        this.counter = 0; // an increasing counter for unique signatures
    }

    /**
     * Get the value of an entry either in temporary cache, cache, or database.
     *
     * @param {object} request - the request in original
     *                           RepdConnection format { db, key
     *                           [, value][, type], method, options }
     * @param {object} logger - logger
     * @param {function} callback - callback function: callback(error, value)
     * @return {any} - to finish the call
     */
    get(request, logger, callback) {
        const { db, key } = request;

        const cacheKey = formatCacheKey(db, key);
        if (this.cache[cacheKey]) {
            if (this.cache[cacheKey].value) {
                return callback(null, this.cache[cacheKey].value);
            }
            return callback(errors.ObjNotFound);
        }
        // not in cache, try to get it from the database
        const signature = this._enqueue(cacheKey, callback);
        if (signature === undefined) {
            // another get is in progress, keep calm and queue up
            return null;
        }
        // no other is in progress, get the key from the database
        return this.wgm.get(request, logger, (err, value) => {
            // answer all the queued requests
            this._dequeue(cacheKey, signature, err, value);
        });
    }

    /**
     * Queue up a get request.
     *
     * @param {string} cacheKey - key of the cache entry
     * @param {function} callback - callback
     * @return {number} - the signature of the request if this is the first
     *                    entry in the queue (which will do the get from the
     *                    database), undefined otherwise
     */
    _enqueue(cacheKey, callback) {
        if (this.queue[cacheKey]) {
            this.queue[cacheKey].queue.push(callback);
            return undefined;
        }
        this.queue[cacheKey] = { queue: [callback], signature: this.counter };
        return this.counter;
    }

    /**
     * Dequeue the concurrent get requests on the same object.
     *
     * @param {string} cacheKey - key of the cache entry
     * @param {number} signature - signature of the first request of the queue
     * @param {object} err - the error from the get
     * @param {string} value - the value of the object to seed dequeueing
     * @param {boolean} force - force dequeuing even on signature mismatch
     * @return {undefined} - nothing
     */
    _dequeue(cacheKey, signature, err, value, force = false) {
        if (this.queue[cacheKey] === undefined) {
            return;
        }
        // the lock (dequeueing) here is to prevent the concurrency of
        // dequeueing where a dequeued request can synchronously update
        // the cache, which will trigger a new dequeue process
        if (this.queue[cacheKey].dequeueing) {
            return;
        }
        if (this.queue[cacheKey].signature === signature || force) {
            this.queue[cacheKey].dequeueing = true;
            // dequeueing will read, compute, and update the cache
            const dequeueSignature = this.counter++;
            this.cache[cacheKey] = { signature: dequeueSignature, value };
            this.queue[cacheKey].queue.forEach(callback => {
                // always return the value from cache, not the value that
                // started dequeueing, because the cache might be updated
                // synchronously by a dequeued request
                if (err) {
                    return callback(err);
                }
                if (this.cache[cacheKey].value === undefined) {
                    return callback(errors.ObjNotFound);
                }
                return callback(null, this.cache[cacheKey].value);
            });
            // clear the queue when done dequeueing all entries
            delete this.queue[cacheKey];
            // also clear the cache if there is no new write
            if (this.cache[cacheKey].signature === dequeueSignature) {
                delete this.cache[cacheKey];
            }
        }
    }

    /**
     * Replicate the latest value of an entry and cache it during replication.
     *
     * @param {object} request - the request in format { db,
     *                           array, options }
     * @param {object} logger - logger of the operation
     * @param {function} callback - asynchronous callback of the call
     * @return {undefined}
     */
    batch(request, logger, callback) {
        const { db, array } = request;
        const signature = this._cacheWrite(db, array);
        this.wgm.batch(request, logger, (err, data) => {
            this._cacheClear(db, array, signature);
            callback(err, data);
        });
    }

    /**
     * Temporarily cache the writing value. Overwrite existing temporary value
     * and dequeue all pending temporary gets if exist. This is here is to
     * ensure the "isolation" property: an operation depends on the one before
     * it. The newly put value is always the latest; we have to use it instead
     * of using the potentially more stale value in the database.
     *
     * @param {string} db - name of the database
     * @param {object} array - batch operation to apply on the database
     * @return {string} - signature of the request
     */
    _cacheWrite(db, array) {
        const signature = this.counter++;
        array.forEach(entry => {
            const cacheKey = formatCacheKey(db, entry.key);
            this.cache[cacheKey] = { signature, value: entry.value };
            this._dequeue(cacheKey, null, null, entry.value, true);
        });
        return signature;
    }

    /**
     * Clear the cached entries after a successful write.
     *
     * @param {string} db - name of the database
     * @param {object} array - batch operation to apply on the database
     * @param {string} signature - signature if temporarily cached
     * @return {undefined}
     */
    _cacheClear(db, array, signature) {
        array.forEach(entry => {
            const key = formatCacheKey(db, entry.key);
            if (this.cache[key] && this.cache[key].signature === signature) {
                // only clear cache when the temporarily cached entry
                // is still available and the signatures match, which
                // means it has not been updated by a subsequent update
                delete this.cache[key];
            }
        });
    }
}

module.exports = WriteCache;
