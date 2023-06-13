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

const { reshapeExceptionError } = require('../../../errorUtils');
const errors = require('../../../errors').default;
const BucketInfo = require('../../../models/BucketInfo').default;
const ObjectMD = require('../../../models/ObjectMD').default;
const jsutil = require('../../../jsutil');

const MongoClient = require('mongodb').MongoClient;
const Uuid = require('uuid');
const diskusage = require('diskusage');

const genVID = require('../../../versioning/VersionID').generateVersionId;
const listAlgos = require('../../../algos/list/exportAlgos');
const LRUCache = require('../../../algos/cache/LRUCache');

const MongoReadStream = require('./readStream');
const MongoUtils = require('./utils');
const Skip = require('../../../algos/list/skip');
const MergeStream = require('../../../algos/stream/MergeStream');
const { Transform } = require('stream');
const { Version } = require('../../../versioning/Version');

const { formatMasterKey, formatVersionKey } = require('./utils');

const VID_NONE = '';

const USERSBUCKET = '__usersbucket';
const METASTORE = '__metastore';
const INFOSTORE = '__infostore';
const __UUID = 'uuid';
const PENSIEVE = 'PENSIEVE';
const __COUNT_ITEMS = 'countitems';
const ASYNC_REPAIR_TIMEOUT = 15000;
const CONNECT_TIMEOUT_MS = 5000;
// MongoDB default
const SOCKET_TIMEOUT_MS = 360000;
const CONCURRENT_CURSORS = 10;

const initialInstanceID = process.env.INITIAL_INSTANCE_ID;

let uidCounter = 0;

const BUCKET_VERSIONS = require('../../../versioning/constants')
    .VersioningConstants.BucketVersioningKeyFormat;
const DB_PREFIXES = require('../../../versioning/constants')
    .VersioningConstants.DbPrefixes;

function generateVersionId(replicationGroupId) {
    // generate a unique number for each member of the nodejs cluster
    return genVID(`${process.pid}.${uidCounter++}`,
        replicationGroupId);
}

function inc(str) {
    return str ? (str.slice(0, str.length - 1) +
            String.fromCharCode(str.charCodeAt(str.length - 1) + 1)) : str;
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
 * @param {function} params.isLocationTransient - optional function
 *   to get the transient attribute of a location by name
 * @param {werelogs.Logger} params.logger - logger instance
 * @param {String} [params.path] - path for mongo volume
 */
class MongoClientInterface {
    constructor(params) {
        const { replicaSetHosts, writeConcern, replicaSet, readPreference, path,
            database, logger, replicationGroupId, authCredentials,
            isLocationTransient, shardCollections } = params;
        const cred = MongoUtils.credPrefix(authCredentials);
        this.mongoUrl = `mongodb://${cred}${replicaSetHosts}/` +
            `?w=${writeConcern}&readPreference=${readPreference}`;

        if (!shardCollections) {
            this.mongoUrl += `&replicaSet=${replicaSet}`;
        }

        this.logger = logger;
        this.client = null;
        this.db = null;
        this.path = path;
        this.replicationGroupId = replicationGroupId;
        this.database = database;
        this.isLocationTransient = isLocationTransient;
        this.shardCollections = shardCollections;

        this.concurrentCursors = (process.env.CONCURRENT_CURSORS &&
            !Number.isNaN(process.env.CONCURRENT_CURSORS))
            ? Number.parseInt(process.env.CONCURRENT_CURSORS, 10)
            : CONCURRENT_CURSORS;

        this.bucketVFormatCache = new LRUCache(constants.maxCachedBuckets);
        this.defaultBucketKeyFormat = [BUCKET_VERSIONS.v0, BUCKET_VERSIONS.v1]
            .includes(process.env.DEFAULT_BUCKET_KEY_FORMAT) ? process.env.DEFAULT_BUCKET_KEY_FORMAT
            : BUCKET_VERSIONS.v1;

        this.cacheHit = 0;
        this.cacheMiss = 0;
        this.cacheHitMissLoggerInterval = null;
    }

    setup(cb) {
        // FIXME: constructors shall not have side effect so there
        // should be an async_init(cb) method in the wrapper to
        // initialize this backend
        if ((process.env.MONGO_CONNECT_TIMEOUT_MS &&
        Number.isNaN(process.env.MONGO_CONNECT_TIMEOUT_MS)) ||
        (process.env.MONGO_SOCKET_TIMEOUT_MS &&
        Number.isNaN(process.env.MONGO_SOCKET_TIMEOUT_MS))) {
            this.logger.error('MongoDB connect and socket timeouts must be a ' +
            'number. Using default value(s).');
        }
        const connectTimeoutMS = Number.parseInt(
            process.env.MONGO_CONNECT_TIMEOUT_MS, 10) || CONNECT_TIMEOUT_MS;
        const socketTimeoutMS = Number.parseInt(
            process.env.MONGO_SOCKET_TIMEOUT_MS, 10) || SOCKET_TIMEOUT_MS;
        const options = { connectTimeoutMS, socketTimeoutMS };
        if (process.env.MONGO_POOL_SIZE &&
            !Number.isNaN(process.env.MONGO_POOL_SIZE)) {
            options.poolSize = Number.parseInt(process.env.MONGO_POOL_SIZE, 10);
        }
        return MongoClient.connect(this.mongoUrl, options, (err, client) => {
            if (err) {
                this.logger.error('error connecting to mongodb',
                    { error: err.message });
                return cb(errors.InternalError);
            }
            this.logger.info('connected to mongodb');
            this.client = client;
            this.db = client.db(this.database, {
                ignoreUndefined: true,
            });
            this.adminDb = client.db('admin');
            // log cache hit/miss every 5min
            this.cacheHitMissLoggerInterval = setInterval(() => {
                let hitRatio = (this.cacheHit / (this.cacheHit + this.cacheMiss)) || 0;
                hitRatio = hitRatio.toFixed(3);
                this.logger.debug('MongoClientInterface: Bucket vFormat cache hit/miss (5min)',
                    { hits: this.cacheHit, misses: this.cacheMiss, hitRatio });
                this.cacheHit = 0;
                this.cacheMiss = 0;
            }, 300000);

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
            usersBucketAttr,
            this.logger,
            err => {
                if (err) {
                    this.logger.fatal('error writing usersBucket ' +
                                      'attributes to metastore',
                    { error: err });
                    throw (errors.InternalError);
                }
                return cb();
            });
    }

    close(cb) {
        if (this.client) {
            clearInterval(this.cacheHitMissLoggerInterval);
            return this.client.close(true, cb);
        }
        return cb();
    }

    getCollection(name) {
        /* mongo has a problem with .. in collection names */
        const newName = (name === constants.usersBucket) ?
            USERSBUCKET : name;
        return this.db.collection(newName);
    }

    /**
     * Creates a bucket with the provided metadata
     * @param {string} bucketName bucket name
     * @param {Object} bucketMD bucket metadata
     * @param {Object} log logger
     * @param {Function} cb callback
     * @return {undefined}
     */
    createBucket(bucketName, bucketMD, log, cb) {
        // FIXME: there should be a version of BucketInfo.serialize()
        // that does not JSON.stringify()
        const bucketInfo = BucketInfo.fromObj(bucketMD);
        const bucketMDStr = bucketInfo.serialize();
        const newBucketMD = JSON.parse(bucketMDStr);
        const m = this.getCollection(METASTORE);

        const payload = {
            _id: bucketName,
            value: newBucketMD,
        };
        if (bucketName !== constants.usersBucket &&
            bucketName !== PENSIEVE &&
            !bucketName.startsWith(constants.mpuBucketPrefix)) {
            payload.vFormat = this.defaultBucketKeyFormat;
        } else {
            payload.vFormat = BUCKET_VERSIONS.v0;
        }

        // we don't have to test bucket existence here as it is done
        // on the upper layers
        m.update({
            _id: bucketName,
        }, payload, {
            upsert: true,
        }, err => {
            if (err) {
                log.error(
                    'createBucket: error creating bucket',
                    { error: err.message });
                return cb(errors.InternalError);
            }
            // caching bucket vFormat
            this.bucketVFormatCache.add(bucketName, payload.vFormat);
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
                            { error: err });
                        return cb(errors.InternalError);
                    }
                    if (this.shardCollections) {
                        const cmd = {
                            shardCollection: `${this.database}.${bucketName}`,
                            key: { _id: 1 },
                        };
                        return this.adminDb.command(cmd, {}, err => {
                            if (err) {
                                log.error(
                                    'createBucket: enabling sharding',
                                    { error: err });
                                return cb(errors.InternalError);
                            }
                            return cb();
                        });
                    }
                    return cb();
                });
            }

            return cb();
        });
    }

    /**
     * Gets bucket metadata
     * @param {String} bucketName bucket name
     * @param {Object} log logger
     * @param {Function} cb callback
     * @return {undefined}
     */
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
        return undefined;
    }

    /**
     * Gets the bucket key format
     * @param {String} bucketName bucket name
     * @param {Object} log logger
     * @param {Function} cb callback
     * @return {undefined}
     */
    getBucketVFormat(bucketName, log, cb) {
        // retreiving vFormat from cache
        const cachedVFormat = this.bucketVFormatCache.get(bucketName);
        if (cachedVFormat) {
            this.cacheHit++;
            return cb(null, cachedVFormat);
        }
        this.cacheMiss++;
        const m = this.getCollection(METASTORE);
        m.findOne({
            _id: bucketName,
        }, {}, (err, doc) => {
            if (err) {
                log.error(
                    'getBucketVFormat: error getting bucket vFormat',
                    { bucket: bucketName, error: err.message });
                return cb(errors.InternalError);
            }
            if (!doc) {
                return cb(null, BUCKET_VERSIONS.v0);
            }
            const vFormat = doc.vFormat || BUCKET_VERSIONS.v0;
            this.bucketVFormatCache.add(bucketName, vFormat);
            return cb(null, vFormat);
        });
        return undefined;
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
                    if (err.is.NoSuchKey) {
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
            $set: {
                _id: bucketName,
                value: newBucketMD,
            },
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
            // removing cached bucket metadata
            this.bucketVFormatCache.remove(bucketName);
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

    /**
     * Returns the suitable mongo operation to perform
     * depending on the version being put
     * In v1 the master gets deleted instead of being
     * updated like in v0 when the last version is a delete
     * marker
     * @param {Boolean} isDeleteMarker isDeleteMarker tag
     * @param {String} vFormat vFormat of bucket
     * @param {Object} filter filter to get master
     * @param {Object} update value to update master with
     * @param {Boolean} upsert if upserting is needed
     * @return {Object} mongo operation
     */
    updateDeleteMaster(isDeleteMarker, vFormat, filter, update, upsert) {
        // delete master when we are in v1 and the version is a delete
        // marker
        if (isDeleteMarker && vFormat === BUCKET_VERSIONS.v1) {
            return {
                deleteOne: {
                    filter,
                },
            };
        }
        // in v0 or if the version is not a delete marker the master
        // simply gets updated
        return {
            updateOne: {
                filter,
                update,
                upsert,
            },
        };
    }

    /**
     * In this case we generate a versionId and
     * sequentially create the object THEN update the master.
     * Master is deleted when version put is a delete marker
     *
     * It is possible that 2 version creations are inverted
     * in flight so we also check that we update a master only
     * if the version in place is greater that the one we set.
     *
     * We also test the existence of the versionId property
     * to manage the case of an object created before the
     * versioning was enabled.
     * @param {Object} c bucket collection
     * @param {String} bucketName bucket name
     * @param {String} objName object name
     * @param {Object} objVal object metadata
     * @param {Object} params params
     * @param {String} params.vFormat object key format
     * @param {Object} log logger
     * @param {Function} cb callback
     * @param {boolean} isRetry is function call a retry
     * @return {undefined}
     */
    putObjectVerCase1(c, bucketName, objName, objVal, params, log, cb, isRetry) {
        const versionId = generateVersionId(this.replicationGroupId);
        // eslint-disable-next-line
        objVal.versionId = versionId;
        const versionKey = formatVersionKey(objName, versionId, params.vFormat);
        const masterKey = formatMasterKey(objName, params.vFormat);
        // initiating array of operations with version creation
        const ops = [{
            updateOne: {
                filter: {
                    _id: versionKey,
                },
                update: {
                    $set: { _id: versionKey, value: objVal },
                },
                upsert: true,
            },
        }];
        // filter to get master
        const filter = {
            _id: masterKey,
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
        };
        // values to update master
        const update = {
            $set: { _id: masterKey, value: objVal },
        };
        // updating or deleting master depending on the last version put
        // in v0 the master gets updated, in v1 the master gets deleted if version is
        // a delete marker or updated otherwise.
        const masterOp = this.updateDeleteMaster(objVal.isDeleteMarker, params.vFormat, filter, update, true);
        ops.push(masterOp);
        c.bulkWrite(ops, {
            ordered: true,
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
                if (err.code === 11000) {
                    log.debug('putObjectVerCase1: error putting object version', {
                        code: err.code,
                        error: err.errmsg,
                        isRetry: isRetry ? true : false, // eslint-disable-line no-unneeded-ternary
                    });
                    let count = err.result.upsertedCount;
                    if (typeof count !== 'number') {
                        count = err.result.nUpserted;
                    }
                    if (typeof count === 'number' && count !== 1) {
                        // This may be a race condition, when two different S3 Connector try to put the same version id
                        if (!isRetry) {
                            // retrying with a new version id
                            return process.nextTick(() =>
                                this.putObjectVerCase1(c, bucketName, objName, objVal, params, log, cb, true));
                        }
                        log.error('putObjectVerCase1: race condition upserting versionId', {
                            error: err.errmsg,
                        });
                        return cb(errors.InternalError);
                    }
                    // Otherwise this error is expected, it means that two differents version was put at the same time
                } else {
                    log.error('putObjectVerCase1: error putting object version', {
                        error: err.errmsg,
                    });
                    return cb(errors.InternalError);
                }
            }
            return cb(null, `{"versionId": "${versionId}"}`);
        });
    }

    /**
     * Case used when versioning has been disabled after objects
     * have been created with versions
     * @param {Object} c bucket collection
     * @param {String} bucketName bucket name
     * @param {String} objName object name
     * @param {Object} objVal object metadata
     * @param {Object} params params
     * @param {String} params.vFormat object key format
     * @param {Object} log logger
     * @param {Function} cb callback
     * @return {undefined}
     */
    putObjectVerCase2(c, bucketName, objName, objVal, params, log, cb) {
        const versionId = generateVersionId(this.replicationGroupId);
        // eslint-disable-next-line
        objVal.versionId = versionId;
        const masterKey = formatMasterKey(objName, params.vFormat);
        c.update({
            _id: masterKey,
        }, {
            _id: masterKey,
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

    /**
     * In this case the caller provides a versionId. This function will
     * check if the object exists then sequentially update the object
     * (or create if doesn't exist) with given versionId THEN the master
     * if the provided versionId matches the one of the master. There
     * is a potential race condition where if two putObjectVerCase3 are
     * occurring at the same time and the master version doesn't exist,
     * then one will upsert and update the master and one will fail with
     * the KeyAlreadyExists error.
     * @param {Object} c bucket collection
     * @param {String} bucketName bucket name
     * @param {String} objName object name
     * @param {Object} objVal object metadata
     * @param {Object} params params
     * @param {String} params.vFormat object key format
     * @param {String} params.versionId object version
     * @param {Object} log logger
     * @param {Function} cb callback
     * @return {undefined}
     */
    putObjectVerCase3(c, bucketName, objName, objVal, params, log, cb) {
        // eslint-disable-next-line
        objVal.versionId = params.versionId;
        const versionKey = formatVersionKey(objName, params.versionId, params.vFormat);
        const masterKey = formatMasterKey(objName, params.vFormat);
        c.findOne({ _id: masterKey }, (err, checkObj) => {
            if (err) {
                log.error('putObjectVerCase3: mongoDB error finding object');
                return cb(errors.InternalError);
            }
            const objUpsert = !checkObj;
            // initiating array of operations with version creation/update
            const ops = [{
                updateOne: {
                    filter: {
                        _id: versionKey,
                    },
                    update: {
                        $set: {
                            _id: versionKey,
                            value: objVal,
                        },
                    },
                    upsert: true,
                },
            }];
            // filter to get master
            const filter = {
                '_id': masterKey,
                'value.versionId': objVal.versionId,
            };
            // values to update master
            const update = {
                $set: { _id: masterKey, value: objVal },
            };
            // updating or deleting master depending on the last version put
            // in v0 the master gets updated, in v1 the master gets deleted if version is
            // a delete marker or updated otherwise.
            const masterOp = this.updateDeleteMaster(objVal.isDeleteMarker, params.vFormat, filter, update, objUpsert);
            ops.push(masterOp);
            c.bulkWrite(ops, {
                ordered: true,
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

    /**
     * In this case the caller provides a versionId. We assume that
     * objVal already contains the destination versionId. We first
     * update the version if it exists or create it. We then call
     * getLatestVersion() to get the latest version. We update the
     * master only if the returned version is greater or equal than
     * the stored one. Caveat: this function is not optimized for
     * multiple updates to the same objName, a batch would be more
     * suited to avoid the parallel attempts to update the master.
     * @param {Object} c bucket collection
     * @param {String} bucketName bucket name
     * @param {String} objName object name
     * @param {Object} objVal object metadata
     * @param {Object} params params
     * @param {String} params.vFormat object key format
     * @param {String} params.versionId object version
     * @param {Object} log logger
     * @param {Function} cb callback
     * @return {undefined}
     */
    putObjectVerCase4(c, bucketName, objName, objVal, params, log, cb) {
        const versionKey = formatVersionKey(objName, params.versionId, params.vFormat);
        const masterKey = formatMasterKey(objName, params.vFormat);
        c.update({
            _id: versionKey,
        }, {
            _id: versionKey,
            value: objVal,
        }, {
            upsert: true,
        }, err => {
            if (err) {
                log.error(
                    'putObjectVerCase4: error upserting object version',
                    { error: err.message });
                return cb(errors.InternalError);
            }
            this.getLatestVersion(c, objName, params.vFormat, log, (err, mstObjVal) => {
                if (err) {
                    log.error('getLatestVersion: getting latest version',
                        { error: err.message });
                    return cb(err);
                }
                MongoUtils.serialize(mstObjVal);
                const ops = [];
                // filter to get master
                const filter = {
                    '_id': masterKey,
                    'value.versionId': {
                        // We break the semantic correctness here with
                        // $gte instead of $gt because we do not have
                        // a microVersionId to capture the micro
                        // changes (tags, ACLs, etc). If we do not use
                        // $gte currently the micro changes are not
                        // propagated. We are now totally dependent of
                        // the order of changes (which Backbeat
                        // replication and ingestion can hopefully
                        // ensure), but this would not work e.g. in
                        // the case of an active-active replication.
                        $gte: mstObjVal.versionId,
                    },
                };
                // values to update master
                const update = {
                    $set: { _id: masterKey, value: mstObjVal },
                };
                // updating or deleting master depending on the last version put
                // in v0 the master gets updated, in v1 the master gets deleted if version is
                // a delete marker or updated otherwise.
                const masterOp = this.updateDeleteMaster(mstObjVal.isDeleteMarker, params.vFormat, filter, update,
                    true);
                ops.push(masterOp);
                c.bulkWrite(ops, {
                    ordered: true,
                }, err => {
                    if (err) {
                        // we accept that the update fails if
                        // condition is not met, meaning that a more
                        // recent master was already in place
                        if (err.code !== 11000) {
                            log.error(
                                'putObjectVerCase4: error upserting master',
                                { error: err.message });
                            return cb(errors.InternalError);
                        }
                    }
                    return cb(null, `{"versionId": "${objVal.versionId}"}`);
                });
                return undefined;
            });
            return undefined;
        });
    }

    /**
     * Put object when versioning is not enabled
     * @param {Object} c bucket collection
     * @param {String} bucketName bucket name
     * @param {String} objName object name
     * @param {Object} objVal object metadata
     * @param {Object} params params
     * @param {Object} log logger
     * @param {Function} cb callback
     * @return {undefined}
     */
    putObjectNoVer(c, bucketName, objName, objVal, params, log, cb) {
        const masterKey = formatMasterKey(objName, params.vFormat);
        c.update({
            _id: masterKey,
        }, {
            _id: masterKey,
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

    /**
     * Returns the putObjectVerCase function to use
     * depending on params
     * @param {Object} params params
     * @return {Function} suitable putObjectVerCase function
     */
    getPutObjectVerStrategy(params) {
        if (params.versionId === '') {
            return this.putObjectVerCase2;
        } else if (params.versionId) {
            if (!params.repairMaster) {
                return this.putObjectVerCase3;
            }
            return this.putObjectVerCase4;
        } else if (params.versioning) {
            return this.putObjectVerCase1;
        }
        return this.putObjectNoVer;
    }

    /**
     * puts object metadata in bucket
     * @param {String} bucketName bucket name
     * @param {String} objName object name
     * @param {Object} objVal object metadata
     * @param {object} params params
     * @param {Object} log logger
     * @param {Function} cb callback
     * @return {undefined}
     */
    putObject(bucketName, objName, objVal, params, log, cb) {
        MongoUtils.serialize(objVal);
        const c = this.getCollection(bucketName);
        const _params = Object.assign({}, params);
        return this.getBucketVFormat(bucketName, log, (err, vFormat) => {
            if (err) {
                return cb(err);
            }
            _params.vFormat = vFormat;
            if (params) {
                const putObjectVer = this.getPutObjectVerStrategy(params)
                    .bind(this);
                return putObjectVer(c, bucketName, objName, objVal, _params, log,
                    cb);
            }
            return this.putObjectNoVer(c, bucketName, objName, objVal,
                _params, log, cb);
        });
    }

    /**
     * gets versioned and non versioned object metadata
     * @param {String} bucketName bucket name
     * @param {String} objName object name
     * @param {object} params params
     * @param {String} params.versionId version of object (optional)
     * @param {Object} log logger
     * @param {Function} cb callback
     * @return {undefined}
     */
    getObject(bucketName, objName, params, log, cb) {
        const c = this.getCollection(bucketName);
        let key;
        async.waterfall([
            next => this.getBucketVFormat(bucketName, log, next),
            (vFormat, next) => {
                if (params && params.versionId) {
                    key = formatVersionKey(objName, params.versionId, vFormat);
                } else {
                    key = formatMasterKey(objName, vFormat);
                }
                c.findOne({
                    _id: key,
                    // filtering out objects flagged for deletion
                    $or: [
                        { 'value.deleted': { $exists: false } },
                        { 'value.deleted': { $eq: false } },
                    ],
                }, {}, (err, doc) => {
                    if (err) {
                        log.error('findOne: error getting object',
                            { bucket: bucketName, object: objName, error: err.message });
                        return next(errors.InternalError);
                    }
                    return next(null, vFormat, doc);
                });
            },
            (vFormat, doc, next) => {
                if (!doc && params && params.versionId) {
                    return next(errors.NoSuchKey);
                }
                // If no master found then object is either non existent
                // or last version is delete marker
                if (!doc || doc.value.isPHD) {
                    this.getLatestVersion(c, objName, vFormat, log, (err, value) => {
                        if (err) {
                            log.error('getLatestVersion: getting latest version',
                                { bucket: bucketName, object: objName, error: err.message });
                            return next(err);
                        }
                        return next(null, value);
                    });
                    return undefined;
                }
                MongoUtils.unserialize(doc.value);
                return next(null, doc.value);
            },
        ], cb);
    }

    /**
     * gets object metadata for a list of objects
     * @param {String} bucketName bucket name
     * @param {Array} objects array of objects
     * @param {Object} log logger
     * @param {Function} callback callback
     * @return {undefined}
     */
    getObjects(bucketName, objects, log, callback) {
        const c = this.getCollection(bucketName);
        let vFormat = null;
        if (!Array.isArray(objects)) {
            return callback(errors.InternalError.customizeDescription('objects must be an array'));
        }
        // Function to process each document
        const processDoc = (doc, objName, params, key, cb) => {
            const versionIdValue = params && params.versionId ? params.versionId : undefined;
            if (!doc && versionIdValue) {
                return cb(null, {
                    doc: null,
                    versionId: versionIdValue,
                    key,
                });
            }
            // If no master found then ob ject is either non existent
            // or last version is delete marker
            if (!doc || doc.value.isPHD) {
                return this.getLatestVersion(c, objName, vFormat, log, (err, _doc) => {
                    if (err && !err.is.NoSuchKey) {
                        return cb(err);
                    }
                    return cb(null, {
                        doc: _doc || null,
                        versionId: versionIdValue,
                        key,
                    });
                });
            }
            MongoUtils.unserialize(doc.value);
            return cb(null, {
                doc: doc.value,
                versionId: versionIdValue,
                key,
            });
        };
        return this.getBucketVFormat(bucketName, log, (err, _vFormat) => {
            if (err) {
                return callback(err);
            }
            vFormat = _vFormat;
            // Create keys, maintaining the context with each key
            const keysAndObjects = objects.map(({ key: objName, params }) => {
                const _key = params && params.versionId
                    ? formatVersionKey(objName, params.versionId, vFormat)
                    : formatMasterKey(objName, vFormat);
                return { key: _key, objName, params };
            });
            // Extract keys and find documents
            const keys = keysAndObjects.map(o => o.key);
            return c.find({
                _id: { $in: keys },
                $or: [
                    { 'value.deleted': { $exists: false } },
                    { 'value.deleted': { $eq: false } },
                ],
            }).toArray((err, docs) => {
                if (err) {
                    return callback(err);
                }
                // Create a Map to quickly find docs by their keys
                const docByKey = new Map(docs.map(doc => [doc._id, doc]));
                // Process each document using associated context (objName, params)
                return async.mapLimit(keysAndObjects, 5, ({ key, objName, params }, cb) => {
                    const doc = docByKey.get(key);
                    processDoc(doc, objName, params, key, cb);
                }, callback);
            });
        });
    }

    /**
     * This function return the latest version of an object
     * by getting all keys related to an object's versions, ordering them
     * and returning the latest one
     * @param {Object} c collection
     * @param {String} objName object name
     * @param {String} vFormat bucket version format
     * @param {Object} log logger
     * @param {Function} cb callback
     * @return {undefined}
     */
    getLatestVersion(c, objName, vFormat, log, cb) {
        // generating the range delimiter keys
        const masterKey = formatMasterKey(objName, vFormat);
        // version id is added at the end of the key so giving it an empty
        // string gives us the last key in the range
        const versionKey = formatVersionKey(objName, VID_NONE, vFormat);
        const lastVersionKey = inc(versionKey);
        const filter = {};
        if (vFormat === BUCKET_VERSIONS.v0) {
            filter.$gt = masterKey;
            filter.$lt = lastVersionKey;
        } else {
            filter.$gt = versionKey;
            filter.$lt = lastVersionKey;
        }
        c.find({
            _id: filter,
            // filtering out objects flagged for deletion
            $or: [
                { 'value.deleted': { $exists: false } },
                { 'value.deleted': { $eq: false } },
            ],
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

    /**
     * repair the master with a new value. There can be
     * race-conditions or legit updates so place an atomic condition
     * on PHD flag and mst version.
     * @param {Object} c collection
     * @param {String} bucketName bucket name
     * @param {String} objName object name
     * @param {Object} objVal new object version metadata
     * @param {Object} mst master version metadata
     * @param {String} vFormat key format version
     * @param {Object} log logger
     * @param {Function} cb callback
     * @return {undefined}
     */
    repair(c, bucketName, objName, objVal, mst, vFormat, log, cb) {
        const masterKey = formatMasterKey(objName, vFormat);
        MongoUtils.serialize(objVal);
        // eslint-disable-next-line
        objVal.originOp = 's3:ObjectRemoved:Delete';
        c.findOneAndReplace({
            '_id': masterKey,
            'value.isPHD': true,
            'value.versionId': mst.versionId,
        }, {
            _id: masterKey,
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

    /**
     * Get the latest version and repair. The process is safe because
     * we never replace a non-PHD master
     * @param {Object} c collection
     * @param {String} bucketName bucket name
     * @param {String} objName object name
     * @param {Object} mst master version metadata
     * @param {String} vFormat key format version
     * @param {Object} log logger
     * @param {Function} cb callback
     * @return {undefined}
     */
    asyncRepair(c, bucketName, objName, mst, vFormat, log) {
        this.getLatestVersion(c, objName, vFormat, log, (err, value) => {
            if (err) {
                log.error('async-repair: getting latest version',
                    { error: err.message });
                return undefined;
            }
            this.repair(c, bucketName, objName, value, mst, vFormat, log, err => {
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

    /**
     * the master is a PHD so we try to see if it is the latest of its
     * kind to get rid of it, otherwise we asynchronously repair it
     * @param {Object} c collection
     * @param {String} bucketName bucket name
     * @param {String} objName object name
     * @param {Object} mst master version metadata
     * @param {String} vFormat key format version
     * @param {Object} log logger
     * @param {Function} cb callback
     * @return {undefined}
     */
    deleteOrRepairPHD(c, bucketName, objName, mst, vFormat, log, cb) {
        const masterKey = formatMasterKey(objName, vFormat);
        // Check if there are other versions available
        this.getLatestVersion(c, objName, vFormat, log, (err, version) => {
            if (err && !err.is.NoSuchKey) {
                log.error('getLatestVersion: error getting latest version',
                    { error: err.message, bucket: bucketName, key: objName });
                return cb(err);
            }
            if ((err && err.is.NoSuchKey) || (version.isDeleteMarker && vFormat === BUCKET_VERSIONS.v1)) {
                // We try to delete the master. A race condition
                // is possible here: another process may recreate
                // a master or re-delete it in between so place an
                // atomic condition on the PHD flag and the mst
                // version:
                // eslint-disable-next-line
                const filter = {
                    'value.isPHD': true,
                    'value.versionId': mst.versionId,
                };
                this.internalDeleteObject(c, bucketName, masterKey, filter, log, err => {
                    if (err) {
                        // the PHD master might get updated when a PUT is performed
                        // before the repair is done, we don't want to return an error
                        // in this case
                        if (err.is.NoSuchKey) {
                            return cb(null);
                        }
                        log.error(
                            'deleteOrRepairPHD: error deleting object',
                            { error: err.message, bucket: bucketName, key: objName });
                        return cb(errors.InternalError);
                    }
                    // do not test result.ok === 1 because
                    // both cases are expected
                    return cb(null);
                });
                return undefined;
            }
            // We have other versions available so repair:
            setTimeout(() => {
                this.asyncRepair(c, bucketName, objName, mst, vFormat, log);
            }, ASYNC_REPAIR_TIMEOUT);
            return cb(null);
        });
    }

    /**
     * Delete object when versioning is enabled and the version is
     * master. In this case we sequentially update the master with a
     * PHD flag (placeholder) and a unique non-existing version THEN
     * we delete the specified versioned object. THEN we try to delete
     * or repair the PHD we just created
     * @param {Object} c collection
     * @param {String} bucketName bucket name
     * @param {String} objName object name
     * @param {Object} params params
     * @param {String} params.versionId object version
     * @param {String} params.vFormat object key format
     * @param {Object} log logger
     * @param {Function} cb callback
     * @return {undefined}
     */
    deleteObjectVerMaster(c, bucketName, objName, params, log, cb) {
        const masterKey = formatMasterKey(objName, params.vFormat);
        const versionKey = formatVersionKey(objName, params.versionId, params.vFormat);
        const _vid = generateVersionId(this.replicationGroupId);
        async.series([
            next => c.updateOne(
                {
                    // Can't filter out objects with deletiong flag
                    // as it will try and recreate an object with the same _id
                    // instead we reset the flag to false, the data might be
                    // inconsistent with the current state of the object but
                    // this is not an issue as the object is in a temporary
                    // placeholder (PHD) state
                    _id: masterKey,
                },
                {
                    $set: {
                        '_id': masterKey,
                        'value.isPHD': true,
                        'value.versionId': _vid,
                        'value.deleted': false,
                    },
                },
                { upsert: true },
                next,
            ),
            // delete version
            next => this.internalDeleteObject(c, bucketName, versionKey, {}, log,
                err => {
                    // we don't return an error in case we don't find
                    // a version as we expect this case when dealing with
                    // a versioning suspended object.
                    if (err && err.is.NoSuchKey) {
                        return next(null);
                    }
                    return next(err);
                }, params),
        ], err => {
            if (err) {
                log.error(
                    'deleteObjectVerMaster: error deleting the object',
                    { error: err.message, bucket: bucketName, key: objName });
                return cb(errors.InternalError);
            }
            return this.deleteOrRepairPHD(c, bucketName, objName, { versionId: _vid }, params.vFormat, log, cb);
        });
    }

    /**
     * Delete object when versioning is enabled and the version is
     * not master. It is a straight-forward atomic delete
     * @param {Object} c collection
     * @param {String} bucketName bucket name
     * @param {String} objName object name
     * @param {Object} params params
     * @param {String} params.versionId object version
     * @param {String} params.vFormat object key format
     * @param {Object} log logger
     * @param {Function} cb callback
     * @return {undefined}
     */
    deleteObjectVerNotMaster(c, bucketName, objName, params, log, cb) {
        const versionKey = formatVersionKey(objName, params.versionId, params.vFormat);
        this.internalDeleteObject(c, bucketName, versionKey, {}, log, err => {
            if (err) {
                if (err.is.NoSuchKey) {
                    log.error(
                        'deleteObjectVerNotMaster: unable to find target object to delete',
                        { error: err.message, bucket: bucketName, key: objName });
                    return cb(errors.NoSuchKey);
                }
                log.error(
                    'deleteObjectVerNotMaster: error deleting object with no version',
                    { error: err.message, bucket: bucketName, key: objName });
                return cb(errors.InternalError);
            }
            return cb(null);
        }, params);
    }

    /**
     * Delete object when versioning is enabled. We first find the
     * master, if it is already a PHD we have a special processing,
     * then we check if it matches the master versionId in such case
     * we will create a PHD, otherwise we delete it
     * @param {Object} c collection
     * @param {String} bucketName bucket name
     * @param {String} objName object name
     * @param {Object} params params
     * @param {String} params.versionId object version
     * @param {String} params.vFormat object key format
     * @param {Object} log logger
     * @param {Function} cb callback
     * @return {undefined}
     */
    deleteObjectVer(c, bucketName, objName, params, log, cb) {
        const masterKey = formatMasterKey(objName, params.vFormat);
        async.waterfall([
            next => {
                // find the master version
                c.findOne({
                    _id: masterKey,
                    $or: [
                        { 'value.deleted': { $exists: false } },
                        { 'value.deleted': { $eq: false } },
                    ],
                }, {}, (err, mst) => {
                    if (err) {
                        log.error('deleteObjectVer: error deleting versioned object',
                            { error: err.message, bucket: bucketName, key: objName });
                        return cb(errors.InternalError);
                    }
                    return next(null, mst);
                });
            },
            (mst, next) => {
                // getting the last version if master not found
                // (either object non existent or last version is a delete marker)
                if (!mst) {
                    return this.getLatestVersion(c, objName, params.vFormat, log, (err, version) => {
                        if (err) {
                            return next(err);
                        }
                        return next(null, { value: version });
                    });
                }
                return next(null, mst);
            },
            (mst, next) => {
                if (mst.value.isPHD ||
                    mst.value.versionId === params.versionId) {
                    return this.deleteObjectVerMaster(c, bucketName, objName,
                        params, log, next);
                }
                return this.deleteObjectVerNotMaster(c, bucketName, objName,
                    params, log, next);
            },
        ], cb);
    }

    /**
     * Atomically delete an object when versioning is not enabled
     * @param {Object} c collection
     * @param {String} bucketName bucket name
     * @param {String} objName object name
     * @param {Object} params params
     * @param {String} params.vFormat object key format
     * @param {Object} log logger
     * @param {Function} cb callback
     * @return {undefined}
     */
    deleteObjectNoVer(c, bucketName, objName, params, log, cb) {
        const masterKey = formatMasterKey(objName, params.vFormat);
        this.internalDeleteObject(c, bucketName, masterKey, {}, log, err => {
            if (err) {
                // Should not return an error when no object is found
                if (err.is.NoSuchKey) {
                    return cb(null);
                }
                log.error(
                    'deleteObjectNoVer: error deleting object with no version',
                    { error: err.message, bucket: bucketName, key: objName });
                return cb(errors.InternalError);
            }
            return cb(null);
        }, params);
    }

    /**
     * Flags the object before deleting it, this is done
     * to keep object metadata in the oplog, as oplog delete
     * events don't contain any object metadata
     * @param {Object} collection MongoDB collection
     * @param {string} bucketName bucket name
     * @param {string} key Key of the object to delete
     * @param {object} filter additional query filters
     * @param {Logger}log logger instance
     * @param {Function} cb callback containing error
     * and BulkWriteResult
     * @param {object} [params] request params
     * @return {undefined}
     */
    internalDeleteObject(collection, bucketName, key, filter, log, cb, params = null) {
        // filter used when deleting object
        const deleteFilter = Object.assign({
            _id: key,
        }, filter);

        if (params && params.shouldOnlyDelete) {
            // If flag is true, directly delete object
            return collection.deleteOne(deleteFilter)
                .then(() => cb(null))
                .catch(err => {
                    log.error('internalDeleteObject: error deleting object',
                        { bucket: bucketName, object: key, error: err.message });
                    return cb(errors.InternalError);
                });
        }

        // filter used when finding and updating object
        const findFilter = Object.assign({
            _id: key,
            $or: [
                { 'value.deleted': { $exists: false } },
                { 'value.deleted': { $eq: false } },
            ],
        }, filter);

        const updateDeleteFilter = Object.assign({
            '_id': key,
            'value.deleted': true,
        }, filter);
        return async.waterfall([
            // Adding delete flag when getting the object
            // to avoid having race conditions.
            next => collection.findOneAndUpdate(findFilter, {
                $set: {
                    '_id': key,
                    'value.deleted': true,
                },
            }, {
                upsert: false,
            }, (err, doc) => {
                if (err) {
                    log.error('internalDeleteObject: error getting object',
                        { bucket: bucketName, object: key, error: err.message });
                    return next(errors.InternalError);
                }
                if (!doc.value) {
                    log.error('internalDeleteObject: unable to find target object to delete',
                        { bucket: bucketName, object: key });
                    return next(errors.NoSuchKey);
                }
                const obj = doc.value;
                const objMetadata = new ObjectMD(obj.value);
                objMetadata.setOriginOp('s3:ObjectRemoved:Delete');
                // Not supported in 7.x
                // objMetadata.setDeleted(true);
                return next(null, objMetadata.getValue());
            }),
            // We update the full object to get the whole object metadata
            // in the oplog update event
            (objMetadata, next) => {
                const operations = [{
                    updateOne: {
                        filter: updateDeleteFilter,
                        update: {
                            $set: { _id: key, value: objMetadata },
                        },
                        upsert: false,
                    },
                }];

                // Add the delete operation if the shouldDelete flag is true
                operations.push({
                    deleteOne: {
                        filter: updateDeleteFilter,
                    },
                });
                collection.bulkWrite(operations, { ordered: true }, () => next(null));
            },
        ], (err, res) => {
            if (err) {
                if (err.is.NoSuchKey) {
                    return cb(err);
                }
                log.error('internalDeleteObject: error deleting object',
                    { bucket: bucketName, object: key, error: err.message });
                return cb(errors.InternalError);
            }
            return cb(null, res);
        });
    }

    /**
     * Deletes object metadata
     * @param {String} bucketName bucket name
     * @param {String} objName object name
     * @param {Object} params params
     * @param {String} params.versionId object version (optional)
     * @param {Object} log logger
     * @param {Function} cb callback
     * @return {undefined}
     */
    deleteObject(bucketName, objName, params, log, cb) {
        const c = this.getCollection(bucketName);
        const _params = Object.assign({}, params);
        return this.getBucketVFormat(bucketName, log, (err, vFormat) => {
            if (err) {
                return cb(err);
            }
            _params.vFormat = vFormat;
            if (_params && _params.versionId) {
                return this.deleteObjectVer(c, bucketName, objName,
                    _params, log, cb);
            }
            return this.deleteObjectNoVer(c, bucketName, objName,
                _params, log, cb);
        });
    }

    /**
     * internal listing function for buckets
     * @param {String} bucketName bucket name
     * @param {Object} params internal listing params
     * @param {Object} params.mainStreamParams internal listing param applied
     * to the main listing stream (master stream when we have the two streams)
     * @param {Object} params.secondaryStreamParams internal listing param applied
     * to the secondary stream (versionStream when having two streams) (is optional)
     * @param {Object} params.mongifiedSearch search options
     * @param {Object} extension listing extention
     * @param {String} vFormat bucket format version
     * @param {Object} log logger
     * @param {Function} cb callback
     * @return {undefined}
     */
    internalListObject(bucketName, params, extension, vFormat, log, cb) {
        const c = this.getCollection(bucketName);
        const getLatestVersion = this.getLatestVersion;
        let stream;
        if (!params.secondaryStreamParams) {
            // listing masters only (DelimiterMaster)
            stream = new MongoReadStream(c, params.mainStreamParams, params.mongifiedSearch);
            if (vFormat === BUCKET_VERSIONS.v1) {
                /**
                 * When listing masters only in v1 we can't just skip PHD
                 * we have to replace them with the latest version of
                 * the object.
                 * Here we use a trasform stream that we pipe with the
                 * mongo read steam and that checks and replaces the key
                 * read if it's a PHD
                 *  */
                const resolvePhdKey = new Transform({
                    objectMode: true,
                    transform(obj, encoding, callback) {
                        if (Version.isPHD(obj.value)) {
                            const key = obj.key.slice(DB_PREFIXES.Master.length);
                            getLatestVersion(c, key, BUCKET_VERSIONS.v1, log, (err, version) => {
                                if (err) {
                                    // ignoring PHD keys with no versions as all versions
                                    // might get deleted before the PHD key gets resolved by the listing
                                    // function
                                    if (err.is.NoSuchKey) {
                                        return callback(null);
                                    }
                                    log.error(
                                        'internalListObjectV1: error while getting latest version of PHD key',
                                        { error: err.message });
                                    return callback(errors.InternalError);
                                }
                                MongoUtils.unserialize(version);
                                // we keep the master key and only replace the value
                                const latestVersion = {
                                    key: obj.key,
                                    value: JSON.stringify(version),
                                };
                                return callback(null, latestVersion);
                            });
                        } else {
                            callback(null, obj);
                        }
                    },
                });
                stream = stream.pipe(resolvePhdKey);
            }
        } else {
            // listing both master and version keys (delimiterVersion Algo)
            const masterStream = new MongoReadStream(c, params.mainStreamParams, params.mongifiedSearch);
            const versionStream = new MongoReadStream(c, params.secondaryStreamParams, params.mongifiedSearch);
            stream = new MergeStream(
                versionStream, masterStream, extension.compareObjects.bind(extension));
        }
        const gteParams = params.secondaryStreamParams ?
            [params.mainStreamParams.gte, params.secondaryStreamParams.gte] : params.mainStreamParams.gte;
        const skip = new Skip({
            extension,
            gte: gteParams,
        });
        const cbOnce = jsutil.once(cb);
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

            if (params.secondaryStreamParams) {
                // eslint-disable-next-line no-param-reassign
                newParams.mainStreamParams.gte = range[0];
                newParams.secondaryStreamParams.gte = range[1];
            } else {
                // eslint-disable-next-line no-param-reassign
                newParams.mainStreamParams.gte = range;
            }
            // then continue listing the next key range
            this.internalListObject(bucketName, newParams, extension, vFormat, log, cb);
        });
        stream
            .on('data', entry => {
                skip.filter(entry);
            })
            .on('error', err => {
                const logObj = {
                    rawError: err,
                    error: err.message,
                    errorStack: err.stack,
                };
                log.error(
                    'internalListObjectV1: error listing objects', logObj);
                cbOnce(errors.InternalError);
            })
            .on('end', () => {
                const data = extension.result();
                cbOnce(null, data);
            });
        return undefined;
    }

    /**
     * lists versioned and non versioned objects in a bucket
     * @param {String} bucketName bucket name
     * @param {Object} params params
     * @param {String} params.listingType type of algorithm to use (optional)
     * @param {Number} params.maxKeys maximum number of keys to list (optional)
     * @param {String} params.prefix prefix of objects to use (optional)
     * @param {String} params.delimiter delimiter to use (optional)
     * @param {Object} params.mongifiedSearch search options (optional)
     * @param {Object} log logger
     * @param {Function} cb callback
     * @return {undefined}
     */
    listObject(bucketName, params, log, cb) {
        return this.getBucketVFormat(bucketName, log, (err, vFormat) => {
            if (err) {
                return cb(err);
            }
            const extName = params.listingType;
            // extention here can either be DelimiterMaster ot DelimiterVersions
            const extension = new listAlgos[extName](params, log, vFormat);
            // the params returned depend on the vFormat as well as the algorithm used
            // DelimiterMaster returns an object of filters to apply when filtering
            // DelimiterVersions in v0 also returns the same thing
            // in v1 however it returns two objects containing filters to use for two separate
            // listing streams (master and version)
            const extensionParams = extension.genMDParams();
            const internalParams = {
                mainStreamParams: Array.isArray(extensionParams) ? extensionParams[0] : extensionParams,
                secondaryStreamParams: Array.isArray(extensionParams) ? extensionParams[1] : null,
            };
            internalParams.mongifiedSearch = params.mongifiedSearch;
            return this.internalListObject(bucketName, internalParams, extension,
                vFormat, log, cb);
        });
    }

    /**
     * lists versionned and non versionned objects in a bucket
     * @param {String} bucketName bucket name
     * @param {Object} params params
     * @param {String} params.listingType type of algorithm to use (optional)
     * @param {Number} params.maxKeys maximum number of keys to list (optional)
     * @param {String} params.prefix prefix of objects to use (optional)
     * @param {String} params.delimiter delimiter to use (optional)
     * @param {Object} params.mongifiedSearch search options (optional)
     * @param {Object} log logger
     * @param {Function} cb callback
     * @return {undefined}
     */
    listMultipartUploads(bucketName, params, log, cb) {
        const extName = params.listingType;
        const extension = new listAlgos[extName](params, log);
        const extensionParams = extension.genMDParams();
        const internalParams = {
            mainStreamParams: extensionParams,
            mongifiedSearch: params.mongifiedSearch,
        };
        return this.internalListObject(bucketName, internalParams, extension,
            BUCKET_VERSIONS.v0, log, cb);
    }

    checkHealth(implName, log, cb) {
        const resp = {};
        if (this.client && this.client.isConnected()) {
            resp[implName] = errors.ok;
            return cb(null, resp);
        }
        log.error('disconnected from mongodb');
        resp[implName] = {
            error: errors.ServiceUnavailable,
            code: errors.ServiceUnavailable.code,
        };
        return cb(null, resp);
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
                if (err.is.InternalError) {
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

    readCountItems(log, cb) {
        const i = this.getCollection(INFOSTORE);
        i.findOne({
            _id: __COUNT_ITEMS,
        }, {}, (err, doc) => {
            if (err) {
                log.error('readCountItems: error reading count items', {
                    error: err.message,
                });
                return cb(errors.InternalError);
            }
            if (!doc) {
                // defaults
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
                return cb(null, res);
            }
            return cb(null, doc.value);
        });
    }

    updateCountItems(value, log, cb) {
        const i = this.getCollection(INFOSTORE);
        i.update({
            _id: __COUNT_ITEMS,
        }, {
            _id: __COUNT_ITEMS,
            value,
        }, {
            upsert: true,
        }, err => {
            if (err) {
                log.error('updateCountItems: error updating count items', {
                    error: err.message,
                });
                return cb(errors.InternalError);
            }
            return cb();
        });
    }

    /*
     * return true if it a special collection and therefore
     * does not need to be collected for infos
     */
    _isSpecialCollection(name) {
        return name === METASTORE ||
            name === INFOSTORE ||
            name === USERSBUCKET ||
            name === PENSIEVE ||
            name.startsWith(constants.mpuBucketPrefix) ||
            name.startsWith('__');
    }

    /*
     * get bucket related information for count items, used by cloudserver
     * and s3utils
     */
    getBucketInfos(log, cb) {
        let bucketCount = 0;
        const bucketInfos = [];

        this.db.listCollections().toArray((err, collInfos) => {
            if (err) {
                log.error('could not get list of collections', {
                    method: '_getBucketInfos',
                    error: err,
                });
                return cb(err);
            }
            return async.eachLimit(collInfos, 10, (value, next) => {
                if (this._isSpecialCollection(value.name)) {
                    // skip
                    return next();
                }
                bucketCount++;
                const bucketName = value.name;
                // FIXME: there is currently no way of distinguishing
                // master from versions and searching for VID_SEP
                // does not work because there cannot be null bytes
                // in $regex

                return this.getBucketAttributes(bucketName, log,
                    (err, bucketInfo) => {
                        if (err) {
                            log.error('failed to get bucket attributes', {
                                bucketName,
                                error: err,
                            });
                            return next(errors.InternalError);
                        }
                        bucketInfos.push(bucketInfo);
                        return next();
                    });
            }, err => {
                if (err) {
                    return cb(err);
                }
                return cb(null, {
                    bucketCount,
                    bucketInfos,
                });
            });
        });
    }

    countItems(log, cb) {
        this.getBucketInfos(log, (err, res) => {
            if (err) {
                log.error('error getting bucket info', {
                    method: 'countItems',
                    error: err,
                });
                return cb(err);
            }
            const { bucketCount, bucketInfos } = res;

            const retBucketInfos = bucketInfos.map(bucket => ({
                name: bucket.getName(),
                location: bucket.getLocationConstraint(),
                isVersioned: !!bucket.getVersioningConfiguration(),
                ownerCanonicalId: bucket.getOwner(),
                ingestion: bucket.isIngestionBucket(),
            }));

            return this.readCountItems(log, (err, results) => {
                if (err) {
                    return cb(err);
                }
                // overwrite bucket info since we have latest info
                /* eslint-disable */
                results.bucketList = retBucketInfos;
                results.buckets = bucketCount;
                /* eslint-enable */
                return cb(null, results);
            });
        });
    }

    consolidateData(store, dataManaged) {
        /* eslint-disable */
        if (dataManaged && dataManaged.locations && dataManaged.total) {
            const locations = dataManaged.locations;
            store.dataManaged.total.curr += dataManaged.total.curr;
            store.dataManaged.total.prev += dataManaged.total.prev;
            Object.keys(locations).forEach(site => {
                if (!store.dataManaged.byLocation[site]) {
                    store.dataManaged.byLocation[site] =
                        Object.assign({}, locations[site]);
                } else {
                    store.dataManaged.byLocation[site].curr +=
                        locations[site].curr;
                    store.dataManaged.byLocation[site].prev +=
                        locations[site].prev;
                }
            });
        }
        /* eslint-enable */
    }

    scanItemCount(log, cb) {
        const store = {
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

        const consolidateData = dataManaged =>
            this.consolidateData(store, dataManaged);

        this.getBucketInfos(log, (err, res) => {
            if (err) {
                log.error('error getting bucket info', {
                    method: 'scanItemCount',
                    error: err,
                });
                return cb(err);
            }

            const { bucketCount, bucketInfos } = res;
            const retBucketInfos = bucketInfos.map(bucket => ({
                name: bucket.getName(),
                location: bucket.getLocationConstraint(),
                isVersioned: !!bucket.getVersioningConfiguration(),
                ownerCanonicalId: bucket.getOwner(),
                ingestion: bucket.isIngestionBucket(),
            }));

            store.buckets = bucketCount;
            store.bucketList = retBucketInfos;

            return async.eachLimit(bucketInfos, this.concurrentCursors,
                (bucketInfo, done) => {
                    async.waterfall([
                        next => this._getIsTransient(bucketInfo, log, next),
                        (isTransient, next) => {
                            const bucketName = bucketInfo.getName();
                            this.getObjectMDStats(bucketName, bucketInfo,
                                isTransient, log, next);
                        },
                    ], (err, results) => {
                        if (err) {
                            return done(err);
                        }
                        if (results.dataManaged) {
                            store.objects += results.objects;
                            store.versions += results.versions;
                            store.stalled += results.stalled;
                            consolidateData(results.dataManaged);
                        }
                        return done();
                    });
                }, err => {
                    if (err) {
                        return cb(err);
                    }
                    // save to infostore
                    return this.updateCountItems(store, log, err => {
                        if (err) {
                            log.error('error saving count items in mongo', {
                                method: 'scanItemCount',
                                error: err,
                            });
                            return cb(err);
                        }
                        return cb(null, store);
                    });
                });
        });
        return undefined;
    }

    _getIsTransient(bucketInfo, log, cb) {
        const locConstraint = bucketInfo.getLocationConstraint();

        if (this.isLocationTransient) {
            this.isLocationTransient(locConstraint, log, cb);
            return;
        }
        this._pensieveLocationIsTransient(locConstraint, log, cb);
    }

    _pensieveLocationIsTransient(locConstraint, log, cb) {
        const overlayVersionId = 'configuration/overlay-version';

        async.waterfall([
            next => this.getObject(PENSIEVE, overlayVersionId, {}, log, next),
            (version, next) => {
                const overlayConfigId = `configuration/overlay/${version}`;
                return this.getObject(PENSIEVE, overlayConfigId, {}, log, next);
            },
        ], (err, res) => {
            if (err) {
                log.error('error getting configuration overlay', {
                    method: '_getIsTransient',
                    error: err,
                });
                return cb(err);
            }
            const isTransient =
                Boolean(res.locations[locConstraint].isTransient);

            return cb(null, isTransient);
        });
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

    /**
     * @param{object} entry -
     * @param{string} entry._id -
     * @param{object} entry.value -
     * @param{boolean} isTransient -
     * @returns{object.<string, number>} results -
     */
    _processEntryData(entry, isTransient) {
        const results = {};

        const size = Number.parseInt(entry.value['content-length'], 10);
        if (Number.isNaN(size)) {
            return {
                data: {},
                error: new Error('invalid content length'),
            };
        }

        if (!isTransient ||
            entry.value.replicationInfo.status !== 'COMPLETED') {
            if (results[entry.value.dataStoreName]) {
                results[entry.value.dataStoreName] += size;
            } else {
                results[entry.value.dataStoreName] = size;
            }
        } else {
            if (!results[entry.value.dataStoreName]) {
                results[entry.value.dataStoreName] = 0;
            }
        }
        entry.value.replicationInfo.backends.forEach(rep => {
            if (rep.status === 'COMPLETED') {
                if (results[rep.site]) {
                    results[rep.site] += size;
                } else {
                    results[rep.site] = size;
                }
            }
        });
        return {
            data: results,
            error: null,
        };
    }

    /**
     * @param{object} entry -
     * @param{string} entry._id -
     * @param{object} entry.value -
     * @param{Date} cmpDate -
     * @returns{boolean} stalled -
     */
    _isReplicationEntryStalled(entry, cmpDate) {
        if (entry.value.replicationInfo.status !== 'PENDING') {
            return false;
        }
        const lastModified = Date.parse(entry.value['last-modified'] || null);
        if (isNaN(lastModified) || new Date(lastModified) > cmpDate) {
            return false;
        }
        return true;
    }

    /*
     * scan and process a single collection (bucket)
     */
    getObjectMDStats(bucketName, bucketInfo, isTransient, log, callback) {
        const c = this.getCollection(bucketName);
        const cursor = c.find({}, {
            projection: {
                '_id': 1,
                'value.last-modified': 1,
                'value.replicationInfo': 1,
                'value.dataStoreName': 1,
                'value.content-length': 1,
                'value.versionId': 1,
            },
        });
        const collRes = {
            masterCount: 0,
            masterData: {},
            nullCount: 0,
            nullData: {},
            versionCount: 0,
            versionData: {},
        };
        let stalledCount = 0;
        const cmpDate = new Date();
        cmpDate.setHours(cmpDate.getHours() - 1);

        cursor.forEach(
            res => {
                const { data, error } = this._processEntryData(res, isTransient);

                if (error) {
                    log.error('Failed to process entry data', {
                        method: 'getObjectMDStats',
                        entry: res,
                        error,
                    });
                }

                let targetCount;
                let targetData;
                if (res._id.indexOf('\0') !== -1) {
                    // versioned item
                    targetCount = 'versionCount';
                    targetData = 'versionData';

                    if (res.value.replicationInfo.backends.length > 0 &&
                        this._isReplicationEntryStalled(res, cmpDate)) {
                        stalledCount++;
                    }
                } else if (!!res.value.versionId) {
                    // master version
                    targetCount = 'masterCount';
                    targetData = 'masterData';
                } else {
                    // null version
                    targetCount = 'nullCount';
                    targetData = 'nullData';
                }
                collRes[targetCount]++;
                Object.keys(data).forEach(site => {
                    if (collRes[targetData][site]) {
                        collRes[targetData][site] += data[site];
                    } else {
                        collRes[targetData][site] = data[site];
                    }
                });
            },
            err => {
                if (err) {
                    log.error('Error when processing mongo entries', {
                        method: 'getObjectMDStats',
                        error: err,
                    });
                    return callback(err);
                }
                const bucketStatus = bucketInfo.getVersioningConfiguration();
                const isVer = (bucketStatus &&
                    (bucketStatus.Status === 'Enabled' ||
                    bucketStatus.Status === 'Suspended'));
                const retResult = this._handleResults(collRes, isVer);
                retResult.stalled = stalledCount;
                return callback(null, retResult);
            },
        );
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

    /*
     * delete an object that matches a given conditions object
     */
    deleteObjectWithCond(bucketName, objName, params, log, cb) {
        const c = this.getCollection(bucketName);
        const method = 'deleteObjectWithCond';
        this.getBucketVFormat(bucketName, log, (err, vFormat) => {
            if (err) {
                return cb(err);
            }
            const masterKey = formatMasterKey(objName, vFormat);
            const filter = {};
            try {
                MongoUtils.translateConditions(0, 'value', filter,
                    params.conditions);
            } catch (err) {
                log.error('error creating mongodb filter', {
                    error: reshapeExceptionError(err),
                });
                return cb(errors.InternalError);
            }
            return this.internalDeleteObject(c, bucketName, masterKey, filter, log,
                err => {
                    if (err) {
                        // unable to find an object that matches the conditions
                        if (err.is.NoSuchKey) {
                            log.error('unable to find target object to delete', {
                                method,
                                filter,
                            });
                            return cb(errors.NoSuchKey);
                        }
                        log.error('error occurred when attempting to delete object', {
                            method,
                            error: err.message,
                        });
                        return cb(errors.InternalError);
                    }
                    return cb();
                });
        });
    }

    /*
     * update an object that matches the given conditions. If one cannot be
     * found, a new object will be upserted
     */
    putObjectWithCond(bucketName, objName, objVal, params, log, cb) {
        const c = this.getCollection(bucketName);
        const method = 'putObjectWithCond';
        this.getBucketVFormat(bucketName, log, (err, vFormat) => {
            if (err) {
                return cb(err);
            }
            const masterKey = formatMasterKey(objName, vFormat);
            const filter = { _id: masterKey };
            try {
                MongoUtils.translateConditions(0, 'value', filter,
                    params.conditions);
            } catch (err) {
                log.error('error creating mongodb filter', {
                    error: reshapeExceptionError(err),
                });
                return cb(errors.InternalError);
            }
            return c.findOneAndUpdate(filter, {
                $set: {
                    _id: masterKey,
                    value: objVal,
                },
            }, {
                upsert: true,
            }, (err, res) => {
                if (err) {
                    log.error('error occurred when attempting to update object', {
                        method,
                        error: err,
                    });
                    return cb(errors.InternalError);
                }
                if (res.ok !== 1) {
                    log.error('failed to update object', {
                        method,
                        error: err.message,
                    });
                    return cb(errors.InternalError);
                }
                if (!res.value) {
                    log.debug('object not found...upserted object', {
                        method,
                        filter,
                    });
                    return cb();
                }
                log.debug('Object found...updated object', {
                    method,
                    filter,
                });
                return cb();
            });
        });
    }
}

module.exports = MongoClientInterface;
