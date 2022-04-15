const errors = require('../../errors').default;

const BucketInfo = require('../../models/BucketInfo');

const BucketClientInterface = require('./bucketclient/BucketClientInterface');
const BucketFileInterface = require('./file/BucketFileInterface');
const MongoClientInterface = require('./mongoclient/MongoClientInterface');
const metastore = require('./in_memory/metastore');

let CdmiMetadata;
try {
    CdmiMetadata = require('cdmiclient').CdmiMetadata;
} catch (err) {
    CdmiMetadata = null;
}

let bucketNotificationHook;

/** _parseListEntries - parse the values returned in a listing by metadata
 * @param {object[]} entries - Version or Content entries in a metadata listing
 * @param {string} entries[].key - metadata key
 * @param {string} entries[].value - stringified object metadata
 * @return {object} - mapped array with parsed value or JSON parsing err
 */
function _parseListEntries(entries) {
    return entries.map(entry => {
        const tmp = JSON.parse(entry.value);
        return {
            key: entry.key,
            value: {
                Size: tmp['content-length'],
                ETag: tmp['content-md5'],
                VersionId: tmp.versionId,
                IsNull: tmp.isNull,
                IsDeleteMarker: tmp.isDeleteMarker,
                LastModified: tmp['last-modified'],
                Owner: {
                    DisplayName: tmp['owner-display-name'],
                    ID: tmp['owner-id'],
                },
                StorageClass: tmp['x-amz-storage-class'],
                // MPU listing properties
                Initiated: tmp.initiated,
                Initiator: tmp.initiator,
                EventualStorageBucket: tmp.eventualStorageBucket,
                partLocations: tmp.partLocations,
                creationDate: tmp.creationDate,
                ingestion: tmp.ingestion,
            },
        };
    });
}

/** parseListEntries - parse the values returned in a listing by metadata
 * @param {object[]} entries - Version or Content entries in a metadata listing
 * @param {string} entries[].key - metadata key
 * @param {string} entries[].value - stringified object metadata
 * @param {function} parser - Parser for object data
 * @return {(object|Error)} - mapped array with parsed value or JSON parsing err
 */
function parseListEntries(entries, parser) {
    // wrap private function in a try/catch clause
    // just in case JSON parsing throws an exception
    try {
        return parser(entries);
    } catch (e) {
        return e;
    }
}

class MetadataWrapper {
    constructor(clientName, params, bucketclient, logger) {
        if (clientName === 'mem') {
            this.client = metastore;
            this.implName = 'memorybucket';
        } else if (clientName === 'file') {
            this.client = new BucketFileInterface(params, logger);
            this.implName = 'bucketfile';
        } else if (clientName === 'scality') {
            this.client = new BucketClientInterface(params, bucketclient,
                logger);
            this.implName = 'bucketclient';
        } else if (clientName === 'mongodb') {
            this.client = new MongoClientInterface({
                replicaSetHosts: params.mongodb.replicaSetHosts,
                writeConcern: params.mongodb.writeConcern,
                replicaSet: params.mongodb.replicaSet,
                readPreference: params.mongodb.readPreference,
                database: params.mongodb.database,
                replicationGroupId: params.replicationGroupId,
                path: params.mongodb.path,
                authCredentials: params.mongodb.authCredentials,
                shardCollections: params.mongodb.shardCollections,
                config: params.config,
                logger,
            });
            this.implName = 'mongoclient';
        } else if (clientName === 'cdmi') {
            if (!CdmiMetadata) {
                throw new Error('Unauthorized backend');
            }

            this.client = new CdmiMetadata({
                path: params.cdmi.path,
                host: params.cdmi.host,
                port: params.cdmi.port,
                readonly: params.cdmi.readonly,
            });
            this.implName = 'cdmi';
        }
        this._listingParser = params.customListingParser || _parseListEntries;
    }

    setup(done) {
        if (this.client.setup) {
            return this.client.setup(done);
        }
        return process.nextTick(done);
    }

    createBucket(bucketName, bucketMD, log, cb) {
        log.debug('creating bucket in metadata');
        this.client.createBucket(bucketName, bucketMD, log, err => {
            if (err) {
                log.debug('error from metadata', { implName: this.implName,
                    error: err });
                return cb(err);
            }
            log.trace('bucket created in metadata');
            if (bucketNotificationHook) {
                setTimeout(bucketNotificationHook);
            }
            return cb(err);
        });
    }

    updateBucket(bucketName, bucketMD, log, cb) {
        log.debug('updating bucket in metadata');
        this.client.putBucketAttributes(bucketName, bucketMD, log, err => {
            if (err) {
                log.debug('error from metadata', { implName: this.implName,
                    error: err });
                return cb(err);
            }
            log.trace('bucket updated in metadata');
            return cb(err);
        });
    }

    getBucket(bucketName, log, cb) {
        log.debug('getting bucket from metadata');
        this.client.getBucketAttributes(bucketName, log, (err, data) => {
            if (err) {
                log.debug('error from metadata', { implName: this.implName,
                    error: err });
                return cb(err);
            }
            log.trace('bucket retrieved from metadata');
            return cb(err, BucketInfo.fromObj(data));
        });
    }

    deleteBucket(bucketName, log, cb) {
        log.debug('deleting bucket from metadata');
        this.client.deleteBucket(bucketName, log, err => {
            if (err) {
                log.debug('error from metadata', { implName: this.implName,
                    error: err });
                return cb(err);
            }
            log.debug('Deleted bucket from Metadata');
            if (bucketNotificationHook) {
                setTimeout(bucketNotificationHook);
            }
            return cb(err);
        });
    }

    putObjectMD(bucketName, objName, objVal, params, log, cb) {
        log.debug('putting object in metadata');
        const value = typeof objVal.getValue === 'function' ?
            objVal.getValue() : objVal;
        this.client.putObject(bucketName, objName, value, params, log,
            (err, data) => {
                if (err) {
                    log.debug('error from metadata', { implName: this.implName,
                        error: err });
                    return cb(err);
                }
                if (data) {
                    log.debug('object version successfully put in metadata',
                        { version: data });
                } else {
                    log.debug('object successfully put in metadata');
                }
                return cb(err, data);
            });
    }

    getBucketAndObjectMD(bucketName, objName, params, log, cb) {
        log.debug('getting bucket and object from metadata',
            { database: bucketName, object: objName });
        this.client.getBucketAndObject(bucketName, objName, params, log,
            (err, data) => {
                if (err) {
                    log.debug('error from metadata', { implName: this.implName,
                        err });
                    return cb(err);
                }
                log.debug('bucket and object retrieved from metadata',
                    { database: bucketName, object: objName });
                return cb(err, data);
            });
    }

    getObjectMD(bucketName, objName, params, log, cb) {
        log.debug('getting object from metadata');
        this.client.getObject(bucketName, objName, params, log, (err, data) => {
            if (err) {
                log.debug('error from metadata', { implName: this.implName,
                    err });
                return cb(err);
            }
            log.debug('object retrieved from metadata');
            return cb(err, data);
        });
    }

    deleteObjectMD(bucketName, objName, params, log, cb) {
        log.debug('deleting object from metadata');
        this.client.deleteObject(bucketName, objName, params, log, err => {
            if (err) {
                log.debug('error from metadata', { implName: this.implName,
                    err });
                return cb(err);
            }
            log.debug('object deleted from metadata');
            return cb(err);
        });
    }

    listObject(bucketName, listingParams, log, cb) {
        if (listingParams.listingType === undefined) {
            // eslint-disable-next-line
            listingParams.listingType = 'Delimiter';
        }
        this.client.listObject(bucketName, listingParams, log, (err, data) => {
            log.debug('getting object listing from metadata');
            if (err) {
                log.debug('error from metadata', { implName: this.implName,
                    err });
                return cb(err);
            }
            log.debug('object listing retrieved from metadata');
            if (listingParams.listingType === 'DelimiterVersions') {
                // eslint-disable-next-line
                data.Versions = parseListEntries(data.Versions, this._listingParser);
                if (data.Versions instanceof Error) {
                    log.error('error parsing metadata listing', {
                        error: data.Versions,
                        listingType: listingParams.listingType,
                        method: 'listObject',
                    });
                    return cb(errors.InternalError);
                }
                return cb(null, data);
            }
            // eslint-disable-next-line
            data.Contents = parseListEntries(data.Contents, this._listingParser);
            if (data.Contents instanceof Error) {
                log.error('error parsing metadata listing', {
                    error: data.Contents,
                    listingType: listingParams.listingType,
                    method: 'listObject',
                });
                return cb(errors.InternalError);
            }
            return cb(null, data);
        });
    }

    listMultipartUploads(bucketName, listingParams, log, cb) {
        this.client.listMultipartUploads(bucketName, listingParams, log,
            (err, data) => {
                log.debug('getting mpu listing from metadata');
                if (err) {
                    log.debug('error from metadata', { implName: this.implName,
                        err });
                    return cb(err);
                }
                log.debug('mpu listing retrieved from metadata');
                return cb(err, data);
            });
    }

    switch(newClient, cb) {
        this.client = newClient;
        return cb();
    }

    getRaftBuckets(raftId, log, cb) {
        if (!this.client.getRaftBuckets) {
            return cb();
        }
        return this.client.getRaftBuckets(raftId, log, cb);
    }

    checkHealth(log, cb) {
        if (!this.client.checkHealth) {
            const defResp = {};
            defResp[this.implName] = { code: 200, message: 'OK' };
            return cb(null, defResp);
        }
        return this.client.checkHealth(this.implName, log, cb);
    }

    getUUID(log, cb) {
        if (!this.client.getUUID) {
            log.debug('returning empty uuid as fallback', {
                implName: this.implName });
            return cb(null, '');
        }
        return this.client.getUUID(log, cb);
    }

    getDiskUsage(log, cb) {
        if (!this.client.getDiskUsage) {
            log.debug('returning empty disk usage as fallback', {
                implName: this.implName });
            return cb(null, {});
        }
        return this.client.getDiskUsage(cb);
    }

    countItems(log, cb) {
        if (!this.client.countItems) {
            log.debug('returning zero item counts as fallback', {
                implName: this.implName });
            return cb(null, {
                buckets: 0,
                objects: 0,
                versions: 0,
            });
        }
        return this.client.countItems(log, cb);
    }

    getIngestionBuckets(log, cb) {
        if (this.implName !== 'mongoclient') {
            log.debug('error getting ingestion buckets', {
                implName: this.implName });
            return cb(errors.NotImplemented);
        }
        return this.client.getIngestionBuckets(log, cb);
    }

    notifyBucketChange(cb) {
        bucketNotificationHook = cb;
    }

    close(cb) {
        if (typeof this.client.close === 'function') {
            return this.client.close(cb);
        }
        return cb();
    }

    /**
     * deletes an object that matches the given conditions
     * @param{string} bucketName -
     * @param{string} objName -
     * @param{object} params -
     * @param{object} params.conditions - conditions object
     * @param{werelogs.RequestLogger} log -
     * @param{function} cb -
     * @returns{undefined}
     */
    deleteObjectWithCond(bucketName, objName, params, log, cb) {
        log.debug('find and delete object from metadata');
        if (typeof this.client.deleteObjectWithCond !== 'function') {
            log.debug('backend does not support deletions with conditions', {
                implName: this.implName,
            });
            return cb(errors.NotImplemented);
        }
        return this.client.deleteObjectWithCond(bucketName, objName,
            params, log, err => {
                if (err) {
                    log.debug('error from metadata', {
                        implName: this.implName,
                    });
                    return cb(err);
                }
                log.debug('object deleted from metadata');
                return cb();
            });
    }

    /**
     * updates(insert, if missing) an object that matches the given conditions
     * @param{string} bucketName -
     * @param{string} objName -
     * @param{object} objVal -
     * @param{object} params -
     * @param{object} params.conditions - conditions object
     * @param{werelogs.RequestLogger} log -
     * @param{function} cb -
     * @returns{undefined}
     */
    putObjectWithCond(bucketName, objName, objVal, params, log, cb) {
        log.debug('find and update object in metadata');
        if (typeof this.client.putObjectWithCond !== 'function') {
            log.debug('backend does not support updates with conditions', {
                implName: this.implName,
            });
            return cb(errors.NotImplemented);
        }
        return this.client.putObjectWithCond(bucketName, objName, objVal,
            params, log, err => {
                if (err) {
                    log.debug('error from metadata', {
                        implName: this.implName,
                    });
                    return cb(err);
                }
                log.debug('object successfully updated in metadata');
                return cb();
            });
    }
}

module.exports = MetadataWrapper;
