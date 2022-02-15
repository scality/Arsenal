/*
 * Main interface for Mongo oplog management
 */
const MongoClient = require('mongodb').MongoClient;
const bson = require('bson');
const { jsutil, errors } = require('arsenal');
const async = require('async');
const { isMasterKey } = require('arsenal/lib/versioning/Version');
const OplogInterface = require('./OplogInterface');

class MongoOplogInterface extends OplogInterface {

    constructor(params) {
        super(params);
        this.mongoDbUri = 'mongodb://localhost:27017';
        if (params && params.mongoDbUri !== undefined) {
            this.mongoDbUri = params.mongoDbUri;
        }
        this.databaseName = 'metadata';
        if (params && params.databaseName !== undefined) {
            this.databaseName = params.databaseName;
        }
    }

    start(filter, cb) {
        if (filter.filterType !== 'bucket') {
            return cb(errors.NotImplemented);
        }
        const filterName = filter.filterName;
        const bucketName = filter.bucket.bucketName;
        let db;
        let collection;
        async.waterfall([
            /*
             * In this step we connect to MongoDB
             */
            next => {
                MongoClient.connect(
                    this.mongoDbUri,
                    (err, client) => {
                        if (err) {
                            this.logger.error('error connecting to mongodb', { err, filterName });
                            return next(err);
                        }
                        db = client.db(this.databaseName, {
                            ignoreUndefined: true,
                        });
                        collection = db.collection(bucketName);
                        return next();
                    });
            },
            /*
             * In this step we get the stored offset if we have it
             */
            next => {
                let resumeToken = undefined;
                this.persist.load(filterName, this.persistData, (err, offset) => {
                    if (err) {
                        return next(err);
                    }
                    if (offset && offset._data) {
                        resumeToken = {};
                        resumeToken._data = new bson.Binary(Buffer.from(offset._data, 'base64'));
                    }
                    return next(null, resumeToken);
                });
            },
            /*
             * In this step we acquire the offset if we don't already have it
             */
            (resumeToken, next) => {
                if (resumeToken !== undefined) {
                    this.logger.info(
                        `skipping resumeToken acquisition (resumeToken=${resumeToken})`,
                        { filterName });
                    return next(null, resumeToken, true);
                }
                this.logger.info('resumeToken acquisition',
                                 { filterName });
                const changeStream = collection.watch();
                // big hack to extract resumeToken
                changeStream.once('change', () => next(null, changeStream.resumeToken, false));
                return undefined;
            },
            /*
             * In this step we init the state (e.g. scan)
             */
            (resumeToken, skipInit, next) => {
                if (skipInit) {
                    this.logger.info(`skipping state initialization resumeToken=${resumeToken}`,
                                     { filterName });
                    return next(null, resumeToken);
                }
                this.logger.info(`initializing state resumeToken=${resumeToken}`,
                                 { filterName });
                this.persistData.initState(
                    err => {
                        if (err) {
                            // eslint-disable-next-line
                            console.error(err);
                            process.exit(1);
                        }
                        this.persist.save(
                            filterName, this.persistData, resumeToken, err => {
                                if (err) {
                                    return next(err);
                                }
                                return next(null, resumeToken);
                            });
                        return undefined;
                    });
                return undefined;
            },
            /*
             * In this step we loop over the oplog
             */
            (resumeToken, next) => {
                this.logger.info(`reading oplog resumeToken=${resumeToken}`,
                                 { filterName });
                // only way to get out of the loop in all cases
                const nextOnce = jsutil.once(next);
                // read the change stream
                const changeStream = collection.watch({ resumeAfter: resumeToken });
                // start bufferization
                this.filterName = filterName;
                this.startFlusher();
                changeStream.on(
                    'change', item => {
                        if (item.ns.db === this.databaseName) {
                            const _item = {};
                            _item.bucketName = bucketName;
                            _item.key = item.documentKey._id;
                            if (item.operationType === 'insert' ||
                                item.operationType === 'replace') {
                                _item.value = Object.assign({}, item.fullDocument.value);
                                this.addEvent(_item, changeStream.resumeToken);
                            } else if (item.operationType === 'delete') {
                                if (!isMasterKey(_item.key)) {
                                    // ignore for now
                                    return;
                                }
                                this.delEvent(_item, changeStream.resumeToken);
                            } else if (item.operationType === 'invalidate') {
                                nextOnce();
                                return;
                            } else {
                                return;
                            }
                        }
                    });
            }], err => {
            if (err) {
                return cb(err);
            }
            this.logger.info('returning',
                             { filterName });
            return cb();
        });
        return undefined;
    }
}

module.exports = MongoOplogInterface;
