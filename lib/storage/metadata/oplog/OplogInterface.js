/*
 * Interface for oplog management
 *
 * filter is an object with the following structure: {
 *           filterName: string,
 *           filterType: bucket|bucketList|raftSession,
 *           bucket: {
 *               bucketName: string,
 *           },
 *           bucketList: {
 *               bucketList: [string, ...]
 *           },
 *           raftSession: {
 *               raftId: number,
 *           },
 *       }
 *
 * persist is an interface with the following methods:
 * - constructor(params)
 * - load(filterName, persistData, cb(err, offset))
 * - save(filterName, persistData, offset, cb(err))

 * persistData is an interface with the following methods:
 * - constuctor(params)
 * - initState(cb(err)): initialize the structure, e.g. initial bucket scan
 * - loadState(stream, cb(err)): load the state
 * - saveState(stream, cb(err)): save the state
 * - updateState(addQueue, delQueue, cb(err)): update the state
 *               item: { filterName, key, value }
 */
const werelogs = require('werelogs');

werelogs.configure({
    level: 'info',
    dump: 'error',
});

class OplogInterface {

    constructor(params) {
        this.persist = params?.persist;
        this.persistData = params?.persistData;
        this.logger = new werelogs.Logger('OplogInterface');
        /* for backends requiring bufferization only */
        this.bufferTimeoutMs = params?.bufferTimeoutMs ?? 500;
        this.addQueue = [];
        this.delQueue = [];
        this.pending = false;
        this.prevOffset = null;
        this.offset = null;
    }

    addEvent(item, offset) {
        this.addQueue.push(item);
        this.offset = offset;
    }

    delEvent(item, offset) {
        this.delQueue.push(item);
        this.offset = offset;
    }

    /*
     * Optional buffer management for backends that don't bufferize.
     * It avoids persisting the state at each event
     */
    flushQueue(cb) {
        if (this.offset === null ||
            this.prevOffset === this.offset) {
            if (cb) {
                return process.nextTick(cb);
            }
            return undefined;
        }
        if (this.pending) {
            if (cb) {
                return process.nextTick(cb);
            }
            return undefined;
        }
        this.pending = true;
        const addQueue = this.addQueue;
        this.addQueue = [];
        const delQueue = this.delQueue;
        this.delQueue = [];
        const offset = this.offset;
        this.prevOffset = this.offset;
        this.persistData.updateState(
            addQueue,
            delQueue,
            err => {
                if (err) {
                    if (cb) {
                        return cb(err);
                    }
                }
                this.persist.save(
                    this.filterName,
                    this.persistData,
                    offset,
                    err => {
                        this.pending = false;
                        if (err) {
                            if (cb) {
                                return cb(err);
                            }
                            return undefined;
                        }
                        if (cb) {
                            return cb();
                        }
                        return undefined;
                    });
                return undefined;
            });
        return undefined;
    }

    doFlush() {
        this.flushQueue(err => {
            if (err) {
                this.logger.error('flusing buffer', { err });
            }
        });
        this.startFlusher();
    }

    startFlusher() {
        setTimeout(this.doFlush.bind(this), this.bufferTimeoutMs);
    }

    // method to be overridden
    start() {
        throw new Error('not implemented');
    }
}

module.exports = OplogInterface;
