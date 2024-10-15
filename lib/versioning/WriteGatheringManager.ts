/* eslint-disable @typescript-eslint/no-explicit-any */

import { RequestLogger } from 'werelogs';

import { ArsenalError } from '../errors';

const WG_TIMEOUT = 5; // batching period in milliseconds

/**
 * This write-gathering manager aggregates and send requests in batches.
 * Because we are managing buckets in separate databases, we build a batch
 * from operations targeting the same database.
 */
export default class WriteGatheringManager {
    // TODO Fix this
    db: any;
    dbState: object;

    constructor(db: any) {
        this.db = db;
        this.dbState = {};
    }

    /**
     * Get the value of an entry either in temporary cache, cache, or database.
     *
     * @param request - the request in original
     *                           RepdConnection format { db, key
     *                           [, value][, type], method, options }
     * @param logger - logger
     * @param callback - callback function: callback(error, value)
     * @return - to finish the call
     */
    get(
        request: any,
        logger: RequestLogger,
        callback: (error: ArsenalError | null, data?: any) => void,
    ) {
        return this.db.get(request, logger, callback);
    }

    list(
        request: any,
        logger: RequestLogger,
        callback: (error: ArsenalError | null, data?: any) => void,
    ) {
        return this.db.list(request, logger, callback);
    }

    /**
     * Append a request to the write gathering batch.
     * Replicate and commit the batch on timeout or oversize.
     *
     * @param request - the request in format { db,
     *                           array, options }
     * @param logger - logger of the request
     * @param callback - callback(err)
     * @return - return this
     */
    batch(
        request: any,
        logger: RequestLogger,
        callback: (error: ArsenalError | null, data?: any) => void,
    ) {
        const { db, array } = request;
        if (this.dbState[db] === undefined) {
            this.dbState[db] = { db, isCommitting: false };
        }
        const dbState = this.dbState[db];
        if (dbState.batchCache === undefined) {
            dbState.batchCache = {
                batch: [],
                uids: [],
                callback: [],
                logger,
                timer: setTimeout(() => this._commitBatch(db), WG_TIMEOUT),
            };
        }
        const bCache = dbState.batchCache;
        array.forEach((entry, index) => {
            bCache.batch.push(entry);
            bCache.uids.push(logger.getSerializedUids());
            bCache.callback.push(index ? null : callback);
        });
        return this;
    }

    /**
     * Commit a batch of operations on a database.
     *
     * @param db - Name of the database
     * @return - to finish the call
     */
    _commitBatch(db: string) {
        const dbState = this.dbState[db];
        const bCache = dbState.batchCache;
        // do nothing if no batch to replicate
        if (bCache === undefined) {
            return null;
        }
        // clear the existing timer of the batch here, this pending batch will
        // be sent automatically when the previous batch finishes
        clearTimeout(bCache.timer);
        bCache.timer = undefined;
        // do nothing if another batch on the same database is in progress
        // WGM will retry after it has done committing the in-progress batch
        if (dbState.isCommitting) {
            return null;
        }
        // otherwise, clear the cache, lock the database, and commit batch
        dbState.batchCache = undefined;
        dbState.isCommitting = true; // lock batching on the database
        const request = { db, array: bCache.batch };

        return this.db.batch(request, bCache.logger, err => {
            // release the lock and answer the requests in all cases
            dbState.isCommitting = false;
            this._batchCommitted(err, bCache);
            // then check if there is any pending batch to commit
            const _bCache = this.dbState[db].batchCache;
            if (_bCache === undefined) {
                // no more pending requests, do nothing
                return null;
            }
            if (err) {
                // in the case of commit error, it is better to clear the
                // batch cache instead of rebuilding it because it is very
                // likely that the rebuilt batch will fail as well
                clearTimeout(_bCache.timer);
                _bCache.timer = undefined;
                dbState.batchCache = undefined;
                return this._batchCommitted(err, _bCache);
            }
            if (_bCache.timer === undefined) {
                // the next batch is waiting, go committing it
                return this._commitBatch(db);
            }
            return null;
        });
    }

    /**
     * Respond to all requests of a batch after it has been committed.
     *
     * @param error - error of committing the batch
     * @param batch - the committed batch
     * @return - nothing
     */
    _batchCommitted(
        error: ArsenalError | null,
        batch: { callback: (((error: ArsenalError | null) => void) | null)[] },
    ) {
        batch.callback.forEach(callback => {
            if (callback) {
                callback(error);
            }
        });
    }
}
