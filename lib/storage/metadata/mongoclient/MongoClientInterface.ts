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
import async from 'async';

import * as constants from '../../../constants';
import * as werelogs from 'werelogs';

import { ErrorLike, reshapeExceptionError } from '../../../errorUtils';
import errors, { ArsenalError, errorInstances } from '../../../errors';
import BucketInfo, { BucketMetadata, Capabilities } from '../../../models/BucketInfo';
import ObjectMD, { ObjectMDData } from '../../../models/ObjectMD';
import * as jsutil from '../../../jsutil';
import { ArsenalCallback } from '../../../types';

import { MongoClient, UpdateFilter, Long, MongoServerError } from 'mongodb';
import type {
    Db,
    MongoClientOptions,
    ReadPreferenceMode,
    WithId,
    Collection,
    AnyBulkWriteOperation,
    BulkWriteResult,
} from 'mongodb';

import { v4 as uuidv4 } from 'uuid';

import { generateVersionId as genVID } from '../../../versioning/VersionID';
import * as listAlgos from '../../../algos/list/exportAlgos';
import LRUCache from '../../../algos/cache/LRUCache';

import MongoReadStream from './readStream';
import * as MongoUtils from './utils';
import Skip from '../../../algos/list/skip';
import MergeStream from '../../../algos/stream/MergeStream';
import { Transform } from 'stream';
import { Version } from '../../../versioning/Version';

import { formatMasterKey, formatVersionKey } from './utils';
import { VeeamCapacityInfo, VeeamSOSApiSchema } from '../../../models/Veeam';
import { BucketVersioningFormat } from '../../../versioning/constants';

const VID_NONE = '';

const USERSBUCKET = '__usersbucket';
const METASTORE = '__metastore';
const INFOSTORE = '__infostore';
const __UUID = 'uuid';
const PENSIEVE = 'PENSIEVE';
const __COUNT_ITEMS = 'countitems';
const ASYNC_REPAIR_TIMEOUT = 15000;

const MONGO_CONNECT_TIMEOUT_MS = process.env.MONGO_CONNECT_TIMEOUT_MS;
const MONGO_SOCKET_TIMEOUT_MS = process.env.MONGO_SOCKET_TIMEOUT_MS;
const MONGO_POOL_SIZE = process.env.MONGO_POOL_SIZE;
// MongoDB default
const CONNECT_TIMEOUT_MS = MONGO_CONNECT_TIMEOUT_MS ?
    Number.parseInt(MONGO_CONNECT_TIMEOUT_MS, 10) : 5000;
const SOCKET_TIMEOUT_MS = MONGO_SOCKET_TIMEOUT_MS ?
    Number.parseInt(MONGO_SOCKET_TIMEOUT_MS, 10) : 360000;

const initialInstanceID = process.env.INITIAL_INSTANCE_ID;

let uidCounter = 0;

const BUCKET_VERSIONS = require('../../../versioning/constants')
    .VersioningConstants.BucketVersioningKeyFormat;
const DEFAULT_BUCKET_KEY_FORMAT =
    [<string>BUCKET_VERSIONS.v0, <string>BUCKET_VERSIONS.v1]
        .includes(process.env.DEFAULT_BUCKET_KEY_FORMAT!) ?
            <BucketVersioningFormat>process.env.DEFAULT_BUCKET_KEY_FORMAT : BUCKET_VERSIONS.v1;

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

export type MongoDBClientInterfaceParameters = {
    replicaSetHosts: string,
    writeConcern: string,
    replicaSet: string,
    readPreference: ReadPreferenceMode,
    database: string,
    logger: werelogs.Logger,
    replicationGroupId: string,
    authCredentials: MongoUtils.AuthCredentials,
    shardCollections: boolean,
};

export type CapabilitiesMongoDB = Capabilities & {
    VeeamSOSApi?: Omit<VeeamSOSApiSchema, 'CapacityInfo'> & {
        CapacityInfo?: {
            Capacity: Long,
            Available: Long,
            Used: Long,
        },
    },
}

export type BucketMetadataMongoDB = Omit<Omit<BucketMetadata, 'quotaMax'>, 'capabilities'> & {
    // Old buckets might not have a quotaMax
    quotaMax?: Long,
    capabilities?: CapabilitiesMongoDB,
};

export interface BucketMetastoreDocument extends Document {
    _id: string;
    value: BucketMetadataMongoDB;
    vFormat?: BucketVersioningFormat;
}

export interface ObjectMetastoreDocument extends Document {
    _id: string;
    value: ObjectMDData;
};

export type ObjectMDOperationParams = {
    vFormat: string,
    versionId: string,
    repairMaster: boolean,
    versioning: boolean,
    needOplogUpdate: boolean,
    originOp: string,
    doesNotNeedOpogUpdate?: boolean,
    conditions: any,
};

export type InternalListObjectParams = {
    mainStreamParams: {
        gte: string;
    };
    secondaryStreamParams?: {
        gte: string;
    };
    mongifiedSearch?: object;
    listingType?: string;
    start?: undefined;
    gt?: undefined
};

export interface InfostoreDocument extends Document {
    _id: string | 'uuid';
    value?: string | ObjectMDStats,
    measuredOn?: string;
    objectCount?: {
        current: Long | number,
        _currentCold: Long | number,
        deleteMarker: Long | number,
        nonCurrent: Long | number,
        _nonCurrentCold: Long | number,
        _currentRestored: Long | number,
        _currentRestoring: Long | number,
        _nonCurrentRestored: Long | number,
        _nonCurrentRestoring: Long | number,
        _incompleteMPUUploads: Long | number,
    },
    usedCapacity?: {
        current: Long | number,
        _currentCold: Long | number,
        nonCurrent: Long | number,
        _nonCurrentCold: Long | number,
        _currentRestored: Long | number,
        _currentRestoring: Long | number,
        _nonCurrentRestored: Long | number,
        _nonCurrentRestoring: Long | number,
        _incompleteMPUParts: Long | number,
    },
    locations: {
        [key: string]: {
            usedCapacity: {
                current: Long | number,
                nonCurrent: Long | number,
                _currentCold: Long | number,
                _nonCurrentCold: Long | number,
                _currentRestored: Long | number,
                _currentRestoring: Long | number,
                _nonCurrentRestored: Long | number,
                _nonCurrentRestoring: Long | number,
                _inflightsPreScan: Long | number,
                _incompleteMPUParts: Long | number,
            },
            objectCount: {
                current: Long | number,
                nonCurrent: Long | number,
                _currentCold: Long | number,
                _nonCurrentCold: Long | number,
                _currentRestored: Long | number,
                _currentRestoring: Long | number,
                _nonCurrentRestored: Long | number,
                _nonCurrentRestoring: Long | number,
                _incompleteMPUUploads: Long | number,
                deleteMarker: Long | number,
            },
        },
    },
};

export type ObjectMDStats = {
    versions: number;
    objects: any;
    dataManaged: {
        total: {
            curr: number;
            prev: number;
        };
        byLocation?: {};
    };
    bucketList?: {
        name: string;
        location: string | null;
        isVersioned: boolean;
        ownerCanonicalId: string;
        ingestion: boolean;
    }[],
    locations?: any;
    buckets?: number;
    bucketWithQuotaCount?: number;
    stalled: number;
};

/**
 * @constructor
 *
 * @param {MongoDBClientInterfaceParameters} params - constructor params
 */
class MongoClientInterface {
    private mongoUrl: string;
    private logger: werelogs.Logger;
    private client: MongoClient | null;
    private db: Db | null;
    private replicationGroupId: string;
    private database: string;
    private shardCollections: boolean;
    private bucketVFormatCache: LRUCache;
    private readonly defaultBucketKeyFormat: BucketVersioningFormat;
    private cacheHit: number;
    private cacheMiss: number;
    private cacheHitMissLoggerInterval: NodeJS.Timer | null;
    private adminDb: Db | null;

    private isConnected = false;

    // Optimization configuration
    private readonly OPTIM_BATCH = process.env.OPTIM_BATCH === 'true';
    private readonly BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '100', 10);

    // Batch operation handling
    private batchOperations: Map<string, { 
        operations: AnyBulkWriteOperation<ObjectMetastoreDocument>[], 
        callbacks: Array<{
            cb: ArsenalCallback<any>,
            params: any
        }> 
    }> = new Map();
    private batchTimeouts: Map<string, NodeJS.Timeout> = new Map();

    constructor(params: MongoDBClientInterfaceParameters) {
        const { replicaSetHosts, writeConcern, replicaSet, readPreference,
            database, logger, replicationGroupId, authCredentials,
            shardCollections } = params;
        const cred = MongoUtils.credPrefix(authCredentials);
        this.mongoUrl = `mongodb://${cred}${replicaSetHosts}/` +
            `?w=${writeConcern}&readPreference=${readPreference}`;

        if (!shardCollections) {
            this.mongoUrl += `&replicaSet=${replicaSet}`;
        }

        this.client = null;
        this.db = null;
        this.adminDb = null;
        this.logger = logger;
        this.replicationGroupId = replicationGroupId;
        this.database = database;
        this.shardCollections = shardCollections;

        this.bucketVFormatCache = new LRUCache(constants.maxCachedBuckets);
        this.defaultBucketKeyFormat = DEFAULT_BUCKET_KEY_FORMAT;

        this.cacheHit = 0;
        this.cacheMiss = 0;
        this.cacheHitMissLoggerInterval = null;
    }

    setup(cb: Function) {
        // FIXME: constructors shall not have side effect so there
        // should be an async_init(cb) method in the wrapper to
        // initialize this backend
        if ((MONGO_CONNECT_TIMEOUT_MS && Number.isNaN(MONGO_CONNECT_TIMEOUT_MS)) ||
            (MONGO_SOCKET_TIMEOUT_MS && Number.isNaN(MONGO_SOCKET_TIMEOUT_MS))) {
            this.logger.error('MongoDB connect and socket timeouts must be a ' +
                'number. Using default value(s).');
        }
        const connectTimeoutMS = CONNECT_TIMEOUT_MS;
        const socketTimeoutMS = SOCKET_TIMEOUT_MS;
        const options: MongoClientOptions = {
            connectTimeoutMS,
            socketTimeoutMS,
        };
        if (MONGO_POOL_SIZE && !Number.isNaN(MONGO_POOL_SIZE)) {
            options.minPoolSize = Number.parseInt(MONGO_POOL_SIZE, 10);
            options.maxPoolSize = Number.parseInt(MONGO_POOL_SIZE, 10);
        }
        const client = new MongoClient(this.mongoUrl, options);

        return client.connect()
            .then(client => {
                this.logger.info('connected to mongodb');
                this.client = client;
                this.isConnected = true;
                this.db = client.db(this.database, {
                    ignoreUndefined: true,
                });
                this.adminDb = client.db('admin');
                // log cache hit/miss every 5min
                this.cacheHitMissLoggerInterval = setInterval(() => {
                    const hitRatio = (this.cacheHit / (this.cacheHit + this.cacheMiss)) || 0;
                    this.logger.debug('MongoClientInterface: Bucket vFormat cache hit/miss (5min)',
                        { hits: this.cacheHit, misses: this.cacheMiss, hitRatio: hitRatio.toFixed(3) });
                    this.cacheHit = 0;
                    this.cacheMiss = 0;
                }, 300000);

                this.client.on('close', reason => {
                    this.logger.error('disconnected from MongoDB', { reason });
                    this.isConnected = false;
                });
                return this.usersBucketHack(cb);
            })
            .catch(err => {
                this.logger.error('error connecting to mongodb', { error: err.message });
                return cb(errors.InternalError);
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
            if (this.cacheHitMissLoggerInterval) {
                clearInterval(this.cacheHitMissLoggerInterval as NodeJS.Timeout);
            }
            
            // Execute any pending batches before closing
            this.executeAllBatches();
            
            return this.client.close(true)
                .then(() => cb())
                .catch(() => cb());
        }
        return cb();
    }

    getCollection<T extends Document>(name): Collection<T> {
        /* mongo has a problem with .. in collection names */
        const newName = (name === constants.usersBucket) ?
            USERSBUCKET : name;
        return this.db!.collection<T>(newName);
    }

    /**
     * Creates a bucket with the provided metadata
     * @param {string} bucketName bucket name
     * @param {Object} bucketMD bucket metadata
     * @param {Object} log logger
     * @param {Function} cb callback
     * @return {undefined}
     */
    createBucket(bucketName: string, bucketMD: BucketInfo, log: werelogs.Logger, cb: ArsenalCallback<void>) {
        // FIXME: there should be a version of BucketInfo.serialize()
        // that does not JSON.stringify()
        const newBucketMD = (
            bucketMD instanceof BucketInfo ? bucketMD : BucketInfo.fromObj(bucketMD)
        ).makeSerializable();
        const m = this.getCollection<BucketMetastoreDocument>(METASTORE);

        const payload = {
            $set: {
                _id: bucketName,
                value: {
                    ...newBucketMD,
                    quotaMax: new Long(newBucketMD.quotaMax || '0'),
                    capabilities: undefined,
                },
                vFormat: this.defaultBucketKeyFormat,
            },
        };
        if (bucketName !== constants.usersBucket &&
            bucketName !== PENSIEVE &&
            !bucketName.startsWith(constants.mpuBucketPrefix)) {
            payload.$set.vFormat = this.defaultBucketKeyFormat;
        } else {
            payload.$set.vFormat = BUCKET_VERSIONS.v0;
        }

        // we don't have to test bucket existence here as it is done
        // on the upper layers
        m.updateOne({
            _id: bucketName,
        }, payload, {
            upsert: true,
        })
            .then(() => {
                // caching bucket vFormat
                this.bucketVFormatCache.add(bucketName, payload.$set.vFormat);
                // NOTE: We do not need to create a collection for
                // "constants.usersBucket" and "PENSIEVE" since it has already
                // been created
                if (bucketName !== constants.usersBucket && bucketName !== PENSIEVE) {
                    return this.db!.createCollection(bucketName)
                        .then(() => {
                            if (this.shardCollections) {
                                const cmd = {
                                    shardCollection: `${this.database}.${bucketName}`,
                                    key: { _id: 1 },
                                };
                                return this.adminDb!.command(cmd, {}).then(() => cb(null)).catch(err => {
                                    log.error(
                                        'createBucket: enabling sharding',
                                        { error: err });
                                    return cb(errors.InternalError);
                                });
                            }
                            return cb(null);
                        });
                }
                return cb(null);
            })
            .catch(err => {
                log.error('createBucket: error creating bucket', { error: err.message });
                return cb(errors.InternalError);
            });
    }

    /**
     * Gets bucket metadata
     * @param {String} bucketName bucket name
     * @param {Object} log logger
     * @param {Function} cb callback
     * @return {undefined}
     */
    getBucketAttributes(bucketName: string, log: werelogs.Logger, cb: ArsenalCallback<BucketInfo>) {
        const m = this.getCollection<BucketMetastoreDocument>(METASTORE);
        m.findOne({
            _id: bucketName,
        })
            .then(doc => {
                if (!doc) {
                    return cb(errors.NoSuchBucket);
                }
                const bucketMetadata = {
                    ...doc.value,
                    quotaMax: doc.value.quotaMax?.toString() || '0',
                    capabilities: {
                        ...doc.value.capabilities,
                        VeeamSOSApi: doc.value.capabilities?.VeeamSOSApi && {
                            ...doc.value.capabilities.VeeamSOSApi,
                            // Long values are automatically serialized to strings
                            CapacityInfo: doc.value.capabilities.VeeamSOSApi.CapacityInfo &&
                                VeeamCapacityInfo.serialize(doc.value.capabilities.VeeamSOSApi.CapacityInfo),
                        },
                    },
                };
                return cb(null, BucketInfo.fromJson(bucketMetadata));
            })
            .catch(err => {
                log.error(
                    'getBucketAttributes: error getting bucket attributes',
                    { error: err.message });
                return cb(errors.InternalError);
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
    getBucketVFormat(bucketName: string, log: werelogs.Logger, cb: ArsenalCallback<BucketVersioningFormat>) {
        // retreiving vFormat from cache
        const cachedVFormat = this.bucketVFormatCache.get(bucketName);
        if (cachedVFormat) {
            this.cacheHit++;
            return cb(null, cachedVFormat);
        }
        this.cacheMiss++;
        const m = this.getCollection<BucketMetastoreDocument>(METASTORE);
        m.findOne({
            _id: bucketName,
        })
            .then(doc => {
                if (!doc) {
                    return cb(null, BUCKET_VERSIONS.v0);
                }
                const vFormat = doc.vFormat || BUCKET_VERSIONS.v0;
                this.bucketVFormatCache.add(bucketName, vFormat);
                return cb(null, vFormat);
            })
            .catch(err => {
                log.error(
                    'getBucketVFormat: error getting bucket vFormat',
                    { bucket: bucketName, error: err.message },
                );
                return cb(errors.InternalError);
            });
        return undefined;
    }

    getBucketAndObject(
        bucketName: string,
        objName: string,
        params: ObjectMDOperationParams,
        log: werelogs.Logger,
        cb: ArsenalCallback<{ bucket: string, obj?: string }>,
    ) {
        this.getBucketAttributes(bucketName, log, (err, bucket?) => {
            if (err) {
                log.error(
                    'getBucketAttributes: error getting bucket attributes',
                    { error: err.message });
                return cb(err);
            }
            this.getObject(bucketName, objName, params, log, (err, obj?) => {
                if (err) {
                    if (err.is.NoSuchKey) {
                        return cb(null,
                            {
                                bucket:
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

    putBucketAttributes(bucketName: string, bucketMD: BucketInfo, log: werelogs.Logger, cb: ArsenalCallback<void>) {
        // FIXME: there should be a version of BucketInfo.serialize()
        // that does not JSON.stringify()
        const bucketInfo = BucketInfo.fromObj(bucketMD);
        const bucketMDStr = bucketInfo.serialize();
        const newBucketMD = JSON.parse(bucketMDStr);
        // Quota must be stored as a Long to account for values larger than
        // Number.MAX_SAFE_INTEGER.

        newBucketMD.quotaMax = new Long(newBucketMD.quotaMax || 0);
        const m = this.getCollection<BucketMetastoreDocument>(METASTORE);
        m.updateOne({
            _id: bucketName,
        }, {
            $set: {
                _id: bucketName,
                value: newBucketMD,
            },
        }, {
            upsert: true,
        })
            .then(() => cb(null))
            .catch(err => {
                log.error(
                    'putBucketAttributes: error putting bucket attributes',
                    { error: err.message });
                return cb(errors.InternalError);
            });
    }

    /**
     *
     * @param {String} bucketName - name of bucket
     * @param {String} capabilityName - name of capability
     * @param {String} [capabilityField] - name of capability field
     * @param {Object} capability - capability object
     * @param {Sbject} log - logger
     * @param {Function} cb - callback
     * @return {undefined}
     */
    putBucketAttributesCapabilities(
        bucketName: string,
        capabilityName: string,
        capabilityField: string | null,
        capability: { [K in keyof Capabilities]: unknown },
        log: werelogs.Logger,
        cb: ArsenalCallback<void>,
    ) {
        const m = this.getCollection<BucketMetastoreDocument>(METASTORE);
        const updateString = capabilityField ?
            `value.capabilities.${capabilityName}.${capabilityField}` :
            `value.capabilities.${capabilityName}`;
        m.updateOne({
            _id: bucketName,
        }, {
            $set: {
                _id: bucketName,
                [updateString]: capability,
            },
        }, {
            upsert: true,
        }).then(() => cb(null)).catch(err => {
            log.error(
                'putBucketAttributesCapabilities: error putting bucket attributes',
                { error: err.message });
            return cb(errors.InternalError);
        });
    }

    /**
     * Delete bucket attributes capability
     * @param {String} bucketName - name of bucket
     * @param {String} capabilityName - name of capability
     * @param {String} [capabilityField] - name of capability field
     * @param {Object} log - logger
     * @param {Function} cb - callback
     * @return {undefined}
     **/
    deleteBucketAttributesCapability(
        bucketName: string,
        capabilityName: string,
        capabilityField: { [K in keyof Capabilities]: unknown },
        log: werelogs.Logger,
        cb: ArsenalCallback<void>,
    ) {
        const m = this.getCollection<BucketMetastoreDocument>(METASTORE);
        const updateString = capabilityField ?
            `value.capabilities.${capabilityName}.${capabilityField}` :
            `value.capabilities.${capabilityName}`;
        m.updateOne({
            _id: bucketName,
        }, {
            $unset: {
                [updateString]: '',
            },
        }).then(() => cb(null)).catch(err => {
            if (err) {
                log.error(
                    'deleteBucketAttributesCapability: error deleting bucket attributes',
                    { error: err.message });
                return cb(errors.InternalError);
            }
            return cb(null);
        });
    }

    /*
     * Delete bucket from metastore
     */
    deleteBucketStep2(bucketName: string, log: werelogs.Logger, cb: ArsenalCallback<void>) {
        const m = this.getCollection<BucketMetastoreDocument>(METASTORE);
        m.findOneAndDelete({
            _id: bucketName,
        } , {
            includeResultMetadata: true,
        })
            .then(result => {
                if (result.ok !== 1) {
                    log.error('deleteBucketStep2: failed deleting bucket');
                    return cb(errors.InternalError);
                }
                // removing cached bucket metadata
                this.bucketVFormatCache.remove(bucketName);
                return cb(null);
            })
            .catch(err => {
                log.error('deleteBucketStep2: error deleting bucket',
                    { error: err.message });
                return cb(errors.InternalError);
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
    deleteBucket(bucketName: string, log: werelogs.Logger, cb: ArsenalCallback<void>) {
        const c = this.getCollection<ObjectMetastoreDocument>(bucketName);
        c.drop({})
            .then(() => {
                this.deleteBucketStep2(bucketName, log, err => {
                    if (err) {
                        return cb(err);
                    }
                    return cb(null);
                });
            })
            .catch(err => {
                if (err.codeName === 'NamespaceNotFound') {
                    return this.deleteBucketStep2(bucketName, log, cb);
                }
                log.error('deleteBucket: error deleting bucket',
                    { error: err.message });
                return cb(errors.InternalError);
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
    updateDeleteMaster(isDeleteMarker: boolean, vFormat: string, 
        filter: any, update: any, upsert: boolean): AnyBulkWriteOperation<ObjectMetastoreDocument> {
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
    putObjectVerCase1(
        c: Collection<ObjectMetastoreDocument>,
        bucketName: string,
        objName: string,
        objVal: ObjectMDData,
        params: ObjectMDOperationParams,
        log: werelogs.Logger,
        cb: ArsenalCallback<string>,
        isRetry?: boolean,
    ) {
        const versionId = generateVersionId(this.replicationGroupId);
        objVal.versionId = versionId;
        const versionKey = formatVersionKey(objName, versionId, params.vFormat);
        const masterKey = formatMasterKey(objName, params.vFormat);
        // initiating array of operations with version creation
        const ops: AnyBulkWriteOperation<ObjectMetastoreDocument>[] = [{
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
        const masterOp = this.updateDeleteMaster(objVal.isDeleteMarker || false, params.vFormat, filter, update, true);
        ops.push(masterOp);
        c.bulkWrite(ops, {
            ordered: true,
        })
            .then(() => cb(null, `{"versionId": "${versionId}"}`))
            .catch(err => {
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
                        // This may be a race condition, when two different S3 Connector try to put the same
                        // version id
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
                    // Otherwise this error is expected, it means that two differents version was put at the
                    // same time
                    return cb(null, `{"versionId": "${versionId}"}`);
                }
                log.error('putObjectVerCase1: error putting object version', {
                    error: err.errmsg,
                });
                return cb(errors.InternalError);
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
    putObjectVerCase2(
        c: Collection<ObjectMetastoreDocument>,
        bucketName: string,
        objName: string,
        objVal: ObjectMDData,
        params: ObjectMDOperationParams,
        log: werelogs.Logger,
        cb: ArsenalCallback<string>,
    ) {
        const versionId = generateVersionId(this.replicationGroupId);
        objVal.versionId = versionId;
        const masterKey = formatMasterKey(objName, params.vFormat);
        c.updateOne({ _id: masterKey },
            { $set: { value: objVal }, $setOnInsert: { _id: masterKey } },
            { upsert: true },
        )
            .then(() => cb(null, `{"versionId": "${objVal.versionId}"}`))
            .catch(err => {
                log.error('putObjectVerCase2: error putting object version', { error: err.message });
                return cb(errors.InternalError);
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
    putObjectVerCase3(
        c: Collection<ObjectMetastoreDocument>,
        bucketName: string,
        objName: string,
        objVal: ObjectMDData,
        params: ObjectMDOperationParams,
        log: werelogs.Logger,
        cb: ArsenalCallback<string>,
    ) {
        objVal.versionId = params.versionId;
        const versionKey = formatVersionKey(objName, params.versionId, params.vFormat);
        const masterKey = formatMasterKey(objName, params.vFormat);

        const putObjectEntry = (ops, callback) => {
            c.bulkWrite(ops, {
                ordered: true,
            })
                .then(() => callback(null, `{"versionId": "${objVal.versionId}"}`))
                .catch(err => {
                    log.error('putObjectVerCase3: error putting object version', { error: err.message });
                    if (err.code === 11000) {
                        // We want duplicate key error logged however in
                        // case of the race condition mentioned above, the
                        // InternalError will allow for automatic retries
                        log.error('putObjectVerCase3:', errors.KeyAlreadyExists);
                        return callback(errors.InternalError);
                    }
                    return callback(errors.NoSuchVersion);
                });
        };

        c.findOne({ _id: masterKey }).then(checkObj => {
            const objUpsert = !checkObj;
            // initiating array of operations with version creation/update
            const ops: AnyBulkWriteOperation<ObjectMetastoreDocument>[] = [{
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

            c.findOne({ _id: versionKey }).then(verObj => {
                // existing versioned entry update.
                // if master entry doesn't exist, skip upsert of master
                if (verObj && !checkObj) {
                    putObjectEntry(ops, cb);
                    return null;
                }

                // updating or deleting master depending on the last version put
                // in v0 the master gets updated, in v1 the master gets deleted if version is
                // a delete marker or updated otherwise.
                const masterOp = this.updateDeleteMaster(
                    objVal.isDeleteMarker || false,
                    params.vFormat,
                    filter,
                    update,
                    objUpsert,
                );
                ops.push(masterOp);
                putObjectEntry(ops, cb);
                return null;
            }).catch(err => {
                log.error('putObjectVerCase3: mongoDB error finding object', { err });
                return cb(errors.InternalError);
            });
            return null;
        }).catch(err => {
            log.error('putObjectVerCase3: mongoDB error finding object', { err });
            return cb(errors.InternalError);
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
    putObjectVerCase4(
        c: Collection<ObjectMetastoreDocument>,
        bucketName: string,
        objName: string,
        objVal: ObjectMDData,
        params: ObjectMDOperationParams,
        log: werelogs.Logger,
        cb: ArsenalCallback<string>,
    ) {
        const versionKey = formatVersionKey(objName, params.versionId, params.vFormat);
        const masterKey = formatMasterKey(objName, params.vFormat);
        c.updateOne({
            _id: versionKey,
        }, {
            $set: {
                _id: versionKey,
                value: objVal,
            },
        }, {
            upsert: true,
        }).then(() => this.getLatestVersion(c, objName, params.vFormat, log, (err, mstObjVal?) => {
            if (err?.is.NoSuchKey) {
                return cb(err);
            }

            if (err) {
                log.error('getLatestVersion: getting latest version',
                    { error: err.message });
                return cb(err);
            }

            MongoUtils.serialize(mstObjVal);
            const ops: AnyBulkWriteOperation<ObjectMetastoreDocument>[] = [];
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
                    $gte: mstObjVal!.versionId,
                },
            };
            // values to update master
            const update = {
                $set: { _id: masterKey, value: mstObjVal },
            };
            // updating or deleting master depending on the last version put
            // in v0 the master gets updated, in v1 the master gets deleted if version is
            // a delete marker or updated otherwise.
            const masterOp = this.updateDeleteMaster(mstObjVal!.isDeleteMarker || false, params.vFormat, filter, update,
                true);
            ops.push(masterOp);
            return c.bulkWrite(ops, {
                ordered: true,
            }).then(() => cb(null, `{"versionId": "${objVal.versionId}"}`)).catch(err => {
                // we accept that the update fails if
                // condition is not met, meaning that a more
                // recent master was already in place
                if (err.code === 11000) {
                    return cb(null, `{"versionId": "${objVal.versionId}"}`);
                }
                log.error('putObjectVerCase4: error upserting master', { error: err.message });
                return cb(errors.InternalError);
            });
        })).catch(err => {
            log.error(
                'putObjectVerCase4: error upserting object version',
                { error: err.message });
            return cb(errors.InternalError);
        });
    }
    /**
     * Puts an object into a MongoDB collection.
     * Depending on the parameters, the object is either directly put into the collection
     * or the existing object is marked as deleted and a new object is inserted.
     *
     * @param {Object} collection - The MongoDB collection to put the object into.
     * @param {string} bucketName - The name of the bucket the object belongs to.
     * @param {string} objName - The name of the object.
     * @param {Object} value - The value of the object.
     * @param {Object} params - Additional parameters.
     * @param {string} params.vFormat - object key format.
     * @param {boolean} params.needOplogUpdate - If true, the object is directly put into the collection
     * with updating the operation log.
     * @param {Object} log - The logger to use.
     * @param {Function} cb - The callback function to call when the operation is complete. It is called with an error
     * if there is an issue with the operation.
     * @returns {Promise} A promise that resolves when the operation is complete. The promise is rejected with an error
     * if there is an issue with the operation.
     */
    putObjectNoVer(
        collection: Collection<ObjectMetastoreDocument>,
        bucketName: string,
        objName: string,
        value: ObjectMDData,
        params: ObjectMDOperationParams,
        log: werelogs.Logger,
        cb: ArsenalCallback<void>,
    ) {
        if (params?.needOplogUpdate) {
            return this.putObjectNoVerWithOplogUpdate(collection, bucketName, objName, value, params, log, cb);
        }
        const key = formatMasterKey(objName, params.vFormat);
        const putFilter = { _id: key };
        
        // Use batching if enabled
        if (this.OPTIM_BATCH) {
            const operation = {
                updateOne: {
                    filter: putFilter,
                    update: {
                        $set: {
                            _id: key,
                            value,
                        },
                    },
                    upsert: true,
                }
            };
            
            const added = this.addToBatch(bucketName, operation, cb, null);
            if (added) {
                return;
            }
        }
        
        // If not using batching, proceed with the regular operation
        return collection.updateOne(putFilter, {
            $set: {
                _id: key,
                value,
            },
        }, {
            upsert: true,
        }).then(() => cb(null)).catch(err => {
            log.error('putObjectNoVer: error putting obect with no versioning', { error: err.message });
            return cb(errors.InternalError);
        });
    }

    /**
     * Updates an object in a MongoDB collection without changing its version.
     * If the object doesn't exist, it will be created (upsert is true for the second update operation).
     * The operation is logged in the oplog.
     *
     * @param {Object} collection - The MongoDB collection to update the object in.
     * @param {string} bucketName - The name of the bucket the object belongs to.
     * @param {string} objName - The name of the object.
     * @param {Object} value - The new value of the object.
     * @param {Object} params - Additional parameters.
     * @param {string} params.vFormat - object key format
     * @param {string} params.originOp - origin operation
     * @param {Object} log - The logger to use.
     * @param {Function} cb - The callback function to call when the operation is complete.
     * It is called with an error if there is an issue with the operation.
     * @returns {void}
     */
    putObjectNoVerWithOplogUpdate(
        collection: Collection<ObjectMetastoreDocument>,
        bucketName: string,
        objName: string,
        value: ObjectMDData,
        params: ObjectMDOperationParams,
        log: werelogs.Logger,
        cb: ArsenalCallback<void>,
    ) {
        const key = formatMasterKey(objName, params.vFormat);
        const putFilter = { _id: key };
        // filter used when finding and updating object
        const findFilter = {
            ...putFilter,
            $or: [
                { 'value.deleted': { $exists: false } },
                { 'value.deleted': { $eq: false } },
            ],
        };
        const updateDeleteFilter = {
            ...putFilter,
            'value.deleted': true,
        };
        return async.waterfall([
            // Adding delete flag when getting the object
            // to avoid having race conditions.
            next => collection.findOneAndUpdate(findFilter, {
                $set: updateDeleteFilter,
            }, {
                upsert: false,
            }).then(doc => {
                if (!doc?.value) {
                    log.error('internalPutObject: unable to find target object to update',
                        { bucket: bucketName, object: key });
                    return next(errors.NoSuchKey);
                }
                const obj = doc.value;
                const objMetadata = new ObjectMD(obj);
                objMetadata.setOriginOp(params.originOp);
                objMetadata.setDeleted(true);
                return next(null, objMetadata.getValue());
            }).catch(err => {
                log.error('internalPutObject: error getting object',
                    { bucket: bucketName, object: key, error: err.message });
                return next(errors.InternalError);
            }),
            // We update the full object to get the whole object metadata
            // in the oplog update event
            (objMetadata, next) => collection.bulkWrite([
                {
                    updateOne: {
                        filter: updateDeleteFilter,
                        update: {
                            $set: { _id: key, value: objMetadata },
                        },
                        upsert: false,
                    },
                },
                {
                    updateOne: {
                        filter: putFilter,
                        update: {
                            $set: { _id: key, value },
                        },
                        upsert: true,
                    },
                },
            ], { ordered: true }).then(() => next(null)).catch(next),
        ], err => {
            if (err) {
                log.error('internalPutObject: error updating object',
                    { bucket: bucketName, object: key, error: err.message });
                return cb(errors.InternalError);
            }
            return cb(null);
        });
    }
    /**
     * Returns the putObjectVerCase function to use
     * depending on params
     * @param {Object} params params
     * @return {Function} suitable putObjectVerCase function
     */
    getPutObjectVerStrategy(params: ObjectMDOperationParams): Function {
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
    putObject(
        bucketName: string,
        objName: string,
        objVal: ObjectMDData,
        params: ObjectMDOperationParams,
        log: werelogs.Logger,
        cb: ArsenalCallback<string | void>,
    ): void {
        MongoUtils.serialize(objVal);
        const c = this.getCollection<ObjectMetastoreDocument>(bucketName);
        const _params = Object.assign({}, params);
        return this.getBucketVFormat(bucketName, log, (err, vFormat?) => {
            if (err) {
                return cb(err);
            }
            if (vFormat) {
                _params.vFormat = vFormat;
            }
            if (params) {
                const putObjectVer = this.getPutObjectVerStrategy(params)
                    .bind(this);
                return putObjectVer(c, bucketName, objName, objVal, _params, log, cb);
            }
            return this.putObjectNoVer(c, bucketName, objName, objVal, _params, log, cb);
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
    getObject(
        bucketName: string,
        objName: string,
        params: ObjectMDOperationParams | null,
        log: werelogs.Logger,
        cb: ArsenalCallback<ObjectMDData>,
    ) {
        const c = this.getCollection<ObjectMetastoreDocument>(bucketName);
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
                }, {}).then(doc => next(null, vFormat, doc)).catch(err => {
                    log.error('findOne: error getting object',
                        { bucket: bucketName, object: objName, error: err.message });
                    return next(errors.InternalError);
                });
            },
            (vFormat, doc, next) => {
                if (!doc && params && params.versionId) {
                    return next(errors.NoSuchKey);
                }
                // If no master found then object is either non existent
                // or last version is delete marker
                if (!doc || doc.value.isPHD) {
                    this.getLatestVersion(c, objName, vFormat, log, (err, value?) => {
                        if (err?.is.NoSuchKey) {
                            return next(err);
                        }

                        if (err) {
                            log.error('getLatestVersion: getting latest version',
                                { bucket: bucketName, object: objName, error: err.message });

                            return next(errors.InternalError);
                        }

                        return next(null, value);
                    });
                    return undefined;
                }
                MongoUtils.unserialize(doc.value);
                return next(null, doc.value);
            },
        ], (err: ArsenalError | null | undefined, result?: ObjectMDData) => {
            if (err) {
                return cb(err);
            }
            return cb(null, result!);
        });
    }

    /**
     * gets object metadata for a list of objects
     * @param {String} bucketName bucket name
     * @param {Array} objects array of objects
     * @param {Object} log logger
     * @param {Function} callback callback
     * @return {undefined}
     */
    getObjects(
        bucketName: string,
        objects: { key: string, params: ObjectMDOperationParams }[],
        log: werelogs.Logger,
        callback: ArsenalCallback<unknown[]>,
    ) {
        let vFormat;
        const c = this.getCollection<ObjectMetastoreDocument>(bucketName);
        if (!Array.isArray(objects)) {
            return callback(errorInstances.InternalError.customizeDescription('objects must be an array'));
        }
        // We do not accept more than 1000 keys in a single request
        if (objects.length > 1000) {
            return callback(errorInstances.InternalError.customizeDescription('cannot get more than 1000 objects'));
        }
        // Function to process each document
        const processDoc = (doc, objName, params, key, cb) => {
            const versionIdValue = params && params.versionId ? params.versionId : undefined;
            if (!doc && versionIdValue) {
                // If no document and a version ID is provided, return an error.
                return cb(null, {
                    err: errors.NoSuchKey,
                    doc: null,
                    versionId: versionIdValue,
                    key,
                });
            }
            // If no master found then object is either non existent or last
            // version is delete marker
            if (!doc || doc.value.isPHD) {
                return this.getLatestVersion(c!, objName, vFormat, log, (err, _doc?) => cb(null, {
                    err,
                    doc: _doc || null,
                    versionId: versionIdValue,
                    key,
                }));
            }
            MongoUtils.unserialize(doc.value);
            return cb(null, {
                err: null,
                doc: doc.value,
                versionId: versionIdValue,
                key,
            });
        };
        return this.getBucketVFormat(bucketName, log, (err, _vFormat?) => {
            if (err) {
                return callback(err);
            }
            if (!_vFormat) {
                log.debug('error when getting bucket vFormat', {
                    bucketName,
                });
                return callback(errors.InternalError);
            }
            vFormat = _vFormat;
            const keys = objects.map(({ key: objName, params }) => (params && params.versionId
                ? formatVersionKey(objName, params.versionId, vFormat)
                : formatMasterKey(objName, vFormat)));
            return c!.find({
                _id: { $in: keys },
                $or: [
                    { 'value.deleted': { $exists: false } },
                    { 'value.deleted': { $eq: false } },
                ],
            }).toArray().then(docs => {
                // Create a Map to quickly find docs by their keys
                const docByKey = new Map(docs.map(doc => [doc._id, doc]));
                // Process each document using associated context (objName, params)
                async.mapLimit(objects, constants.maxBatchingConcurrentOperations,
                    ({ key: objName, params }, cb) => {
                        const key = params && params.versionId
                            ? formatVersionKey(objName, params.versionId, vFormat)
                            : formatMasterKey(objName, vFormat);
                        const doc = docByKey.get(key);
                        processDoc(doc, objName, params, key, cb);
                    }, (err: ArsenalError | null | undefined, result?: unknown[]) => {
                        if (err) {
                            return callback(err);
                        }
                        return callback(null, result!);
                    });
            }).catch(err => {
                callback(err);
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
    getLatestVersion(
        c: Collection<ObjectMetastoreDocument>,
        objName: string,
        vFormat: string,
        log: werelogs.Logger,
        cb: ArsenalCallback<ObjectMDData>,
    ) {
        // generating the range delimiter keys
        const masterKey = formatMasterKey(objName, vFormat);
        // version id is added at the end of the key so giving it an empty
        // string gives us the last key in the range
        const versionKey = formatVersionKey(objName, VID_NONE, vFormat);
        const lastVersionKey = inc(versionKey);
        const filter = vFormat === BUCKET_VERSIONS.v0 ? {
            $gt: masterKey,
            $lt: lastVersionKey,
        } : {
            $gt: versionKey,
            $lt: lastVersionKey,
        };
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
            toArray()
            .then(keys => {
                if (keys.length === 0) {
                    return cb(errors.NoSuchKey);
                }
                MongoUtils.unserialize(keys[0].value);
                return cb(null, keys[0].value);
            })
            .catch(err => {
                log.error(
                    'getLatestVersion: error getting latest version',
                    { error: err.message });
                return cb(errors.InternalError);
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
    repair(
        c: Collection<ObjectMetastoreDocument>,
        bucketName: string,
        objName: string,
        objVal: ObjectMDData,
        mst: { versionId: string },
        vFormat: string,
        log: werelogs.Logger,
        cb: ArsenalCallback<void>,
    ) {
        const masterKey = formatMasterKey(objName, vFormat);
        MongoUtils.serialize(objVal);
        objVal.originOp = 's3:ObjectRemoved:Delete';
        c.findOneAndReplace({
            '_id': masterKey,
            'value.isPHD': true,
            'value.versionId': mst.versionId,
        }, <WithId<ObjectMetastoreDocument>>{
            _id: masterKey,
            value: objVal,
        }, {
            includeResultMetadata: true,
            upsert: true,
        }).then(result => {
            if (result.ok !== 1) {
                log.error('repair: failed trying to repair value');
                return cb(errors.InternalError);
            }
            return cb(null);
        }).catch(err => {
            log.error('repair: error trying to repair value',
                { error: err.message });
            return cb(errors.InternalError);
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
    asyncRepair(
        c: Collection<ObjectMetastoreDocument>,
        bucketName: string,
        objName: string,
        mst: { versionId: string },
        vFormat: string,
        log: werelogs.Logger
    ) {
        this.getLatestVersion(c, objName, vFormat, log, (err, value?) => {
            if (err) {
                log.error('async-repair: getting latest version',
                    { error: err.message });
                return undefined;
            }
            this.repair(c, bucketName, objName, value!, mst, vFormat, log, err => {
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
    deleteOrRepairPHD(
        c: Collection<ObjectMetastoreDocument>,
        bucketName: string,
        objName: string,
        mst: { versionId: string },
        vFormat: string,
        log: werelogs.Logger,
        cb: ArsenalCallback<void>,
    ) {
        const masterKey = formatMasterKey(objName, vFormat);
        // Check if there are other versions available
        this.getLatestVersion(c, objName, vFormat, log, (err, version?) => {
            if (err && !err.is.NoSuchKey) {
                log.error('getLatestVersion: error getting latest version',
                    { error: err.message, bucket: bucketName, key: objName });
                return cb(err);
            }
            if ((err?.is.NoSuchKey) || (version!.isDeleteMarker && vFormat === BUCKET_VERSIONS.v1)) {
                // We try to delete the master. A race condition
                // is possible here: another process may recreate
                // a master or re-delete it in between so place an
                // atomic condition on the PHD flag and the mst
                // version:
                const filter = {
                    'value.isPHD': true,
                    'value.versionId': mst.versionId,
                };
                this.internalDeleteObject(c, bucketName, masterKey, filter, null, log, err => {
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
     * @param {String} [originOp=s3:ObjectRemoved:Delete] origin operation
     * @return {undefined}
     */
    deleteObjectVerMaster(
        c: Collection<ObjectMetastoreDocument>,
        bucketName: string,
        objName: string,
        params: ObjectMDOperationParams,
        log: werelogs.Logger,
        cb: ArsenalCallback<void>,
        originOp = 's3:ObjectRemoved:Delete',
    ) {
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
                { upsert: true })
                .then(() => next())
                .catch(err => next(err)),
            // delete version
            next => this.internalDeleteObject(c, bucketName, versionKey, {}, params, log,
                err => {
                    // we don't return an error in case we don't find
                    // a version as we expect this case when dealing with
                    // a versioning suspended object.
                    if (err?.is.NoSuchKey) {
                        return next(null);
                    }
                    return next(err);
                }, originOp),
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
     * @param {String} [originOp=s3:ObjectRemoved:Delete] origin operation
     * @return {undefined}
     */
    deleteObjectVerNotMaster(
        c: Collection<ObjectMetastoreDocument>,
        bucketName: string,
        objName: string,
        params: ObjectMDOperationParams,
        log: werelogs.Logger,
        cb: ArsenalCallback<void>,
        originOp = 's3:ObjectRemoved:Delete',
    ) {
        const versionKey = formatVersionKey(objName, params.versionId, params.vFormat);
        this.internalDeleteObject(c, bucketName, versionKey, {}, params, log, err => {
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
        }, originOp);
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
     * @param {String} [originOp=s3:ObjectRemoved:Delete] origin operation
     * @return {undefined}
     */
    deleteObjectVer(
        c: Collection<ObjectMetastoreDocument>,
        bucketName: string,
        objName: string,
        params: ObjectMDOperationParams,
        log: werelogs.Logger,
        cb: ArsenalCallback<void>,
        originOp = 's3:ObjectRemoved:Delete',
    ) {
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
                }, {})
                    .then(mst => next(null, mst))
                    .catch(err => {
                        log.error('deleteObjectVer: error deleting versioned object',
                            { error: err.message, bucket: bucketName, key: objName });
                        return cb(errors.InternalError);
                    });
            },
            (mst, next) => {
                // getting the last version if master not found
                // (either object non existent or last version is a delete marker)
                if (!mst) {
                    return this.getLatestVersion(c, objName, params.vFormat, log, (err, version?) => {
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
                        params, log, next, originOp);
                }
                return this.deleteObjectVerNotMaster(c, bucketName, objName,
                    params, log, next, originOp);
            },
        ], (err: ArsenalError | null | undefined) => {
            if (err) {
                return cb(err);
            }
            return cb(null);
        });
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
     * @param {String} [originOp=s3:ObjectRemoved:Delete] origin operation
     * @return {undefined}
     */
    deleteObjectNoVer(
        c: Collection<ObjectMetastoreDocument>,
        bucketName: string,
        objName: string,
        params: ObjectMDOperationParams,
        log: werelogs.Logger,
        cb: ArsenalCallback<void>,
        originOp = 's3:ObjectRemoved:Delete',
    ) {
        const masterKey = formatMasterKey(objName, params.vFormat);
        this.internalDeleteObject(c, bucketName, masterKey, {}, params, log, err => {
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
        }, originOp);
    }

    /**
     * Flags the object before deleting it, this is done
     * to keep object metadata in the oplog, as oplog delete
     * events don't contain any object metadata
     * @param {Object} collection MongoDB collection
     * @param {string} bucketName bucket name
     * @param {string} key Key of the object to delete
     * @param {object} filter additional query filters
     * @param {object} params request params
     * @param {Logger} log logger instance
     * @param {Function} cb callback containing error
     * and BulkWriteResult
     * @param {String} [originOp=s3:ObjectRemoved:Delete] origin operation
     * @return {undefined}
     */
    internalDeleteObject(
        collection: Collection<ObjectMetastoreDocument>,
        bucketName: string,
        key: string,
        filter: UpdateFilter<ObjectMetastoreDocument>,
        params: ObjectMDOperationParams | null,
        log: werelogs.Logger,
        cb: ArsenalCallback<unknown>,
        originOp = 's3:ObjectRemoved:Delete',
    ) {
        // filter used when deleting object
        const deleteFilter = Object.assign({
            _id: key,
        }, filter);

        if (params && params.doesNotNeedOpogUpdate) {
            // If flag is true, directly delete object
            // Use batching if enabled
            if (this.OPTIM_BATCH) {
                const deleteOperation = { 
                    deleteOne: { 
                        filter: deleteFilter 
                    } 
                };
                
                const added = this.addToBatch(bucketName, deleteOperation, cb, { deletedCount: 1 });
                if (added) {
                    return;
                }
            }

            return collection.deleteOne(deleteFilter)
                .then(() => cb(null, undefined))
                .catch(err => {
                    log.error('internalDeleteObject: error deleting object',
                        { bucket: bucketName, object: key, error: err.message });
                    // wrong error type in "no found" case
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
                includeResultMetadata : true,
                upsert: false,
            }).then(doc => {
                if (!doc.value) {
                    log.error('internalDeleteObject: unable to find target object to delete',
                        { bucket: bucketName, object: key });
                    return next(errors.NoSuchKey);
                }
                const obj = doc.value;
                const objMetadata = new ObjectMD(obj.value);
                objMetadata.setOriginOp(originOp);
                objMetadata.setDeleted(true);
                return next(null, objMetadata.getValue());
            }).catch(err => {
                log.error('internalDeleteObject: error getting object',
                    { bucket: bucketName, object: key, error: err.message });
                return next(errors.InternalError);
            }),
            // We update the full object to get the whole object metadata
            // in the oplog update event
            (objMetadata, next) => collection.bulkWrite([
                {
                    updateOne: {
                        filter: updateDeleteFilter,
                        update: {
                            $set: { _id: key, value: objMetadata },
                        },
                        upsert: false,
                    },
                }, {
                    deleteOne: {
                        filter: updateDeleteFilter,
                    },
                },
            ], { ordered: true }).then(() => next(null)).catch(err => next(err)),
        ], (err, res) => {
            if (err) {
                if (err instanceof ArsenalError && err.is.NoSuchKey) {
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
     * @param {String} [originOp=s3:ObjectRemoved:Delete] origin operation
     * @return {undefined}
     */
    deleteObject(
        bucketName: string,
        objName: string,
        params: ObjectMDOperationParams,
        log: werelogs.Logger,
        cb: ArsenalCallback<void>,
        originOp = 's3:ObjectRemoved:Delete',
    ) {
        const c = this.getCollection<ObjectMetastoreDocument>(bucketName);
        const _params = Object.assign({}, params);
        return this.getBucketVFormat(bucketName, log, (err, vFormat?) => {
            if (err) {
                return cb(err);
            }
            _params.vFormat = vFormat;
            if (_params && _params.versionId) {
                return this.deleteObjectVer(c, bucketName, objName,
                    _params, log, cb, originOp);
            }
            return this.deleteObjectNoVer(c, bucketName, objName,
                _params, log, cb, originOp);
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
    internalListObject(
        bucketName: string,
        params: InternalListObjectParams,
        extension: { compareObjects: Function, result: Function },
        vFormat: string,
        log: werelogs.Logger,
        cb: ArsenalCallback<void>,
    ) {
        const c = this.getCollection<ObjectMetastoreDocument>(bucketName);
        const getLatestVersion = this.getLatestVersion;
        let stream;
        let baseStream;
        let resolvePhdKey;
        const cleanupStreams = () => {
            if (resolvePhdKey) {
                resolvePhdKey.removeAllListeners();
                resolvePhdKey.destroy();
                resolvePhdKey = null;
            }
            if (baseStream && baseStream !== stream) {
                baseStream.removeAllListeners();
                baseStream.destroy();
                baseStream = null;
            }
            if (stream) {
                stream.removeAllListeners();
                stream.destroy();
                stream = null;
            }
        };
        const cbOnce = jsutil.once((err, data) => {
            cleanupStreams();
            return cb(err, data);
        });
        if (!params.secondaryStreamParams) {
            // listing masters only (DelimiterMaster)
            stream = new MongoReadStream(c, params.mainStreamParams, params.mongifiedSearch);
            baseStream = stream;
            if (vFormat === BUCKET_VERSIONS.v1) {
                /**
                 * When listing masters only in v1 we can't just skip PHD
                 * we have to replace them with the latest version of
                 * the object.
                 * Here we use a trasform stream that we pipe with the
                 * mongo read steam and that checks and replaces the key
                 * read if it's a PHD
                 *  */
                resolvePhdKey = new Transform({
                    objectMode: true,
                    transform(obj, encoding, callback) {
                        if (Version.isPHD(obj.value)) {
                            const key = obj.key.slice(DB_PREFIXES.Master.length);
                            getLatestVersion(c, key, BUCKET_VERSIONS.v1, log, (err, version?) => {
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
                // Propagate the 'end' event from resolvePhdKey to stream
                // to properly cleanup resources.
                resolvePhdKey.on('end', () => {
                    baseStream.emit('end');
                });
                baseStream.on('error', err => {
                    const logObj = {
                        rawError: err,
                        error: err.message,
                        errorStack: err.stack,
                    };
                    log.error(
                        'internalListObjectV1: error listing objects', logObj);
                    return cbOnce(err);
                });
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
        skip.setListingEndCb(() => {
            stream.emit('end');
        });
        skip.setSkipRangeCb(range => {
            // stop listing this key range
            cleanupStreams();

            // update the new listing parameters here
            const newParams = params;
            newParams.start = undefined; // 'start' is deprecated
            newParams.gt = undefined;

            if (newParams.secondaryStreamParams) {
                newParams.mainStreamParams.gte = range[0];
                newParams.secondaryStreamParams.gte = range[1];
            } else {
                newParams.mainStreamParams.gte = range;
            }
            // then continue listing the next key range
            this.internalListObject(bucketName, newParams, extension, vFormat, log, cbOnce);
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
                cbOnce(err);
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
    listObject(
        bucketName: string,
        params: InternalListObjectParams,
        log: werelogs.Logger,
        cb: ArsenalCallback<void>) {
        return this.getBucketVFormat(bucketName, log, (err, vFormat?) => {
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
                mongifiedSearch: params.mongifiedSearch,
            };
            return this.internalListObject(bucketName, internalParams, extension,
                vFormat, log, cb);
        });
    }
    /**
     * lists current version, non-current version and orphan delete markers in a bucket
     * @param {String} bucketName bucket name
     * @param {Object} params params
     * @param {String} params.listingType type of algorithm to use
     * @param {Number} [params.maxKeys] maximum number of keys to list
     * @param {String} [params.prefix] prefix of objects to use
     * @param {Object} log logger
     * @param {Function} cb callback
     * @return {undefined}
     */
    listLifecycleObject(
        bucketName: string,
        params: InternalListObjectParams,
        log: werelogs.Logger,
        cb: ArsenalCallback<void>,
    ) {
        return this.getBucketVFormat(bucketName, log, (err, vFormat?) => {
            if (err) {
                return cb(err);
            }

            const extName = params.listingType;

            const extension = new listAlgos[extName](params, log, vFormat);
            const extensionParams = extension.genMDParams();

            const internalParams = {
                mainStreamParams: Array.isArray(extensionParams) ? extensionParams[0] : extensionParams,
                secondaryStreamParams: Array.isArray(extensionParams) ? extensionParams[1] : null,
            };

            return this.internalListObject(bucketName, internalParams, extension, vFormat, log, cb);
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
    listMultipartUploads(
        bucketName: string,
        params: InternalListObjectParams,
        log: werelogs.Logger,
        cb: ArsenalCallback<void>,
    ) {
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
        if (this.isConnected) {
            resp[implName] = errors.ok;
            return cb(null, resp);
        }
        log.error('disconnected from mongodb');
        resp[implName] = {
            error: errors.ServiceUnavailable,
            code: errorInstances.ServiceUnavailable.code,
        };
        return cb(null, resp);
    }

    readUUID(log: werelogs.Logger, cb: ArsenalCallback<string | ObjectMDStats>) {
        const i = this.getCollection<InfostoreDocument>(INFOSTORE);
        if (!i) {
            log.error('readUUID: error getting infostore collection');
            return;
        }
        i.findOne({
            _id: __UUID,
        }, {}).then(doc => {
            if (!doc) {
                return cb(errors.NoSuchKey);
            }
            return cb(null, doc.value!);
        }).catch(err => {
            log.error('readUUID: error reading UUID',
                { error: err.message });
            return cb(errors.InternalError);
        });
    }

    writeUUIDIfNotExists(uuid: string, log: werelogs.Logger, cb: ArsenalCallback<void>) {
        const i = this.getCollection<InfostoreDocument>(INFOSTORE);
        if (!i) {
            log.error('writeUUIDIfNotExists: error getting infostore collection');
            return cb(errors.InternalError);
        }
        return i.insertOne(<InfostoreDocument>{
            _id: __UUID,
            value: uuid,
        }, {}).then(() => cb(null)) // FIXME: shoud we check for result.ok === 1 ?
            .catch(err => {
                if (err.code === 11000) {
                    // duplicate key error
                    return cb(errors.KeyAlreadyExists);
                }
                log.error('writeUUIDIfNotExists: error writing UUID',
                    { error: err.message });
                return cb(errors.InternalError);
            });
    }

    /*
     * we always try to generate a new UUID in order to be atomic in
     * case of concurrency. The write will fail if it already exists.
     */
    getUUID(log: werelogs.Logger, cb: ArsenalCallback<string | ObjectMDStats>) {
        const _uuid = initialInstanceID || uuidv4();
        this.writeUUIDIfNotExists(_uuid, log, err => {
            if (err) {
                if (err.is.InternalError) {
                    log.error('getUUID: error getting UUID',
                        { error: err.message });
                    return cb(err);
                }
                return this.readUUID(log, cb);
            }
            return cb(null, _uuid);
        });
    }

    /**
     * Get disk usage information from MongoDB
     * @param {Function} cb - Callback
     * @return {undefined}
     */
    getDiskUsage(cb: ArsenalCallback<{ available: number; free: number; total: number }>) {
        if (!this.db || !this.client) {
            return cb(errors.InternalError.customizeDescription(
                'Cannot get disk usage: database not connected'));
        }

        return this.db.command({ dbStats: 1, scale: 1 })
            .then(stats => {
                const result = {
                    available: stats.fsFreeSize || 0,
                    // Same as available in MongoDB context
                    free: stats.fsFreeSize || 0,
                    total: stats.fsTotalSize || 0
                };
                return cb(null, result);
            })
            .catch(err => {
                this.logger.error('Error getting MongoDB disk stats', 
                    { error: err.message });
                return cb(errors.InternalError);
            });
    }

    readCountItems(log: werelogs.Logger, cb: ArsenalCallback<ObjectMDStats | string>) {
        const i = this.getCollection<InfostoreDocument>(INFOSTORE);
        if (!i) {
            log.error('readCountItems: error getting infostore collection');
            return cb(errors.InternalError);
        }
        return i.findOne({
            _id: __COUNT_ITEMS,
        }, {}).then(doc => {
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
            return cb(null, doc.value!);
        }).catch(err => {
            log.error('readCountItems: error reading count items', {
                error: err.message,
            });
            return cb(errors.InternalError);
        });
    }

    /*
     * return true if it a special collection and therefore
     * does not need to be collected for infos
     */
    _isSpecialCollection(name: string) {
        return name === METASTORE ||
            name === INFOSTORE ||
            name === USERSBUCKET ||
            name === PENSIEVE ||
            name.startsWith(constants.mpuBucketPrefix) ||
            name.startsWith('__');
    }

    /*
     * return true if it a system collection, reserved by Mongo for internal use: and which should
     * not be used.
     */
    _isSystemCollection(name: string) {
        return name.startsWith('system.');
    }

    /**
     * @typedef BucketInfos
     * @property { int } bucketCount - number of buckets
     * @property { BucketInfo[] } bucketInfos - array of bucket metadata
     */

    /**
     * Get bucket related information for count items, used by cloudserver
     * and s3utils.
     * @param { Logger } log - Werelogs logger
     * @param { function(error, BucketInfos): void } cb - callback
     * @return { undefined }
     */
    getBucketInfos(log: werelogs.Logger, cb: ArsenalCallback<{ bucketCount: number, bucketInfos: BucketInfo[] }>) {
        let bucketCount = 0;
        const bucketInfos: BucketInfo[] = [];

        this.db!.listCollections({ type: 'collection' }).toArray().then(collInfos =>
            async.eachLimit(collInfos, 10, (value, next) => {
                if (this._isSystemCollection(value.name) || this._isSpecialCollection(value.name)) {
                    // skip
                    return next();
                }
                const bucketName = value.name;
                // FIXME: there is currently no way of distinguishing
                // master from versions and searching for VID_SEP
                // does not work because there cannot be null bytes
                // in $regex
                return this.getBucketAttributes(bucketName, log,
                    (err, bucketInfo?) => {
                        if (err?.is?.NoSuchBucket) {
                            // Skip bucket if not found: can happen if bucket has just been removed
                            return next();
                        }
                        if (err) {
                            log.error('failed to get bucket attributes', {
                                bucketName,
                                error: err,
                            });
                            return next(errors.InternalError);
                        }
                        bucketCount++;
                        bucketInfos!.push(bucketInfo!);
                        return next();
                    });
            }, err => {
                if (err && err instanceof ArsenalError) {
                    return cb(err);
                } else if (err) {
                    log.error('could not get list of collections', {
                        method: 'getBucketInfos',
                        error: err,
                    });
                    return cb(errors.InternalError);
                }
                return cb(null, {
                    bucketCount,
                    bucketInfos,
                });
            })
        ).catch(err => {
            log.error('could not get list of collections', {
                method: 'getBucketInfos',
                error: err,
            });
            if (err && err instanceof ArsenalError) {
                return cb(err);
            }
            return cb(errors.InternalError);
        });
    }

    countItems(log: werelogs.Logger, cb: ArsenalCallback<ObjectMDStats>) {
        this.getBucketInfos(log, (err, res?) => {
            if (err) {
                log.error('error getting bucket info', {
                    method: 'countItems',
                    error: err,
                });
                return cb(err);
            }
            if (!res) {
                log.error('missing buckets info');
                return cb(errors.InternalError);
            }
            const { bucketCount, bucketInfos } = res;
            let bucketWithQuotaCount = 0;

            const retBucketInfos = bucketInfos.map(bucket => {
                if (bucket.getQuota()) {
                    bucketWithQuotaCount++;
                }
                return {
                    name: bucket.getName(),
                    location: bucket.getLocationConstraint(),
                    isVersioned: !!bucket.getVersioningConfiguration(),
                    ownerCanonicalId: bucket.getOwner(),
                    ingestion: bucket.isIngestionBucket(),
                };
            });

            return this.readCountItems(log, (err, results?) => {
                if (err) {
                    return cb(err);
                }
                if (!results || typeof results === 'string') {
                    log.error('unable to get any count items document');
                    return cb(errors.InternalError);
                }
                // overwrite bucket info since we have latest info
                results.bucketList = retBucketInfos;
                results.buckets = bucketCount;
                results.bucketWithQuotaCount = bucketWithQuotaCount;
                return cb(null, results);
            });
        });
    }

    _getLocName(loc) {
        return loc === 'mem' || loc === 'file' ? 'us-east-1' : loc;
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

    getIngestionBuckets(log: werelogs.Logger, cb: ArsenalCallback<BucketInfo[]>) {
        const m = this.getCollection<BucketMetastoreDocument>(METASTORE);
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
        }).toArray()
            .then(doc => cb(null, doc.map(i => i.value))).catch(err => {
                log.error('error getting ingestion buckets', {
                    error: err.message,
                    method: 'MongoClientInterface.getIngestionBuckets',
                });
                return cb(errors.InternalError);
            });
    }

    /*
     * delete an object that matches a given conditions object
     * @warning this method only work on master keys, and will thus break
     * when the object is versionned
     */
    deleteObjectWithCond(bucketName: string, objName: string, params: ObjectMDOperationParams,
        log: werelogs.Logger, cb: ArsenalCallback<void>) {
        const c = this.getCollection<ObjectMetastoreDocument>(bucketName);
        const method = 'deleteObjectWithCond';
        this.getBucketVFormat(bucketName, log, (err, vFormat?) => {
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
                    error: reshapeExceptionError(err as ErrorLike),
                });
                return cb(errors.InternalError);
            }
            return this.internalDeleteObject(c, bucketName, masterKey, filter, null, log,
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
                    return cb(null);
                });
        });
    }

    /*
     * update an object that matches the given conditions. If one cannot be
     * found, a new object will be upserted
     */
    putObjectWithCond(bucketName, objName, objVal, params, log, cb) {
        const c = this.getCollection<ObjectMetastoreDocument>(bucketName);
        const method = 'putObjectWithCond';
        this.getBucketVFormat(bucketName, log, (err, vFormat?) => {
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
                    error: reshapeExceptionError(err as ErrorLike),
                });
                return cb(errors.InternalError);
            }
            return c.findOneAndUpdate(filter, {
                $set: {
                    _id: masterKey,
                    value: objVal,
                },
            }, {
                includeResultMetadata: true,
                upsert: true,
            }).then(res => {
                if (res.ok !== 1) {
                    log.error('failed to update object', {
                        method,
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
            })
                .catch(err => {
                    log.error('error occurred when attempting to update object', {
                        method,
                        error: err,
                    });
                    return cb(errors.InternalError);
                });
        });
    }

    /**
     * Puts bucket indexes
     * @param {String} bucketName bucket name
     * @param {Array<Object>} indexSpecs index specification
     * @param {Object} log logger
     * @param {Function} cb callback
     * @return {undefined}
     */
    putBucketIndexes(bucketName: string, indexSpecs, log: werelogs.Logger, cb: ArsenalCallback<void>) {
        const c = this.getCollection<ObjectMetastoreDocument>(bucketName);
        const indexes = MongoUtils.indexFormatObjectToMongoArray(indexSpecs);
        c.createIndexes(indexes).then(() => cb(null)).catch(err => {
            if (err.codeName === 'NamespaceNotFound') {
                return cb(errors.NoSuchBucket);
            }

            log.error(
                'putBucketIndexes: error creating bucket indexes',
                { error: err });
            return cb(errors.InternalError);
        });
    }

    /**
     * Delete bucket indexes
     * @param {String} bucketName bucket name
     * @param {Array<Object>} indexSpecs index specification
     * @param {Object} log logger
     * @param {Function} cb callback
     * @return {undefined}
     */
    deleteBucketIndexes(bucketName: string, indexSpecs: { name: string }[],
        log: werelogs.Logger, cb: ArsenalCallback<void>) {
        const c = this.getCollection<ObjectMetastoreDocument>(bucketName);
        async.each(indexSpecs,
            (spec, next) => c.dropIndex(spec.name).then(() => next()).catch(err => next(err)),
            err => {
                if (err) {
                    if (err instanceof MongoServerError && err.codeName === 'NamespaceNotFound') {
                        return cb(errors.NoSuchBucket);
                    }

                    log.error(
                        'deleteBucketIndexes: error deleting bucket indexes',
                        { error: err });
                    return cb(errors.InternalError);
                }
                return cb(null);
            });
    }

    /**
     * Gets bucket indexes
     * @param {String} bucketName bucket name
     * @param {Object} log logger
     * @param {Function} cb callback
     * @return {undefined}
     */
    getBucketIndexes(bucketName: string, log: werelogs.Logger, cb: ArsenalCallback<{
        name: string;
        keys: {
            key: string;
            order: number;
        }[];
    }[]>) {
        const c = this.getCollection<ObjectMetastoreDocument>(bucketName);
        c.listIndexes()
            .toArray()
            .then(res => cb(null, MongoUtils.indexFormatMongoArrayToObject(res)))
            .catch(err => {
                if (err.codeName === 'NamespaceNotFound') {
                    return cb(errors.NoSuchBucket);
                }

                log.error('getBucketIndexes: error retrieving bucket indexes', {
                    error: err,
                });
                return cb(errors.InternalError);
            });
    }

    getIndexingJobs(log, cb) {
        // list active createIndexes jobs
        this.adminDb!.command({
            currentOp: true,
            $or: [
                { 'op': 'command', 'command.createIndexes': { $exists: true } },
                { op: 'none', msg: /^Index Build/ },
            ],
        }).then(res => {
            const jobs: {
                bucket: string, indexes: {
                    name: any;
                    keys: {
                        key: any;
                        order: any;
                    }[];
                }[]
            }[] = [];

            for (const j of res.inprog) {
                jobs.push({
                    bucket: j.command.createIndexes,
                    indexes: MongoUtils.indexFormatMongoArrayToObject(j.command.indexes),
                });
            }

            return cb(null, jobs);
        })
            .catch(err => {
                log.error('getIndexingJobs: error retrieving current index jobs', {
                    error: err,
                });
                return cb(err);
            });
    }

    // --- Begin batch operations management ---
    
    /**
     * Add an operation to a batch queue for later execution
     */
    private addToBatch(collectionName: string, operation: AnyBulkWriteOperation<ObjectMetastoreDocument>, 
        callback: ArsenalCallback<any>, callbackParams: any) {
        if (!this.OPTIM_BATCH) {
            return false;
        }

        if (!this.batchOperations.has(collectionName)) {
            this.batchOperations.set(collectionName, {
                operations: [],
                callbacks: []
            });
        }

        const batchInfo = this.batchOperations.get(collectionName)!;
        batchInfo.operations.push(operation);
        batchInfo.callbacks.push({ cb: callback, params: callbackParams });

        // Set timeout to execute batch if it's the first operation
        if (batchInfo.operations.length === 1) {
            const timeout = setTimeout(() => {
                this.executeBatch(collectionName);
            }, 50); // Small timeout to batch operations
            this.batchTimeouts.set(collectionName, timeout);
        }

        // Execute immediately if we reached batch size
        if (batchInfo.operations.length >= this.BATCH_SIZE) {
            this.executeBatch(collectionName);
        }

        return true;
    }

    /**
     * Execute a batch of operations for a collection
     */
    private executeBatch(collectionName: string) {
        if (!this.batchOperations.has(collectionName)) {
            return;
        }

        // Clear any pending timeout
        if (this.batchTimeouts.has(collectionName)) {
            clearTimeout(this.batchTimeouts.get(collectionName)!);
            this.batchTimeouts.delete(collectionName);
        }

        const batchInfo = this.batchOperations.get(collectionName)!;
        this.batchOperations.delete(collectionName);

        if (batchInfo.operations.length === 0) {
            return;
        }

        // Execute the batch operation
        const collection = this.getCollection<ObjectMetastoreDocument>(collectionName);
        collection.bulkWrite(batchInfo.operations, { ordered: false })
            .then((result: BulkWriteResult) => {
                // Call all callbacks with success
                batchInfo.callbacks.forEach(({ cb, params }) => {
                    cb(null, params);
                });
            })
            .catch(err => {
                // Call all callbacks with the error
                batchInfo.callbacks.forEach(({ cb }) => {
                    cb(err);
                });
            });
    }

    /**
     * Execute all pending batches
     */
    private executeAllBatches() {
        // Execute all pending batches
        for (const collectionName of this.batchOperations.keys()) {
            this.executeBatch(collectionName);
        }
    }
    
    // --- End batch operations management ---
}

module.exports = MongoClientInterface;

