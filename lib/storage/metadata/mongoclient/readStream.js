const Readable = require('stream').Readable;
const MongoUtils = require('./utils');

class MongoReadStream extends Readable {
    constructor(c, options, searchOptions) {
        super({
            objectMode: true,
            highWaterMark: 0,
        });

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
            if (options.lastModified.lte) {
                query['value.last-modified'].$lte = options.lastModified.lte;
            }
            if (options.lastModified.gt) {
                query['value.last-modified'].$gt = options.lastModified.gt;
            }
            if (options.lastModified.gte) {
                query['value.last-modified'].$gte = options.lastModified.gte;
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

        let sort = {
            _id: options.reverse ? -1 : 1,
        };

        if (options.sortByLastModified) {
            sort = {
                'value.last-modified': 1,
                '_id': 1,
            };
        }

        this._cursor = this._cursor.sort(sort);

        this._cursor = c.find(query).sort({
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

        this._cursor.next((err, doc) => {
            if (this._destroyed) {
                return;
            }
            if (err) {
                this.emit('error', err);
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
        });
    }

    _cleanup() {
        if (this._destroyed) {
            return;
        }
        this._destroyed = true;

        this._cursor.close(err => {
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
