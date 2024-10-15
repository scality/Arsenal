/* eslint-disable @typescript-eslint/no-require-imports */

const url = require('url');

const azure = require('azure-storage');
const errors = require('../../../errors').default;
const azureMpuUtils = require('../../../s3middleware/azureHelpers/mpuUtils');
const { validateAndFilterMpuParts } =
    require('../../../s3middleware/processMpuParts');

const { createLogger, logHelper, translateAzureMetaHeaders } =
    require('./utils');

const constants = require('../../../constants');
const packageVersion = require('../../../../package.json').version;

azure.Constants.USER_AGENT_PRODUCT_NAME = constants.productName;
azure.Constants.USER_AGENT_PRODUCT_VERSION = packageVersion;

class AzureClient {
    constructor(config) {
        this._azureStorageEndpoint = config.azureStorageEndpoint;
        this._azureStorageCredentials = config.azureStorageCredentials;
        this._azureContainerName = config.azureContainerName;
        this._client = azure.createBlobService(
            this._azureStorageCredentials.storageAccountName,
            this._azureStorageCredentials.storageAccessKey,
            this._azureStorageEndpoint);
        this._client.enableGlobalHttpAgent = true;
        this._dataStoreName = config.dataStoreName;
        this._bucketMatch = config.bucketMatch;
        if (config.proxy && config.proxy.url) {
            const parsedUrl = url.parse(config.proxy.url);
            if (!parsedUrl.port) {
                parsedUrl.port = 80;
            }
            const proxyParams = parsedUrl;
            if (config.proxy.certs) {
                Object.assign(proxyParams, config.proxy.certs);
            }
            this._client.setProxy(proxyParams);
        }
    }

    _errorWrapper(s3Method, azureMethod, args, log, cb) {
        if (log) {
            log.info(`calling azure ${azureMethod}`);
        }
        try {
            this._client[azureMethod].apply(this._client, args);
        } catch (err) {
            const error = errors.ServiceUnavailable;
            if (log) {
                log.error('error thrown by Azure Storage Client Library',
                    { error: err.message, stack: err.stack, s3Method,
                        azureMethod, dataStoreName: this._dataStoreName });
            }
            cb(error.customizeDescription('Error from Azure ' +
                `method: ${azureMethod} on ${s3Method} S3 call: ` +
                `${err.message}`));
        }
    }

    _createAzureKey(requestBucketName, requestObjectKey,
        bucketMatch) {
        if (bucketMatch) {
            return requestObjectKey;
        }
        return `${requestBucketName}/${requestObjectKey}`;
    }

    _getMetaHeaders(objectMD) {
        const metaHeaders = {};
        Object.keys(objectMD).forEach(mdKey => {
            const isMetaHeader = mdKey.startsWith('x-amz-meta-');
            if (isMetaHeader) {
                metaHeaders[mdKey] = objectMD[mdKey];
            }
        });
        return translateAzureMetaHeaders(metaHeaders);
    }

    // Before putting or deleting object on Azure, check if MPU exists with
    // same key name. If it does, do not allow put or delete because Azure
    // will delete all blocks with same key name
    protectAzureBlocks(metadata, bucketName, objectKey, dataStoreName,
        log, cb) {
        const mpuBucketName = `${constants.mpuBucketPrefix}${bucketName}`;
        const splitter = constants.splitter;
        const listingParams = {
            prefix: `overview${splitter}${objectKey}`,
            listingType: 'MPU',
            splitter,
            maxKeys: 1,
        };

        return metadata.listMultipartUploads(mpuBucketName, listingParams,
            log, (err, mpuList) => {
                if (err && !err.NoSuchBucket) {
                    log.error('Error listing MPUs for Azure delete',
                        { error: err, dataStoreName });
                    return cb(errors.ServiceUnavailable);
                }
                if (mpuList && mpuList.Uploads && mpuList.Uploads.length > 0) {
                    const error = errors.MPUinProgress;
                    log.error('Error: cannot put/delete object to Azure with ' +
                    'same key name as ongoing MPU on Azure',
                    { error, dataStoreName });
                    return cb(error);
                }
                // If listMultipartUploads returns a NoSuchBucket error or the
                // mpu list is empty, there are no conflicting MPUs, so continue
                return cb();
            });
    }

    toObjectGetInfo(objectKey, bucketName) {
        return {
            key: this._createAzureKey(bucketName, objectKey, this._bucketMatch),
            dataStoreName: this._dataStoreName,
        };
    }

    put(stream, size, keyContext, reqUids, callback, skey, metadata) {
        const log = createLogger(reqUids);
        // before blob is put, make sure there is no ongoing MPU with same key
        this.protectAzureBlocks(metadata, keyContext.bucketName,
            keyContext.objectKey, this._dataStoreName, log, err => {
            // if error returned, there is ongoing MPU, so do not put
                if (err) {
                    return callback(err.customizeDescription(
                        `Error putting object to Azure: ${err.message}`));
                }
                const azureKey = this._createAzureKey(keyContext.bucketName,
                    keyContext.objectKey, this._bucketMatch);
                const options = {
                    metadata: translateAzureMetaHeaders(keyContext.metaHeaders,
                        keyContext.tagging),
                    contentSettings: {
                        contentType: keyContext.contentType || undefined,
                        cacheControl: keyContext.cacheControl || undefined,
                        contentDisposition: keyContext.contentDisposition ||
                        undefined,
                        contentEncoding: keyContext.contentEncoding || undefined,
                    },
                };
                if (size === 0) {
                    return this._errorWrapper('put', 'createBlockBlobFromText',
                        [this._azureContainerName, azureKey, '', options,
                            err => {
                                if (err) {
                                    logHelper(log, 'error', 'err from Azure PUT data ' +
                                'backend', err, this._dataStoreName);
                                    return callback(errors.ServiceUnavailable
                                        .customizeDescription('Error returned from ' +
                                `Azure: ${err.message}`));
                                }
                                return callback(null, azureKey);
                            }], log, callback);
                }
                return this._errorWrapper('put', 'createBlockBlobFromStream',
                    [this._azureContainerName, azureKey, stream, size, options,
                        err => {
                            if (err) {
                                logHelper(log, 'error', 'err from Azure PUT data ' +
                            'backend', err, this._dataStoreName);
                                return callback(errors.ServiceUnavailable
                                    .customizeDescription('Error returned from ' +
                            `Azure: ${err.message}`));
                            }
                            return callback(null, azureKey);
                        }], log, callback);
            });
    }

    head(objectGetInfo, reqUids, callback) {
        const log = createLogger(reqUids);
        const { key, azureStreamingOptions } = objectGetInfo;
        return this._errorWrapper('head', 'getBlobProperties',
            [this._azureContainerName, key, azureStreamingOptions,
                (err, data) => {
                    if (err) {
                        let logLevel;
                        let retError;
                        if (err.code === 'NotFound') {
                            logLevel = 'info';
                            retError = errors.LocationNotFound;
                        } else {
                            logLevel = 'error';
                            retError = errors.ServiceUnavailable
                                .customizeDescription(
                                    `Error returned from Azure: ${err.message}`);
                        }
                        logHelper(log, logLevel, 'err from Azure HEAD data backend',
                            err, this._dataStoreName);
                        return callback(retError);
                    }
                    return callback(null, data);
                }], log, callback);
    }

    get(objectGetInfo, range, reqUids, callback) {
        const log = createLogger(reqUids);
        // for backwards compatibility
        const { key, response, azureStreamingOptions } = objectGetInfo;
        let streamingOptions;
        if (azureStreamingOptions) {
            // option coming from api.get()
            streamingOptions = azureStreamingOptions;
        } else if (range) {
            // option coming from multipleBackend.upload()
            const rangeStart = (typeof range[0] === 'number') ? range[0].toString() : undefined;
            const rangeEnd = range[1] ? range[1].toString() : undefined;
            streamingOptions = { rangeStart, rangeEnd };
        }
        this._errorWrapper('get', 'getBlobToStream',
            [this._azureContainerName, key, response, streamingOptions,
                err => {
                    if (err) {
                        logHelper(log, 'error', 'err from Azure GET data backend',
                            err, this._dataStoreName);
                        return callback(errors.ServiceUnavailable);
                    }
                    return callback(null, response);
                }], log, callback);
    }

    delete(objectGetInfo, reqUids, callback) {
        const log = createLogger(reqUids);
        // for backwards compatibility
        const key = typeof objectGetInfo === 'string' ? objectGetInfo :
            objectGetInfo.key;
        let options;
        if (typeof objectGetInfo === 'object') {
            options = objectGetInfo.options;
        }
        return this._errorWrapper('delete', 'deleteBlobIfExists',
            [this._azureContainerName, key, options,
                err => {
                    if (err && err.statusCode === 412) {
                        return callback(errors.PreconditionFailed);
                    }
                    if (err) {
                        const log = createLogger(reqUids);
                        logHelper(log, 'error', 'error deleting object from ' +
                        'Azure datastore', err, this._dataStoreName);
                        return callback(errors.ServiceUnavailable
                            .customizeDescription('Error returned from ' +
                        `Azure: ${err.message}`));
                    }
                    return callback();
                }], log, callback);
    }

    healthcheck(location, callback, flightCheckOnStartUp) {
        const azureResp = {};
        const healthCheckAction = flightCheckOnStartUp ?
            'createContainerIfNotExists' : 'doesContainerExist';
        this._errorWrapper('checkAzureHealth', healthCheckAction,
            [this._azureContainerName, err => {
                if (err) {
                    azureResp[location] = { error: err.message,
                        external: true };
                    return callback(null, azureResp);
                }
                azureResp[location] = {
                    message:
                    'Congrats! You can access the Azure storage account',
                };
                return callback(null, azureResp);
            }], null, callback);
    }

    uploadPart(request, streamingV4Params, partStream, size, key, uploadId,
        partNumber, bucket, log, callback) {
        const azureKey = this._createAzureKey(bucket, key, this._bucketMatch);
        const params = { bucketName: this._azureContainerName,
            partNumber, size, objectKey: azureKey, uploadId };
        const stream = request || partStream;

        if (request && request.headers && request.headers['content-md5']) {
            params.contentMD5 = request.headers['content-md5'];
        }
        const dataRetrievalInfo = {
            key: azureKey,
            partNumber,
            dataStoreName: this._dataStoreName,
            dataStoreType: 'azure',
            numberSubParts: azureMpuUtils.getSubPartInfo(size)
                .expectedNumberSubParts,
        };

        if (size === 0) {
            log.debug('0-byte part does not store data',
                { method: 'uploadPart' });
            dataRetrievalInfo.dataStoreETag = azureMpuUtils.zeroByteETag;
            dataRetrievalInfo.numberSubParts = 0;
            return callback(null, dataRetrievalInfo);
        }
        if (size <= azureMpuUtils.maxSubPartSize) {
            const errorWrapperFn = this._errorWrapper.bind(this);
            return azureMpuUtils.putSinglePart(errorWrapperFn,
                stream, params, this._dataStoreName, log, (err, dataStoreETag) => {
                    if (err) {
                        return callback(err);
                    }
                    dataRetrievalInfo.dataStoreETag = dataStoreETag;
                    return callback(null, dataRetrievalInfo);
                });
        }
        const errorWrapperFn = this._errorWrapper.bind(this);
        return azureMpuUtils.putSubParts(errorWrapperFn, stream,
            params, this._dataStoreName, log, (err, dataStoreETag) => {
                if (err) {
                    return callback(err);
                }
                dataRetrievalInfo.dataStoreETag = dataStoreETag;
                return callback(null, dataRetrievalInfo);
            });
    }

    completeMPU(jsonList, mdInfo, key, uploadId, bucket, metaHeaders,
        contentSettings, tagging, log, callback) {
        const azureKey = this._createAzureKey(bucket, key, this._bucketMatch);
        const commitList = {
            UncommittedBlocks: jsonList.uncommittedBlocks || [],
        };
        let filteredPartsObj;
        if (!jsonList.uncommittedBlocks) {
            const { storedParts, mpuOverviewKey, splitter } = mdInfo;
            filteredPartsObj = validateAndFilterMpuParts(storedParts, jsonList,
                mpuOverviewKey, splitter, log);
            if (filteredPartsObj.error) {
                return callback(filteredPartsObj.error);
            }
            filteredPartsObj.partList.forEach(part => {
                // part.locations is always array of 1, which contains data info
                const subPartIds =
                    azureMpuUtils.getSubPartIds(part.locations[0], uploadId);
                commitList.UncommittedBlocks.push(...subPartIds);
            });
        }
        const options = {
            contentSettings,
            metadata: translateAzureMetaHeaders(metaHeaders || {}, tagging),
        };
        return this._errorWrapper('completeMPU', 'commitBlocks',
            [this._azureContainerName, azureKey, commitList, options,
                err => {
                    if (err) {
                        logHelper(log, 'error', 'err completing MPU on Azure ' +
                        'datastore', err, this._dataStoreName);
                        return callback(errors.ServiceUnavailable
                            .customizeDescription('Error returned from ' +
                        `Azure: ${err.message}`));
                    }
                    const completeObjData = {
                        key: azureKey,
                        filteredPartsObj,
                    };
                    return callback(null, completeObjData);
                }], log, callback);
    }

    objectPutTagging(key, bucket, objectMD, log, callback) {
        const azureKey = this._createAzureKey(bucket, key, this._bucketMatch);
        const azureMD = this._getMetaHeaders(objectMD);
        azureMD.tags = JSON.stringify(objectMD.tags);
        this._errorWrapper('objectPutTagging', 'setBlobMetadata',
            [this._azureContainerName, azureKey, azureMD,
                err => {
                    if (err) {
                        logHelper(log, 'error', 'err putting object tags to ' +
                        'Azure backend', err, this._dataStoreName);
                        return callback(errors.ServiceUnavailable);
                    }
                    return callback();
                }], log, callback);
    }

    objectDeleteTagging(key, bucketName, objectMD, log, callback) {
        const azureKey = this._createAzureKey(bucketName, key, this._bucketMatch);
        const azureMD = this._getMetaHeaders(objectMD);
        this._errorWrapper('objectDeleteTagging', 'setBlobMetadata',
            [this._azureContainerName, azureKey, azureMD,
                err => {
                    if (err) {
                        logHelper(log, 'error', 'err putting object tags to ' +
                        'Azure backend', err, this._dataStoreName);
                        return callback(errors.ServiceUnavailable);
                    }
                    return callback();
                }], log, callback);
    }

    copyObject(request, destLocationConstraintName, sourceKey,
        sourceLocationConstraintName, storeMetadataParams, config, log, callback) {
        const destContainerName = request.bucketName;
        const destObjectKey = request.objectKey;

        const destAzureKey = this._createAzureKey(destContainerName,
            destObjectKey, this._bucketMatch);

        const sourceContainerName =
        config.locationConstraints[sourceLocationConstraintName]
            .details.azureContainerName;

        let options;
        if (storeMetadataParams.metaHeaders) {
            options = { metadata:
            translateAzureMetaHeaders(storeMetadataParams.metaHeaders) };
        }

        this._errorWrapper('copyObject', 'startCopyBlob',
            [`${this._azureStorageEndpoint}` +
                `${sourceContainerName}/${sourceKey}`,
            this._azureContainerName, destAzureKey, options,
            (err, res) => {
                if (err) {
                    if (err.code === 'CannotVerifyCopySource') {
                        logHelper(log, 'error', 'Unable to access ' +
                        `${sourceContainerName} Azure Container`, err,
                        this._dataStoreName);
                        return callback(errors.AccessDenied
                            .customizeDescription('Error: Unable to access ' +
                        `${sourceContainerName} Azure Container`),
                        );
                    }
                    logHelper(log, 'error', 'error from data backend on ' +
                    'copyObject', err, this._dataStoreName);
                    return callback(errors.ServiceUnavailable
                        .customizeDescription('Error returned from ' +
                    `AWS: ${err.message}`),
                    );
                }
                if (res.copy.status === 'pending') {
                    logHelper(log, 'error', 'Azure copy status is pending',
                        err, this._dataStoreName);
                    const copyId = res.copy.id;
                    this._client.abortCopyBlob(this._azureContainerName,
                        destAzureKey, copyId, err => {
                            if (err) {
                                logHelper(log, 'error', 'error from data backend ' +
                            'on abortCopyBlob', err, this._dataStoreName);
                                return callback(errors.ServiceUnavailable
                                    .customizeDescription('Error returned from ' +
                            `AWS on abortCopyBlob: ${err.message}`),
                                );
                            }
                            return callback(errors.InvalidObjectState
                                .customizeDescription('Error: Azure copy status was ' +
                        'pending. It has been aborted successfully'),
                            );
                        });
                }
                return callback(null, destAzureKey);
            }], log, callback);
    }
}

module.exports = AzureClient;
