const async = require('async');
const PassThrough = require('stream').PassThrough;
const assert = require('assert');

const errors = require('../../errors');
const MD5Sum = require('../../s3middleware/MD5Sum');
const NullStream = require('../../s3middleware/nullStream');
const RelayMD5Sum = require('./utils/RelayMD5Sum');
const backendUtils = require('./external/utils');
const constants = require('../../constants');
const BackendInfo = require('../../models/BackendInfo');

const externalBackends = constants.externalBackends;
const skipError = new Error('skip');
const MAX_RETRY = 2;

const externalVersioningErrorMessage = 'We do not currently support putting ' +
'a versioned object to a location-constraint of type Azure or GCP.';

class DataWrapper {
    constructor(client, implName, config, kms, metadata, locStorageCheckFn,
    vault) {
        this.client = client;
        this.implName = implName;
        this.config = config;
        this.kms = kms;
        this.metadata = metadata;
        this.locStorageCheckFn = locStorageCheckFn;
        this.vault = vault;
    }

    put(cipherBundle, value, valueSize, keyContext, backendInfo, log, cb) {
        const location = backendInfo.getControllingLocationConstraint();
        return this.locStorageCheckFn(location, valueSize, log, err => {
            if (err) {
                return cb(err);
            }
            return this._put(cipherBundle, value, valueSize, keyContext,
            backendInfo, log, (err, dataRetrievalInfo, hashedStream) => {
                if (err) {
                    // if error putting object, counter should be decremented
                    return this.locStorageCheckFn(location, -valueSize, log,
                    error => {
                        if (error) {
                            log.error('Error decrementing location metric ' +
                                'following object PUT failure',
                                { error: error.message });
                        }
                        return cb(err);
                    });
                }
                if (hashedStream) {
                    if (hashedStream.completedHash) {
                        return cb(null, dataRetrievalInfo, hashedStream);
                    }
                    hashedStream.on('hashed', () => {
                        hashedStream.removeAllListeners('hashed');
                        return cb(null, dataRetrievalInfo, hashedStream);
                    });
                    return undefined;
                }
                return cb(null, dataRetrievalInfo);
            });
        });
    }

    head(objectGetInfo, log, cb) {
        if (this.implName !== 'multipleBackends') {
            // no-op if not multipleBackend implementation;
            // head is used during get just to check external backend data state
            return process.nextTick(cb);
        }
        return this.client.head(objectGetInfo, log.getSerializedUids(), cb);
    }

    get(objectGetInfo, response, log, cb) {
        const isMdModelVersion2 = typeof(objectGetInfo) === 'string';
        const isRequiredStringKey =
            constants.clientsRequireStringKey[this.implName];
        const key = isMdModelVersion2 ? objectGetInfo : objectGetInfo.key;
        const clientGetInfo = isRequiredStringKey ? key : objectGetInfo;
        const range = objectGetInfo.range;

        // If the key is explicitly set to null, the part to
        // be read doesn't really exist and is only made of zeroes.
        // This functionality is used by Scality-NFSD.
        // Otherwise, the key is always defined
        assert(key === null || key !== undefined);
        if (key === null) {
            cb(null, new NullStream(objectGetInfo.size, range));
            return;
        }
        log.debug('sending get to datastore',
            { implName: this.implName, key, range, method: 'get' });
        // We need to use response as a writable stream for AZURE GET
        if (!isMdModelVersion2 && !isRequiredStringKey && response) {
            clientGetInfo.response = response;
        }
        this.client.get(clientGetInfo, range, log.getSerializedUids(),
        (err, stream) => {
            if (err) {
                log.error('get error from datastore',
                    { error: err, implName: this.implName });
                return cb(errors.ServiceUnavailable);
            }
            if (objectGetInfo.cipheredDataKey) {
                const serverSideEncryption = {
                    cryptoScheme: objectGetInfo.cryptoScheme,
                    masterKeyId: objectGetInfo.masterKeyId,
                    cipheredDataKey: Buffer.from(
                        objectGetInfo.cipheredDataKey, 'base64'),
                };
                const offset = objectGetInfo.range ? objectGetInfo.range[0] : 0;
                return this.kms.createDecipherBundle(serverSideEncryption,
                offset, log, (err, decipherBundle) => {
                    if (err) {
                        log.error('cannot get decipher bundle from kms',
                            { method: 'data.wrapper.data.get' });
                        return cb(err);
                    }
                    stream.pipe(decipherBundle.decipher);
                    return cb(null, decipherBundle.decipher);
                });
            }
            return cb(null, stream);
        });
    }

    delete(objectGetInfo, log, cb) {
        const callback = cb || log.end;
        const isMdModelVersion2 = typeof(objectGetInfo) === 'string';
        const isRequiredStringKey =
            constants.clientsRequireStringKey[this.implName];
        const key = isMdModelVersion2 ? objectGetInfo : objectGetInfo.key;
        const clientGetInfo = isRequiredStringKey ? key : objectGetInfo;

        log.trace('sending delete to datastore',
            { implName: this.implName, key, method: 'delete' });
        // If the key is explicitly set to null, the part to
        // be deleted doesn't really exist.
        // This functionality is used by Scality-NFSD.
        // Otherwise, the key is always defined
        assert(key === null || key !== undefined);
        if (key === null) {
            callback(null);
            return;
        }
        this._retryDelete(clientGetInfo, log, 0, err => {
            if (err && !err.ObjNotFound) {
                log.error('delete error from datastore',
                    { error: err, key: objectGetInfo.key, moreRetries: 'no' });
            }
            if (!err) {
                // pass size as negative so location metric is decremented
                return this.locStorageCheckFn(objectGetInfo.dataStoreName,
                -objectGetInfo.size, log, err => {
                    if (err) {
                        log.error('Utapi error pushing location metric', {
                            error: err,
                            key: objectGetInfo.key,
                            method: 'locationStorageCheck' });
                    }
                    return callback(err);
                });
            }
            return callback(err);
        });
    }

    batchDelete(locations, requestMethod, newObjDataStoreName, log, cb) {
        // TODO: The method of persistence of sproxy delete key will
        // be finalized; refer Issue #312 for the discussion. In the
        // meantime, we at least log the location of the data we are
        // about to delete before attempting its deletion.
        if (this._shouldSkipDelete(locations, requestMethod,
        newObjDataStoreName)) {
            return process.nextTick(cb);
        }
        log.trace('initiating batch delete', {
            keys: locations,
            implName: this.implName,
            method: 'batchDelete',
        });
        const keys = [];
        let backendName = '';
        const shouldBatchDelete = locations.every(l => {
            // legacy sproxyd location, should fallback to using regular delete
            if (typeof l === 'string') {
                return false;
            }
            if (!('batchDelete' in this.client)) {
                return false;
            }
            const { dataStoreName, key } = l;
            backendName = dataStoreName;
            const type = this.config.getLocationConstraintType(dataStoreName);
            // filter out possible `null` created by NFS
            if (key && type === 'scality') {
                keys.push(key);
                return true;
            }
            return false;
        });
        if (shouldBatchDelete && keys.length > 1) {
            return this.client.batchDelete(backendName, { keys }, log, cb);
        }
        return async.eachLimit(locations, 5, (loc, next) => {
            process.nextTick(() => this.delete(loc, log, next));
        },
        err => {
            if (err) {
                log.end().error('batch delete failed', { error: err });
		// deletion of non-existing objects result in 204
                if (err.code === 404) {
                    return cb();
                }
                return cb(err);
            }
            log.end().trace('batch delete successfully completed');
            return cb();
        });
    }

    switch(newClient) {
        this.client = newClient;
        return this.client;
    }

    checkHealth(log, cb, flightCheckOnStartUp) {
        if (!this.client.healthcheck) {
            const defResp = {};
            defResp[this.implName] = { code: 200, message: 'OK' };
            return cb(null, defResp);
        }
        return this.client.healthcheck(flightCheckOnStartUp, log,
        (err, result) => {
            let respBody = {};
            if (err) {
                log.error(`error from ${this.implName}`, { error: err });
                respBody[this.implName] = {
                    error: err,
                };
                // error returned as null so async parallel doesn't return
                // before all backends are checked
                return cb(null, respBody);
            }
            if (this.implName === 'multipleBackends') {
                respBody = result;
                return cb(null, respBody);
            }
            respBody[this.implName] = {
                code: result.statusCode,
                message: result.statusMessage,
            };
            return cb(null, respBody);
        });
    }

    getDiskUsage(log, cb) {
        if (!this.client.getDiskUsage) {
            log.debug('returning empty disk usage as fallback',
                { implName: this.implName });
            return cb(null, {});
        }
        return this.client.getDiskUsage(this.config,
            log.getSerializedUids(), cb);
    }

    /**
     * copyObject - copy object
     * @param {object} request - request object
     * @param {string} sourceLocationConstraintName -
     * source locationContraint name (awsbackend, azurebackend, ...)
     * @param {object} storeMetadataParams - metadata information of the
     * source object
     * @param {array} dataLocator - source object metadata location(s)
     * NOTE: for Azure and AWS data backend this array only has one item
     * @param {object} dataStoreContext - information of the destination object
     * dataStoreContext.bucketName: destination bucket name,
     * dataStoreContext.owner: owner,
     * dataStoreContext.namespace: request namespace,
     * dataStoreContext.objectKey: destination object key name,
     * @param {BackendInfo} destBackendInfo - Instance of BackendInfo:
     * Represents the info necessary to evaluate which data backend to use
     * on a data put call.
     * @param {object} sourceBucketMD - metadata of the source bucket
     * @param {object} destBucketMD - metadata of the destination bucket
     * @param {object} log - Werelogs request logger
     * @param {function} cb - callback
     * @returns {function} cb - callback
     */
    copyObject(request, sourceLocationConstraintName, storeMetadataParams,
    dataLocator, dataStoreContext, destBackendInfo, sourceBucketMD,
    destBucketMD, log, cb) {
        const serverSideEncryption = destBucketMD.getServerSideEncryption();
        if (this.config.backends.data === 'multiple' &&
        backendUtils.externalBackendCopy(this.config,
        sourceLocationConstraintName, storeMetadataParams.dataStoreName,
        sourceBucketMD, destBucketMD)) {
            const destLocationConstraintName =
                storeMetadataParams.dataStoreName;
            const objectGetInfo = dataLocator[0];
            const externalSourceKey = objectGetInfo.key;
            return this.client.copyObject(request, destLocationConstraintName,
            externalSourceKey, sourceLocationConstraintName,
            storeMetadataParams, this.config, log,
            (error, objectRetrievalInfo) => {
                if (error) {
                    return cb(error);
                }
                const putResult = {
                    key: objectRetrievalInfo.key,
                    dataStoreName: objectRetrievalInfo.dataStoreName,
                    dataStoreType: objectRetrievalInfo.dataStoreType,
                    dataStoreVersionId: objectRetrievalInfo.dataStoreVersionId,
                    size: storeMetadataParams.size,
                    dataStoreETag: objectGetInfo.dataStoreETag,
                    start: objectGetInfo.start,
                };
                const putResultArr = [putResult];
                return cb(null, putResultArr);
            });
        }

        const that = this;
        // dataLocator is an array.  need to get and put all parts
        // For now, copy 1 part at a time. Could increase the second
        // argument here to increase the number of parts
        // copied at once.
        return async.mapLimit(dataLocator, 1,
        // eslint-disable-next-line prefer-arrow-callback
        function copyPart(part, copyCb) {
            if (part.dataStoreType === 'azure') {
                const passThrough = new PassThrough();
                return async.parallel([
                    parallelCb => that.get(part, passThrough, log, err =>
                        parallelCb(err)),
                    parallelCb => that._dataCopyPut(serverSideEncryption,
                        passThrough, part, dataStoreContext,
                        destBackendInfo, log, parallelCb),
                ], (err, res) => {
                    if (err) {
                        return copyCb(err);
                    }
                    return copyCb(null, res[1]);
                });
            }
            return that.get(part, null, log, (err, stream) => {
                if (err) {
                    return copyCb(err);
                }
                return that._dataCopyPut(serverSideEncryption, stream,
                part, dataStoreContext, destBackendInfo, log, copyCb);
            });
        }, (err, results) => {
            if (err) {
                log.debug('error transferring data from source',
                    { error: err });
                return cb(err);
            }
            return cb(null, results);
        });
    }

    /**
     * uploadPartCopy - put copy part
     * @param {object} request - request object
     * @param {object} log - Werelogs request logger
     * @param {object} destBucketMD - destination bucket metadata
     * @param {string} sourceLocationConstraintName -
     * source locationContraint name (awsbackend, azurebackend, ...)
     * @param {string} destLocationConstraintName -
     * location of the destination MPU object (awsbackend, azurebackend, ...)
     * @param {array} dataLocator - source object metadata location(s)
     * NOTE: for Azure and AWS data backend this array
     * @param {object} dataStoreContext - information of the destination object
     * dataStoreContext.bucketName: destination bucket name,
     * dataStoreContext.owner: owner,
     * dataStoreContext.namespace: request namespace,
     * dataStoreContext.objectKey: destination object key name,
     * dataStoreContext.uploadId: uploadId
     * dataStoreContext.partNumber: request.query.partNumber
     * @param {function} lcCheckFn: locationConstraintCheck function
     * @param {function} callback - callback
     * @returns {function} cb - callback
     */
    uploadPartCopy(request, log, destBucketMD, sourceLocationConstraintName,
    destLocationConstraintName, dataLocator, dataStoreContext, lcCheckFn,
    callback) {
        const serverSideEncryption = destBucketMD.getServerSideEncryption();
        const lastModified = new Date().toJSON();

        // skip if 0 byte object
        if (dataLocator.length === 0) {
            return process.nextTick(() => {
                callback(null, constants.emptyFileMd5, lastModified,
                    serverSideEncryption, []);
            });
        }

        // if destination mpu was initiated in legacy version
        if (destLocationConstraintName === undefined) {
            const backendInfoObj = lcCheckFn(request,
                null, destBucketMD, log);
            if (backendInfoObj.err) {
                return process.nextTick(() => {
                    callback(backendInfoObj.err);
                });
            }
            // eslint-disable-next-line no-param-reassign
            destLocationConstraintName = backendInfoObj.controllingLC;
        }

        const srcType =
            this.config.getLocationConstraintType(sourceLocationConstraintName);
        const dstType =
            this.config.getLocationConstraintType(destLocationConstraintName);
        const locationTypeMatch =
            this.config.backends.data === 'multiple' && srcType === dstType &&
            constants.hasCopyPartBackends[srcType];

        // NOTE: using multipleBackendGateway.uploadPartCopy only if copying
        // from AWS to AWS or from GCP to GCP
        if (locationTypeMatch && dataLocator.length === 1) {
            const sourceKey = dataLocator[0].key;
            return this.client.uploadPartCopy(request,
            destLocationConstraintName, sourceKey, sourceLocationConstraintName,
            this.config, log, (error, eTag) => {
                if (error) {
                    return callback(error);
                }
                const doSkip = srcType === 'aws' ? skipError : null;
                return callback(doSkip, eTag, lastModified,
                    serverSideEncryption);
            });
        }

        const backendInfo = new BackendInfo(this._config,
            destLocationConstraintName);

        // totalHash will be sent through the RelayMD5Sum transform streams
        // to collect the md5 from multiple streams
        let totalHash;
        const locations = [];
        const that = this;
        // dataLocator is an array, need to get and put all parts
        // in order so can get the ETag of full object
        return async.forEachOfSeries(dataLocator,
        // eslint-disable-next-line prefer-arrow-callback
        function copyPart(part, index, cb) {
            if (part.dataStoreType === 'azure') {
                const passThrough = new PassThrough();
                return async.parallel([
                    next => that.get(part, passThrough, log, err => {
                        if (err) {
                            log.error('error getting data part from Azure',
                                {
                                    error: err,
                                    method: 'objectPutCopyPart::' +
                                        'multipleBackendGateway.copyPart',
                                });
                            return next(err);
                        }
                        return next();
                    }),
                    next => that._dataCopyPutPart(request,
                        serverSideEncryption, passThrough, part,
                        dataStoreContext, backendInfo, locations, log, next),
                ], err => {
                    if (err) {
                        return cb(err);
                    }
                    return cb();
                });
            }
            return that.get(part, null, log, (err, stream) => {
                if (err) {
                    log.debug('error getting object part', { error: err });
                    return cb(err);
                }
                const hashedStream =
                    new RelayMD5Sum(totalHash, updatedHash => {
                        totalHash = updatedHash;
                    });
                stream.pipe(hashedStream);

                // destLocationConstraintName is location of the
                // destination MPU object
                return that._dataCopyPutPart(request, serverSideEncryption,
                    hashedStream, part, dataStoreContext, backendInfo,
                    locations, log, cb);
            });
        }, err => {
            // Digest the final combination of all of the part streams
            if (err && err !== skipError) {
                log.debug('error transferring data from source',
                    { error: err, method: 'goGetData' });
                return callback(err);
            }
            if (totalHash) {
                totalHash = totalHash.digest('hex');
            } else {
                totalHash = locations[0].dataStoreETag;
            }
            if (err && err === skipError) {
                return callback(skipError, totalHash, lastModified,
                    serverSideEncryption);
            }
            return callback(null, totalHash, lastModified,
                serverSideEncryption, locations);
        });
    }

    abortMPU(objectKey, uploadId, location, bucketName, request, destBucket,
    lcCheckFn, log, callback) {
        if (this.config.backends.data === 'multiple') {
            // if controlling location constraint is not stored in object
            // metadata, mpu was initiated in legacy S3C, so need to
            // determine correct location constraint
            if (location === undefined) {
                const backendInfoObj = lcCheckFn(request, null,
                    destBucket, log);
                if (backendInfoObj.err) {
                    return process.nextTick(() => {
                        callback(backendInfoObj.err);
                    });
                }
                // eslint-disable-next-line no-param-reassign
                location = backendInfoObj.controllingLC;
            }

            return this.client.abortMPU(objectKey, uploadId, location,
            bucketName, log, callback);
        }
        return callback(null, false);
    }

    completeMPU(request, mpuInfo, mdInfo, location, userMetadata,
    contentSettings, tagging, lcCheckFn, log, callback) {
        const { objectKey, uploadId, jsonList, bucketName, destBucket } =
            mpuInfo;
        if (this.config.backends.data === 'multiple') {
            // if mpu was initiated in legacy version
            if (location === undefined) {
                const backendInfoObj = lcCheckFn(request, null,
                    destBucket, log);
                if (backendInfoObj.err) {
                    return process.nextTick(() => {
                        callback(backendInfoObj.err);
                    });
                }
                // eslint-disable-next-line no-param-reassign
                location = backendInfoObj.controllingLC;
            }
            return this.client.completeMPU(objectKey, uploadId, location,
                jsonList, mdInfo, bucketName, userMetadata, contentSettings,
                tagging, log, callback);
        }
        return callback();
    }

    initiateMPU(mpuInfo, websiteRedirectHeader, log, callback) {
        const {
            objectKey,
            metaHeaders,
            bucketName,
            locConstraint,
            destinationBucket,
            // the next for properties are used for backbeat
            contentType,
            cacheControl,
            contentDisposition,
            contentEncoding,
            tagging,
        } = mpuInfo;
        if (this.config.backends.data === 'multiple') {
            return this.client.createMPU(objectKey, metaHeaders,
            bucketName, websiteRedirectHeader, locConstraint, contentType,
            cacheControl, contentDisposition, contentEncoding, tagging, log,
            (err, dataBackendResObj) => {
                if (err) {
                    return callback(err);
                }
                const configLoc =
                    this.config.locationConstraints[locConstraint];
                if (locConstraint && configLoc && configLoc.type &&
                constants.versioningNotImplBackends[configLoc.type]) {
                    const vcfg = destinationBucket.getVersioningConfiguration();
                    const isVersionedObj = vcfg && vcfg.Status === 'Enabled';
                    if (isVersionedObj) {
                        log.debug(externalVersioningErrorMessage,
                            { method: 'initiateMultipartUpload',
                                error: errors.NotImplemented });
                        return callback(errors.NotImplemented
                            .customizeDescription(
                            externalVersioningErrorMessage),
                            null, isVersionedObj);
                    }
                }
                return callback(null, dataBackendResObj);
            });
        }
        return callback();
    }

    listParts(mpuInfo, request, lcCheckFn, log, callback) {
        const {
            objectKey,
            uploadId,
            bucketName,
            partNumberMarker,
            maxParts,
            mpuOverviewObj,
            destBucket,
        } = mpuInfo;
        if (this.config.backends.data === 'multiple') {
            let location;
            // if controlling location constraint is not stored in object
            // metadata, mpu was initiated in legacy S3C, so need to
            // determine correct location constraint
            if (!mpuOverviewObj.controllingLocationConstraint) {
                const backendInfoObj = lcCheckFn(request, null,
                    destBucket, log);
                if (backendInfoObj.err) {
                    return process.nextTick(() => {
                        callback(backendInfoObj.err);
                    });
                }
                location = backendInfoObj.controllingLC;
            } else {
                location = mpuOverviewObj.controllingLocationConstraint;
            }
            return this.client.listParts(objectKey, uploadId,
            location, bucketName, partNumberMarker, maxParts, log,
            (err, backendPartList) => {
                if (err) {
                    return callback(err);
                }
                return callback(null, backendPartList);
            });
        }
        return callback();
    }

    putPart(request, mpuInfo, streamingV4Params, objectLocationConstraint,
    lcCheckFn, log, callback) {
        const {
            stream,
            destinationBucket,
            size,
            objectKey,
            uploadId,
            partNumber,
            bucketName,
        } = mpuInfo;
        if (this.config.backends.data === 'multiple') {
            // if mpu was initiated in legacy version
            if (objectLocationConstraint === undefined) {
                const backendInfoObj = lcCheckFn(request,
                    null, destinationBucket, log);
                if (backendInfoObj.err) {
                    return process.nextTick(() => {
                        callback(backendInfoObj.err);
                    });
                }
                // eslint-disable-next-line no-param-reassign
                objectLocationConstraint = backendInfoObj.controllingLC;
            }
            return this.client.uploadPart(request,
            streamingV4Params, stream, size, objectLocationConstraint,
            objectKey, uploadId, partNumber, bucketName, log,
            (err, partInfo) => {
                if (err) {
                    log.error('error putting part to data backend', {
                        error: err,
                        method:
                        'objectPutPart::multipleBackendGateway.uploadPart',
                    });
                    return callback(err);
                }
                return callback(null, partInfo, objectLocationConstraint);
            });
        }
        return callback();
    }

    objectTagging(method, objectKey, bucket, objectMD, log, callback) {
        if (this.config.backends.data === 'multiple') {
            return this.client.objectTagging(method, objectKey,
            bucket, objectMD, log, err => callback(err));
        }
        return callback();
    }

    toObjectGetInfo(objectKey, bucketName, storageLocation) {
        if (this.client.toObjectGetInfo) {
            return this.client.toObjectGetInfo(objectKey, bucketName,
                storageLocation);
        }
        return null;
    }

    protectAzureBlocks(bucketName, objectKey, objGetInfo, log, callback) {
        if (objGetInfo && objGetInfo[0] &&
        this.config.backends.data === 'multiple') {
            return this.client.protectAzureBlocks(bucketName, objectKey,
                objGetInfo[0].dataStoreName, log, err => {
                    if (err) {
                        return callback(err.customizeDescription('Error ' +
                            `deleting object on Azure: ${err.message}`));
                    }
                    return callback();
                });
        }
        return callback();
    }

   /**
    * _putForCopy - put used for copying object
    * @param {object} cipherBundle - cipher bundle that encrypt the data
    * @param {object} stream - stream containing the data
    * @param {object} part - element of dataLocator array
    * @param {object} dataStoreContext - information of the
    * destination object
    * dataStoreContext.bucketName: destination bucket name,
    * dataStoreContext.owner: owner,
    * dataStoreContext.namespace: request namespace,
    * dataStoreContext.objectKey: destination object key name,
    * @param {BackendInfo} destBackendInfo - Instance of BackendInfo:
    * Represents the info necessary to evaluate which data backend to use
    * on a data put call.
    * @param {object} log - Werelogs request logger
    * @param {function} cb - callback
    * @returns {function} cb - callback
    */
    _putForCopy(cipherBundle, stream, part, dataStoreContext, destBackendInfo,
    log, cb) {
        return this.put(cipherBundle, stream, part.size, dataStoreContext,
        destBackendInfo, log, (error, partRetrievalInfo) => {
            if (error) {
                return cb(error);
            }
            const partResult = {
                key: partRetrievalInfo.key,
                dataStoreName: partRetrievalInfo
                    .dataStoreName,
                dataStoreType: partRetrievalInfo
                    .dataStoreType,
                start: part.start,
                size: part.size,
            };
            if (cipherBundle) {
                partResult.cryptoScheme = cipherBundle.cryptoScheme;
                partResult.cipheredDataKey = cipherBundle.cipheredDataKey;
            }
            if (part.dataStoreETag) {
                partResult.dataStoreETag = part.dataStoreETag;
            }
            if (partRetrievalInfo.dataStoreVersionId) {
                partResult.dataStoreVersionId =
                partRetrievalInfo.dataStoreVersionId;
            }
            return cb(null, partResult);
        });
    }

    /**
     * _dataCopyPut - put used for copying object with and without encryption
     * @param {string} serverSideEncryption - Server side encryption
     * @param {object} stream - stream containing the data
     * @param {object} part - element of dataLocator array
     * @param {object} dataStoreContext - information of the destination object
     * dataStoreContext.bucketName: destination bucket name,
     * dataStoreContext.owner: owner,
     * dataStoreContext.namespace: request namespace,
     * dataStoreContext.objectKey: destination object key name
     * @param {BackendInfo} destBackendInfo - Instance of BackendInfo:
     * Represents the info necessary to evaluate which data backend to use
     * on a data put call.
     * @param {object} log - Werelogs request logger
     * @param {function} cb - callback
     * @returns {function} cb - callback
     */
    _dataCopyPut(serverSideEncryption, stream, part, dataStoreContext,
    destBackendInfo, log, cb) {
        if (serverSideEncryption) {
            return this.kms.createCipherBundle(serverSideEncryption, log,
            (err, cipherBundle) => {
                if (err) {
                    log.debug('error getting cipherBundle');
                    return cb(errors.InternalError);
                }
                return this._putForCopy(cipherBundle, stream, part,
                    dataStoreContext, destBackendInfo, log, cb);
            });
        }
        // Copied object is not encrypted so just put it
        // without a cipherBundle
        return this._putForCopy(null, stream, part, dataStoreContext,
            destBackendInfo, log, cb);
    }

    _dataCopyPutPart(request, serverSideEncryption, stream, part,
    dataStoreContext, destBackendInfo, locations, log, cb) {
        const numberPartSize = Number.parseInt(part.size, 10);
        const partNumber = Number.parseInt(request.query.partNumber, 10);
        const uploadId = request.query.uploadId;
        const destObjectKey = request.objectKey;
        const destBucketName = request.bucketName;
        const destLocationConstraintName = destBackendInfo
            .getControllingLocationConstraint();
        if (externalBackends[this.config.locationConstraints
        [destLocationConstraintName].type]) {
            return this.client.uploadPart(null, null, stream,
            numberPartSize, destLocationConstraintName, destObjectKey, uploadId,
            partNumber, destBucketName, log, (err, partInfo) => {
                if (err) {
                    log.error('error putting part to AWS', {
                        error: err,
                        method: 'objectPutCopyPart::' +
                            'multipleBackendGateway.uploadPart',
                    });
                    return cb(errors.ServiceUnavailable);
                }
                // skip to end of waterfall because don't need to store
                // part metadata
                if (partInfo && partInfo.dataStoreType === 'aws_s3') {
                    // if data backend handles MPU, skip to end of waterfall
                    const partResult = {
                        dataStoreETag: partInfo.dataStoreETag,
                    };
                    locations.push(partResult);
                    return cb(skipError, partInfo.dataStoreETag);
                } else if (partInfo && partInfo.dataStoreType === 'azure') {
                    const partResult = {
                        key: partInfo.key,
                        dataStoreName: partInfo.dataStoreName,
                        dataStoreETag: partInfo.dataStoreETag,
                        size: numberPartSize,
                        numberSubParts: partInfo.numberSubParts,
                        partNumber: partInfo.partNumber,
                    };
                    locations.push(partResult);
                    return cb();
                } else if (partInfo && partInfo.dataStoreType === 'gcp') {
                    const partResult = {
                        key: partInfo.key,
                        dataStoreName: partInfo.dataStoreName,
                        dataStoreETag: partInfo.dataStoreETag,
                        size: numberPartSize,
                        partNumber: partInfo.partNumber,
                    };
                    locations.push(partResult);
                    return cb();
                }
                return cb(skipError);
            });
        }
        if (serverSideEncryption) {
            return this.kms.createCipherBundle(serverSideEncryption, log,
            (err, cipherBundle) => {
                if (err) {
                    log.debug('error getting cipherBundle', { error: err });
                    return cb(errors.InternalError);
                }
                return this.put(cipherBundle, stream, numberPartSize,
                dataStoreContext, destBackendInfo, log,
                (error, partRetrievalInfo, hashedStream) => {
                    if (error) {
                        log.debug('error putting encrypted part', { error });
                        return cb(error);
                    }
                    const partResult = {
                        key: partRetrievalInfo.key,
                        dataStoreName: partRetrievalInfo.dataStoreName,
                        dataStoreETag: hashedStream.completedHash,
                        // Do not include part start here since will change in
                        // final MPU object
                        size: numberPartSize,
                        sseCryptoScheme: cipherBundle.cryptoScheme,
                        sseCipheredDataKey: cipherBundle.cipheredDataKey,
                        sseAlgorithm: cipherBundle.algorithm,
                        sseMasterKeyId: cipherBundle.masterKeyId,
                    };
                    locations.push(partResult);
                    return cb();
                });
            });
        }
        // Copied object is not encrypted so just put it
        // without a cipherBundle
        return this.put(null, stream, numberPartSize, dataStoreContext,
        destBackendInfo, log, (error, partRetrievalInfo, hashedStream) => {
            if (error) {
                log.debug('error putting object part', { error });
                return cb(error);
            }
            const partResult = {
                key: partRetrievalInfo.key,
                dataStoreName: partRetrievalInfo.dataStoreName,
                dataStoreETag: hashedStream.completedHash,
                size: numberPartSize,
            };
            locations.push(partResult);
            return cb();
        });
    }

    _put(cipherBundle, value, valueSize, keyContext, backendInfo, log, cb) {
        assert.strictEqual(typeof valueSize, 'number');
        log.debug('sending put to datastore', {
            implName: this.implName,
            keyContext,
            method: 'put',
        });
        let hashedStream = null;
        if (value) {
            hashedStream = new MD5Sum();
            value.pipe(hashedStream);
            value.once('clientError', () => {
                log.trace('destroying hashed stream');
                hashedStream.destroy();
            });
        }

        if (this.implName === 'multipleBackends') {
            // Need to send backendInfo to client.put and client.put will
            // provide dataRetrievalInfo so no need to construct here
            /* eslint-disable no-param-reassign */
            keyContext.cipherBundle = cipherBundle;
            return this.client.put(hashedStream, valueSize, keyContext,
            backendInfo, log.getSerializedUids(), (err, dataRetrievalInfo) => {
                if (err) {
                    log.error('put error from datastore',
                        { error: err, implName: this.implName });
                    return cb(errors.ServiceUnavailable);
                }
                return cb(null, dataRetrievalInfo, hashedStream);
            });
        }
        /* eslint-enable no-param-reassign */
        let writeStream = hashedStream;
        if (cipherBundle && cipherBundle.cipher) {
            writeStream = cipherBundle.cipher;
            hashedStream.pipe(writeStream);
        }

        return this.client.put(writeStream, valueSize, keyContext,
        log.getSerializedUids(), (err, key) => {
            if (err) {
                log.error('put error from datastore',
                    { error: err, implName: this.implName });
                return cb(errors.InternalError);
            }
            const dataRetrievalInfo = {
                key,
                dataStoreName: this.implName,
            };
            return cb(null, dataRetrievalInfo, hashedStream);
        });
    }

    /**
     * _retryDelete - Attempt to delete key again if it failed previously
     * @param { string | object } objectGetInfo - either string location of
     * object to delete or object containing info of object to delete
     * @param {object} log - Werelogs request logger
     * @param {number} count - keeps count of number of times function has
     * been run
     * @param {function} cb - callback
     * @return {undefined} calls callback
     */
    _retryDelete(objectGetInfo, log, count, cb) {
        if (count > MAX_RETRY) {
            return cb(errors.InternalError);
        }
        return this.client.delete(objectGetInfo, log.getSerializedUids(),
        err => {
            if (err) {
                if (err.ObjNotFound) {
                    log.info('no such key in datastore', {
                        objectGetInfo,
                        implName: this.implName,
                        moreRetries: 'no',
                    });
                    return cb(err);
                }
                log.error('delete error from datastore', {
                    error: err,
                    implName: this.implName,
                    moreRetries: 'yes',
                });
                return this._retryDelete(objectGetInfo, log, count + 1, cb);
            }
            return cb();
        });
    }

    // This check is done because on a put, complete mpu or copy request to
    // Azure/AWS, if the object already exists on that backend, the existing
    // object should not be deleted, which is the functionality for all other
    // backends
    _shouldSkipDelete(locations, requestMethod, newObjDataStoreName) {
        const skipMethods = { PUT: true, POST: true };
        if (!Array.isArray(locations) || !locations[0] ||
        !locations[0].dataStoreType) {
            return false;
        }
        const isSkipBackend = externalBackends[locations[0].dataStoreType];
        const isMatchingBackends =
            locations[0].dataStoreName === newObjDataStoreName;
        const isSkipMethod = skipMethods[requestMethod];
        return (isSkipBackend && isMatchingBackends && isSkipMethod);
    }
}

module.exports = DataWrapper;
