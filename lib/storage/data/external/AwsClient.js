const AWS = require('aws-sdk');
const werelogs = require('werelogs');

const errors = require('../../../errors');
const MD5Sum = require('../../../s3middleware/MD5Sum');
const getMetaHeaders =
    require('../../../s3middleware/userMetadata').getMetaHeaders;
const { prepareStream } = require('../../../s3middleware/prepareStream');
const { createLogger, logHelper, removeQuotes, trimXMetaPrefix } =
    require('./utils');

const missingVerIdInternalError = errors.InternalError.customizeDescription(
    'Invalid state. Please ensure versioning is enabled ' +
    'in AWS for the location constraint and try again.'
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
        this._client = new AWS.S3(this._s3Params);
        this._logger = new werelogs.Logger('AwsClient');
    }

    setup(cb) {
        // this request implicitly updates the endpoint for the location
        // the following code explcitly sets it to avoid surprises
        this._client.getBucketLocation({ Bucket: this._awsBucketName },
        (err, res) => {
            if (err && err.code !== 'AuthorizationHeaderMalformed') {
                this._logger.error('error during setup', {
                    error: err,
                    method: 'AwsClient.setup',
                });
                return cb(err);
            }
            let region;
            if (err && err.code === 'AuthorizationHeaderMalformed') {
                // set regional endpoint
                region = err.region;
            } else if (res) {
                region = res.LocationConstraint;
            }
            const isAWS = this._s3Params.endpoint.endsWith('amazonaws.com');
            if (region && isAWS) {
                const endpoint = `s3.${region}.amazonaws.com`;
                this._logger.debug('setting regional endpoint', {
                    method: 'AwsClient.setup',
                    region,
                    endpoint,
                });
                this._client.endpoint = new AWS.Endpoint(endpoint);
            }
            return cb();
        });
    }

    _createAwsKey(requestBucketName, requestObjectKey,
        bucketMatch) {
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

        const putCb = (err, data) => {
            if (err) {
                logHelper(log, 'error', 'err from data backend',
                  err, this._dataStoreName, this.clientType);
                return callback(errors.ServiceUnavailable
                  .customizeDescription('Error returned from ' +
                  `${this.type}: ${err.message}`)
                );
            }
            if (!data.VersionId && this._supportsVersioning) {
                logHelper(log, 'error', 'missing version id for data ' +
                    'backend object', missingVerIdInternalError,
                    this._dataStoreName, this.clientType);
                return callback(missingVerIdInternalError);
            }
            const dataStoreVersionId = data.VersionId;
            return callback(null, awsKey, dataStoreVersionId);
        };

        const params = {
            Bucket: this._awsBucketName,
            Key: awsKey,
        };
        // we call data.put to create a delete marker, but it's actually a
        // delete request in call to AWS
        if (keyContext.isDeleteMarker) {
            return this._client.deleteObject(params, putCb);
        }
        const uploadParams = params;
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
            return this._client.putObject(uploadParams, putCb);
        }

        uploadParams.Body = stream;
        return this._client.upload(uploadParams, putCb);
    }
    head(objectGetInfo, reqUids, callback) {
        const log = createLogger(reqUids);
        const { key, dataStoreVersionId } = objectGetInfo;
        return this._client.headObject({
            Bucket: this._awsBucketName,
            Key: key,
            VersionId: dataStoreVersionId,
        }, (err, data) => {
            if (err) {
                let logLevel;
                let retError;
                if (err.code === 'NotFound') {
                    logLevel = 'info';
                    retError = errors.LocationNotFound;
                } else {
                    logLevel = 'error';
                    retError = errors.ServiceUnavailable.customizeDescription(
                        `Error returned from ${this.type}: ${err.message}`);
                }
                logHelper(log, logLevel, 'error heading object ' +
                'from datastore', err, this._dataStoreName);
                return callback(retError);
            }
            return callback(null, data);
        });
    }
    get(objectGetInfo, range, reqUids, callback) {
        const log = createLogger(reqUids);
        const { key, dataStoreVersionId } = objectGetInfo;
        const request = this._client.getObject({
            Bucket: this._awsBucketName,
            Key: key,
            VersionId: dataStoreVersionId,
            Range: range ? `bytes=${range[0]}-${range[1]}` : null,
        }).on('success', response => {
            log.trace(`${this.type} GET request response headers`,
              { responseHeaders: response.httpResponse.headers,
                backendType: this.clientType });
        });
        if (!callback) {
            return request;
        }
        const stream = request.createReadStream().on('error', err => {
            let logLevel;
            let retError;
            if (err.code === 'NotFound') {
                logLevel = 'info';
                retError = errors.LocationNotFound;
            } else {
                logLevel = 'error';
                retError = errors.ServiceUnavailable.customizeDescription(
                    `Error returned from ${this.type}: ${err.message}`);
            }
            logHelper(log, logLevel,
              `error streaming data from ${this.type}`,
              err, this._dataStoreName, this.clientType);
            return callback(retError);
        });
        return callback(null, stream);
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
        return this._client.deleteObject(params, err => {
            if (err) {
                logHelper(log, 'error', 'error deleting object from ' +
                'datastore', err, this._dataStoreName, this.clientType);
                if (err.code === 'NoSuchVersion' || err.code === 'NoSuchKey') {
                    // data may have been deleted directly from the AWS backend
                    // don't want to retry the delete and errors are not
                    // sent back to client anyway, so no need to return err
                    return callback();
                }
                return callback(errors.ServiceUnavailable
                  .customizeDescription('Error returned from ' +
                  `${this.type}: ${err.message}`)
                );
            }
            return callback();
        });
    }

    healthcheck(location, callback) {
        const awsResp = {};
        this._client.headBucket({ Bucket: this._awsBucketName },
        err => {
            /* eslint-disable no-param-reassign */
            if (err) {
                awsResp[location] = { error: err, external: true };
                return callback(null, awsResp);
            }
            if (!this._supportsVersioning) {
                awsResp[location] = {
                    message: 'Congrats! You own the bucket',
                };
                return callback(null, awsResp);
            }
            return this._client.getBucketVersioning({
                Bucket: this._awsBucketName },
            (err, data) => {
                if (err) {
                    awsResp[location] = { error: err, external: true };
                } else if (!data.Status ||
                    data.Status === 'Suspended') {
                    awsResp[location] = {
                        versioningStatus: data.Status,
                        error: 'Versioning must be enabled',
                        external: true,
                    };
                } else {
                    awsResp[location] = {
                        versioningStatus: data.Status,
                        message: 'Congrats! You own the bucket',
                    };
                }
                return callback(null, awsResp);
            });
        });
    }

    createMPU(key, metaHeaders, bucketName, websiteRedirectHeader, contentType,
        cacheControl, contentDisposition, contentEncoding, tagging, log,
        callback) {
        const metaHeadersTrimmed = {};
        Object.keys(metaHeaders).forEach(header => {
            if (header.startsWith('x-amz-meta-')) {
                const headerKey = header.substring(11);
                metaHeadersTrimmed[headerKey] = metaHeaders[header];
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
        return this._client.createMultipartUpload(params, (err, mpuResObj) => {
            if (err) {
                logHelper(log, 'error', 'err from data backend',
                  err, this._dataStoreName, this.clientType);
                return callback(errors.ServiceUnavailable
                  .customizeDescription('Error returned from ' +
                  `${this.type}: ${err.message}`)
                );
            }
            return callback(null, mpuResObj);
        });
    }

    uploadPart(request, streamingV4Params, stream, size, key, uploadId,
    partNumber, bucketName, log, callback) {
        let hashedStream = stream;
        if (request) {
            const partStream = prepareStream(request, streamingV4Params,
                this._vault, log, callback);
            hashedStream = new MD5Sum();
            partStream.pipe(hashedStream);
        }

        const awsBucket = this._awsBucketName;
        const awsKey = this._createAwsKey(bucketName, key, this._bucketMatch);
        const params = { Bucket: awsBucket, Key: awsKey, UploadId: uploadId,
            Body: hashedStream, ContentLength: size,
            PartNumber: partNumber };
        return this._client.uploadPart(params, (err, partResObj) => {
            if (err) {
                logHelper(log, 'error', 'err from data backend ' +
                    'on uploadPart', err, this._dataStoreName, this.clientType);
                return callback(errors.ServiceUnavailable
                    .customizeDescription('Error returned from ' +
                    `${this.type}: ${err.message}`)
                );
            }
            // Because we manually add quotes to ETag later, remove quotes here
            const noQuotesETag =
                partResObj.ETag.substring(1, partResObj.ETag.length - 1);
            const dataRetrievalInfo = {
                key: awsKey,
                dataStoreType: 'aws_s3',
                dataStoreName: this._dataStoreName,
                dataStoreETag: noQuotesETag,
            };
            return callback(null, dataRetrievalInfo);
        });
    }

    listParts(key, uploadId, bucketName, partNumberMarker, maxParts, log,
    callback) {
        const awsBucket = this._awsBucketName;
        const awsKey = this._createAwsKey(bucketName, key, this._bucketMatch);
        const params = { Bucket: awsBucket, Key: awsKey, UploadId: uploadId,
            PartNumberMarker: partNumberMarker, MaxParts: maxParts };
        return this._client.listParts(params, (err, partList) => {
            if (err) {
                logHelper(log, 'error', 'err from data backend on listPart',
                  err, this._dataStoreName, this.clientType);
                return callback(errors.ServiceUnavailable
                  .customizeDescription('Error returned from ' +
                  `${this.type}: ${err.message}`)
                );
            }
            // build storedParts object to mimic Scality S3 backend returns
            const storedParts = {};
            storedParts.IsTruncated = partList.IsTruncated;
            storedParts.Contents = [];
            storedParts.Contents = partList.Parts.map(item => {
                // We manually add quotes to ETag later, so remove quotes here
                const noQuotesETag =
                    item.ETag.substring(1, item.ETag.length - 1);
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
        return this._client.completeMultipartUpload(mpuParams,
        (err, completeMpuRes) => {
            if (err) {
                if (mpuError[err.code]) {
                    logHelper(log, 'trace', 'err from data backend on ' +
                    'completeMPU', err, this._dataStoreName, this.clientType);
                    return callback(errors[err.code]);
                }
                logHelper(log, 'error', 'err from data backend on ' +
                'completeMPU', err, this._dataStoreName, this.clientType);
                return callback(errors.ServiceUnavailable
                  .customizeDescription('Error returned from ' +
                  `${this.type}: ${err.message}`)
                );
            }
            if (!completeMpuRes.VersionId && this._supportsVersioning) {
                logHelper(log, 'error', 'missing version id for data ' +
                'backend object', missingVerIdInternalError,
                    this._dataStoreName, this.clientType);
                return callback(missingVerIdInternalError);
            }
            // need to get content length of new object to store
            // in our metadata
            return this._client.headObject({ Bucket: awsBucket, Key: awsKey },
            (err, objHeaders) => {
                if (err) {
                    logHelper(log, 'trace', 'err from data backend on ' +
                    'headObject', err, this._dataStoreName, this.clientType);
                    return callback(errors.ServiceUnavailable
                      .customizeDescription('Error returned from ' +
                      `${this.type}: ${err.message}`)
                    );
                }
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
        return this._client.abortMultipartUpload(abortParams, err => {
            if (err) {
                logHelper(log, 'error', 'There was an error aborting ' +
                'the MPU on AWS S3. You should abort directly on AWS S3 ' +
                'using the same uploadId.', err, this._dataStoreName,
                this.clientType);
                return callback(errors.ServiceUnavailable
                  .customizeDescription('Error returned from ' +
                  `${this.type}: ${err.message}`)
                );
            }
            return callback();
        });
    }

    objectPutTagging(key, bucket, objectMD, log, callback) {
        const awsBucket = this._awsBucketName;
        const awsKey = this._createAwsKey(bucket, key, this._bucketMatch);
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
        return this._client.putObjectTagging(tagParams, err => {
            if (err) {
                logHelper(log, 'error', 'error from data backend on ' +
                  'putObjectTagging', err,
                  this._dataStoreName, this.clientType);
                return callback(errors.ServiceUnavailable
                  .customizeDescription('Error returned from ' +
                  `${this.type}: ${err.message}`)
                );
            }
            return callback();
        });
    }

    objectDeleteTagging(key, bucket, objectMD, log, callback) {
        const awsBucket = this._awsBucketName;
        const awsKey = this._createAwsKey(bucket, key, this._bucketMatch);
        const dataStoreVersionId = objectMD.location[0].dataStoreVersionId;
        const tagParams = {
            Bucket: awsBucket,
            Key: awsKey,
            VersionId: dataStoreVersionId,
        };
        return this._client.deleteObjectTagging(tagParams, err => {
            if (err) {
                logHelper(log, 'error', 'error from data backend on ' +
                'deleteObjectTagging', err,
                this._dataStoreName, this.clientType);
                return callback(errors.ServiceUnavailable
                  .customizeDescription('Error returned from ' +
                  `${this.type}: ${err.message}`)
                );
            }
            return callback();
        });
    }
    copyObject(request, destLocationConstraintName, sourceKey,
    sourceLocationConstraintName, storeMetadataParams, config, log, callback) {
        const destBucketName = request.bucketName;
        const destObjectKey = request.objectKey;
        const destAwsKey = this._createAwsKey(destBucketName, destObjectKey,
          this._bucketMatch);

        const sourceAwsBucketName =
          config.getAwsBucketName(sourceLocationConstraintName);

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
        config.isAWSServerSideEncrytion(destLocationConstraintName)) {
            awsParams.ServerSideEncryption = 'AES256';
        }
        this._client.copyObject(awsParams, (err, copyResult) => {
            if (err) {
                if (err.code === 'AccessDenied') {
                    logHelper(log, 'error', 'Unable to access ' +
                    `${sourceAwsBucketName} ${this.type} bucket`, err,
                    this._dataStoreName, this.clientType);
                    return callback(errors.AccessDenied
                      .customizeDescription('Error: Unable to access ' +
                      `${sourceAwsBucketName} ${this.type} bucket`)
                    );
                }
                logHelper(log, 'error', 'error from data backend on ' +
                'copyObject', err, this._dataStoreName, this.clientType);
                return callback(errors.ServiceUnavailable
                  .customizeDescription('Error returned from ' +
                  `${this.type}: ${err.message}`)
                );
            }
            if (!copyResult.VersionId && this._supportsVersioning) {
                this._logger.debug('No VersionId found in response, ' +
                                   'calling headObject to resolve');
                return this._client.headObject({
                    Bucket: this._awsBucketName,
                    Key: destAwsKey,
                }, (err, data) => {
                    if (err || !data.VersionId) {
                        logHelper(log, 'error', 'missing version id for data ' +
                            'backend object', missingVerIdInternalError,
                            this._dataStoreName, this.clientType);
                        return callback(missingVerIdInternalError);
                    }
                    return callback(null, destAwsKey, data.VersionId);
                });
            }
            return callback(null, destAwsKey, copyResult.VersionId);
        });
    }
    uploadPartCopy(request, awsSourceKey, sourceLocationConstraintName,
      config, log, callback) {
        const destBucketName = request.bucketName;
        const destObjectKey = request.objectKey;
        const destAwsKey = this._createAwsKey(destBucketName, destObjectKey,
        this._bucketMatch);

        const sourceAwsBucketName =
          config.getAwsBucketName(sourceLocationConstraintName);

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
        return this._client.uploadPartCopy(params, (err, res) => {
            if (err) {
                if (err.code === 'AccessDenied') {
                    logHelper(log, 'error', 'Unable to access ' +
                    `${sourceAwsBucketName} AWS bucket`, err,
                    this._dataStoreName, this.clientType);
                    return callback(errors.AccessDenied
                      .customizeDescription('Error: Unable to access ' +
                      `${sourceAwsBucketName} AWS bucket`)
                    );
                }
                logHelper(log, 'error', 'error from data backend on ' +
                'uploadPartCopy', err, this._dataStoreName, this.clientType);
                return callback(errors.ServiceUnavailable
                  .customizeDescription('Error returned from ' +
                  `${this.type}: ${err.message}`)
                );
            }
            const eTag = removeQuotes(res.CopyPartResult.ETag);
            return callback(null, eTag);
        });
    }
}

module.exports = AwsClient;
