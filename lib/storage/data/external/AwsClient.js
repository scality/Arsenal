const { S3Client,
    PutObjectCommand,
    HeadObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    CreateMultipartUploadCommand,
    UploadPartCommand,
    UploadPartCopyCommand,
    ListPartsCommand,
    CompleteMultipartUploadCommand,
    AbortMultipartUploadCommand,
    PutObjectTaggingCommand,
    DeleteObjectTaggingCommand,
    CopyObjectCommand,
    GetBucketLocationCommand, 
    GetBucketVersioningCommand,
    NoSuchKey,
    NotFound } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const werelogs = require('werelogs');
const { Readable } = require('stream');
const errors = require('../../../errors').default;
const errorInstances = require('../../../errors').errorInstances;
const MD5Sum = require('../../../s3middleware/MD5Sum').default;
const getMetaHeaders = require('../../../s3middleware/userMetadata').getMetaHeaders;
const { prepareStream } = require('../../../s3middleware/prepareStream');
const { createLogger, logHelper, removeQuotes, trimXMetaPrefix } = 
    require('./utils');
const jsutil = require('../../../jsutil');
const missingVerIdInternalError = errorInstances.InternalError.customizeDescription(
    'Invalid state. Please ensure versioning is enabled ' +
    'in AWS for the location constraint and try again.',
);
class AwsClient {
    constructor(config) {
        this.clientType = 'aws_s3';
        this.type = 'AWS';
        this._s3Params = config.s3Params;
        this._awsBucketName = config.bucketName;
        this._bucketMatch = config.bucketMatch;
        this._dataStoreName = config.dataStoreName;
        this._serverSideEncryption = config.serverSideEncryption;
        this._supportsVersioning = config.supportsVersioning;
        this._vault = config.vault;
        this._client = new S3Client(this._s3Params);
        this._logger = new werelogs.Logger('AwsClient');
    }

    setup(cb) {
        let callbackCalled = false;
        const done = err => {
            if (callbackCalled) {
                return;
            }
            callbackCalled = true;
            cb(err);
        };

        let usEast1Client;
        try {
            usEast1Client = new S3Client({
                ...this._client.config,
                region: 'us-east-1',
            });
        } catch (err) {
            this._logger.error('unexpected error during setup', {
                error: err,
                method: 'AwsClient.setup',
            });
            return done(err);
        }

        const applyRegion = region => {
            if (!region) {
                return done();
            }

            const isAWS = this._s3Params.endpoint?.endsWith('amazonaws.com');
            const newConfig = {
                ...this._client.config,
                region,
            };

            if (isAWS) {
                const endpoint = `https://s3.${region}.amazonaws.com`;
                this._logger.debug('setting regional endpoint', {
                    method: 'AwsClient.setup',
                    region,
                    endpoint,
                });
                newConfig.endpoint = endpoint;
            }

            try {
                this._client = new S3Client(newConfig);
            } catch (err) {
                this._logger.error('unexpected error during setup', {
                    error: err,
                    method: 'AwsClient.setup',
                });
                return done(err);
            }

            return done();
        };

        return usEast1Client.send(
            new GetBucketLocationCommand({ Bucket: this._awsBucketName })
        ).then(res => applyRegion(res.LocationConstraint))
         .catch(err => {
            if (err.name === 'AuthorizationHeaderMalformed') {
                return applyRegion(err.region);
            }
            this._logger.error('error during setup', {
                error: err,
                method: 'AwsClient.setup',
            });
            return done(err);
        });
    }

    _createAwsKey(requestBucketName, requestObjectKey, bucketMatch) {
        if (bucketMatch) {
            return requestObjectKey;
        }
        return `${requestBucketName}/${requestObjectKey}`;
    }
    toObjectGetInfo(objectKey, bucketName) {
        return {
            key: this._createAwsKey(bucketName, objectKey, this._bucketMatch),
            dataStoreName: this._dataStoreName,
        };
    }
    put(stream, size, keyContext, reqUids, callback) {
        const awsKey = this._createAwsKey(keyContext.bucketName,
            keyContext.objectKey, this._bucketMatch);
        const metaHeaders = trimXMetaPrefix(keyContext.metaHeaders);
        const log = createLogger(reqUids);

        const putCb = async (err, data) => {
            console.log('putCb called with err:', err, 'data:', data);
            if (err) {
                logHelper(log, 'error', 'err from data backend',
                    err, this._dataStoreName, this.clientType);
                return callback(errorInstances.ServiceUnavailable
                    .customizeDescription('Error returned from ' +
                `${this.type}: ${err.message}`),
                );
            }
            console.log('data received from put:', data);
            console.log('this._supportsVersioning:', this._supportsVersioning);
            console.log('data.VersionId:', data.VersionId);
            console.log('condition outcome:', (!data.VersionId && this._supportsVersioning));
            let dataStoreVersionId = data.VersionId;
            if (!dataStoreVersionId && this._supportsVersioning) {
                console.log('VersionId missing, fetching manually with HeadObject');
                try {
                    const headCommand = new HeadObjectCommand({
                        Bucket: this._awsBucketName,
                        Key: awsKey
                    });
                    const headResult = await this._client.send(headCommand);
                    console.log('HeadObject result:', headResult);
                    dataStoreVersionId = headResult.VersionId;
                    console.log('VersionId retrieved from HeadObject:', dataStoreVersionId);
                } catch (headErr) {
                        console.log('Error fetching VersionId with HeadObject:', headErr);
                        logHelper(log, 'error', 'failed to retrieve version id for data ' +
                            'backend object', headErr, this._dataStoreName, this.clientType);
                }
            }
            if (!dataStoreVersionId && this._supportsVersioning) {
                logHelper(log, 'error', 'missing version id for data ' +
                    'backend object', missingVerIdInternalError,
                this._dataStoreName, this.clientType);
                return callback(missingVerIdInternalError);
            }
            return callback(null, awsKey, dataStoreVersionId);
        };

        const params = {
            Bucket: this._awsBucketName,
            Key: awsKey,
        };
        
        // Handle delete marker case
        if (keyContext.isDeleteMarker) {
            const command = new DeleteObjectCommand(params);
            return this._client.send(command)
                .then(data => putCb(null, data))
                .catch(err => putCb(err));
        }
        
        // Build upload parameters
        const uploadParams = { ...params };
        uploadParams.Metadata = metaHeaders;
        uploadParams.ContentLength = size;
        
        if (this._serverSideEncryption) {
            uploadParams.ServerSideEncryption = 'AES256';
        }
        if (keyContext.tagging) {
            uploadParams.Tagging = keyContext.tagging;
        }
        if (keyContext.contentType !== undefined) {
            uploadParams.ContentType = keyContext.contentType;
        }
        if (keyContext.cacheControl !== undefined) {
            uploadParams.CacheControl = keyContext.cacheControl;
        }
        if (keyContext.contentDisposition !== undefined) {
            uploadParams.ContentDisposition = keyContext.contentDisposition;
        }
        if (keyContext.contentEncoding !== undefined) {
            uploadParams.ContentEncoding = keyContext.contentEncoding;
        }
        
        if (!stream) {
            console.log('Putting empty body with params:', uploadParams);
            const command = new PutObjectCommand(uploadParams);
            return this._client.send(command)
                .then(data => {
                    console.log('PutObjectCommand done data:', data);
                    putCb(null, data)})
                .catch(err => putCb(err));
        }
        
        // Handle stream upload using Upload from @aws-sdk/lib-storage
        uploadParams.Body = stream;
        console.log('Starting upload with params:', uploadParams);
        console.log('Client endpoint:', this._s3Params.endpoint);
        console.log('Upload params body:', uploadParams.Body);
        const upload = new Upload({
            client: this._client,
            params: uploadParams,
        });
        
        return upload.done()
            .then(data => {
                console.log('Upload done data:', data);
                putCb(null, data)})
            .catch(err => putCb(err));
    }

    head(objectGetInfo, reqUids, callback) {
        const log = createLogger(reqUids);
        const { key, dataStoreVersionId } = objectGetInfo;
        return this._client.send(new HeadObjectCommand({
            Bucket: this._awsBucketName,
            Key: key,
            VersionId: dataStoreVersionId,
        })).then(data => callback(null, data))
            .catch(err => {
            let logLevel;
            let retError;
            if (err instanceof NotFound) {
                logLevel = 'info';
                retError = errors.LocationNotFound;
            }
            else {
                logLevel = 'error';
                retError = errorInstances.ServiceUnavailable.customizeDescription(`Error returned from ${this.type}: ${err.message}`);
            }
            logHelper(log, logLevel, 'error heading object ' +
                'from datastore', err, this._dataStoreName);
            return callback(retError);
        });
    }
    get(objectGetInfo, range, reqUids, callback) {
        const log = createLogger(reqUids);
        const { key, dataStoreVersionId } = objectGetInfo;
        const params = {
            Bucket: this._awsBucketName,
            Key: key,
            VersionId: dataStoreVersionId,
            Range: range ? `bytes=${range[0]}-${range[1]}` : undefined,
        };
        this._client.send(new GetObjectCommand(params)).then(data => {
            let stream = data.Body;
            console.log('[Arsenal get] stream.pipe type:', typeof stream?.pipe);
            console.log('[Arsenal get] stream.pipe value:', stream?.pipe);
            console.log('[Arsenal get] stream has source?', !!stream?.source);
            console.log('[Arsenal get] source has pipe?', typeof stream?.source?.pipe);
            
            // ChecksumStream is a Duplex but doesn't properly expose .pipe()
            // Always use the underlying source stream for reliability
            // AWS SDK v3 returns streams that may not be fully compatible Node.js Readable streams
            // They might have .pipe() but not .on(), .once(), etc.
            // Always check if we have a proper Node.js stream with full API
            const isProperNodeStream = stream && 
                typeof stream.pipe === 'function' && 
                typeof stream.on === 'function' &&
                typeof stream.once === 'function';
            
            if (!isProperNodeStream) {
                // Try to get the underlying source stream (IncomingMessage) which is a proper Node.js stream
                if (stream && stream.source && typeof stream.source.pipe === 'function' && typeof stream.source.on === 'function') {
                    stream = stream.source;
                }
                // Otherwise convert via transformToWebStream to get a proper Node.js Readable
                else if (stream && typeof stream.transformToWebStream === 'function') {
                    const webStream = stream.transformToWebStream();
                    stream = Readable.fromWeb(webStream);
                }
            }
            
            console.log('[Arsenal get] Final stream has .pipe?', typeof stream?.pipe);
            console.log('[Arsenal get] Final stream has .on?', typeof stream?.on);
            console.log('[Arsenal get] Final stream has .once?', typeof stream?.once);
            let isAborted = false;
            const destroy = () => {
                if (isAborted) {
                    return;
                }
                isAborted = true;
                (stream?.destroy || stream?.abort || stream?.close || stream?.end || stream?.removeAllListeners)?.();
            };
            if (!stream?.abort) {
                stream.abort = destroy;
            }
            // Return an object with createReadStream for compatibility
            stream.createReadStream = () => stream;
            return callback(null, stream);
        }).catch(err => {
            if (err instanceof NoSuchKey || err instanceof NotFound) {
                logHelper(log, 'info', 'object not found', err, this._dataStoreName);
            }
            else {
                logHelper(log, 'error', 'error getting object from datastore', err, this._dataStoreName);
            }
            return callback(err);
        });
    }
    delete(objectGetInfo, reqUids, callback) {
        const { key, dataStoreVersionId, deleteVersion } = objectGetInfo;
        const log = createLogger(reqUids);
        const params = {
            Bucket: this._awsBucketName,
            Key: key,
        };
        if (deleteVersion) {
            params.VersionId = dataStoreVersionId;
        }
        return this._client.send(new DeleteObjectCommand(params)).then(() => callback()).catch(err => {
            logHelper(log, 'error', 'error deleting object from ' +
                'datastore', err, this._dataStoreName, this.clientType);
            if (err.name === 'NoSuchVersion' || err instanceof NoSuchKey) {
                // data may have been deleted directly from the AWS backend
                // don't want to retry the delete and errors are not
                // sent back to client anyway, so no need to return err
                return callback();
            }
            return callback(errorInstances.ServiceUnavailable
                .customizeDescription('Error returned from ' +
                `${this.type}: ${err.message}`));
        });
    }
    healthcheck(location, callback) {
        const awsResp = {};
        this._client.send(new HeadObjectCommand({ Bucket: this._awsBucketName }))
            .then(() => {
            if (!this._supportsVersioning) {
                awsResp[location] = {
                    message: 'Congrats! You own the bucket',
                };
                return callback(null, awsResp);
            }
            return this._client.send(new GetBucketVersioningCommand({
                Bucket: this._awsBucketName
            })).catch(err => {
                awsResp[location] = { error: err, external: true };
            }).then(data => {
                if (!data.Status ||
                    data.Status === 'Suspended') {
                    awsResp[location] = {
                        versioningStatus: data.Status,
                        error: 'Versioning must be enabled',
                        external: true,
                    };
                }
                else {
                    awsResp[location] = {
                        versioningStatus: data.Status,
                        message: 'Congrats! You own the bucket',
                    };
                }
                return callback(null, awsResp);
            });
        }).catch(err => {
            awsResp[location] = { error: err, external: true };
            return callback(null, awsResp);
        });
    }
    createMPU(key, metaHeaders, bucketName, websiteRedirectHeader, contentType, cacheControl, contentDisposition, contentEncoding, tagging, log, callback) {
        const metaHeadersTrimmed = {};
        Object.keys(metaHeaders).forEach(header => {
            if (header.startsWith('x-amz-meta-')) {
                const headerKey = header.substring(11);
                console.log(`Trimmed metadata header: ${headerKey} = ${metaHeaders[header]}`);
                metaHeadersTrimmed[headerKey] = metaHeaders[header];
                console.log('metaHeadersTrimmed:', metaHeadersTrimmed);
            }
        });
        const awsBucket = this._awsBucketName;
        const awsKey = this._createAwsKey(bucketName, key, this._bucketMatch);
        const params = {
            Bucket: awsBucket,
            Key: awsKey,
            WebsiteRedirectLocation: websiteRedirectHeader,
            Metadata: metaHeadersTrimmed,
            ContentType: contentType,
            CacheControl: cacheControl,
            ContentDisposition: contentDisposition,
            ContentEncoding: contentEncoding,
            Tagging: tagging,
        };
        return this._client.send(new CreateMultipartUploadCommand(params)).then(mpuResObj => {
            console.log('mpuResObj:', mpuResObj);
            return callback(null, mpuResObj);
        }).catch(err => {
            console.log('Error occurred while creating multipart upload:', err);
            logHelper(log, 'error', 'err from data backend', 
                err, this._dataStoreName, this.clientType);
            return callback(errorInstances.ServiceUnavailable
                .customizeDescription('Error returned from ' +
                `${this.type}: ${err.message}`));
        });
    }
    uploadPart(request, streamingV4Params, stream, size, key, uploadId, partNumber, bucketName, log, callback) {
        let hashedStream = stream;
        const cbOnce = jsutil.once(callback);
        if (request) {
            const partStream = prepareStream(request, streamingV4Params, this._vault, log, cbOnce);
            hashedStream = new MD5Sum();
            partStream.pipe(hashedStream);
        }
        const awsBucket = this._awsBucketName;
        const awsKey = this._createAwsKey(bucketName, key, this._bucketMatch);
        const params = { Bucket: awsBucket, Key: awsKey, UploadId: uploadId,
            Body: hashedStream, ContentLength: size,
            PartNumber: partNumber };
        return this._client.send(new UploadPartCommand(params)).catch(err => {
            console.log('Error occurred while uploading part:', err);
            logHelper(log, 'error', 'err from data backend ' +
                'on uploadPart', err, this._dataStoreName, this.clientType);
            return cbOnce(errorInstances.ServiceUnavailable
                .customizeDescription('Error returned from ' +
                `${this.type}: ${err.message}`));
        }).then(partResObj => {
            // Because we manually add quotes to ETag later, remove quotes here
            const noQuotesETag = partResObj?.ETag?.substring(1, partResObj.ETag.length - 1);
            const dataRetrievalInfo = {
                key: awsKey,
                dataStoreType: 'aws_s3',
                dataStoreName: this._dataStoreName,
                dataStoreETag: noQuotesETag,
            };
            console.log('Uploaded part info:', dataRetrievalInfo);
            return cbOnce(null, dataRetrievalInfo);
        });
    }
    listParts(key, uploadId, bucketName, partNumberMarker, maxParts, log, callback) {
        const awsBucket = this._awsBucketName;
        const awsKey = this._createAwsKey(bucketName, key, this._bucketMatch);
        const params = {
            Bucket: awsBucket,
            Key: awsKey,
            UploadId: uploadId,
            MaxParts: maxParts
        };
        if (partNumberMarker && partNumberMarker > 0) {
            params.PartNumberMarker = String(partNumberMarker);
        }
        console.log('[Arsenal listParts] Calling ListPartsCommand with params:', params);
        console.log('[Arsenal listParts] Client endpoint:', this._s3Params.endpoint);
        console.log('[Arsenal listParts] Client region:', this._s3Params.region);
        return this._client.send(new ListPartsCommand(params))
            .then(partList => {
            // build storedParts object to mimic Scality S3 backend returns
            console.log('partList from AWS:', partList);
            const storedParts = {};
            storedParts.IsTruncated = partList.IsTruncated;
            storedParts.Contents = [];
            storedParts.Contents = partList.Parts.map(item => {
                // We manually add quotes to ETag later, so remove quotes here
                const noQuotesETag = item.ETag.substring(1, item.ETag.length - 1);
                return {
                    partNumber: item.PartNumber,
                    value: {
                        Size: item.Size,
                        ETag: noQuotesETag,
                        LastModified: item.LastModified,
                    },
                };
            });
            return callback(null, storedParts);
        })
            .catch(err => {
            console.log('Error occurred while listing parts:', err);
            logHelper(log, 'error', 'err from data backend on listPart', err, this._dataStoreName, this.clientType);
            return callback(errorInstances.ServiceUnavailable
                .customizeDescription('Error returned from ' +
                `${this.type}: ${err.message}`));
        });
    }
    /**
     * completeMPU - complete multipart upload on AWS backend
     * @param {object} jsonList - user-sent list of parts to include in
     *                          final mpu object
     * @param {object} mdInfo - object containing 3 keys: storedParts,
     *                          mpuOverviewKey, and splitter
     * @param {string} key - object key
     * @param {string} uploadId - multipart upload id string
     * @param {string} bucketName - name of bucket
     * @param {RequestLogger} log - logger instance
     * @param {function} callback - callback function
     * @return {(Error|object)} - return Error if complete MPU fails, otherwise
     * object containing completed object key, eTag, and contentLength
     */
    completeMPU(jsonList, mdInfo, key, uploadId, bucketName, log, callback) {
        const awsBucket = this._awsBucketName;
        const awsKey = this._createAwsKey(bucketName, key, this._bucketMatch);
        const mpuError = {
            InvalidPart: true,
            InvalidPartOrder: true,
            EntityTooSmall: true,
        };
        const partArray = [];
        const partList = jsonList.Part;
        partList.forEach(partObj => {
            const partParams = { PartNumber: partObj.PartNumber[0],
                ETag: partObj.ETag[0] };
            partArray.push(partParams);
        });
        const mpuParams = {
            Bucket: awsBucket, Key: awsKey, UploadId: uploadId,
            MultipartUpload: {
                Parts: partArray,
            },
        };
        const completeObjData = { key: awsKey };
        return this._client.send(new CompleteMultipartUploadCommand(mpuParams)).catch(err => {
            console.log('Error occurred while completing multipart upload:', err);
            if (mpuError[err.name]) {
                logHelper(log, 'trace', 'err from data backend on ' +
                    'completeMPU', err, this._dataStoreName, this.clientType);
                return callback(errors[err.name]);
            }
            logHelper(log, 'error', 'err from data backend on ' +
                'completeMPU', err, this._dataStoreName, this.clientType);
            return callback(errorInstances.ServiceUnavailable
                .customizeDescription('Error returned from ' +
                `${this.type}: ${err.message}`));
        }).then(completeMpuRes => {
            if (!completeMpuRes.VersionId && this._supportsVersioning) {
                logHelper(log, 'error', 'missing version id for data ' +
                    'backend object', missingVerIdInternalError, this._dataStoreName, this.clientType);
                return callback(missingVerIdInternalError);
            }
            // need to get content length of new object to store
            // in our metadata
            return this._client.send(new HeadObjectCommand({ Bucket: awsBucket, Key: awsKey })).catch(err => {
                console.log('Error occurred while retrieving object headers:', err);
                logHelper(log, 'trace', 'err from data backend on ' +
                    'headObject', err, this._dataStoreName, this.clientType);
                return callback(errorInstances.ServiceUnavailable
                    .customizeDescription('Error returned from ' +
                    `${this.type}: ${err.message}`));
            }).then(objHeaders => {
                console.log('Object headers retrieved:', objHeaders);
                // remove quotes from eTag because they're added later
                completeObjData.eTag = completeMpuRes.ETag
                    .substring(1, completeMpuRes.ETag.length - 1);
                completeObjData.dataStoreVersionId = completeMpuRes.VersionId;
                completeObjData.contentLength =
                    Number.parseInt(objHeaders.ContentLength, 10);
                return callback(null, completeObjData);
            });
        });
    }
    abortMPU(key, uploadId, bucketName, log, callback) {
        const awsBucket = this._awsBucketName;
        const awsKey = this._createAwsKey(bucketName, key, this._bucketMatch);
        const abortParams = {
            Bucket: awsBucket, Key: awsKey, UploadId: uploadId,
        };
        return this._client.send(new AbortMultipartUploadCommand(abortParams)).catch(err => {
            console.log('Error occurred while aborting multipart upload:', err);
            logHelper(log, 'error', 'There was an error aborting ' +
                'the MPU on AWS S3. You should abort directly on AWS S3 ' +
                'using the same uploadId.', err, this._dataStoreName, this.clientType);
            return callback(errorInstances.ServiceUnavailable
                .customizeDescription('Error returned from ' +
                `${this.type}: ${err.message}`));
        }).then(() => {
            return callback();
        });
    }
    objectPutTagging(key, bucketName, objectMD, log, callback) {
        const awsBucket = this._awsBucketName;
        const awsKey = this._createAwsKey(bucketName, key, this._bucketMatch);
        const dataStoreVersionId = objectMD.location[0].dataStoreVersionId;
        const tagParams = {
            Bucket: awsBucket,
            Key: awsKey,
            VersionId: dataStoreVersionId,
        };
        const keyArray = Object.keys(objectMD.tags);
        tagParams.Tagging = {};
        tagParams.Tagging.TagSet = keyArray.map(key => {
            const value = objectMD.tags[key];
            return { Key: key, Value: value };
        });
        return this._client.send(new PutObjectTaggingCommand(tagParams)).catch(err => {
            logHelper(log, 'error', 'error from data backend on ' +
                'putObjectTagging', err, this._dataStoreName, this.clientType);
            return callback(errorInstances.ServiceUnavailable
                .customizeDescription('Error returned from ' +
                `${this.type}: ${err.message}`));
        }).then(() => {
            return callback();
        });
    }
    objectDeleteTagging(key, bucketName, objectMD, log, callback) {
        const awsBucket = this._awsBucketName;
        const awsKey = this._createAwsKey(bucketName, key, this._bucketMatch);
        const dataStoreVersionId = objectMD.location[0].dataStoreVersionId;
        const tagParams = {
            Bucket: awsBucket,
            Key: awsKey,
            VersionId: dataStoreVersionId,
        };
        return this._client.send(new DeleteObjectTaggingCommand(tagParams)).catch(err => {
            logHelper(log, 'error', 'error from data backend on ' +
                'deleteObjectTagging', err, this._dataStoreName, this.clientType);
            return callback(errorInstances.ServiceUnavailable
                .customizeDescription('Error returned from ' +
                `${this.type}: ${err.message}`));
        }).then(() => {
            return callback();
        });
    }
    copyObject(request, destLocationConstraintName, sourceKey, sourceLocationConstraintName, storeMetadataParams, config, log, callback) {
        const destBucketName = request.bucketName;
        const destObjectKey = request.objectKey;
        const destAwsKey = this._createAwsKey(destBucketName, destObjectKey, this._bucketMatch);
        const sourceAwsBucketName = config.getAwsBucketName(sourceLocationConstraintName);
        const metadataDirective = request.headers['x-amz-metadata-directive'];
        const metaHeaders = trimXMetaPrefix(getMetaHeaders(request.headers));
        const awsParams = {
            Bucket: this._awsBucketName,
            Key: destAwsKey,
            CopySource: `${sourceAwsBucketName}/${sourceKey}`,
            Metadata: metaHeaders,
            MetadataDirective: metadataDirective,
        };
        if (destLocationConstraintName &&
            config.isAWSServerSideEncryption(destLocationConstraintName)) {
            awsParams.ServerSideEncryption = 'AES256';
        }
        return this._client.send(new CopyObjectCommand(awsParams))
        .then(copyResult => {
            if (!copyResult.VersionId && this._supportsVersioning) {
                this._logger.debug('No VersionId found in response, ' +
                    'calling headObject to resolve');
                return this._client.send(new HeadObjectCommand({
                    Bucket: this._awsBucketName,
                    Key: destAwsKey,
                }))
                .then(data => {
                    if (!data.VersionId) {
                        return callback(missingVerIdInternalError);
                    }
                    return callback(null, destAwsKey, data.VersionId);
                })
                .catch(err => {
                    logHelper(log, 'error', 'missing version id for data ' +
                        'backend object', missingVerIdInternalError, this._dataStoreName, this.clientType);
                    return callback(missingVerIdInternalError);
                });
            }
            return callback(null, destAwsKey, copyResult.VersionId);
        })
        .catch(err => {
            if (err.name == "AccessDenied") {
                logHelper(log, 'error', 'Unable to access ' +
                    `${sourceAwsBucketName} ${this.type} bucket`, err, this._dataStoreName, this.clientType);
                return callback(errorInstances.AccessDenied
                    .customizeDescription('Error: Unable to access ' +
                    `${sourceAwsBucketName} ${this.type} bucket`));
            }
            logHelper(log, 'error', 'error from data backend on ' +
                'copyObject', err, this._dataStoreName, this.clientType);
            return callback(errorInstances.ServiceUnavailable
                .customizeDescription('Error returned from ' +
                `${this.type}: ${err.message}`));
        });
    }
    uploadPartCopy(request, awsSourceKey, sourceLocationConstraintName, config, log, callback) {
        console.log('uploadPartCopy called with source key:', request);
        const destBucketName = request.bucketName;
        const destObjectKey = request.objectKey;
        const destAwsKey = this._createAwsKey(destBucketName, destObjectKey, this._bucketMatch);
        const sourceAwsBucketName = config.getAwsBucketName(sourceLocationConstraintName);
        const uploadId = request.query.uploadId;
        const partNumber = request.query.partNumber;
        const copySourceRange = request.headers['x-amz-copy-source-range'];
        const params = {
            Bucket: this._awsBucketName,
            CopySource: `${sourceAwsBucketName}/${awsSourceKey}`,
            CopySourceRange: copySourceRange,
            Key: destAwsKey,
            PartNumber: partNumber,
            UploadId: uploadId,
        };
        console.log('uploadPartCopy params:', params);
        return this._client.send(new UploadPartCopyCommand(params))
        .then(res => {
            console.log('uploadPartCopy response:', res);
            const eTag = removeQuotes(res?.CopyPartResult?.ETag);
            return callback(null, eTag);
        })
        .catch(err => {
            console.log('Error occurred while uploading part copy:', err);
            if (err.name === "AccessDenied") {
                logHelper(log, 'error', 'Unable to access ' +
                    `${sourceAwsBucketName} AWS bucket`, err, this._dataStoreName, this.clientType);
                return callback(errorInstances.AccessDenied
                    .customizeDescription('Error: Unable to access ' +
                    `${sourceAwsBucketName} AWS bucket`));
            }
            logHelper(log, 'error', 'error from data backend on ' +
                'uploadPartCopy', err, this._dataStoreName, this.clientType);
            return callback(errorInstances.ServiceUnavailable
                .customizeDescription('Error returned from ' +
                `${this.type}: ${err.message}`));
        });
    }
}

module.exports = AwsClient;