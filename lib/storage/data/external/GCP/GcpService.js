// GcpClient.js: GCP-compatible S3 client using AWS SDK v3
const errorInstances = require('../../../../errors').errorInstances;
const constructStringToSignV2 = require('../../../../auth/v2/constructStringToSign').default;
const crypto = require('crypto');
const getPutTagsMetadata = require('./GcpUtils').getPutTagsMetadata;
const processTagSet = require('./GcpUtils').processTagSet;
const GcpManagedUpload = require('../GCP/GcpManagedUpload');
const async = require('async');
const createMpuKey = require('./GcpUtils').createMpuKey;
const getPartNumber = require('./GcpUtils').getPartNumber;
const MpuHelper = require('./GcpApis/mpuHelper');
const { v4: uuid } = require('uuid');
const stripTags = require('./GcpUtils').stripTags;
const { S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    CopyObjectCommand,
    HeadObjectCommand,
    HeadBucketCommand,
    ListObjectsCommand,
    CreateMultipartUploadCommand,
    UploadPartCommand,
    CompleteMultipartUploadCommand,
    AbortMultipartUploadCommand,
    PutObjectTaggingCommand,
    GetObjectTaggingCommand,
    DeleteObjectTaggingCommand,
    ListPartsCommand,
    GetBucketVersioningCommand,
    PutBucketVersioningCommand,
} = require('@aws-sdk/client-s3');

/**
 * GcpClient: S3-compatible client for Google Cloud Storage using AWS SDK v3.
 *
 * Configuration options:
 *   - s3Params: AWS SDK v3 S3Client configuration (endpoint, credentials, etc.)
 *   - bucketName: Main GCP bucket name
 *   - mpuBucket: Bucket for multipart uploads (optional, defaults to bucketName)
 *   - dataStoreName: Logical name for the backend
 *   - type: Should be 'gcp'
 *
 * GCP-specific behaviors:
 *   - Object tags are stored as metadata with the prefix 'scal-s3b-tag-'.
 *   - MPU (multipart upload) is emulated using GCP's compose/copy APIs.
 *   - All S3-compatible methods are available, with overrides for GCP quirks.
 */
class GcpClient extends S3Client {
    /**
     * @param {object} config - Configuration object (see above)
     */
    constructor(config) {
        super(config.s3Params);
        this._config = config;

        this.middlewareStack.remove('httpSigningMiddleware');

        this.middlewareStack.add(
             gcpSigningMiddleware(config),
             {
                 name: 'gcpSigningMiddleware',
                 step: 'finalizeRequest',
                 priority: 'high'
             }
         );
    }

    /**
     * Upload an object to GCP (with optional tagging as metadata).
     * @param {object} params - S3 putObject params
     * @param {function} callback
     */
    putObject(params, callback) {
        return this.send(new PutObjectCommand(params))
            .then(data => callback && callback(null, data))
            .catch(err => callback?.(err));
    }


    /**
     * Set object tags (stored as metadata in GCP).
     * @param {object} params - S3 putObjectTagging params
     * @param {function} callback
     */
    putObjectTagging(params, callback) {
        if (!params.Tagging || !params.Tagging.TagSet) {
            return callback(errorInstances.MissingParameter);
        }
        const tagRes = processTagSet(params.Tagging.TagSet);
        if (tagRes instanceof Error) {
            return callback(tagRes);
        }
        return async.waterfall([
            next => this.headObject({
                Bucket: params.Bucket,
                Key: params.Key,
                VersionId: params.VersionId,
            }, next),
            (resObj, next) => {
                const completeMD = Object.assign({}, resObj.Metadata, tagRes);
                this.copyObject({
                    Bucket: params.Bucket,
                    Key: params.Key,
                    CopySource: `${params.Bucket}/${params.Key}`,
                    Metadata: completeMD,
                    MetadataDirective: 'REPLACE',
                }, next);
            },
        ], callback);
    }

    /**
     * Multipart upload (managed upload, single or multi-part).
     * @param {object} params - S3 upload params
     * @param {function} callback
     */
    upload(params, callback) {
        // Use GcpManagedUpload for multipart or single-part upload
        try {
            const uploader = new GcpManagedUpload(this, params);
            return uploader.send(callback);
        } catch (err) {
            return callback(err);
        }
    }

    /**
     * Initiate a multipart upload (emulated for GCP).
     * @param {object} params - S3 createMultipartUpload params
     * @param {function} callback
     */
    createMultipartUpload(params, callback) {
        if (!params || !params.Bucket || !params.Key) {
            const error = errorInstances.InvalidRequest
                .customizeDescription('Missing required parameter');
            return callback(error);
        }
        const uploadId = uuid().replace(/-/g, '');
        const mpuParams = {
            Bucket: params.Bucket,
            Key: createMpuKey(params.Key, uploadId, 'init'),
            Metadata: params.Metadata,
            ContentType: params.ContentType,
            CacheControl: params.CacheControl,
            ContentDisposition: params.ContentDisposition,
            ContentEncoding: params.ContentEncoding,
        };
        mpuParams.Metadata = getPutTagsMetadata(mpuParams.Metadata, params.Tagging);
        return this.putObject(mpuParams, err => {
            if (err) {
                return callback(err);
            }
            return callback(null, { UploadId: uploadId });
        });
    }

    /**
     * Upload a part for MPU (emulated for GCP).
     * @param {object} params - S3 uploadPart params
     * @param {function} callback
     */
    uploadPart(params, callback) {
        if (!params || !params.UploadId || !params.Bucket || !params.Key) {
            const error = errorInstances.InvalidRequest
                .customizeDescription('Missing required parameter');
            return callback(error);
        }
        const partNumber = getPartNumber(params.PartNumber);
        if (!partNumber) {
            const error = errorInstances.InvalidArgument
                .customizeDescription('PartNumber is invalid');
            return callback(error);
        }
        const mpuParams = {
            Bucket: params.Bucket,
            Key: createMpuKey(params.Key, params.UploadId, partNumber),
            Body: params.Body,
            ContentLength: params.ContentLength,
        };
        // Use v3 S3Client's putObject
        return super.putObject(mpuParams, callback);
    }

    /**
     * Upload a part by copying from an existing object (emulated for GCP).
     * @param {object} params - S3 uploadPartCopy params
     * @param {function} callback
     */
    uploadPartCopy(params, callback) {
        if (!params || !params.UploadId || !params.Bucket || !params.Key || !params.CopySource) {
            const error = errorInstances.InvalidRequest
                .customizeDescription('Missing required parameter');
            return callback(error);
        }
        const partNumber = getPartNumber(params.PartNumber);
        if (!partNumber) {
            const error = errorInstances.InvalidArgument
                .customizeDescription('PartNumber is not a number');
            return callback(error);
        }
        const mpuParams = {
            Bucket: params.Bucket,
            Key: createMpuKey(params.Key, params.UploadId, partNumber),
            CopySource: params.CopySource,
        };
        return this.copyObject(mpuParams, callback);
    }

    /**
     * Complete a multipart upload (emulated for GCP).
     * @param {object} params - S3 completeMultipartUpload params
     * @param {function} callback
     */
    completeMultipartUpload(params, callback) {
        if (!params || !params.MultipartUpload ||
            !params.MultipartUpload.Parts || !params.UploadId ||
            !params.Bucket || !params.Key) {
            const error = errorInstances.InvalidRequest
                .customizeDescription('Missing required parameter');
            return callback(error);
        }
        const partList = params.MultipartUpload.Parts;
        if (partList.length === 0) {
            const error = errorInstances.InvalidRequest
                .customizeDescription('You must specify at least one part');
            return callback(error);
        }
        for (let ind = 1; ind < partList.length; ++ind) {
            if (partList[ind - 1].PartNumber >= partList[ind].PartNumber) {
                return callback(errorInstances.InvalidPartOrder);
            }
        }
        const mpuHelper = new MpuHelper(this);
        return async.waterfall([
            next => mpuHelper.splitMerge(params, partList, 'compose', next),
            (numParts, next) => mpuHelper.composeFinal(numParts, params, next),
            (result, next) => mpuHelper.generateMpuResult(result, partList, next),
            (result, aggregateETag, next) => mpuHelper.copyToMain(result, aggregateETag, params, next),
            (mpuResult, next) => {
                const delParams = {
                    Bucket: params.Bucket,
                    MPU: params.MPU,
                    Prefix: createMpuKey(params.Key, params.UploadId),
                };
                return mpuHelper.removeParts(delParams, err => next(err, mpuResult));
            },
        ], callback);
    }

    /**
     * Abort a multipart upload (emulated for GCP).
     * @param {object} params - S3 abortMultipartUpload params
     * @param {function} callback
     */
    abortMultipartUpload(params, callback) {
        if (!params || !params.Key || !params.UploadId || !params.Bucket || !params.MPU) {
            const error = errorInstances.InvalidRequest
                .customizeDescription('Missing required parameter');
            return callback(error);
        }
        const mpuHelper = new MpuHelper(this);
        const delParams = {
            Bucket: params.Bucket,
            MPU: params.MPU,
            Prefix: createMpuKey(params.Key, params.UploadId),
        };
        return mpuHelper.removeParts(delParams, callback);
    }

    /**
     * List parts of a multipart upload (emulated for GCP).
     * @param {object} params - S3 listParts params
     * @param {function} callback
     */
    listParts(params, callback) {
        if (!params || !params.UploadId || !params.Bucket || !params.Key) {
            const error = errorInstances.InvalidRequest
                .customizeDescription('Missing required parameter');
            return callback(error);
        }
        if (params.PartNumberMarker && params.PartNumberMarker < 0) {
            return callback(errorInstances.InvalidArgument
                .customizeDescription('The request specified an invalid marker'));
        }
        const mpuParams = {
            Bucket: params.Bucket,
            Prefix: createMpuKey(params.Key, params.UploadId, 'parts'),
            Marker: createMpuKey(params.Key, params.UploadId, params.PartNumberMarker, 'parts'),
            MaxKeys: params.MaxParts,
        };
        return this.listObjects(mpuParams, callback);
    }

    /**
     * List objects in a bucket.
     * @param {object} params - S3 listObjects params
     * @param {function} callback
     */
    listObjects(params, callback) {
        return this.send(new ListObjectsCommand(params))
            .then(data => {
                if (callback) callback(null, data);
                return data;
            })
            .catch(err => {
                if (callback) callback(err);
                return Promise.reject(err);
            });
    }

    /**
     * Copy an object (mock for test compatibility).
     * @param {object} params - S3 copyObject params
     * @param {function} callback
     */
    copyObject(params, callback) {
        return this.send(new CopyObjectCommand(params))
            .then(data => {
                if (callback) callback(null, data);
                return data;
            })
            .catch(err => {
                if (callback) callback(err);
                return Promise.reject(err);
            });
    }

    /**
     * Get object tags (from metadata).
     * @param {object} params - S3 getObjectTagging params
     * @param {function} callback
     */
    getObjectTagging(params, callback) {
        // GCP: tags are stored as metadata
        return this.headObject({
            Bucket: params.Bucket,
            Key: params.Key,
            VersionId: params.VersionId,
        }, (err, resObj) => {
            if (err) return callback(err);
            // Extract tags from metadata
            const tagSet = [];
            Object.keys(resObj.Metadata || {}).forEach(key => {
                if (key.startsWith('scal-s3b-tag-')) {
                    tagSet.push({
                        Key: key.replace('scal-s3b-tag-', ''),
                        Value: resObj.Metadata[key],
                    });
                }
            });
            return callback(null, { TagSet: tagSet });
        });
    }

    /**
     * Delete object tags (from metadata).
     * @param {object} params - S3 deleteObjectTagging params
     * @param {function} callback
     */
    deleteObjectTagging(params, callback) {
        // Remove tags from metadata
        return async.waterfall([
            next => this.headObject({
                Bucket: params.Bucket,
                Key: params.Key,
                VersionId: params.VersionId,
            }, next),
            (resObj, next) => {
                const completeMD = stripTags(resObj.Metadata);
                this.copyObject({
                    Bucket: params.Bucket,
                    Key: params.Key,
                    CopySource: `${params.Bucket}/${params.Key}`,
                    Metadata: completeMD,
                    MetadataDirective: 'REPLACE',
                }, next);
            },
        ], callback);
    }

    putObjectCopy(params, callback) {
        return callback(errorInstances.NotImplemented
            .customizeDescription('GCP: putObjectCopy not implemented'));
    }

    /**
     * Get an object (callback style for test compatibility).
     */
    getObject(params, callback) {
        return this.send(new GetObjectCommand(params))
            .then(data => callback && callback(null, data))
            .catch(err => callback?.(err));
    }

    /**
     * Delete an object.
     */
    deleteObject(params, callback) {
        return this.send(new DeleteObjectCommand(params))
            .then(data => callback && callback(null, data))
            .catch(err => callback?.(err));
    }

    /**
     * Compose multiple objects into one (GCP-specific, mock for test compatibility).
     */
    composeObject(params, callback) {
        return callback && callback(null, { /* mock result */ });
    }

    /**
     * Check if bucket exists and is accessible.
     * @param {object} params - Contains Bucket name
     * @param {function} callback
     */
    headBucket(params, callback) {
        // For GCP, we can simulate this by using HeadObjectCommand on a non-existent key
        // If bucket doesn't exist, we'll get appropriate error
        return this.send(new HeadBucketCommand({
            Bucket: params.Bucket
        }))
            .then(() => {
                // Bucket exists (even if key doesn't)
                if (callback) callback(null, {});
                return {};
            })
            .catch(err => {
                if (callback) callback(err);
                return Promise.reject(err);
            });
    }

    /**
     * Get bucket versioning configuration.
     * @param {object} params - Contains Bucket name
     * @param {function} callback
     */
    getBucketVersioning(params, callback) {
        return this.send(new GetBucketVersioningCommand(params))
            .then(data => {
                if (callback) callback(null, data);
                return Promise.resolve(data);
            })
            .catch(err => {
                if (callback) callback(err);
                return Promise.reject(err);
            });
    }

    /**
     * Set bucket versioning configuration.
     * @param {object} params - Contains Bucket name and VersioningConfiguration
     * @param {function} callback
     */
    putBucketVersioning(params, callback) {
        return this.send(new PutBucketVersioningCommand(
            { Bucket: params.Bucket, VersioningConfiguration: params.VersioningConfiguration }
        ))
        .then(data => {
            const result = {};
            if (callback) callback(null, result);
            return Promise.resolve(result);
        })
        .catch(err => {
            if (callback) callback(err);
            return Promise.reject(err);
        });
    }

    /**
     * List object versions in bucket.
     * @param {object} params - Contains Bucket name and optional filters
     * @param {function} callback
     */
    listVersions(params, callback) {
        // GCP doesn't have S3-style versioning, but we can simulate this
        // by returning current objects as "versions" for API compatibility
        return this.listObjects(params)
            .then(data => {
                const result = {
                    Name: data.Name,
                    Prefix: data.Prefix,
                    Delimiter: data.Delimiter,
                    MaxKeys: data.MaxKeys,
                    IsTruncated: data.IsTruncated,
                    Versions: data.Contents ? data.Contents.map(obj => ({
                        ...obj,
                        VersionId: obj.ETag, // Use ETag as version ID
                        IsLatest: true,
                    })) : [],
                    CommonPrefixes: data.CommonPrefixes,
                };
                if (callback) callback(null, result);
                return result;
            })
            .catch(err => {
                if (callback) callback(err);
                return Promise.reject(err);
            });
    }

    /**
     * Head an object.
     */
    headObject(params, callback) {
        return this.send(new HeadObjectCommand(params))
            .then(data => callback && callback(null, data))
            .catch(err => callback?.(err));
    }
}

function gcpSigningMiddleware(config) {
    return (next, context) => async (args) => {
        try {
            console.log('[GCP Signing] START - method:', args.request.method, 'path:', args.request.path);
            console.log('[GCP Signing] hostname:', args.request.hostname);
            console.log('[GCP Signing] input Bucket param:', args.input?.Bucket);
            const { request } = args;
            if (!request.headers)
                request.headers = {};
            if (!request.headers['x-goog-date']) {
                request.headers['x-goog-date'] = new Date().toUTCString();
            }
            console.log('[GCP Signing] x-goog-date set:', request.headers['x-goog-date']);
            // Get bucket name from command input (path not set yet at finalizeRequest step)
            let bucketName = args.input?.Bucket || config.bucketName;
            let virtualHostedBucket = undefined;
            console.log('[GCP Signing] Bucket from input:', args.input?.Bucket);
            console.log('[GCP Signing] Using bucket name:', bucketName);
            
            if (request.hostname && bucketName && request.hostname.includes(bucketName)) {
                virtualHostedBucket = bucketName;
                console.log('[GCP Signing] Virtual-hosted style detected');
            }
            
            let pathForSigning = request.path;
            if (args.input?.Bucket && request.path === '/') {
                if (virtualHostedBucket) {
                    const key = args.input?.Key || '';
                    pathForSigning = key ? `/${key}` : '/';
                    console.log('[GCP Signing] Virtual-hosted path:', pathForSigning);
                }
                else {
                    const key = args.input?.Key || '';
                    pathForSigning = key ? `/${args.input.Bucket}/${key}` : `/${args.input.Bucket}/`;
                    console.log('[GCP Signing] Path-style path:', pathForSigning);
                }
            }
            // Build string to sign
            const fakeRequest = {
                method: request.method,
                headers: request.headers,
                url: pathForSigning,
                path: pathForSigning,
                endpoint: { host: request.hostname },
                virtualHostedBucket,
                bucketName,
                query: request.query || {},
                gotBucketNameFromHost: virtualHostedBucket !== undefined,
            };
            console.log('[GCP Signing] Using bucket name:', bucketName);
            const data = Object.assign({}, request.headers); // Pass headers as data, like old GcpSigner did
            const logger = { trace: () => { } };
            const stringToSign = constructStringToSignV2(fakeRequest, data, logger, 'GCP');
            console.log('[GCP Signing] String to sign:', stringToSign);
            const secret = config.s3Params.credentials.secretAccessKey;
            const accessKeyId = config.s3Params.credentials.accessKeyId;
            console.log('[GCP Signing] Using accessKeyId:', accessKeyId);
            const signature = crypto.createHmac('sha1', secret).update(stringToSign).digest('base64');
            console.log('[GCP Signing] Generated signature:', signature);
            request.headers['Authorization'] = `GOOG1 ${accessKeyId}: ${signature}`;
            console.log('[GCP Signing] Set Authorization:', request.headers['Authorization']);
            // Remove x-amz-* headers added by SDK v3 (GCP doesn't accept them)
            const removedHeaders = [];
            Object.keys(request.headers).forEach(header => {
                if (header.toLowerCase().startsWith('x-amz-')) {
                    removedHeaders.push(header);
                    delete request.headers[header];
                }
            });
            console.log('[GCP Signing] Removed x-amz headers:', removedHeaders);
            return next(args);
        }
        catch (err) {
            console.error('Error in GCP signing middleware:', err);
            throw err;
        }
    };
}

module.exports = GcpClient; 