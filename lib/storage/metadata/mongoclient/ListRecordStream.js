const stream = require('stream');

class ListRecordStream extends stream.Transform {
    constructor(logger, lastEndID) {
        super({ objectMode: true });
        this._logger = logger;
        this._lastEndID = lastEndID;
        this._lastTs = 0;
        this._lastUniqID = null;
        // this._unpublishedListing is true once we pass the oplog
        // that has the start seq timestamp and uniqID 'h'
        this._unpublishedListing = false;
    }

    _transform(itemObj, encoding, callback) {
        if (itemObj && itemObj.o && itemObj.o._id) {
            console.log('ITEM OBJ', itemObj.o._id);
        }
        // always update to most recent uniqID
        this._lastUniqID = itemObj.h.toString();

        if (this._lastTs === null || itemObj.ts.toNumber() > this._lastTs) {
            this._lastTs = itemObj.ts.toNumber();
        }

        // only push to stream unpublished objects
        if (!this._unpublishedListing) {
            // When an oplog with a unique ID that is stored in the
            // log offset is found, all oplogs AFTER this is unpublished.
            if (!this._lastEndID || this._lastEndID === itemObj.h.toString()) {
                this._unpublishedListing = true;
            }
            console.log('SKIPPING EARLY');
            return callback();
        }

        const dbName = itemObj.ns.split('.');
        let entry;
        if (itemObj.op === 'i' && itemObj.o && itemObj.o._id) {
            console.log('PROCESSING I');
            entry = {
                type: 'put',
                key: itemObj.o._id,
                // value is given as-is for inserts
                value: JSON.stringify(itemObj.o.value),
            };
        } else if (itemObj.op === 'u' && itemObj.o && itemObj.o2 && itemObj.o2._id) {
            console.log('PROCESSING U');
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
                       console.log('PROCESSING D');
            entry = {
                type: 'delete',
                key: itemObj.o._id,
                // deletion yields no value
            };
        } else {
            console.log('SKIPPED ENTRY');
            // skip other entry types as we don't need them for now
            // ('c', ...?)
            return callback();
        }
        const streamObject = {
            timestamp: new Date((itemObj.ts ?
                                 itemObj.ts.toNumber() * 1000 : 0)),
            db: dbName[1],
            entries: [entry],
        };
        return callback(null, streamObject);
    }

    _flush(callback) {
        this.emit('info', {
            // store both the timestamp and unique oplog id in an
            // opaque JSON string returned to the reader
            end: JSON.stringify({
                ts: this._lastTs,
                uniqID: this._lastUniqID,
            }),
        });
        callback();
    }
}

module.exports = ListRecordStream;
