'use strict'; // eslint-disable-line

const MongoClient = require('mongodb').MongoClient;
const ListRecordStream = require('./ListRecordStream');

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
        this._mongoUrl = `mongodb://${replicaSetHosts}/local`;
        this._logger = logger;
        this._oplogNsRegExp = new RegExp(`^${database}\\.`);
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
        MongoClient.connect(this._mongoUrl, {
            replicaSet: 'rs0',
            useNewUrlParser: true,
        },
        (err, client) => {
            if (err) {
                this._logger.error('Unable to connect to MongoDB',
                { error: err });
                return done(err);
            }
            this._logger.info('connected to mongodb');
            this.client = client;
            // 'local' is the database where MongoDB has oplog.rs
            // capped collection
            this.db = client.db('local', {
                ignoreUndefined: true,
            });
            return done();
        });
    }

    /**
     * Open a tailable cursor to mongo oplog and retrieve a stream of
     * records to read
     *
     * @param {Object} [params] - params object
     * @param {String} [params.startSeq] - fetch starting from this
     *   opaque offset returned previously by mongo ListRecordStream
     *   in an 'info' event
     * @param {function} cb - callback function, called with an error
     *   object or null and an object as 2nd parameter
     *
     * @return {undefined}
     */
    readRecords(params, cb) {
        let startSeq = {};
        if (params.startSeq) {
            try {
                // parse the opaque JSON string passed through from a
                // previous 'info' event
                startSeq = JSON.parse(params.startSeq);
            } catch (err) {
                this._logger.error('malformed startSeq', {
                    startSeq: params.startSeq,
                });
                // start over if malformed
            }
        }
        this.coll = this.db.collection('oplog.rs');
        this._readLatestOplogID((err, latestOplogID) => {
            if (err) {
                return cb(err);
            }
            const recordStream = new ListRecordStream(this._logger,
                                                      startSeq.uniqID,
                                                      latestOplogID);
            return this.coll.find({
                ns: this._oplogNsRegExp,
            }, {
                tailable: true,
                awaitData: true,
                noCursorTimeout: true,
                numberOfRetries: Number.MAX_VALUE,
            }, (err, res) => {
                const cursorStream = res.stream();
                cursorStream.on('close', () => {
                    recordStream.emit('error', new Error('cursor closed'));
                });
                cursorStream.on('error', err => {
                    this._logger.error('cursor stream error', {
                        error: err.message,
                    });
                    recordStream.emit('error', err);
                    res.close();
                });
                cursorStream.pipe(recordStream);
                return cb(null, { log: recordStream, tailable: true });
            });
        });
    }

    _readLatestOplogID(cb) {
        this.coll.find({
            ns: this._oplogNsRegExp,
        }, {
            ts: 1,
        }).sort({
            $natural: -1,
        }).limit(1).toArray((err, data) => {
            if (err) {
                return cb(err);
            }
            const latestOplogID = data[0].h.toString();
            this._logger.debug('latest oplog ID read', { latestOplogID });
            return cb(null, latestOplogID);
        });
    }
}

module.exports = LogConsumer;
