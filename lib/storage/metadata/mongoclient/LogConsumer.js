'use strict'; // eslint-disable-line

const MongoClient = require('mongodb').MongoClient;
const ListRecordStream = require('./ListRecordStream');
const { Timestamp } = require('bson');

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
        this.oplogNsRegExp = new RegExp(`^${database}\\.`);
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
     *   opaque offset returned previously by mongo ListRecordStream
     *   in an 'info' event
     * @param {Number} [params.limit] - maximum number of log records
     *   to return
     * @param {function} cb - callback function, called with an error
     *   object or null and an object as 2nd parameter
     *
     * @return {undefined}
     */
    readRecords(params, cb) {
        const limit = params.limit || 10000;
        let startSeq = { ts: 0 };
        if (params.startSeq) {
            try {
                // parse the opaque JSON string passed through from a
                // previous 'info' event
                startSeq = JSON.parse(params.startSeq);
            } catch (err) {
                this.logger.error('malformed startSeq', {
                    startSeq: params.startSeq,
                });
                // start over if malformed
            }
        }
        const recordStream = new ListRecordStream(this.logger, startSeq.uniqID);

        this.coll = this.db.collection('oplog.rs');
        return this.coll.find({
            ns: this.oplogNsRegExp,
            ts: { $gte: Timestamp.fromNumber(startSeq.ts) },
        }, {
            limit,
            tailable: false,
            awaitData: false,
            noCursorTimeout: true,
            oplogReplay: true,
            numberOfRetries: Number.MAX_VALUE,
        }, (err, res) => {
            res.stream().pipe(recordStream);
            recordStream.removeAllListeners('error');
            return cb(null, { log: recordStream });
        });
    }
}

module.exports = LogConsumer;
