const async = require('async');

const errors = require('../../errors').default;
const { parseTagFromQuery } = require('../../s3middleware/tagging');
const { externalBackendHealthCheckInterval } = require('../../constants');
const DataFileBackend = require('./file/DataFileInterface');
const { createLogger, checkExternalBackend } = require('./external/utils');

class MultipleBackendGateway {
    constructor(clients, metadata, locStorageCheckFn) {
        this.clients = clients;
        this.metadata = metadata;
        this.locStorageCheckFn = locStorageCheckFn;
    }

    toObjectGetInfo(objectKey, bucketName, location) {
        const client = this.clients[location];
        if (!client || !client.toObjectGetInfo) {
            return null;
        }
        return client.toObjectGetInfo(objectKey, bucketName);
    }

    put(hashedStream, size, keyContext, backendInfo, reqUids, callback) {
        const controllingLocationConstraint =
            backendInfo.getControllingLocationConstraint();
        const client = this.clients[controllingLocationConstraint];
        if (!client) {
            const log = createLogger(reqUids);
            log.error('no data backend matching controlling locationConstraint',
                { controllingLocationConstraint });
            return process.nextTick(() => {
                callback(errors.InternalError);
            });
        }

        let writeStream = hashedStream;
        if (keyContext.cipherBundle && keyContext.cipherBundle.cipher) {
            writeStream = keyContext.cipherBundle.cipher;
            hashedStream.pipe(writeStream);
        }

        if (keyContext.tagging) {
            const validationTagRes = parseTagFromQuery(keyContext.tagging);
            if (validationTagRes instanceof Error) {
                const log = createLogger(reqUids);
                log.debug('tag validation failed', {
                    error: validationTagRes,
                    method: 'multipleBackendGateway put',
                });
                return callback(errors.InternalError);
            }
        }
        return client.put(writeStream, size, keyContext, reqUids,
            (err, key, dataStoreVersionId, dataStoreSize, dataStoreMD5) => {
                const log = createLogger(reqUids);
                log.debug('put to location', { controllingLocationConstraint });
                if (err) {
                    log.error('error from datastore',
                        { error: err, dataStoreType: client.clientType });
                    return callback(errors.ServiceUnavailable);
                }
                const dataRetrievalInfo = {
                    key,
                    dataStoreName: controllingLocationConstraint,
                    dataStoreType: client.clientType,
                    dataStoreVersionId,
                    dataStoreSize,
                    dataStoreMD5,
                };
                return callback(null, dataRetrievalInfo);
            // sproxyd accepts keyschema, send as null so sproxyd generates key
            // send metadata as param for AzureClient in Arsenal
            }, null, this.metadata);
    }

    head(objectGetInfoArr, reqUids, callback) {
        if (!objectGetInfoArr || !Array.isArray(objectGetInfoArr)
        || !objectGetInfoArr[0] || !objectGetInfoArr[0].dataStoreName) {
            // no-op if no stored data store name
            return process.nextTick(callback);
        }
        const objectGetInfo = objectGetInfoArr[0];
        const client = this.clients[objectGetInfo.dataStoreName];
        if (client.head === undefined) {
            // no-op if unsupported client method
            return process.nextTick(callback);
        }
        return client.head(objectGetInfo, reqUids, callback);
    }

    get(objectGetInfo, range, reqUids, callback) {
        let key;
        let client;
        // for backwards compatibility
        if (typeof objectGetInfo === 'string') {
            key = objectGetInfo;
            client = this.clients.sproxyd;
        } else {
            key = objectGetInfo.key;
            client = this.clients[objectGetInfo.dataStoreName];
        }
        if (client.clientType === 'scality') {
            return client.get(key, range, reqUids, callback);
        }
        return client.get(objectGetInfo, range, reqUids, callback);
    }

    delete(objectGetInfo, reqUids, callback) {
        let key;
        let client;
        // for backwards compatibility
        if (typeof objectGetInfo === 'string') {
            key = objectGetInfo;
            client = this.clients.sproxyd;
        } else {
            key = objectGetInfo.key;
            client = this.clients[objectGetInfo.dataStoreName];
        }
        if (client.clientType === 'scality') {
            return client.delete(key, reqUids, callback);
        }
        return client.delete(objectGetInfo, reqUids, callback);
    }

    batchDelete(dataStoreName, keys, log, callback) {
        const client = this.clients[dataStoreName];
        if (client.batchDelete) {
            log.debug('submitting keys for batch delete', { keys });
            return client.batchDelete(keys, log.getSerializedUids(), callback);
        }
        return callback(errors.NotImplemented);
    }

    healthcheck(flightCheckOnStartUp, log, callback) {
        const multBackendResp = {};
        const awsArray = [];
        const azureArray = [];
        const gcpArray = [];
        async.each(Object.keys(this.clients), (location, cb) => {
            const client = this.clients[location];
            if (client.clientType === 'scality') {
                return client.healthcheck(log, (err, res) => {
                    if (err) {
                        multBackendResp[location] = { error: err };
                    } else {
                        multBackendResp[location] = { code: res.statusCode,
                            message: res.statusMessage };
                    }
                    return cb();
                });
            } else if (client.clientType === 'aws_s3') {
                awsArray.push(location);
                return cb();
            } else if (client.clientType === 'azure') {
                azureArray.push(location);
                return cb();
            } else if (client.clientType === 'gcp') {
                gcpArray.push(location);
                return cb();
            }
            // if backend type isn't 'scality' or an external backend, it will
            // be 'mem' or 'file', for which the default response is 200 OK
            multBackendResp[location] = { code: 200, message: 'OK' };
            return cb();
        }, () => {
            async.parallel([
                next => checkExternalBackend(
                    this.clients, awsArray, 'aws_s3', flightCheckOnStartUp,
                    externalBackendHealthCheckInterval, next),
                next => checkExternalBackend(
                    this.clients, azureArray, 'azure', flightCheckOnStartUp,
                    externalBackendHealthCheckInterval, next),
                next => checkExternalBackend(
                    this.clients, gcpArray, 'gcp', flightCheckOnStartUp,
                    externalBackendHealthCheckInterval, next),
            ], (errNull, externalResp) => {
                const externalLocResults = [];
                externalResp.forEach(resp => externalLocResults.push(...resp));
                externalLocResults.forEach(locationResult =>
                    Object.assign(multBackendResp, locationResult));
                callback(null, multBackendResp);
            });
        });
    }

    createMPU(key, metaHeaders, bucketName, websiteRedirectHeader,
        location, contentType, cacheControl, contentDisposition,
        contentEncoding, tagging, log, cb) {
        const client = this.clients[location];
        if (client.clientType === 'aws_s3' || client.clientType === 'gcp') {
            return client.createMPU(key, metaHeaders, bucketName,
                websiteRedirectHeader, contentType, cacheControl,
                contentDisposition, contentEncoding, tagging, log, cb);
        }
        return cb();
    }

    uploadPart(request, streamingV4Params, stream, size, location, key,
        uploadId, partNumber, bucketName, log, cb) {
        const client = this.clients[location];

        if (client.uploadPart) {
            return this.locStorageCheckFn(location, size, log, err => {
                if (err) {
                    return cb(err);
                }
                return client.uploadPart(request, streamingV4Params, stream,
                    size, key, uploadId, partNumber, bucketName, log,
                    (err, partInfo) => {
                        if (err) {
                        // if error putting part, counter should be decremented
                            return this.locStorageCheckFn(location, -size, log,
                                error => {
                                    if (error) {
                                        log.error('Error decrementing location ' +
                                    'metric following object PUT failure',
                                        { error: error.message });
                                    }
                                    return cb(err);
                                });
                        }
                        return cb(null, partInfo);
                    });
            });
        }
        return cb();
    }

    listParts(key, uploadId, location, bucketName, partNumberMarker, maxParts,
        log, cb) {
        const client = this.clients[location];

        if (client.listParts) {
            return client.listParts(key, uploadId, bucketName, partNumberMarker,
                maxParts, log, cb);
        }
        return cb();
    }

    completeMPU(key, uploadId, location, jsonList, mdInfo, bucketName,
        userMetadata, contentSettings, tagging, log, cb) {
        const client = this.clients[location];
        if (client.completeMPU) {
            const args = [jsonList, mdInfo, key, uploadId, bucketName];
            if (client.clientType === 'azure') {
                args.push(userMetadata, contentSettings, tagging);
            }
            return client.completeMPU(...args, log, (err, completeObjData) => {
                if (err) {
                    return cb(err);
                }
                // eslint-disable-next-line no-param-reassign
                completeObjData.dataStoreType = client.clientType;
                return cb(null, completeObjData);
            });
        }
        return cb();
    }

    abortMPU(key, uploadId, location, bucketName, log, cb) {
        const client = this.clients[location];
        const skipDataDelete = true;
        if (client.clientType === 'azure') {
            return cb(null, skipDataDelete);
        }
        if (client.abortMPU) {
            return client.abortMPU(key, uploadId, bucketName, log, err => {
                if (err) {
                    return cb(err);
                }
                if (client.clientType === 'gcp') {
                    return cb(null, skipDataDelete);
                }
                return cb();
            });
        }
        return cb();
    }

    objectTagging(method, key, bucket, objectMD, log, cb) {
        // if legacy, objectMD will not contain dataStoreName, so just return
        const client = this.clients[objectMD.dataStoreName];
        if (client && client[`object${method}Tagging`]) {
            return client[`object${method}Tagging`](key, bucket, objectMD, log,
                cb);
        }
        return cb();
    }

    // NOTE: using copyObject only if copying object from one external
    // backend to the same external backend
    copyObject(request, destLocationConstraintName, externalSourceKey,
        sourceLocationConstraintName, storeMetadataParams, config, log, cb) {
        const client = this.clients[destLocationConstraintName];
        if (client.copyObject) {
            return this.locStorageCheckFn(destLocationConstraintName,
                storeMetadataParams.size, log, err => {
                    if (err) {
                        cb(err);
                    }
                    return client.copyObject(request, destLocationConstraintName,
                        externalSourceKey, sourceLocationConstraintName,
                        storeMetadataParams, config, log,
                        (err, key, dataStoreVersionId) => {
                            const dataRetrievalInfo = {
                                key,
                                dataStoreName: destLocationConstraintName,
                                dataStoreType: client.clientType,
                                dataStoreVersionId,
                            };
                            if (err) {
                                // if error copying obj, counter should be decremented
                                return this.locStorageCheckFn(
                                    destLocationConstraintName, -storeMetadataParams.size,
                                    log, error => {
                                        if (error) {
                                            log.error('Error decrementing location ' +
                                    'metric following object PUT failure',
                                            { error: error.message });
                                        }
                                        return cb(err);
                                    });
                            }
                            return cb(null, dataRetrievalInfo);
                        });
                });
        }
        return cb(errors.NotImplemented
            .customizeDescription('Can not copy object from ' +
            `${client.clientType} to ${client.clientType}`));
    }

    uploadPartCopy(request, location, awsSourceKey,
        sourceLocationConstraintName, config, log, cb) {
        const client = this.clients[location];
        if (client.uploadPartCopy) {
            return client.uploadPartCopy(request, awsSourceKey,
                sourceLocationConstraintName, config,
                log, cb);
        }
        return cb(errors.NotImplemented.customizeDescription(
            'Can not copy object from ' +
          `${client.clientType} to ${client.clientType}`));
    }

    protectAzureBlocks(bucketName, objectKey, location, log, cb) {
        const client = this.clients[location];
        if (client.protectAzureBlocks) {
            return client.protectAzureBlocks(this.metadata, bucketName,
                objectKey, location, log, cb);
        }
        return cb();
    }

    getDiskUsage(config, reqUids, callback) {
        new DataFileBackend(config).getDiskUsage(config, reqUids, callback);
    }
}

module.exports = MultipleBackendGateway;
