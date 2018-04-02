'use strict'; // eslint-disable-line

const stream = require('stream');
const MongoClient = require('mongodb').MongoClient;
const { Timestamp } = require('bson');

let lastEndID = null;

const ops = {
    i: 'put',
    u: 'put',
    d: 'delete',
};

class ListRecordStream extends stream.Transform {
    constructor(logger) {
        super({ objectMode: true });
        this.logger = logger;
        this.hasStarted = false;
        this.start = null;
        this.end = null;
        this.lastUniqID = null;
        // this.unpublishedListing is true once we pass the oplog that has the
        // start seq timestamp and uniqID 'h'
        this.unpublishedListing = null;
    }

    _transform(itemObj, encoding, callback) {
        if (!itemObj) {
            this.push(null);
            this.emit('info', {
                start: this.start,
                end: this.end,
                uniqID: this.lastUniqID,
            });
            return callback();
        }

        // always update to most recent uniqID
        this.lastUniqID = itemObj.h.toString();

        if (this.end === null || itemObj.ts.toNumber() > this.end) {
            this.end = itemObj.ts.toNumber();
        }

        // only push to stream unpublished objects
        if (!this.unpublishedListing) {
            if (lastEndID === itemObj.h.toString()) {
                this.unpublishedListing = true;
            }
            return callback();
        }

        if (!this.hasStarted) {
            this.hasStarted = true;
            this.start = itemObj.ts.toNumber();
            this.emit('info', {
                start: this.start,
                end: this.end,
                uniqId: this.lastUniqID,
            });
        }

        // don't push oplogs that have already been sent
        if (!this.unpublishedListing) {
            return callback();
        }

        const dbName = itemObj.ns.split('.');
        const streamObject = {
            timestamp: new Date(itemObj.ts.high_ * 1000),
            db: dbName[1],
            entries: [
                {
                    type: ops[itemObj.op],
                    key: itemObj.o._id,
                    value: JSON.stringify(itemObj.o.value),
                },
            ],
        };
        return callback(null, streamObject);
    }

    _flush(callback) {
        this.emit('info', {
            start: this.start,
            end: this.end,
            uniqID: this.lastUniqID,
        });
        this.push(null);
        callback();
    }
}

/**
 * @class
 * @classdesc Class to consume mongo oplog
 */
class LogConsumer {

    /**
     * @constructor
     *
     * @param {object} mongoConfig - object with the mongo configuration
     * @param {string} logger - logger
     */
    constructor(mongoConfig, logger) {
        const { replicaSetHosts, database } = mongoConfig;
        // 'local' is the database where MongoDB has oplogs.rs capped collection
        this.database = 'local';
        this.mongoUrl = `mongodb://${replicaSetHosts}/local`;
        this.logger = logger;
        this.metadataDatabase = database;
    }

    /**
     * Connect to MongoClient using Mongo node module to access database and
     * database oplogs (operation logs)
     *
     * @param {function} done - callback function, called with an error object
     * or null and an object as 2nd parameter
     * @return {undefined}
    */
    connectMongo(done) {
        MongoClient.connect(this.mongoUrl, { replicaSet: 'rs0' },
        (err, client) => {
            if (err) {
                this.logger.error('Unable to connect to MongoDB',
                { error: err });
                return done(err);
            }
            this.logger.info('connected to mongodb');
            this.client = client;
            this.db = client.db(this.database, {
                ignoreUndefined: true,
            });
            return done();
        });
    }
    /**
     * Read a series of log records from mongo
     *
     * @param {Object} [params] - params object
     * @param {String} [params.startSeq] - fetch starting from this
     *   sequence number
     * @param {Number} [params.limit] - maximum number of log records
     *   to return
     * @param {function} cb - callback function, called with an error
     *   object or null and an object as 2nd parameter
     *
     * @return {undefined}
     */
    readRecords(params, cb) {
        const recordStream = new ListRecordStream(this.logger);
        const limit = params.limit || 10000;
        const startIDandSeq = params.startSeq.toString().split('|');
        const startSeq = parseInt(startIDandSeq[0], 10) || 0;
        lastEndID = startIDandSeq[1];

        const db = this.metadataDatabase;
        const ns = new RegExp(`^(?!.*${db}.*(?:__)).*${db}\\.\\w+.*`);

        this.coll = this.db.collection('oplog.rs');
        return this.coll.find({
            ns,
            ts: { $gte: Timestamp.fromNumber(startSeq) },
        }, {
            limit,
            tailable: false,
            awaitData: false,
            noCursorTimeout: true,
            OplogReplay: true,
            numberOfRetries: Number.MAX_VALUE,
        }, (err, res) => {
            const stream = res.stream();
            stream.on('data', data => {
                recordStream.write(data);
            });
            stream.on('end', () => {
                recordStream.write(undefined);
            });
            recordStream.once('info', info => {
                recordStream.removeAllListeners('error');
                cb(null, { info, log: recordStream });
            });
            return undefined;
        });
    }
}

module.exports = LogConsumer;
