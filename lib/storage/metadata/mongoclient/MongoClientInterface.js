/*
 * we assume good default setting of write concern is good for all
 * bulk writes. Note that bulk writes are not transactions but ordered
 * writes. They may fail in between. To some extend those situations
 * may generate orphans but not alter the proper conduct of operations
 * (what he user wants and what we acknowledge to the user).
 *
 * Orphan situations may be recovered by the Lifecycle.
 *
 * We use proper atomic operations when needed.
 */
const async = require('async');
const crypto = require('crypto');

const { EventEmitter } = require('events');
const constants = require('../../../constants');

const errors = require('../../../errors');
const BucketInfo = require('../../../models/BucketInfo');

const MongoClient = require('mongodb').MongoClient;
const Uuid = require('uuid');
const diskusage = require('diskusage');

const genVID = require('../../../versioning/VersionID').generateVersionId;
const listAlgos = require('../../../algos/list/exportAlgos');

const MongoReadStream = require('./readStream');
const MongoUtils = require('./utils');
const { DataCounter } = require('./DataCounter');
const Skip = require('../../../algos/list/skip');

const USERSBUCKET = '__usersbucket';
const METASTORE = '__metastore';
const INFOSTORE = '__infostore';
const __UUID = 'uuid';
const __REP_GROUP_ID = 'repGroupID';
const PENSIEVE = 'PENSIEVE';
const ASYNC_REPAIR_TIMEOUT = 15000;
const itemScanRefreshDelay = 1000 * 60 * 60; // 1 hour
const CONNECT_TIMEOUT_MS = 5000;

const initialInstanceID = process.env.INITIAL_INSTANCE_ID;

let uidCounter = 0;

const VID_SEP = require('../../../versioning/constants')
    .VersioningConstants.VersionId.Separator;

function generateVersionId(replicationGroupId) {
    // generate a unique number for each member of the nodejs cluster
    return genVID(`${process.pid}.${uidCounter++}`,
                  replicationGroupId);
}

function formatVersionKey(key, versionId) {
    return `${key}${VID_SEP}${versionId}`;
}

function inc(str) {
    return str ? (str.slice(0, str.length - 1) +
            String.fromCharCode(str.charCodeAt(str.length - 1) + 1)) : str;
}

const VID_SEPPLUS = inc(VID_SEP);

function generatePHDVersion(versionId) {
    return {
        isPHD: true,
        versionId,
    };
}

/**
 * @constructor
 *
 * @param {Object} params - constructor params
 * @param {String} params.replicaSetHosts - replicaSetMembers for mongo
 * @param {String} params.replicationGroupId - replication group id
 * used here to generate version id's
 * @param {String} params.replicaSet - name of mongo replica setup
 * @param {String} params.path - path value
 * // Does backbeat use this at all? Can we make this optional and
 * // set a default so when instantiate the client elsewhere don't need?
 * @param {String} params.database - name of database
 * @param {werelogs.Logger} params.logger - logger instance
 * @param {String} [params.path] - path for mongo volume
 */
class MongoClientInterface {
    constructor(params) {
        const { replicaSetHosts, writeConcern, replicaSet, readPreference, path,
            database, logger, replicationGroupId, config } = params;
        this.mongoUrl = `mongodb://${replicaSetHosts}/?w=${writeConcern}&` +
            `replicaSet=${replicaSet}&readPreference=${readPreference}`;
        this.logger = logger;
        this.client = null;
        this.db = null;
        this.path = path;
        this.replicationGroupId = replicationGroupId;
        this.database = database;
        this.lastItemScanTime = null;
        this.dataCount = new DataCounter();
        if (config && config instanceof EventEmitter) {
            this.config = config;
            this.config.on('location-constraints-update', () => {
                this.dataCount
                .updateTransientList(this.config.locationConstraints);
                if (this.config.isTest) {
                    this.config.emit('MongoClientTestDone');
                }
            });
            this.dataCount.updateTransientList(this.config.locationConstraints);
        }
    }

    setup(cb) {
        // FIXME: constructors shall not have side effect so there
        // should be an async_init(cb) method in the wrapper to
        // initialize this backend
        const connectTimeoutMS = parseInt(process.env.MONGO_CONNECT_TIMEOUT_MS,
            10) || CONNECT_TIMEOUT_MS;
        const options = { connectTimeoutMS };
        return MongoClient.connect(this.mongoUrl, options, (err, client) => {
            if (err) {
                this.logger.error('error connecting to mongodb',
                    { error: err.message });
                return cb(errors.InternalError);
            }
            this.logger.info('connected to mongodb', { url: this.mongoUrl });
            this.client = client;
            this.db = client.db(this.database, {
                ignoreUndefined: true,
            });
            return this.usersBucketHack(cb);
        });
    }
    usersBucketHack(cb) {
        /* FIXME: Since the bucket creation API is expecting the
           usersBucket to have attributes, we pre-create the
           usersBucket attributes here (see bucketCreation.js line
           36)*/
        const usersBucketAttr = new BucketInfo(constants.usersBucket,
            'admin', 'admin', new Date().toJSON(),
            BucketInfo.currentModelVersion());
        return this.createBucket(
            constants.usersBucket,
            usersBucketAttr, {}, err => {
                if (err) {
                    this.logger.fatal('error writing usersBucket ' +
                                      'attributes to metastore',
                                      { error: err });
                    throw (errors.InternalError);
                }
                return cb();
            });
    }

    getCollection(name) {
        /* mongo has a problem with .. in collection names */
        const newName = (name === constants.usersBucket) ?
              USERSBUCKET : name;
        return this.db.collection(newName);
    }

    createBucket(bucketName, bucketMD, log, cb) {
        // FIXME: there should be a version of BucketInfo.serialize()
        // that does not JSON.stringify()
        const bucketInfo = BucketInfo.fromObj(bucketMD);
        const bucketMDStr = bucketInfo.serialize();
        const newBucketMD = JSON.parse(bucketMDStr);
        const m = this.getCollection(METASTORE);
        // we don't have to test bucket existence here as it is done
        // on the upper layers
        m.update({
            _id: bucketName,
        }, {
            _id: bucketName,
            value: newBucketMD,
        }, {
            upsert: true,
        }, err => {
            if (err) {
                log.error(
                    'createBucket: error creating bucket',
                { error: err.message });
                return cb(errors.InternalError);
            }
            this.lastItemScanTime = null;
            // NOTE: We do not need to create a collection for
            // "constants.usersBucket" and "PENSIEVE" since it has already
            // been created
            if (bucketName !== constants.usersBucket &&
                bucketName !== PENSIEVE) {
                return this.db.createCollection(bucketName, err => {
                    if (err) {
                        log.error(
                            'createBucket: error creating bucket',
                        { error: err.message });
                        return cb(errors.InternalError);
                    }
                    return cb();
                });
            }

            return cb();
        });
    }

    getBucketAttributes(bucketName, log, cb) {
        const m = this.getCollection(METASTORE);
        m.findOne({
            _id: bucketName,
        }, {}, (err, doc) => {
            if (err) {
                log.error(
                    'getBucketAttributes: error getting bucket attributes',
                    { error: err.message });
                return cb(errors.InternalError);
            }
            if (!doc) {
                return cb(errors.NoSuchBucket);
            }
            // FIXME: there should be a version of BucketInfo.deserialize()
            // that properly inits w/o JSON.parse()
            const bucketMDStr = JSON.stringify(doc.value);
            const bucketMD = BucketInfo.deSerialize(bucketMDStr);
            return cb(null, bucketMD);
        });
    }

    getBucketAndObject(bucketName, objName, params, log, cb) {
        this.getBucketAttributes(bucketName, log, (err, bucket) => {
            if (err) {
                log.error(
                    'getBucketAttributes: error getting bucket attributes',
                    { error: err.message });
                return cb(err);
            }
            this.getObject(bucketName, objName, params, log, (err, obj) => {
                if (err) {
                    if (err === errors.NoSuchKey) {
                        return cb(null,
                                  { bucket:
                                    BucketInfo.fromObj(bucket).serialize(),
                                  });
                    }
                    log.error('getObject: error getting object',
                    { error: err.message });
                    return cb(err);
                }
                return cb(null, {
                    bucket: BucketInfo.fromObj(bucket).serialize(),
                    obj: JSON.stringify(obj),
                });
            });
            return undefined;
        });
    }

    putBucketAttributes(bucketName, bucketMD, log, cb) {
        // FIXME: there should be a version of BucketInfo.serialize()
        // that does not JSON.stringify()
        const bucketInfo = BucketInfo.fromObj(bucketMD);
        const bucketMDStr = bucketInfo.serialize();
        const newBucketMD = JSON.parse(bucketMDStr);
        const m = this.getCollection(METASTORE);
        m.update({
            _id: bucketName,
        }, {
            _id: bucketName,
            value: newBucketMD,
        }, {
            upsert: true,
        }, err => {
            if (err) {
                log.error(
                    'putBucketAttributes: error putting bucket attributes',
                { error: err.message });
                return cb(errors.InternalError);
            }
            return cb();
        });
    }

    /*
     * Delete bucket from metastore
     */
    deleteBucketStep2(bucketName, log, cb) {
        const m = this.getCollection(METASTORE);
        m.findOneAndDelete({
            _id: bucketName,
        }, {}, (err, result) => {
            if (err) {
                log.error('deleteBucketStep2: error deleting bucket',
                { error: err.message });
                return cb(errors.InternalError);
            }
            if (result.ok !== 1) {
                log.error('deleteBucketStep2: failed deleting bucket',
                { error: err.message });
                return cb(errors.InternalError);
            }
            return cb(null);
        });
    }

    /*
     * Drop the bucket then process to step 2. Checking
     * the count is already done by the upper layer. We don't need to be
     * atomic because the call is protected by a delete_pending flag
     * in the upper layer.
     * 2 cases here:
     * 1) the collection may not yet exist (or being already dropped
     * by a previous call)
     * 2) the collection may exist.
     */
    deleteBucket(bucketName, log, cb) {
        const c = this.getCollection(bucketName);
        c.drop({}, err => {
            if (err) {
                if (err.codeName === 'NamespaceNotFound') {
                    return this.deleteBucketStep2(bucketName, log, cb);
                }
                log.error('deleteBucket: error deleting bucket',
                { error: err.message });
                return cb(errors.InternalError);
            }
            return this.deleteBucketStep2(bucketName, log, err => {
                if (err) {
                    return cb(err);
                }
                this.lastItemScanTime = null;
                return cb(null);
            });
        });
    }

    /*
     * In this case we generate a versionId and
     * sequentially create the object THEN update the master.
     *
     * It is possible that 2 version creations are inverted
     * in flight so we also check that we update a master only
     * if the version in place is greater that the one we set.
     *
     * We also test the existence of the versionId property
     * to manage the case of an object created before the
     * versioning was enabled.
     */
    putObjectVerCase1(c, bucketName, objName, objVal, params, log, cb) {
        const versionId = generateVersionId(this.replicationGroupId);
        // eslint-disable-next-line
        objVal.versionId = versionId;
        const vObjName = formatVersionKey(objName, versionId);
        c.bulkWrite([{
            updateOne: {
                filter: {
                    _id: vObjName,
                },
                update: {
                    _id: vObjName, value: objVal,
                },
                upsert: true,
            },
        }, {
            updateOne: {
                // eslint-disable-next-line
                filter: {
                    _id: objName,
                    $or: [{
                        'value.versionId': {
                            $exists: false,
                        },
                    },
                    {
                        'value.versionId': {
                            $gt: objVal.versionId,
                        },
                    },
                         ],
                },
                update: {
                    _id: objName, value: objVal,
                },
                upsert: true,
            },
        }], {
            ordered: 1,
        }, err => {
            /*
             * Related to https://jira.mongodb.org/browse/SERVER-14322
             * It happens when we are pushing two versions "at the same time"
             * and the master one does not exist. In MongoDB, two threads are
             * trying to create the same key, the master version, and one of
             * them, the one with the highest versionID (less recent one),
             * fails.
             * We check here than than the MongoDB error is related to the
             * second operation, the master version update and than the error
             * code is the one related to mentionned issue.
             */
            if (err) {
                if (!err.index || err.index !== 1
                 || !err.code || err.code !== 11000) {
                    log.error(
                        'putObjectVerCase1: error putting object version',
                    { error: err.errmsg });
                    return cb(errors.InternalError);
                }
                log.debug('putObjectVerCase1: error putting object version',
                    { code: err.code, error: err.errmsg });
            }
            return cb(null, `{"versionId": "${versionId}"}`);
        });
    }

    /*
     * Case used when versioning has been disabled after objects
     * have been created with versions
     */
    putObjectVerCase2(c, bucketName, objName, objVal, params, log, cb) {
        const versionId = generateVersionId(this.replicationGroupId);
        // eslint-disable-next-line
        objVal.versionId = versionId;
        c.update({
            _id: objName,
        }, {
            _id: objName,
            value: objVal,
        }, {
            upsert: true,
        }, err => {
            if (err) {
                log.error(
                    'putObjectVerCase2: error putting object version',
                { error: err.message });
                return cb(errors.InternalError);
            }
            return cb(null, `{"versionId": "${objVal.versionId}"}`);
        });
    }

    /*
     * In this case the caller provides a versionId. This function will
     * check if the object exists then sequentially update the object
     * (or create if doesn't exist) with given versionId THEN the master
     * if the provided versionId matches the one of the master. There
     * is a potential race condition where if two putObjectVerCase3 are
     * occurring at the same time and the master version doesn't exist,
     * then one will upsert and update the master and one will fail with
     * the KeyAlreadyExists error.
     */
    putObjectVerCase3(c, bucketName, objName, objVal, params, log, cb) {
        // eslint-disable-next-line
        objVal.versionId = params.versionId;
        const vObjName = formatVersionKey(objName, params.versionId);
        c.findOne({ _id: objName }, (err, checkObj) => {
            if (err) {
                log.error('putObjectVerCase3: mongoDB error finding object');
                return cb(errors.InternalError);
            }
            const objUpsert = !checkObj;
            c.bulkWrite([{
                updateOne: {
                    filter: {
                        _id: vObjName,
                    },
                    update: {
                        $set: {
                            _id: vObjName,
                            value: objVal,
                        },
                    },
                    upsert: true,
                },
            }, {
                updateOne: {
                    // eslint-disable-next-line
                    filter: {
                        _id: objName,
                        'value.versionId': params.versionId,
                    },
                    update: {
                        $set: {
                            _id: objName,
                            value: objVal,
                        },
                    },
                    upsert: objUpsert,
                },
            }], {
                ordered: 1,
            }, err => {
                if (err) {
                    log.error(
                        'putObjectVerCase3: error putting object version',
                    { error: err.message });
                    if (err.code === 11000) {
                        // We want duplicate key error logged however in
                        // case of the race condition mentioned above, the
                        // InternalError will allow for automatic retries
                        log.error(
                            'putObjectVerCase3:', errors.KeyAlreadyExists);
                        return cb(errors.InternalError);
                    }
                    return cb(errors.NoSuchVersion);
                }
                return cb(null, `{"versionId": "${objVal.versionId}"}`);
            });
            return null;
        });
    }

    /*
     * In this case the caller provides a versionId. This function will
     * save the versionId object as is and will set PHD on master. We rely
     * on the natural ordering of versions.
     * This is specifically used by backbeat Ingestion process.
     */
    putObjectVerCase4(c, bucketName, objName, objVal, params, log, cb) {
        // eslint-disable-next-line
        objVal.versionId = params.versionId;
        const vObjName = formatVersionKey(objName, params.versionId);
        const mst = generatePHDVersion(params.versionId);
        return c.bulkWrite([{
            updateOne: {
                filter: {
                    _id: vObjName,
                },
                update: {
                    $set: {
                        _id: vObjName,
                        value: objVal,
                    },
                },
                upsert: true,
            },
        }, {
            updateOne: {
                filter: {
                    _id: objName,
                },
                update: {
                    _id: objName, value: mst,
                },
                upsert: true,
            },
        }], {
            ordered: 1,
        }, err => {
            if (err) {
                log.error('putObjectVerCase4: error putting object version', {
                    error: err.message,
                });
                return cb(errors.InternalError);
            }
            return cb(null, `{"versionId": "${objVal.versionId}"}`);
        });
    }

    /*
     * Put object when versioning is not enabled
     */
    putObjectNoVer(c, bucketName, objName, objVal, params, log, cb) {
        c.update({
            _id: objName,
        }, {
            _id: objName,
            value: objVal,
        }, {
            upsert: true,
        }, err => {
            if (err) {
                log.error(
                    'putObjectNoVer: error putting obect with no versioning',
                    { error: err.message });
                return cb(errors.InternalError);
            }
            return cb();
        });
    }

    putObject(bucketName, objName, objVal, params, log, cb) {
        MongoUtils.serialize(objVal);
        const c = this.getCollection(bucketName);
        if (params && params.versioning && !params.versionId) {
            return this.putObjectVerCase1(c, bucketName, objName, objVal,
                                          params, log, cb);
        } else if (params && params.versionId === '') {
            return this.putObjectVerCase2(c, bucketName, objName, objVal,
                                          params, log, cb);
        } else if (params && params.versionId && !params.usePHD) {
            return this.putObjectVerCase3(c, bucketName, objName, objVal,
                                          params, log, cb);
        } else if (params && params.versionId && params.usePHD) {
            return this.putObjectVerCase4(c, bucketName, objName, objVal,
                                          params, log, cb);
        }
        return this.putObjectNoVer(c, bucketName, objName, objVal,
            params, log, cb);
    }

    getObject(bucketName, objName, params, log, cb) {
        const c = this.getCollection(bucketName);
        if (params && params.versionId) {
            // eslint-disable-next-line
            objName = formatVersionKey(objName, params.versionId);
        }
        c.findOne({
            _id: objName,
        }, {}, (err, doc) => {
            if (err) {
                log.error('findOne: error getting object',
                { error: err.message });
                return cb(errors.InternalError);
            }
            if (!doc) {
                return cb(errors.NoSuchKey);
            }
            if (doc.value.isPHD) {
                this.getLatestVersion(c, objName, log, (err, value) => {
                    if (err) {
                        log.error('getLatestVersion: getting latest version',
                        { error: err.message });
                        return cb(err);
                    }
                    return cb(null, value);
                });
                return undefined;
            }
            MongoUtils.unserialize(doc.value);
            return cb(null, doc.value);
        });
    }

    /*
     * This function return the latest version
     */
    getLatestVersion(c, objName, log, cb) {
        c.find({
            _id: {
                $gt: objName,
                $lt: `${objName}${VID_SEPPLUS}`,
            },
        }, {}).
            sort({
                _id: 1,
            }).
            limit(1).
            toArray(
                (err, keys) => {
                    if (err) {
                        log.error(
                            'getLatestVersion: error getting latest version',
                            { error: err.message });
                        return cb(errors.InternalError);
                    }
                    if (keys.length === 0) {
                        return cb(errors.NoSuchKey);
                    }
                    MongoUtils.unserialize(keys[0].value);
                    return cb(null, keys[0].value);
                });
    }

    /*
     * repair the master with a new value. There can be
     * race-conditions or legit updates so place an atomic condition
     * on PHD flag and mst version.
     */
    repair(c, bucketName, objName, objVal, mst, log, cb) {
        MongoUtils.serialize(objVal);
        // eslint-disable-next-line
        c.findOneAndReplace({
            _id: objName,
            'value.isPHD': true,
            'value.versionId': mst.versionId,
        }, {
            _id: objName,
            value: objVal,
        }, {
            upsert: true,
        }, (err, result) => {
            if (err) {
                log.error('repair: error trying to repair value',
                { error: err.message });
                return cb(errors.InternalError);
            }
            if (result.ok !== 1) {
                log.error('repair: failed trying to repair value',
                { error: err.message });
                return cb(errors.InternalError);
            }
            return cb(null);
        });
    }

    /*
     * Get the latest version and repair. The process is safe because
     * we never replace a non-PHD master
     */
    asyncRepair(c, bucketName, objName, mst, log) {
        this.getLatestVersion(c, objName, log, (err, value) => {
            if (err) {
                log.error('async-repair: getting latest version',
                { error: err.message });
                return undefined;
            }
            this.repair(c, bucketName, objName, value, mst, log, err => {
                if (err) {
                    log.error('async-repair failed', { error: err.message });
                    return undefined;
                }
                log.debug('async-repair success');
                return undefined;
            });
            return undefined;
        });
    }

    /*
     * the master is a PHD so we try to see if it is the latest of its
     * kind to get rid of it, otherwise we asynchronously repair it
     */
    deleteOrRepairPHD(c, bucketName, objName, mst, log, cb) {
        // Check if there are other versions available
        this.getLatestVersion(c, objName, log, err => {
            if (err) {
                if (err === errors.NoSuchKey) {
                    // We try to delete the master. A race condition
                    // is possible here: another process may recreate
                    // a master or re-delete it in between so place an
                    // atomic condition on the PHD flag and the mst
                    // version:
                    // eslint-disable-next-line
                    c.findOneAndDelete({
                        _id: objName,
                        'value.isPHD': true,
                        'value.versionId': mst.versionId,
                    }, {}, err => {
                        if (err) {
                            log.error(
                                'findOneAndDelete: error finding and deleting',
                                { error: err.message });
                            return cb(errors.InternalError);
                        }
                        // do not test result.ok === 1 because
                        // both cases are expected
                        return cb(null);
                    });
                    return undefined;
                }
                log.error('getLatestVersion: error getting latest version',
                { error: err.message });
                return cb(err);
            }
            // We have other versions available so repair:
            setTimeout(() => {
                this.asyncRepair(c, bucketName, objName, mst, log);
            }, ASYNC_REPAIR_TIMEOUT);
            return cb(null);
        });
    }

    /*
     * Delete object when versioning is enabled and the version is
     * master. In this case we sequentially update the master with a
     * PHD flag (placeholder) and a unique non-existing version THEN
     * we delete the specified versioned object. THEN we try to delete
     * or repair the PHD we just created
     */
    deleteObjectVerMaster(c, bucketName, objName, params, log, cb) {
        const vObjName = formatVersionKey(objName, params.versionId);
        const _vid = generateVersionId(this.replicationGroupId);
        const mst = generatePHDVersion(_vid);
        c.bulkWrite([{
            updateOne: {
                filter: {
                    _id: objName,
                },
                update: {
                    _id: objName, value: mst,
                },
                upsert: true,
            },
        }, {
            deleteOne: {
                filter: {
                    _id: vObjName,
                },
            },
        }], {
            ordered: 1,
        }, err => {
            if (err) {
                log.error(
                    'deleteObjectVerMaster: error deleting object',
                { error: err.message });
                return cb(errors.InternalError);
            }
            return this.deleteOrRepairPHD(c, bucketName, objName, mst, log, cb);
        });
    }

    /*
     * Delete object when versioning is enabled and the version is
     * not master. It is a straight-forward atomic delete
     */
    deleteObjectVerNotMaster(c, bucketName, objName, params, log, cb) {
        const vObjName = formatVersionKey(objName, params.versionId);
        c.findOneAndDelete({
            _id: vObjName,
        }, {}, (err, result) => {
            if (err) {
                log.error(
                    'findOneAndDelete: error when version is not master',
                    { error: err.message });
                return cb(errors.InternalError);
            }
            if (result.ok !== 1) {
                log.error(
                    'findOneAndDelete: failed when version is not master',
                    { error: err.message });
                return cb(errors.InternalError);
            }
            return cb(null);
        });
    }

    /*
     * Delete object when versioning is enabled. We first find the
     * master, if it is already a PHD we have a special processing,
     * then we check if it matches the master versionId in such case
     * we will create a PHD, otherwise we delete it
     */
    deleteObjectVer(c, bucketName, objName, params, log, cb) {
        c.findOne({
            _id: objName,
        }, {}, (err, mst) => {
            if (err) {
                log.error('deleteObjectVer: error deleting versioned object',
                { error: err.message });
                return cb(errors.InternalError);
            }
            if (!mst) {
                return cb(errors.NoSuchKey);
            }
            if (mst.value.isPHD ||
                mst.value.versionId === params.versionId) {
                return this.deleteObjectVerMaster(c, bucketName, objName,
                params, log, err => {
                    if (err) {
                        return cb(err);
                    }
                    return cb();
                });
            }
            return this.deleteObjectVerNotMaster(c, bucketName, objName,
            params, log, cb);
        });
    }

    /*
     * Atomically delete an object when versioning is not enabled
     */
    deleteObjectNoVer(c, bucketName, objName, params, log, cb) {
        c.findOneAndDelete({
            _id: objName,
        }, {}, (err, result) => {
            if (err) {
                log.error(
                    'deleteObjectNoVer: error deleting object with no version',
                    { error: err.message });
                return cb(errors.InternalError);
            }
            if (result.ok !== 1) {
                log.error(
                    'deleteObjectNoVer: failed deleting object with no version',
                    { error: err.message });
                return cb(errors.InternalError);
            }
            return cb(null);
        });
    }

    deleteObject(bucketName, objName, params, log, cb) {
        const c = this.getCollection(bucketName);
        if (params && params.versionId) {
            return this.deleteObjectVer(c, bucketName, objName,
                                        params, log, cb);
        }
        return this.deleteObjectNoVer(c, bucketName, objName,
                                      params, log, cb);
    }

    internalListObject(bucketName, params, extension, log, cb) {
        const c = this.getCollection(bucketName);
        const stream = new MongoReadStream(c, params, params.mongifiedSearch);
        const skip = new Skip({
            extension,
            gte: params.gte,
        });
        let cbDone = false;

        skip.setListingEndCb(() => {
            stream.emit('end');
            stream.destroy();
        });
        skip.setSkipRangeCb(range => {
            // stop listing this key range
            stream.destroy();

            // update the new listing parameters here
            const newParams = params;
            newParams.start = undefined; // 'start' is deprecated
            newParams.gt = undefined;
            newParams.gte = range;

            // then continue listing the next key range
            this.internalListObject(bucketName, newParams, extension, log, cb);
        });

        stream
            .on('data', e => {
                skip.filter(e);
            })
            .on('error', err => {
                if (!cbDone) {
                    cbDone = true;
                    const logObj = {
                        rawError: err,
                        error: err.message,
                        errorStack: err.stack,
                    };
                    log.error(
                        'internalListObject: error listing objects', logObj);
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
    }

    listObject(bucketName, params, log, cb) {
        const extName = params.listingType;
        const extension = new listAlgos[extName](params, log);
        const internalParams = extension.genMDParams();
        internalParams.mongifiedSearch = params.mongifiedSearch;
        return this.internalListObject(bucketName, internalParams, extension,
                                       log, cb);
    }

    listMultipartUploads(bucketName, params, log, cb) {
        const extName = params.listingType;
        const extension = new listAlgos[extName](params, log);
        const internalParams = extension.genMDParams();
        internalParams.mongifiedSearch = params.mongifiedSearch;
        return this.internalListObject(bucketName, internalParams, extension,
                                       log, cb);
    }

    checkHealth(implName, log, cb) {
        if (this.client.isConnected()) {
            return cb();
        }
        log.error('disconnected from mongodb');
        return cb(errors.InternalError, []);
    }

    readUUID(log, cb) {
        const i = this.getCollection(INFOSTORE);
        i.findOne({
            _id: __UUID,
        }, {}, (err, doc) => {
            if (err) {
                log.error('readUUID: error reading UUID',
                { error: err.message });
                return cb(errors.InternalError);
            }
            if (!doc) {
                return cb(errors.NoSuchKey);
            }
            return cb(null, doc.value);
        });
    }

    writeToInfostoreIfNotExists(id, value, log, cb) {
        const i = this.getCollection(INFOSTORE);
        i.insert({
            _id: id,
            value,
        }, {}, err => {
            if (err) {
                if (err.code === 11000) {
                    // duplicate key error
                    return cb(errors.KeyAlreadyExists);
                }
                log.error(`writeToInfostoreIfNotExists: error writing to ${id}`,
                { error: err.message });
                return cb(errors.InternalError);
            }
            // FIXME: shoud we check for result.ok === 1 ?
            return cb(null);
        });
    }

    /*
     * we always try to generate a new UUID in order to be atomic in
     * case of concurrency. The write will fail if it already exists.
     */
    getUUID(log, cb) {
        const uuid = initialInstanceID || Uuid.v4();
        this.writeToInfostoreIfNotExists(__UUID, uuid, log, err => {
            if (err) {
                if (err === errors.InternalError) {
                    log.error('getUUID: error getting UUID',
                    { error: err.message });
                    return cb(err);
                }
                return this.readUUID(log, cb);
            }
            return cb(null, uuid);
        });
    }

    readReplicationGroupID(log, cb) {
        const i = this.getCollection(INFOSTORE);
        i.findOne({
            _id: __REP_GROUP_ID,
        }, {}, (err, doc) => {
            if (err) {
                log.error('readReplicationGroupID: error reading ' +
                    'replication group id', {
                        error: err.message,
                    });
                return cb(errors.InternalError);
            }
            if (!doc) {
                return cb(errors.NoSuchKey);
            }
            return cb(null, doc.value);
        });
    }

    getReplicationGroupID(log, cb) {
        // random 7 characters
        const repGroupId = crypto.randomBytes(4).toString('hex').slice(1);
        this.writeToInfostoreIfNotExists(__REP_GROUP_ID, repGroupId, log,
        err => {
            if (err) {
                if (err === errors.InternalError) {
                    log.error('getReplicationGroupID: error getting ' +
                        'replication group id', {
                            error: err.message,
                        });
                    return cb(err);
                }
                return this.readReplicationGroupID(log, cb);
            }
            // need to save to instance
            this.replicationGroupId = repGroupId;
            return cb(null, repGroupId);
        });
    }

    getDiskUsage(cb) {
        // FIXME: for basic one server deployment the infrastructure
        // configurator shall set a path to the actual MongoDB volume.
        // For Kub/cluster deployments there should be a more sophisticated
        // way for guessing free space.
        diskusage.check(this.path !== undefined ?
                        this.path : '/', cb);
    }

    countItems(log, cb) {
        const doFullScan = this.lastItemScanTime === null ||
            (Date.now() - this.lastItemScanTime) > itemScanRefreshDelay;

        const res = {
            objects: 0,
            versions: 0,
            buckets: 0,
            bucketList: [],
            dataManaged: {
                total: { curr: 0, prev: 0 },
                byLocation: {},
            },
            stalled: 0,
        };

        const consolidateData = dataManaged => {
            if (dataManaged && dataManaged.locations && dataManaged.total) {
                const locations = dataManaged.locations;
                res.dataManaged.total.curr += dataManaged.total.curr;
                res.dataManaged.total.prev += dataManaged.total.prev;
                Object.keys(locations).forEach(site => {
                    if (!res.dataManaged.byLocation[site]) {
                        res.dataManaged.byLocation[site] =
                            Object.assign({}, locations[site]);
                    } else {
                        res.dataManaged.byLocation[site].curr +=
                            locations[site].curr;
                        res.dataManaged.byLocation[site].prev +=
                            locations[site].prev;
                    }
                });
            }
        };

        this.db.listCollections().toArray((err, collInfos) => {
            async.eachLimit(collInfos, 10, (value, next) => {
                if (value.name === METASTORE ||
                    value.name === INFOSTORE ||
                    value.name === USERSBUCKET ||
                    value.name === PENSIEVE ||
                    value.name.startsWith(constants.mpuBucketPrefix)
                ) {
                    // skip
                    return next();
                }
                res.buckets++;
                const bucketName = value.name;
                // FIXME: there is currently no way of distinguishing
                // master from versions and searching for VID_SEP
                // does not work because there cannot be null bytes
                // in $regex

                return async.waterfall([
                    next => this.getBucketAttributes(
                    bucketName, log, (err, bucketInfo) => {
                        if (err) {
                            log.error('error occured in countItems', {
                                method: 'countItems',
                                error: err,
                            });
                            return next(errors.InternalError);
                        }
                        const retBucketInfo = {
                            name: bucketName,
                            location: bucketInfo.getLocationConstraint(),
                            isVersioned:
                                !!bucketInfo.getVersioningConfiguration(),
                            ownerCanonicalId: bucketInfo.getOwner(),
                            ingestion: bucketInfo.isIngestionBucket(),
                        };
                        res.bucketList.push(retBucketInfo);
                        return next(null, bucketInfo);
                    }),
                    (bucketInfo, next) => {
                        if (!doFullScan) {
                            return next(null, {});
                        }
                        return this.getObjectMDStats(
                        bucketName, bucketInfo, log, next);
                    },
                ], (err, results) => {
                    if (err) {
                        return next(errors.InternalError);
                    }
                    if (results.dataManaged) {
                        res.objects += results.objects;
                        res.versions += results.versions;
                        res.stalled += results.stalled;
                        consolidateData(results.dataManaged);
                    }
                    return next();
                });
            }, err => {
                if (err) {
                    return cb(err);
                }

                if (!doFullScan) {
                    const cachedRes = this.dataCount.results();
                    cachedRes.bucketList = res.bucketList;
                    cachedRes.buckets = res.buckets;
                    return cb(null, cachedRes);
                }

                this.lastItemScanTime = Date.now();
                this.dataCount.set(res);
                return cb(null, res);
            });
        });
        return undefined;
    }

    _getLocName(loc) {
        return loc === 'mem' || loc === 'file' ? 'us-east-1' : loc;
    }

    _handleResults(res, isVersioned) {
        const total = { curr: 0, prev: 0 };
        const locations = {};

        Object.keys(res.nullData).forEach(loc => {
            const bytes = res.nullData[loc];
            const locName = this._getLocName(loc);
            if (!locations[locName]) {
                locations[locName] = { curr: 0, prev: 0 };
            }
            total.curr += bytes;
            locations[locName].curr += bytes;
        });
        if (isVersioned) {
            Object.keys(res.versionData).forEach(loc => {
                const bytes = res.versionData[loc];
                const locName = this._getLocName(loc);
                if (!locations[locName]) {
                    locations[locName] = { curr: 0, prev: 0 };
                }
                total.prev += bytes;
                locations[locName].prev += bytes;
            });
        }
        Object.keys(res.masterData).forEach(loc => {
            const bytes = res.masterData[loc];
            const locName = this._getLocName(loc);
            if (!locations[locName]) {
                locations[locName] = { curr: 0, prev: 0 };
            }
            total.curr += bytes;
            locations[locName].curr += bytes;
            if (isVersioned) {
                total.prev -= bytes;
                total.prev = Math.max(0, total.prev);
                locations[locName].prev -= bytes;
                locations[locName].prev =
                    Math.max(0, locations[locName].prev);
            }
        });
        let versionCount = isVersioned ?
            res.versionCount - res.masterCount : 0;
        versionCount = Math.max(0, versionCount);
        return {
            versions: versionCount,
            objects: res.masterCount + res.nullCount,
            dataManaged: {
                total,
                locations,
            },
        };
    }

    _handleCount(entry) {
        return entry && entry.count > 0 ? entry.count : 0;
    }

    _handleEntries(entries) {
        const results = {};
        if (entries) {
            entries.forEach(entry => {
                results[entry._id] = entry.bytes;
            });
        }
        return results;
    }

    _handleMongo(c, filter, isTransient, log, cb) {
        const reducedFields = {
            '_id': 1,
            'value.versionId': 1,
            'value.replicationInfo.status': 1,
            'value.replicationInfo.backends': 1,
            'value.content-length': 1,
            'value.dataStoreName': 1,
        };

        const aggCount = [
            { $project: { _id: 1 } },
            { $group: { _id: null, count: { $sum: 1 } } },
        ];

        const aggData = [
            { $project: {
                'value.dataStoreName': 1,
                'value.content-length': 1,
            } },
            { $group: {
                _id: '$value.dataStoreName',
                bytes: { $sum: '$value.content-length' },
            } },
        ];

        const aggRepData = [
            { $project: {
                'value.replicationInfo.backends': 1,
                'value.content-length': 1,
            } },
            { $unwind: '$value.replicationInfo.backends' },
            { $match: {
                'value.replicationInfo.backends.status': { $eq: 'COMPLETED' },
            } },
            { $group: {
                _id: '$value.replicationInfo.backends.site',
                bytes: { $sum: '$value.content-length' },
            } },
        ];

        const aggCompleted = [
            { $project: {
                'value.dataStoreName': 1,
                'value.content-length': 1,
                'inComplete': {
                    $eq: ['$value.replicationInfo.status', 'COMPLETED'],
                },
            } },
            { $match: { inComplete: true } },
            { $group: {
                _id: '$value.dataStoreName',
                bytes: { $sum: '$value.content-length' },
            } },
        ];

        return c.aggregate([
            { $project: reducedFields },
            { $match: filter },
            { $facet: {
                count: aggCount,
                data: aggData,
                repData: aggRepData,
                compData: aggCompleted,
            } },
        ]).toArray((err, res) => {
            if (err) {
                log.error('Error when processing mongo entries', {
                    method: '_handleMongo',
                    error: err,
                });
                return cb(err);
            }
            if (!res || res.length < 1) {
                log.debug('aggregate returned empty results', {
                    method: '_handleMongo',
                });
                return cb(null, {});
            }
            const agg = res[0];
            if (!agg || !agg.count || !agg.data || !agg.repData) {
                log.debug('missing field in aggregate results', {
                    method: '_handleMongo',
                });
                return cb(null, {});
            }
            const retResult = {
                count: this._handleCount(agg.count[0] || {}),
                data: this._handleEntries(agg.data),
            };
            const repDataEntries = this._handleEntries(agg.repData);
            Object.keys(repDataEntries).forEach(site => {
                if (!retResult.data[site]) {
                    retResult.data[site] = 0;
                }
                retResult.data[site] += repDataEntries[site];
            });
            if (isTransient && agg.compData) {
                const compDataEntries = this._handleEntries(agg.compData);
                Object.keys(compDataEntries).forEach(site => {
                    if (retResult.data[site]) {
                        retResult.data[site] -= compDataEntries[site];
                        retResult.data[site] =
                            Math.max(0, retResult.data[site]);
                    }
                });
            }
            return cb(null, retResult);
        });
    }

    _getStalled(c, cmpDate, log, cb) {
        const reducedFields = {
            '_id': {
                id: '$_id',
                status: '$value.replicationInfo.status',
            },
            'value.last-modified': 1,
        };
        return c.aggregate([
            { $project: reducedFields },
            { $match: {
                '_id.id': { $regex: /\0/ },
                '_id.status': { $eq: 'PENDING' },
            } },
        ]).toArray((err, res) => {
            if (err) {
                log.debug('Unable to retrieve stalled entries', {
                    error: err,
                });
                return cb(null);
            }
            const count = res.filter(data => {
                if (!data || typeof data !== 'object' ||
                    !data.value || typeof data.value !== 'object') {
                    return false;
                }
                const time = data.value['last-modified'] || null;
                if (isNaN(Date.parse(time))) {
                    return false;
                }
                const testDate = new Date(time);
                return testDate <= cmpDate;
            }).length;
            return cb(null, count);
        });
    }

    getObjectMDStats(bucketName, bucketInfo, log, callback) {
        const c = this.getCollection(bucketName);
        let isTransient;
        if (this.config) {
            isTransient = this.config
                .getLocationConstraint(bucketInfo.getLocationConstraint())
                .isTransient;
        }
        const mstFilter = {
            '_id': { $regex: /^[^\0]+$/ },
            'value.versionId': { $exists: true },
        };
        const verFilter = { _id: { $regex: /\0/ } };
        const nullFilter = {
            '_id': { $regex: /^[^\0]+$/ },
            'value.versionId': { $exists: false },
        };

        const cmpDate = new Date();
        cmpDate.setHours(cmpDate.getHours() - 1);

        async.parallel({
            version: done =>
                this._handleMongo(c, verFilter, isTransient, log, done),
            null: done =>
                this._handleMongo(c, nullFilter, isTransient, log, done),
            master: done =>
                this._handleMongo(c, mstFilter, isTransient, log, done),
            stalled: done =>
                this._getStalled(c, cmpDate, log, done),
        }, (err, res) => {
            if (err) {
                return callback(err);
            }
            const resObj = {
                masterCount: res.master.count || 0,
                masterData: res.master.data || {},
                nullCount: res.null.count || 0,
                nullData: res.null.data || {},
                versionCount: res.version.count || 0,
                versionData: res.version.data || {},
            };
            const bucketStatus = bucketInfo.getVersioningConfiguration();
            const isVer = (bucketStatus && (bucketStatus.Status === 'Enabled' ||
                bucketStatus.Status === 'Suspended'));
            const retResult = this._handleResults(resObj, isVer);
            retResult.stalled = res.stalled || 0;
            return callback(null, retResult);
        });
    }

    getIngestionBuckets(log, cb) {
        const m = this.getCollection(METASTORE);
        m.find({
            '_id': {
                $nin: [PENSIEVE, USERSBUCKET],
            },
            'value.ingestion': {
                $type: 'object',
            },
        }).project({
            'value.name': 1,
            'value.ingestion': 1,
            'value.locationConstraint': 1,
        }).toArray((err, doc) => {
            if (err) {
                log.error('error getting ingestion buckets', {
                    error: err.message,
                    method: 'MongoClientInterface.getIngestionBuckets',
                });
                return cb(errors.InternalError);
            }
            return cb(null, doc.map(i => i.value));
        });
    }
}

module.exports = MongoClientInterface;
