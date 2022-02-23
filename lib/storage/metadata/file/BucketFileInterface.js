const cluster = require('cluster');
const async = require('async');

const errors = require('../../../errors');

const BucketInfo = require('../../../models/BucketInfo');

const list = require('../../../algos/list/exportAlgos');

const MetadataFileClient = require('./MetadataFileClient');
const versionSep =
    require('../../../versioning/constants')
    .VersioningConstants.VersionId.Separator;

const METASTORE = '__metastore';

const itemScanRefreshDelay = 1000 * 30 * 60; // 30 minutes

class BucketFileInterface {

    /**
     * @constructor
     * @param {object} [params] - constructor params
     * @param {boolean} [params.noDbOpen=false] - true to skip DB open
     * @param {object} logger - logger
     *   (for unit tests only)
     */
    constructor(params, logger) {
        this.logger = logger;
        const { host, port } = params.metadataClient;
        this.constants = params.constants;
        this.mdClient = new MetadataFileClient({ host, port });
        if (params && params.noDbOpen) {
            return;
        }
        this.lastItemScanTime = null;
        this.lastItemScanResult = null;
    }

    setup(done) {
        return this.mdClient.openDB((err, value) => {
            if (err) {
                throw err;
            }
            // the metastore sublevel is used to store bucket attributes
            this.mdDB = value;
            this.metastore = this.mdDB.openSub(METASTORE);
            if (cluster.isMaster) {
                this.setupMetadataServer(done);
            }
        });
    }

    setupMetadataServer(done) {
        /* Since the bucket creation API is expecting the
           usersBucket to have attributes, we pre-create the
           usersBucket attributes here */
        this.mdClient.logger.debug('setting up metadata server');
        const usersBucketAttr = new BucketInfo(this.constants.usersBucket,
            'admin', 'admin', new Date().toJSON(),
            BucketInfo.currentModelVersion());
        return this.metastore.put(
            this.constants.usersBucket,
            usersBucketAttr.serialize(), {}, err => {
                if (err) {
                    this.logger.fatal('error writing usersBucket ' +
                                      'attributes to metadata',
                                      { error: err });
                    throw (errors.InternalError);
                }
                return done();
            });
    }

    /**
     * Load DB if exists
     * @param {String} bucketName - name of bucket
     * @param {Object} log - logger
     * @param {function} cb - callback(err, db, attr)
     * @return {undefined}
     */
    loadDBIfExists(bucketName, log, cb) {
        this.getBucketAttributes(bucketName, log, (err, attr) => {
            if (err) {
                return cb(err);
            }
            try {
                const db = this.mdDB.openSub(bucketName);
                return cb(null, db, attr);
            } catch (err) {
                return cb(errors.InternalError);
            }
        });
        return undefined;
    }

    createBucket(bucketName, bucketMD, log, cb) {
        this.getBucketAttributes(bucketName, log, err => {
            if (err && err !== errors.NoSuchBucket) {
                return cb(err);
            }
            if (err === undefined) {
                return cb(errors.BucketAlreadyExists);
            }
            this.lastItemScanTime = null;
            this.putBucketAttributes(bucketName,
                                     bucketMD,
                                     log, cb);
            return undefined;
        });
    }

    getBucketAttributes(bucketName, log, cb) {
        this.metastore
            .withRequestLogger(log)
            .get(bucketName, {}, (err, data) => {
                if (err) {
                    if (err.ObjNotFound) {
                        return cb(errors.NoSuchBucket);
                    }
                    const logObj = {
                        rawError: err,
                        error: err.message,
                        errorStack: err.stack,
                    };
                    log.error('error getting db attributes', logObj);
                    return cb(errors.InternalError);
                }
                return cb(null, BucketInfo.deSerialize(data));
            });
        return undefined;
    }

    getBucketAndObject(bucketName, objName, params, log, cb) {
        this.loadDBIfExists(bucketName, log, (err, db, bucketAttr) => {
            if (err) {
                return cb(err);
            }
            db.withRequestLogger(log)
                .get(objName, params, (err, objAttr) => {
                    if (err) {
                        if (err.ObjNotFound) {
                            return cb(null, {
                                bucket: bucketAttr.serialize(),
                            });
                        }
                        const logObj = {
                            rawError: err,
                            error: err.message,
                            errorStack: err.stack,
                        };
                        log.error('error getting object', logObj);
                        return cb(errors.InternalError);
                    }
                    return cb(null, {
                        bucket: bucketAttr.serialize(),
                        obj: objAttr,
                    });
                });
            return undefined;
        });
        return undefined;
    }

    putBucketAttributes(bucketName, bucketMD, log, cb) {
        this.metastore
            .withRequestLogger(log)
            .put(bucketName, bucketMD.serialize(), {}, err => {
                if (err) {
                    const logObj = {
                        rawError: err,
                        error: err.message,
                        errorStack: err.stack,
                    };
                    log.error('error putting db attributes', logObj);
                    return cb(errors.InternalError);
                }
                return cb();
            });
        return undefined;
    }

    deleteBucket(bucketName, log, cb) {
        this.metastore
            .withRequestLogger(log)
            .del(bucketName, {}, err => {
                if (err) {
                    const logObj = {
                        rawError: err,
                        error: err.message,
                        errorStack: err.stack,
                    };
                    log.error('error deleting bucket',
                              logObj);
                    return cb(errors.InternalError);
                }
                this.lastItemScanTime = null;
                return cb();
            });
        return undefined;
    }

    putObject(bucketName, objName, objVal, params, log, cb) {
        this.loadDBIfExists(bucketName, log, (err, db) => {
            if (err) {
                return cb(err);
            }
            // Ignore the PUT done by AbortMPU
            if (params && params.isAbort) {
                return cb();
            }
            db.withRequestLogger(log)
                .put(objName, JSON.stringify(objVal), params, (err, data) => {
                    if (err) {
                        const logObj = {
                            rawError: err,
                            error: err.message,
                            errorStack: err.stack,
                        };
                        log.error('error putting object', logObj);
                        return cb(errors.InternalError);
                    }
                    return cb(err, data);
                });
            return undefined;
        });
    }

    getObject(bucketName, objName, params, log, cb) {
        this.loadDBIfExists(bucketName, log, (err, db) => {
            if (err) {
                return cb(err);
            }
            db.withRequestLogger(log).get(objName, params, (err, data) => {
                if (err) {
                    if (err.ObjNotFound) {
                        return cb(errors.NoSuchKey);
                    }
                    const logObj = {
                        rawError: err,
                        error: err.message,
                        errorStack: err.stack,
                    };
                    log.error('error getting object', logObj);
                    return cb(errors.InternalError);
                }
                return cb(null, JSON.parse(data));
            });
            return undefined;
        });
    }

    deleteObject(bucketName, objName, params, log, cb) {
        this.loadDBIfExists(bucketName, log, (err, db) => {
            if (err) {
                return cb(err);
            }
            db.withRequestLogger(log).del(objName, params, err => {
                if (err) {
                    const logObj = {
                        rawError: err,
                        error: err.message,
                        errorStack: err.stack,
                    };
                    log.error('error deleting object', logObj);
                    return cb(errors.InternalError);
                }
                return cb();
            });
            return undefined;
        });
    }

    /**
     *  This complex function deals with different extensions of bucket listing:
     *  Delimiter based search or MPU based search.
     *  @param {String} bucketName - The name of the bucket to list
     *  @param {Object} params - The params to search
     *  @param {Object} log - The logger object
     *  @param {function} cb - Callback when done
     *  @return {undefined}
     */
    internalListObject(bucketName, params, log, cb) {
        const extName = params.listingType;
        const extension = new list[extName](params, log);
        const requestParams = extension.genMDParams();
        this.loadDBIfExists(bucketName, log, (err, db) => {
            if (err) {
                return cb(err);
            }
            let cbDone = false;
            db.withRequestLogger(log)
                .createReadStream(requestParams, (err, stream) => {
                    if (err) {
                        return cb(err);
                    }
                    stream
                        .on('data', e => {
                            if (extension.filter(e) < 0) {
                                stream.emit('end');
                                stream.destroy();
                            }
                        })
                        .on('error', err => {
                            if (!cbDone) {
                                cbDone = true;
                                const logObj = {
                                    rawError: err,
                                    error: err.message,
                                    errorStack: err.stack,
                                };
                                log.error('error listing objects', logObj);
                                cb(errors.InternalError);
                            }
                        })
                        .on('end', () => {
                            if (!cbDone) {
                                cbDone = true;
                                const data = extension.result();
                                cb(null, data);
                            }
                        });
                    return undefined;
                });
            return undefined;
        });
    }

    listObject(bucketName, params, log, cb) {
        return this.internalListObject(bucketName, params, log, cb);
    }

    listMultipartUploads(bucketName, params, log, cb) {
        return this.internalListObject(bucketName, params, log, cb);
    }

    getUUID(log, cb) {
        return this.mdDB.getUUID(cb);
    }

    getDiskUsage(cb) {
        return this.mdDB.getDiskUsage(cb);
    }

    countItems(log, cb) {
        if (this.lastItemScanTime !== null &&
            (Date.now() - this.lastItemScanTime) <= itemScanRefreshDelay) {
            return process.nextTick(cb, null, this.lastItemScanResult);
        }

        const params = {};
        const extension = new list.Basic(params, log);
        const requestParams = extension.genMDParams();

        const res = {
            objects: 0,
            versions: 0,
            buckets: 0,
            bucketList: [],
        };
        let cbDone = false;

        this.mdDB.rawListKeys(requestParams, (err, stream) => {
            if (err) {
                return cb(err);
            }
            stream
                .on('data', e => {
                    if (!e.includes(METASTORE)) {
                        if (e.includes(this.constants.usersBucket)) {
                            res.buckets++;
                            res.bucketList.push({
                                name: e.split(this.constants.splitter)[1],
                            });
                        } else if (e.includes(versionSep)) {
                            res.versions++;
                        } else if (!e.includes('..recordLogs#s3-recordlog')) {
                            res.objects++;
                        }
                    }
                })
                .on('error', err => {
                    if (!cbDone) {
                        cbDone = true;
                        const logObj = {
                            error: err,
                            errorMessage: err.message,
                            errorStack: err.stack,
                        };
                        log.error('error listing objects', logObj);
                        cb(errors.InternalError);
                    }
                })
                .on('end', () => {
                    if (!cbDone) {
                        cbDone = true;
                        async.eachSeries(res.bucketList, (bucket, cb) => {
                            this.getBucketAttributes(bucket.name, log,
                            (err, bucketInfo) => {
                                if (err) {
                                    return cb(err);
                                }
                                /* eslint-disable no-param-reassign */
                                bucket.location =
                                    bucketInfo.getLocationConstraint();
                                /* eslint-enable no-param-reassign */
                                return cb();
                            });
                        }, err => {
                            if (!err) {
                                this.lastItemScanTime = Date.now();
                                this.lastItemScanResult = res;
                            }
                            return cb(err, res);
                        });
                    }
                    return undefined;
                });
            return undefined;
        });
        return undefined;
    }
}

module.exports = BucketFileInterface;
