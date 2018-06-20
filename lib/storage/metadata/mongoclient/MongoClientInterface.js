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

const USERSBUCKET = '__usersbucket';
const METASTORE = '__metastore';
const INFOSTORE = '__infostore';
const __UUID = 'uuid';
const PENSIEVE = 'PENSIEVE';
const ASYNC_REPAIR_TIMEOUT = 15000;
const itemScanRefreshDelay = 1000 * 30 * 60; // 30 minutes

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
            database, logger, replicationGroupId } = params;
        this.mongoUrl = `mongodb://${replicaSetHosts}/?w=${writeConcern}&` +
            `replicaSet=${replicaSet}&readPreference=${readPreference}`;
        this.logger = logger;
        this.client = null;
        this.db = null;
        this.path = path;
        this.replicationGroupId = replicationGroupId;
        this.database = database;
        this.lastItemScanTime = null;
        this.lastItemScanResult = null;
    }

    setup(cb) {
        // FIXME: constructors shall not have side effect so there
        // should be an async_init(cb) method in the wrapper to
        // initialize this backend
        return MongoClient.connect(this.mongoUrl, (err, client) => {
            if (err) {
                this.logger.error('error connecting to mongodb',
                    { error: err.message });
                throw (errors.InternalError);
            }
            this.logger.info('connected to mongodb');
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
     * sequentially create the object THEN update the master
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
                filter: {
                    _id: objName,
                },
                update: {
                    _id: objName, value: objVal,
                },
                upsert: true,
            },
        }], {
            ordered: 1,
        }, err => {
            if (err) {
                log.error(
                    'putObjectVerCase1: error putting object version',
                { error: err.message });
                return cb(errors.InternalError);
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
        } else if (params && params.versionId) {
            return this.putObjectVerCase3(c, bucketName, objName, objVal,
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
    repair(c, objName, objVal, mst, log, cb) {
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
    asyncRepair(c, objName, mst, log) {
        this.getLatestVersion(c, objName, log, (err, value) => {
            if (err) {
                log.error('async-repair: getting latest version',
                { error: err.message });
                return undefined;
            }
            this.repair(c, objName, value, mst, log, err => {
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
                this.asyncRepair(c, objName, mst, log);
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
                                                  params, log, cb);
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

    internalListObject(bucketName, params, log, cb) {
        const extName = params.listingType;
        const extension = new listAlgos[extName](params, log);
        const requestParams = extension.genMDParams();
        const c = this.getCollection(bucketName);
        let cbDone = false;
        const stream = new MongoReadStream(c, requestParams,
                                           params.mongifiedSearch);
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
        return this.internalListObject(bucketName, params, log, cb);
    }

    listMultipartUploads(bucketName, params, log, cb) {
        return this.internalListObject(bucketName, params, log, cb);
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

    writeUUIDIfNotExists(uuid, log, cb) {
        const i = this.getCollection(INFOSTORE);
        i.insert({
            _id: __UUID,
            value: uuid,
        }, {}, err => {
            if (err) {
                if (err.code === 11000) {
                    // duplicate key error
                    return cb(errors.KeyAlreadyExists);
                }
                log.error('writeUUIDIfNotExists: error writing UUID',
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
        this.writeUUIDIfNotExists(uuid, log, err => {
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

    getDiskUsage(cb) {
        // FIXME: for basic one server deployment the infrastructure
        // configurator shall set a path to the actual MongoDB volume.
        // For Kub/cluster deployments there should be a more sophisticated
        // way for guessing free space.
        diskusage.check(this.path !== undefined ?
                        this.path : '/', cb);
    }

    countItems(log, cb) {
        if (this.lastItemScanTime !== null &&
            (Date.now() - this.lastItemScanTime) <= itemScanRefreshDelay) {
            return process.nextTick(cb, null, this.lastItemScanResult);
        }

        const res = {
            objects: 0,
            versions: 0,
            buckets: 0,
            bucketList: [],
            dataManaged: {
                total: { curr: 0, prev: 0 },
                byLocation: {},
            },
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
                        return next(null, bucketInfo);
                    }),
                    (bucketInfo, next) => this.getObjectMDStats(
                        bucketName, bucketInfo, log, next),
                ], (err, results) => {
                    if (err) {
                        return next(errors.InternalError);
                    }
                    if (results.bucketList && results.dataManaged) {
                        res.bucketList.push(results.bucketList);
                        res.objects += results.objects;
                        res.versions += results.versions;
                        consolidateData(results.dataManaged);
                    }
                    return next();
                });
            }, err => {
                if (err) {
                    return cb(err);
                }
                this.lastItemScanTime = Date.now();
                this.lastItemScanResult = res;
                return cb(null, res);
            });
        });
        return undefined;
    }

    _handleResults(res, isVersioned) {
        const total = { curr: 0, prev: 0 };
        const locations = {};

        Object.keys(res.nullData).forEach(loc => {
            const bytes = res.nullData[loc];
            const locName = loc === 'mem' || loc === 'file' ?
                'us-east-1' : loc;
            if (!locations[locName]) {
                locations[locName] = { curr: 0, prev: 0 };
            }
            total.curr += bytes;
            locations[locName].curr += bytes;
        });
        if (isVersioned) {
            Object.keys(res.versionData).forEach(loc => {
                const bytes = res.versionData[loc];
                const locName = loc === 'mem' || loc === 'file' ?
                    'us-east-1' : loc;
                if (!locations[locName]) {
                    locations[locName] = { curr: 0, prev: 0 };
                }
                total.prev += bytes;
                locations[locName].prev += bytes;
            });
        }
        Object.keys(res.masterData).forEach(loc => {
            const bytes = res.masterData[loc];
            const locName = loc === 'mem' || loc === 'file' ?
                'us-east-1' : loc;
            if (!locations[locName]) {
                locations[locName] = { curr: 0, prev: 0 };
            }
            total.curr += bytes;
            locations[locName].curr += bytes;
            if (isVersioned) {
                total.prev -= bytes;
                locations[locName].prev -= bytes;
            }
        });
        return {
            versions: isVersioned ?
                res.versionCount - res.masterCount : 0,
            objects: res.masterCount + res.nullCount,
            dataManaged: {
                total,
                locations,
            },
        };
    }

    getObjectMDStats(bucketName, bucketInfo, log, callback) {
        const c = this.getCollection(bucketName);
        const retBucketInfo = {
            name: bucketName,
            location: bucketInfo.getLocationConstraint(),
        };

        const mstFilter = {
            '_id': { $regex: /^[^\0]+$/ },
            'value.versionId': { $exists: true },
        };
        const verFilter = { _id: { $regex: /\0/ } };
        const nullFilter = {
            '_id': { $regex: /^[^\0]+$/ },
            'value.versionId': { $exists: false },
        };

        const _handleCount = (err, entry, cb) => {
            if (err) {
                return cb(err);
            }
            return cb(null, entry && entry.count > 0 ? entry.count : 0);
        };
        const _handleEntries = (err, entries, cb) => {
            if (err) {
                return cb(err);
            }
            const results = {};
            if (entries) {
                entries.forEach(entry => {
                    results[entry._id] = entry.bytes;
                });
            }
            return cb(null, results);
        };

        const _handleMongo = (cursor, cb) => async.parallel({
            count: done => {
                const tmpCursor = cursor.clone();
                tmpCursor.project({ _id: 1 })
                .group({
                    _id: null,
                    count: { $sum: 1 },
                }).next((err, res) => _handleCount(err, res, done));
            },
            data: done => {
                const tmpCursor = cursor.clone();
                tmpCursor.project({
                    'value.dataStoreName': 1,
                    'value.content-length': 1,
                }).group({
                    _id: '$value.dataStoreName',
                    bytes: { $sum: '$value.content-length' },
                }).toArray((err, res) => _handleEntries(err, res, done));
            },
            repData: done => {
                const tmpCursor = cursor.clone();
                tmpCursor.project({
                    'value.replicationInfo.backends': 1,
                    'value.content-length': 1,
                }).unwind('$value.replicationInfo.backends')
                .group({
                    _id: '$value.replicationInfo.backends.site',
                    bytes: { $sum: '$value.content-length' },
                }).toArray((err, res) => _handleEntries(err, res, done));
            },
        }, (err, res) => {
            if (err) {
                log.error('Error when processing mongo entries', {
                    method: '_handleMongo',
                    error: err,
                });
                return cb(err);
            }
            const retResult = {
                count: res.count,
                data: Object.assign({}, res.data),
            };
            Object.keys(res.repData).forEach(site => {
                if (!retResult.data[site]) {
                    retResult.data[site] = 0;
                }
                retResult.data[site] += res.repData[site];
            });
            return cb(null, retResult);
        });

        const mstCursor = c.aggregate().match(mstFilter);
        const verCursor = c.aggregate().match(verFilter);
        const nullCursor = c.aggregate().match(nullFilter);
        async.parallel({
            version: done => _handleMongo(verCursor, done),
            null: done => _handleMongo(nullCursor, done),
            master: done => _handleMongo(mstCursor, done),
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
            retResult.bucketList = retBucketInfo;
            return callback(null, retResult);
        });
    }
}

module.exports = MongoClientInterface;
