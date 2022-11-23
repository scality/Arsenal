const { BlobServiceClient, StorageSharedKeyCredential } = require('@azure/storage-blob');
const errors = require('../../../errors').default;
const azureMpuUtils = require('../../../s3middleware/azureHelpers/mpuUtils');
const { validateAndFilterMpuParts } =
    require('../../../s3middleware/processMpuParts');

const { createLogger, logHelper, translateAzureMetaHeaders } =
    require('./utils');
const objectUtils = require('../../../s3middleware/objectUtils');

const constants = require('../../../constants');
const packageVersion = require('../../../../package.json').version;

class AzureClient {
    constructor(config) {
        this._azureStorageEndpoint = config.azureStorageEndpoint;
        this._azureStorageCredentials = config.azureStorageCredentials;
        this._azureContainerName = config.azureContainerName;
        const cred = new StorageSharedKeyCredential(
            this._azureStorageCredentials.storageAccountName,
            this._azureStorageCredentials.storageAccessKey,
        );
        const proxyOptions = (() => {
            if (!config.proxy || !config.proxy.url) {
                return undefined;
            }
            // NOTE: config.proxy.certs is not supported
            const parsedUrl = new URL(config.proxy.url);
            return {
                host: parsedUrl.host,
                port: parsedUrl.port || 80,
                username: parsedUrl.username || undefined,
                password: parsedUrl.password || undefined,
            };
        })();
        this._client = new BlobServiceClient(this._azureStorageEndpoint, cred, {
            keepAliveOptions: {
                enable: false, // Enable use of global HTTP agent
            },
            proxyOptions,
            userAgentOptions: {
                userAgentPrefix: `${constants.productName}/${packageVersion} `,
            },
        }).getContainerClient(this._azureContainerName);
        this._dataStoreName = config.dataStoreName;
        this._bucketMatch = config.bucketMatch;
    }

    /**
     * Run azure method call.
     * @param {string} [s3Method] S3 method name
     * @param {string} [azureMethod] Azure method name
     * @param {ErrorWrapper~Command} [command] Actual command to run
     * @param {RequestLogger} [log] Logger
     * @param {ErrorWrapper~Cb} [cb] The final callback
     * @returns {void}
     *
     * @callback ErrorWrapper~Command
     * @param {azure.ContainerClient} [client] Azure client to use
     * @returns {Promise<any>}
     *
     * @callback ErrorWrapper~Cb
     * @param {azure.ArsenalError} [arsenalErr] Error returned by the command
     * @param {any} [result] Result of Azure SDK command
     * @returns {void}
     */
    _errorWrapper(s3Method, azureMethod, command, log, cb) {
        if (log) {
            log.info(`calling azure ${azureMethod} in ${s3Method}`);
        }
        command(this._client).then(
            result => cb(null, result),
            cb,
        );
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

    /**
     * Build Azure HTTP headers for content settings
     * @param {object} [properties]                    The blob properties to set.
     * @param {string} [properties.contentType]        The MIME content type of the blob.
     *                                                 The default type is application/octet-stream.
     * @param {string} [properties.contentEncoding]    The content encodings that have been applied
     *                                                 to the blob.
     * @param {string} [properties.contentLanguage]    The natural languages used by this resource.
     * @param {string} [properties.cacheControl]       The blob's cache control.
     * @param {string} [properties.contentDisposition] The blob's content disposition.
     * @param {string} [properties.contentMD5]         The blob's MD5 hash.
     * @returns {BlobHTTPHeaders} The headers
     */
    _getAzureContentSettingsHeaders(properties) {
        return {
            blobContentMD5: properties.contentMD5
                ? objectUtils.getMD5Buffer(properties.contentMD5)
                : undefined,
            blobContentType: properties.contentType || undefined,
            blobCacheControl: properties.cacheControl || undefined,
            blobContentDisposition: properties.contentDisposition || undefined,
            blobContentEncoding: properties.contentEncoding || undefined,
            blobContentLanguage: properties.blobContentLanguage || undefined,
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
                    blobHTTPHeaders: this._getAzureContentSettingsHeaders(
                        keyContext || {}),
                };
                if (size === 0) {
                    return this._errorWrapper('put', 'uploadData', async client => {
                        try {
                            await client.getBlockBlobClient(azureKey).upload('', 0, options);
                            return azureKey;
                        } catch (err) {
                            logHelper(log, 'error', 'err from Azure PUT data backend',
                                err, this._dataStoreName);
                            throw errors.ServiceUnavailable.customizeDescription(
                                `Error returned from Azure: ${err.message}`);
                        }
                    }, log, callback);
                }
                return this._errorWrapper('put', 'createBlockBlobFromStream', async client => {
                    try {
                        await client.getBlockBlobClient(azureKey).upload(() => stream, size, options);
                        return azureKey;
                    } catch (err) {
                        logHelper(log, 'error', 'err from Azure PUT data backend',
                            err, this._dataStoreName);
                        throw errors.ServiceUnavailable.customizeDescription(
                            `Error returned from Azure: ${err.message}`);
                    }
                }, log, callback);
            });
    }

    /**
     * Build BlobRequestConditions from azureStreamingOptions
     * @param {object} [objectGetInfoOptions]   Azure streaming options
     * @param {object} [objectGetInfoOptions.accessConditions] Access conditions
     * @param {Date}   [objectGetInfoOptions.accessConditions.DateUnModifiedSince] Filter objects not
     *                                  modified since that date.
     * @returns {BlobRequestConditions} Request conditions
     */
    _getAzureConditions(objectGetInfoOptions) {
        const accessConditions = objectGetInfoOptions.accessConditions || {};
        return {
            ifUnmodifiedSince: accessConditions.DateUnModifiedSince || undefined,
        };
    }

    head(objectGetInfo, reqUids, callback) {
        const log = createLogger(reqUids);
        const { key } = objectGetInfo;
        return this._errorWrapper('head', 'getBlobProperties', async client => {
            try {
                const data = await client.getBlockBlobClient(key).getProperties();
                return data;
            } catch (err) {
                let logLevel;
                let retError;
                if (err.code === 'NotFound') {
                    logLevel = 'info';
                    retError = errors.LocationNotFound;
                } else {
                    logLevel = 'error';
                    retError = errors.ServiceUnavailable.customizeDescription(
                        `Error returned from Azure: ${err.message}`);
                }
                logHelper(log, logLevel, 'err from Azure HEAD data backend',
                    err, this._dataStoreName);
                throw retError;
            }
        }, log, callback);
    }

    get(objectGetInfo, range, reqUids, callback) {
        const log = createLogger(reqUids);
        const { key, response, azureStreamingOptions } = objectGetInfo;
        let rangeStart = 0;
        let rangeEnd = undefined;
        if (azureStreamingOptions) {
            // option coming from api.get()
            rangeStart = (typeof azureStreamingOptions.rangeStart === 'string')
                ? parseInt(azureStreamingOptions.rangeStart, 10)
                : azureStreamingOptions.rangeStart;
            rangeEnd = (typeof azureStreamingOptions.rangeEnd === 'string')
                ? parseInt(azureStreamingOptions.rangeEnd, 10)
                : azureStreamingOptions.rangeEnd;
        } else if (range) {
            // option coming from multipleBackend.upload()
            rangeStart = (typeof range[0] === 'number') ? range[0] : 0;
            rangeEnd = range[1] || undefined;
        }
        this._errorWrapper('get', 'getBlobToStream', async client => {
            try {
                const rsp = await client.getBlockBlobClient(key)
                    .download(rangeStart, rangeEnd - rangeStart + 1 || undefined);
                rsp.readableStreamBody.pipe(response);
                return response;
            } catch (err) {
                logHelper(log, 'error', 'err from Azure GET data backend',
                    err, this._dataStoreName);
                throw errors.ServiceUnavailable;
            }
        }, log, callback);
    }

    delete(objectGetInfo, reqUids, callback) {
        const log = createLogger(reqUids);
        // for backwards compatibility
        const key = typeof objectGetInfo === 'string' ? objectGetInfo :
            objectGetInfo.key;
        let options;
        if (typeof objectGetInfo === 'object') {
            options = {
                conditions: this._getAzureConditions(objectGetInfo.options || {}),
            };
        }
        return this._errorWrapper('delete', 'deleteBlobIfExists', async client => {
            try {
                await client.getBlockBlobClient(key).deleteIfExists(options);
            } catch (err) {
                if (err.statusCode === 412) {
                    throw errors.PreconditionFailed;
                }
                const log = createLogger(reqUids);
                logHelper(log, 'error', 'error deleting object from Azure datastore',
                    err, this._dataStoreName);
                throw errors.ServiceUnavailable.customizeDescription(
                    `Error returned from Azure: ${err.message}`);
            }
        }, log, callback);
    }

    healthcheck(location, callback, flightCheckOnStartUp) {
        const azureResp = {};
        this._errorWrapper('healthcheck', 'checkAzureHealth', async client => {
            try {
                if (flightCheckOnStartUp) {
                    await client.createIfNotExists();
                } else {
                    await client.exists();
                }
                azureResp[location] = {
                    message: 'Congrats! You can access the Azure storage account',
                };
            } catch (err) {
                azureResp[location] = {
                    error: err.message,
                    external: true,
                };
            }
            return azureResp;
        }, null, callback);
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
            blobHTTPHeaders: this._getAzureContentSettingsHeaders(contentSettings || {}),
            metadata: translateAzureMetaHeaders(metaHeaders || {}, tagging),
        };
        return this._errorWrapper('completeMPU', 'commitBlocks', async client => {
            try {
                await client.getBlockBlobClient(azureKey).commitBlockList(commitList, options);
                return {
                    key: azureKey,
                    filteredPartsObj,
                };
            } catch (err) {
                logHelper(log, 'error', 'err completing MPU on Azure datastore',
                    err, this._dataStoreName);
                throw errors.ServiceUnavailable.customizeDescription(
                    `Error returned from Azure: ${err.message}`);
            }
        }, log, callback);
    }

    objectPutTagging(key, bucket, objectMD, log, callback) {
        const azureKey = this._createAzureKey(bucket, key, this._bucketMatch);
        const azureMD = this._getMetaHeaders(objectMD);
        azureMD.tags = JSON.stringify(objectMD.tags);
        this._errorWrapper('objectPutTagging', 'setBlobMetadata', async client => {
            try {
                await client.getBlockBlobClient(azureKey).setMetadata(azureMD);
            } catch (err) {
                logHelper(log, 'error', 'err putting object tags to Azure backend',
                    err, this._dataStoreName);
                throw errors.ServiceUnavailable;
            }
        }, log, callback);
    }

    objectDeleteTagging(key, bucketName, objectMD, log, callback) {
        const azureKey = this._createAzureKey(bucketName, key, this._bucketMatch);
        const azureMD = this._getMetaHeaders(objectMD);
        this._errorWrapper('objectDeleteTagging', 'setBlobMetadata', async client => {
            try {
                await client.getBlockBlobClient(azureKey).setMetadata(azureMD);
            } catch (err) {
                logHelper(log, 'error', 'err putting object tags to Azure backend',
                    err, this._dataStoreName);
                throw errors.ServiceUnavailable;
            }
        }, log, callback);
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
            options = {
                metadata: translateAzureMetaHeaders(storeMetadataParams.metaHeaders),
            };
        }

        // TODO: should we use syncCopyBlob() instead? or use poller.pollUntilDone() to wait until complete?
        this._errorWrapper('copyObject', 'startCopyBlob', async client => {
            let res;
            try {
                const poller = await client.getBlockBlobClient(destAzureKey).beginCopyFromURL(
                    `${this._azureStorageEndpoint}${sourceContainerName}/${sourceKey}`,
                    options,
                );

                res = poller.getOperationState().result;
                if (res.copyProgress !== 'pending') {
                    return destAzureKey;
                }
            } catch (err) {
                if (err.code === 'CannotVerifyCopySource') { // TOOD: may use a constant (or type) from SDK ??
                    logHelper(log, 'error',
                        `Unable to access ${sourceContainerName} Azure Container`,
                        err, this._dataStoreName);
                    throw errors.AccessDenied.customizeDescription(
                        `Error: Unable to access ${sourceContainerName} Azure Container`);
                }
                logHelper(log, 'error', 'error from data backend on copyObject',
                    err, this._dataStoreName);
                throw errors.ServiceUnavailable.customizeDescription(
                    `Error returned from AWS: ${err.message}`);
            }

            logHelper(log, 'error', 'Azure copy status is pending', {}, this._dataStoreName);
            try {
                await client.getBlockBlobClient(destAzureKey).abortCopyFromURL(res.copyId);
            } catch (err) {
                logHelper(log, 'error', 'error from data backend on abortCopyBlob',
                    err, this._dataStoreName);
                throw errors.ServiceUnavailable.customizeDescription(
                    `Error returned from AWS on abortCopyBlob: ${err.message}`);
            }
            throw errors.InvalidObjectState.customizeDescription(
                'Error: Azure copy status was pending. It has been aborted successfully');
        }, log, callback);
    }
}

module.exports = AzureClient;
