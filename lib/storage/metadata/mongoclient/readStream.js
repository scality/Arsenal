const Readable = require('stream').Readable;
const MongoUtils = require('./utils');

class MongoReadStream extends Readable {
    static nbCreated = 0;
    constructor(c, options, searchOptions) {
        super({
            objectMode: true,
            highWaterMark: 0,
        });
        MongoReadStream.nbCreated++;

        if (options.limit === 0) {
            return;
        }

        const query = {
            _id: {},
        };
        if (options.reverse) {
            if (options.start) {
                query._id.$lte = options.start;
            }
            if (options.end) {
                query._id.$gte = options.end;
            }
            if (options.gt) {
                query._id.$lt = options.gt;
            }
            if (options.gte) {
                query._id.$lte = options.gte;
            }
            if (options.lt) {
                query._id.$gt = options.lt;
            }
            if (options.lte) {
                query._id.$gte = options.lte;
            }
        } else {
            if (options.start) {
                query._id.$gte = options.start;
            }
            if (options.end) {
                query._id.$lte = options.end;
            }
            if (options.gt) {
                query._id.$gt = options.gt;
            }
            if (options.gte) {
                query._id.$gte = options.gte;
            }
            if (options.lt) {
                query._id.$lt = options.lt;
            }
            if (options.lte) {
                query._id.$lte = options.lte;
            }
        }

        if (options.lastModified) {
            query['value.last-modified'] = {};

            if (options.lastModified.lt) {
                query['value.last-modified'].$lt = options.lastModified.lt;
            }
        }

        if (options.dataStoreName) {
            query['value.dataStoreName'] = {};

            if (options.dataStoreName.ne) {
                query['value.dataStoreName'].$ne = options.dataStoreName.ne;
            }
        }

        if (!Object.keys(query._id).length) {
            delete query._id;
        }

        // filtering out objects flagged for deletion
        query.$or = [
            { 'value.deleted': { $exists: false } },
            { 'value.deleted': { $eq: false } },
        ];

        if (searchOptions) {
            Object.assign(query, searchOptions);
        }

        const projection = { 'value.location': 0 };
        this._cursor = c.find(query, { projection }).sort({
            _id: options.reverse ? -1 : 1,
        });
        if (options.limit && options.limit !== -1) {
            this._cursor = this._cursor.limit(options.limit);
        }
        this._options = options;
        this._destroyed = false;
        this.on('end', this._cleanup.bind(this));
    }

    _read() {
        if (this._destroyed) {
            return;
        }

        this._cursor.next().then(doc => {
            if (this._destroyed) {
                return;
            }
            let key = undefined;
            let value = undefined;

            if (doc) {
                key = doc._id;
                MongoUtils.unserialize(doc.value);
                value = JSON.stringify(doc.value);
            }

            if (key === undefined && value === undefined) {
                this.push(null);
            } else if (this._options.keys !== false &&
                       this._options.values === false) {
                this.push(key);
            } else if (this._options.keys === false &&
                       this._options.values !== false) {
                this.push(value);
            } else {
                this.push({
                    key,
                    value,
                });
            }
        }).catch(err => {
            if (this._destroyed) {
                return;
            }
            this.emit('error', err);
            return;
        });
    }

    _cleanup() {
        if (this._destroyed) {
            return;
        }
        this._destroyed = true;
        MongoReadStream.nbCreated--;

        this._cursor.close().catch(err => {
            if (err) {
                this.emit('error', err);
                return;
            }
            this.emit('close');
        });
    }

    destroy() {
        return this._cleanup();
    }
}

module.exports = MongoReadStream;
