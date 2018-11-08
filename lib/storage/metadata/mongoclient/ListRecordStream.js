const stream = require('stream');

/**
 * @class ListRecordStream
 * @classdesc Filter and stream records returned from a mongodb query
 * cursor
 */
class ListRecordStream extends stream.Readable {
    /**
     * @constructor
     * @param {mongodb.Cursor} mongoCursor - cursor returned by a
     *   mongodb query to the oplog (see
     *   http://mongodb.github.io/node-mongodb-native/2.0/api/Cursor.html)
     * @param {werelogs.Logger} logger - logger object
     * @param {string} lastSavedID - unique ID that has been persisted
     *   of the most recently processed entry in the oplog
     * @param {string} latestOplogID - unique ID of the most recently
     *   added entry in the oplog
     */
    constructor(mongoCursor, logger, lastSavedID, latestOplogID) {
        super({ objectMode: true });
        this._cursor = mongoCursor;
        this._logger = logger;
        this._lastSavedID = lastSavedID;
        this._latestOplogID = latestOplogID;
        this._lastConsumedID = null;
        // this._unpublishedListing is true once we pass the oplog
        // record that has the same uniqID 'h' than last saved. If we
        // don't find it (e.g. log rolled over before populator could
        // process its oldest entries), we will restart from the
        // latest record of the oplog.
        this._unpublishedListing = false;
        // cf. this.getSkipCount()
        this._skipCount = 0;
    }

    _read() {
        // MongoDB cursors provide a stream interface. We choose not
        // to use it though because errors may not be emitted by the
        // stream when there is an issue with the connection to
        // MongoDB (especially when pause()/resume() are used).
        //
        // Instead we use the async cursor.next() call directly to
        // fetch records one at a time, errors are then forwarded in
        // the callback.
        this._cursor.next((err, item) => {
            if (err) {
                this._logger.error('mongodb cursor error', {
                    method: 'mongoclient.ListRecordStream._read()',
                    error: err.message,
                });
                this.emit('error', err);
                return undefined;
            }
            if (this._processItem(item)) {
                return process.nextTick(this._read.bind(this));
            }
            // wait until _read() gets called again
            return undefined;
        });
    }

    _processItem(itemObj) {
        // always update to most recent uniqID
        this._lastConsumedID = itemObj.h.toString();

        // only push to stream unpublished objects
        if (!this._lastSavedID) {
            // process from the first entry
            this._unpublishedListing = true;
        } else if (!this._unpublishedListing) {
            // When an oplog with a unique ID that is stored in the
            // log offset is found, all oplogs AFTER this is unpublished.
            if (this._lastSavedID === this._lastConsumedID) {
                this._unpublishedListing = true;
            } else if (this._latestOplogID === this._lastConsumedID) {
                this._logger.warn(
                    'did not encounter the last saved offset in oplog, ' +
                        'resuming processing right after the latest record ' +
                        'to date; some entries may have been skipped', {
                            lastSavedID: this._lastSavedID,
                            latestRecordID: this._latestOplogID,
                        });
                this._unpublishedListing = true;
            }
            ++this._skipCount;
            return true; // read next record
        }

        const dbName = itemObj.ns.split('.');
        let entry;
        if (itemObj.op === 'i' &&
            itemObj.o && itemObj.o._id) {
            entry = {
                type: 'put',
                key: itemObj.o._id,
                // value is given as-is for inserts
                value: JSON.stringify(itemObj.o.value),
            };
        } else if (itemObj.op === 'u' &&
                   itemObj.o && itemObj.o2 && itemObj.o2._id) {
            entry = {
                type: 'put', // updates overwrite the whole metadata,
                             // so they are considered as puts
                key: itemObj.o2._id,
                // updated value may be either stored directly in 'o'
                // attribute or in '$set' attribute (supposedly when
                // the object pre-exists it will be in '$set')
                value: JSON.stringify(
                    (itemObj.o.$set ? itemObj.o.$set : itemObj.o).value),
            };
        } else if (itemObj.op === 'd' &&
                   itemObj.o && itemObj.o._id) {
            entry = {
                type: 'delete',
                key: itemObj.o._id,
                // deletion yields no value
            };
        } else {
            // skip other entry types as we don't need them for now
            // ('c', ...?)
            ++this._skipCount;
            return true; // read next record
        }
        const streamObject = {
            timestamp: new Date((itemObj.ts ?
                                 itemObj.ts.toNumber() * 1000 : 0)),
            db: dbName[1],
            entries: [entry],
        };
        // push object to the stream, then return false to wait until
        // _read() is called again (because we are in an asynchronous
        // context already)
        this.push(streamObject);
        return false;
    }

    /**
     * Get an opaque JSON blob containing the latest consumed offset
     * from MongoDB oplog.
     *
     * @return {string} opaque JSON blob
     */
    getOffset() {
        return JSON.stringify({
            uniqID: this._lastConsumedID,
        });
    }

    /**
     * Get the number of entries that have been read and skipped from
     * MongoDB oplog since the ListRecordStream instance was created.
     *
     * @return {integer} number of skipped entries
     */
    getSkipCount() {
        return this._skipCount;
    }

    /**
     * Get whether the stream reached yet-unpublished records
     * (i.e. after we reached either the saved unique ID, or the tip
     * of the oplog)
     *
     * @return {boolean} true if we are now returning unpublished records
     */
    reachedUnpublishedListing() {
        return this._unpublishedListing;
    }
}

module.exports = ListRecordStream;
