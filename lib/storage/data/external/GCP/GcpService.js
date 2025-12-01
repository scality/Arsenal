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
const retrieveTags = require('./GcpUtils').retrieveTags;
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
        this._maxConcurrent = 10;

        this.middlewareStack.remove('httpSigningMiddleware');

        // Add middleware to normalize headers before they reach signing middleware
        // AWS SDK v3 can pass header values as arrays or non-string types,
        // but signing libraries expect strings. This middleware normalizes all
        // header values to strings before signing.
        this.middlewareStack.add(
            (next) => async (args) => {
                if (args.request && args.request.headers) {
                    const headers = args.request.headers;
                    for (const headerName of Object.keys(headers)) {
                        const headerValue = headers[headerName];
                        if (headerValue !== undefined && typeof headerValue !== 'string') {
                            // Normalize arrays by joining with commas (per HTTP spec)
                            // Normalize other types by converting to string
                            headers[headerName] = Array.isArray(headerValue)
                                ? headerValue.join(',')
                                : String(headerValue);
                        }
                    }
                }
                return next(args);
            },
            {
                name: 'normalizeHeadersMiddleware',
                step: 'build',
                priority: 'high',
            }
        );

        // Add DNS compatibility middleware AFTER bucket endpoint resolution
        // This runs after the SDK decides virtual-hosted vs path-style
        // and forces path-style for DNS-incompatible buckets
        this.middlewareStack.add(
            gcpDnsCompatibilityMiddleware(config),
            {
                name: 'gcpDnsCompatibility',
                step: 'serialize',
                priority: 'high'
            }
        );

        // Add GCP signing middleware
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
        const command = new PutObjectCommand(params);
        
        // Capture GCP-specific headers
        let gcpHeaders = {};
        command.middlewareStack.add(
            (next) => async (args) => {
                const result = await next(args);
                if (result.response?.headers) {
                    gcpHeaders = result.response.headers;
                }
                return result;
            },
            {
                step: 'deserialize',
                name: 'captureGcpHeaders',
            }
        );
        
        return this.send(command)
            .then(data => {
                // Add GCP-specific fields
                const result = { ...data };
                if (gcpHeaders['x-goog-generation']) {
                    result.VersionId = gcpHeaders['x-goog-generation'];
                }
                return callback && callback(null, result);
            })
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
        return this.putObject(mpuParams, callback);
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
            (numParts, next) => {
                mpuHelper.composeFinal(numParts, params, next);
            },
            (result, next) => {
                mpuHelper.generateMpuResult(result, partList, next);
            },
            (result, aggregateETag, next) => {
                mpuHelper.copyToMain(result, aggregateETag, params, next);
            },
            (mpuResult, next) => {
                const delParams = {
                    Bucket: params.Bucket,
                    MPU: params.MPU,
                    Prefix: createMpuKey(params.Key, params.UploadId),
                };
                mpuHelper.removeParts(delParams, err => {
                    next(err, mpuResult);
                });
            },
        ], (err, result) => {
            callback(err, result);
        });
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
                if (callback) {
                    return callback(null, data);
                }
                return data;
            })
            .catch(err => {
                if (callback) {
                    return callback(err);
                }
                throw err;
            });
    }

    /**
     * Copy an object (mock for test compatibility).
     * @param {object} params - S3 copyObject params
     * @param {function} callback
     */
    copyObject(params, callback) {
        const command = new CopyObjectCommand(params);
        
        // Capture GCP-specific headers
        let gcpHeaders = {};
        command.middlewareStack.add(
            (next) => async (args) => {
                const result = await next(args);
                if (result.response?.headers) {
                    gcpHeaders = result.response.headers;
                }
                return result;
            },
            {
                step: 'deserialize',
                name: 'captureGcpHeaders',
            }
        );
        
        return this.send(command)
            .then(data => {
                // Add GCP-specific fields
                const result = { ...data };
                if (gcpHeaders['x-goog-generation']) {
                    result.VersionId = gcpHeaders['x-goog-generation'];
                }
                // Ensure CopyObjectResult exists with VersionId for compatibility
                if (result.CopyObjectResult && gcpHeaders['x-goog-generation']) {
                    result.CopyObjectResult.VersionId = gcpHeaders['x-goog-generation'];
                }
                if (callback) {
                    return callback(null, result);
                }
                return result;
            })
            .catch(err => {
                if (callback) {
                    return callback(err);
                }
                throw err;
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
            if (err)
                return callback(err);
            // Extract tags from metadata using retrieveTags
            const tagSet = retrieveTags(resObj.Metadata || {});
            const result = { TagSet: tagSet };
            return callback(null, result);
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
            next => {
                this.headObject({
                    Bucket: params.Bucket,
                    Key: params.Key,
                    VersionId: params.VersionId,
                }, (err, res) => {
                    next(err, res);
                });
            },
            (resObj, next) => {
                const completeMD = stripTags(resObj.Metadata);
                // Ensure at least one metadata header to trigger REPLACE in GCP
                if (Object.keys(completeMD).length === 0) {
                    completeMD['scal-tags-removed'] = 'true';
                }
                const copyParams = {
                    Bucket: params.Bucket,
                    Key: params.Key,
                    CopySource: `${params.Bucket}/${params.Key}`,
                    Metadata: completeMD,
                    MetadataDirective: 'REPLACE',
                };
                this.copyObject(copyParams, (err, res) => {
                    next(err, res);
                });
            },
        ], (err, result) => {
            callback(err, result);
        });
    }

    putObjectCopy(params, callback) {
        return callback(errorInstances.NotImplemented
            .customizeDescription('GCP: putObjectCopy not implemented'));
    }

    /**
     * Get an object (callback style for test compatibility).
     */
    getObject(params, callback) {
        const command = new GetObjectCommand(params);
        
        // Capture GCP-specific headers
        let gcpHeaders = {};
        command.middlewareStack.add(
            (next) => async (args) => {
                const result = await next(args);
                if (result.response?.headers) {
                    gcpHeaders = result.response.headers;
                }
                return result;
            },
            {
                step: 'deserialize',
                name: 'captureGcpHeaders',
            }
        );
        
        return this.send(command)
            .then(data => {
                // Add GCP-specific fields from headers
                const result = { ...data };
                if (gcpHeaders['x-goog-generation']) {
                    result.VersionId = gcpHeaders['x-goog-generation'];
                }
                return callback && callback(null, result);
            })
            .catch(err => callback?.(err));
    }

    /**
     * Delete an object.
     */
    deleteObject(params, callback) {
        // GCP has issues with VersionId - just delete by key without version
        const deleteParams = { ...params };
        if (deleteParams.VersionId) {
            delete deleteParams.VersionId;
        }
        return this.send(new DeleteObjectCommand(deleteParams))
            .then(data => callback && callback(null, data))
            .catch(err => callback?.(err));
    }

    /**
     * Compose multiple objects into one (GCP-specific, mock for test compatibility).
     */
    composeObject(params, callback) {
        if (!params.MultipartUpload || !params.MultipartUpload.Parts || params.MultipartUpload.Parts.length === 0) {
            return callback(errorInstances.InvalidRequest.customizeDescription('No parts specified for compose'));
        }
        const parts = params.MultipartUpload.Parts;
        // Build GCP Compose XML request body
        const components = parts.map(part => `<Component><Name>${part.PartName}</Name></Component>`).join('');
        const composeXml = `<?xml version="1.0" encoding="UTF-8"?><ComposeRequest>${components}</ComposeRequest>`;
        const command = new PutObjectCommand({
            Bucket: params.Bucket,
            Key: params.Key,
            Body: composeXml,
            ContentType: 'application/xml',
        });
        // Add compose query parameter via middleware
        command.middlewareStack.add((next) => async (args) => {
            if (!args.request.query)
                args.request.query = {};
            args.request.query.compose = '';
            return next(args);
        }, {
            step: 'build',
            name: 'addComposeQuery',
        });
        return this.send(command)
            .then(data => {
                return callback && callback(null, data);
            })
            .catch(err => {
                return callback?.(err);
            });
    }

    /**
     * Check if bucket exists and is accessible.
     * @param {object} params - Contains Bucket name
     * @param {function} callback
     */
    headBucket(params, callback) {
        const command = new HeadBucketCommand({ Bucket: params.Bucket });

        // Capture GCP-specific headers via middleware
        let gcpHeaders = {};
        command.middlewareStack.add(
            (next, context) => async (args) => {
                const result = await next(args);
                // Capture headers from HTTP response
                if (result.response?.headers) {
                    gcpHeaders = result.response.headers;
                }
                return result;
            }, {
            step: 'deserialize',
            name: 'captureGcpHeaders',
        });
        return this.send(command)
            .then(res => {
                // Merge SDK response with GCP-specific metadata
                const result = { ...res };
                if (gcpHeaders['x-goog-metageneration']) {
                    result.MetaVersionId = gcpHeaders['x-goog-metageneration'];
                }
                if (callback) {
                    return callback(null, result);
                }
                return result;
            })
            .catch(err => {
                if (callback) {
                    return callback(err);
                }
                throw err;
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
                if (callback) {
                    return callback(null, data);
                }
                return data;
            })
            .catch(err => {
                if (callback) {
                    return callback(err);
                }
                throw err;
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
                if (callback) {
                    return callback(null, result);
                }
                return result;
            })
            .catch(err => {
                if (callback) {
                    return callback(err);
                }
                throw err;
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
                    NextMarker: data.NextMarker,
                    Versions: data.Contents ? data.Contents.map(obj => ({
                        ...obj,
                        VersionId: obj.ETag, // Use ETag as version ID
                        IsLatest: true,
                    })) : [],
                    CommonPrefixes: data.CommonPrefixes,
                };
                if (callback) {
                    return callback(null, result);
                }
                return result;
            })
            .catch(err => {
                if (callback) {
                    return callback(err);
                }
                throw err;
            });
    }

    /**
     * Head an object.
     */
     headObject(params, callback) {
        const command = new HeadObjectCommand(params);
        let gcpMetadata = {};
        let gcpHeaders = {};
        command.middlewareStack.add((next) => async (args) => {
            const result = await next(args);
            if (result.response?.headers) {
                gcpHeaders = result.response.headers;
                Object.keys(result.response.headers).forEach(header => {
                    if (header.startsWith('x-goog-meta-')) {
                        gcpMetadata[header] = result.response.headers[header];
                    }
                });
            }
            return result;
        }, {
            step: 'deserialize',
            name: 'captureGcpMetadata',
        });
        return this.send(command)
            .then(data => {
            // Normalize metadata keys - remove x-goog-meta- prefix
            const normalizedMetadata = {};
            Object.keys(gcpMetadata).forEach(key => {
                const normalizedKey = key.replace(/^x-goog-meta-/i, '');
                normalizedMetadata[normalizedKey] = gcpMetadata[key];
            });
            // Merge SDK response with normalized metadata and GCP-specific fields
            const result = { ...data, Metadata: normalizedMetadata };
            // Add VersionId from x-goog-generation header
            if (gcpHeaders['x-goog-generation']) {
                result.VersionId = gcpHeaders['x-goog-generation'];
            }
            if (callback) {
                callback(null, result);
            }
            return result;
        })
            .catch(err => {
            if (callback) {
                callback(err);
            }
            throw err;
        });
    }
}

/**
 * Check if bucket name is DNS compatible (same logic as AWS SDK v2)
 */
function dnsCompatibleBucketName(bucketName) {
    const domain = /^[a-z0-9][a-z0-9.\-]{1,61}[a-z0-9]$/;
    const ipAddress = /(\d+\.){3}\d+/;
    const dots = /\.\./;
    return domain.test(bucketName) && !ipAddress.test(bucketName) && !dots.test(bucketName);
}

/**
 * Middleware to enforce path-style for DNS-incompatible buckets
 * Runs at 'serialize' step, AFTER SDK's bucket endpoint middleware
 * Moves bucket from hostname to path if bucket is DNS-incompatible
 */
function gcpDnsCompatibilityMiddleware(config) {
    return (next) => async (args) => {
        const bucketName = args.input?.Bucket;
        const request = args.request;

        // Only process if forcePathStyle is not already set
        if (bucketName && !config.s3Params.forcePathStyle && request) {
            // Check if bucket is DNS compatible
            if (!dnsCompatibleBucketName(bucketName)) {
                // Check if bucket is in the hostname (virtual-hosted style)
                if (request.hostname && request.hostname.includes(bucketName)) {
                    // Move bucket from hostname to path (force path-style)
                    const bucketPrefix = `${bucketName}.`;
                    request.hostname = request.hostname.replace(bucketPrefix, '');

                    // Update the path to include the bucket
                    if (request.path === '/' || request.path.startsWith('/?')) {
                        request.path = `/${bucketName}${request.path}`;
                    } else if (request.path.startsWith('/')) {
                        request.path = `/${bucketName}${request.path}`;
                    } else {
                        request.path = `/${bucketName}/${request.path}`;
                    }
                }
            }
        }

        return next(args);
    };
}

/**
 * GCP signing middleware - signs requests with GCP's GOOG1 signature
 */
function gcpSigningMiddleware(config) {
    return (next, context) => async (args) => {
        try {
            const { request } = args;
            if (!request.headers)
                request.headers = {};
            if (!request.headers['x-goog-date']) {
                request.headers['x-goog-date'] = new Date().toUTCString();
            }
            // Convert x-amz headers to x-goog BEFORE signing (so they're included in signature)
            const convertHeaders = {
                'x-amz-copy-source': 'x-goog-copy-source',
                'x-amz-metadata-directive': 'x-goog-metadata-directive',
                'x-amz-copy-source-if-match': 'x-goog-copy-source-if-match',
                'x-amz-copy-source-if-none-match': 'x-goog-copy-source-if-none-match',
                'x-amz-copy-source-if-modified-since': 'x-goog-copy-source-if-modified-since',
                'x-amz-copy-source-if-unmodified-since': 'x-goog-copy-source-if-unmodified-since',
            };
            Object.keys(request.headers).forEach(header => {
                const lowerHeader = header.toLowerCase();
                if (convertHeaders[lowerHeader]) {
                    request.headers[convertHeaders[lowerHeader]] = request.headers[header];
                    delete request.headers[header];
                }
                // Convert x-amz-meta-* to x-goog-meta-*
                else if (lowerHeader.startsWith('x-amz-meta-')) {
                    const gcpMetaKey = header.replace(/^x-amz-meta-/i, 'x-goog-meta-');
                    request.headers[gcpMetaKey] = request.headers[header];
                    delete request.headers[header];
                }
            });

            let bucketName = args.input?.Bucket || config.bucketName;
            let virtualHostedBucket = undefined;
            if (request.hostname && bucketName && request.hostname.includes(bucketName)) {
                virtualHostedBucket = bucketName;
            }
            let pathForSigning = request.path;
            if (args.input?.Bucket && request.path === '/') {
                if (virtualHostedBucket) {
                    const key = args.input?.Key || '';
                    pathForSigning = key ? `/${key}` : '/';
                }
                else {
                    const key = args.input?.Key || '';
                    pathForSigning = key ? `/${args.input.Bucket}/${key}` : `/${args.input.Bucket}/`;
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
            const data = Object.assign({}, request.headers);
            const logger = { trace: () => { } };
            const stringToSign = constructStringToSignV2(fakeRequest, data, logger, 'GCP');
            const secret = config.s3Params.credentials.secretAccessKey;
            const accessKeyId = config.s3Params.credentials.accessKeyId;
            const signature = crypto.createHmac('sha1', secret).update(stringToSign).digest('base64');
            request.headers['Authorization'] = `GOOG1 ${accessKeyId}: ${signature}`;
            // Remove x-amz-* headers added by SDK v3 (GCP doesn't accept them)
            const removedHeaders = [];
            Object.keys(request.headers).forEach(header => {
                const lowerHeader = header.toLowerCase();
                // Convert x-amz headers to x-goog equivalents
                if (convertHeaders[lowerHeader]) {
                    request.headers[convertHeaders[lowerHeader]] = request.headers[header];
                    delete request.headers[header];
                    removedHeaders.push(header);
                }
                // Remove other x-amz headers
                else if (lowerHeader.startsWith('x-amz-')) {
                    removedHeaders.push(header);
                    delete request.headers[header];
                }
                // Remove AWS SDK internal headers
                else if (lowerHeader.includes('amz-sdk') || lowerHeader.includes('amz-')) {
                    removedHeaders.push(header);
                    delete request.headers[header];
                }
            });
            return next(args);
        }
        catch (err) {
            throw err;
        }
    };
}

module.exports = GcpClient;