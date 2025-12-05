const errorInstances = require('../../../../errors').errorInstances;
const constructStringToSignV2 = require('../../../../auth/v2/constructStringToSign').default;
const crypto = require('crypto');
const GcpManagedUpload = require('../GCP/GcpManagedUpload');
const { S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    CopyObjectCommand,
    HeadObjectCommand,
    HeadBucketCommand,
    ListObjectsCommand,
    ListObjectVersionsCommand,
    PutBucketVersioningCommand,
    GetBucketVersioningCommand,
} = require('@aws-sdk/client-s3');
const { createNormalizeHeadersMiddleware } = require('../../../../utils/normalizeHeaders');
const { getHeaderCaseInsensitive } = require('./GcpUtils');
const gcpApis = require('./GcpApis');

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

        // Normalize headers before signing to avoid non-string values
        this.middlewareStack.add(
            createNormalizeHeadersMiddleware(),
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

    listBuckets(params, callback) {
        return callback(errorInstances.NotImplemented
            .customizeDescription('GCP: listBuckets not implemented'));
    }

    getBucketLocation(params, callback) {
        return callback(errorInstances.NotImplemented
            .customizeDescription('GCP: getBucketLocation not implemented'));
    }

    headBucket(params, callback) {
        const command = new HeadBucketCommand(params);        
        let metaVersionId;
        command.middlewareStack.add(
            next => async args => {
                const result = await next(args);
                const metagenerationHeader = getHeaderCaseInsensitive(
                    result.response?.headers,
                    'x-goog-metageneration'
                );
                if (metagenerationHeader !== undefined) {
                    metaVersionId = metagenerationHeader;
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
                const result = { ...data };
                if (metaVersionId) {
                    result.MetaVersionId = metaVersionId;
                }
                return callback && callback(null, result);
            })
            .catch(err => callback?.(err));
    }

    deleteBucket(params, callback) {
        return callback(errorInstances.NotImplemented
            .customizeDescription('GCP: deleteBucket not implemented'));
    }

    listVersions(params, callback) {
        return this.send(new ListObjectVersionsCommand(params))
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

    listObjectVersions(params, callback) {
        return this.listVersions(params, callback);
    }

    createBucket(params, callback) {
        return callback(errorInstances.NotImplemented
            .customizeDescription('GCP: createBucket not implemented'));
    }

    putBucket(params, callback) {
        return callback(errorInstances.NotImplemented
            .customizeDescription('GCP: putBucket not implemented'));
    }

    putBucketVersioning(params, callback) {
        if (!params || !params.Bucket || !params.VersioningConfiguration) {
            const error = errorInstances.InvalidRequest
                .customizeDescription('Missing required parameter');
            return callback(error);
        }
        return this.send(new PutBucketVersioningCommand(params))
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

    getBucketVersioning(params, callback) {
        if (!params || !params.Bucket) {
            const error = errorInstances.InvalidRequest
                .customizeDescription('Missing required parameter');
            return callback(error);
        }
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

    getBucketAcl(params, callback) {
        return callback(errorInstances.NotImplemented
            .customizeDescription('GCP: getBucketAcl not implemented'));
    }

    putBucketAcl(params, callback) {
        return callback(errorInstances.NotImplemented
            .customizeDescription('GCP: putBucketAcl not implemented'));
    }

    putBucketWebsite(params, callback) {
        return callback(errorInstances.NotImplemented
            .customizeDescription('GCP: putBucketWebsite not implemented'));
    }

    getBucketWebsite(params, callback) {
        return callback(errorInstances.NotImplemented
            .customizeDescription('GCP: getBucketWebsite not implemented'));
    }

    deleteBucketWebsite(params, callback) {
        return callback(errorInstances.NotImplemented
            .customizeDescription('GCP: deleteBucketWebsite not implemented'));
    }

    putBucketCors(params, callback) {
        return callback(errorInstances.NotImplemented
            .customizeDescription('GCP: putBucketCors not implemented'));
    }

    getBucketCors(params, callback) {
        return callback(errorInstances.NotImplemented
            .customizeDescription('GCP: getBucketCors not implemented'));
    }

    deleteBucketCors(params, callback) {
        return callback(errorInstances.NotImplemented
            .customizeDescription('GCP: deleteBucketCors not implemented'));
    }

    putObjectAcl(params, callback) {
        return callback(errorInstances.NotImplemented
            .customizeDescription('GCP: putObjectAcl not implemented'));
    }

    getObjectAcl(params, callback) {
        return callback(errorInstances.NotImplemented
            .customizeDescription('GCP: getObjectAcl not implemented'));
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
        let objectGeneration;
        command.middlewareStack.add(
            next => async args => {
                const result = await next(args);
                const generationHeader = getHeaderCaseInsensitive(
                    result.response?.headers,
                    'x-goog-generation'
                );
                if (generationHeader !== undefined) {
                    objectGeneration = generationHeader;
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
                if (objectGeneration) {
                    result.VersionId = objectGeneration;
                }
                // Ensure CopyObjectResult exists with VersionId for compatibility
                if (result.CopyObjectResult && objectGeneration) {
                    result.CopyObjectResult.VersionId = objectGeneration;
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
     * Get an object (callback style for test compatibility).
     */
    getObject(params, callback) {
        const command = new GetObjectCommand(params);
        
        // Capture GCP-specific headers
        let objectGeneration;
        command.middlewareStack.add(
            next => async args => {
                const result = await next(args);
                const generationHeader = getHeaderCaseInsensitive(
                    result.response?.headers,
                    'x-goog-generation'
                );
                if (generationHeader !== undefined) {
                    objectGeneration = generationHeader;
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
                if (objectGeneration) {
                    result.VersionId = objectGeneration;
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
            .then(data => callback?.(null, data))
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
        command.middlewareStack.add(next => async args => {
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
     * Head an object.
     */
     headObject(params, callback) {
        const command = new HeadObjectCommand(params);
        let gcpMetadata = {};
        let objectGeneration;
        command.middlewareStack.add(next => async args => {
            const result = await next(args);
            if (result.response?.headers) {
                Object.keys(result.response.headers).forEach(header => {
                    if (header.startsWith('x-goog-meta-')) {
                        gcpMetadata[header] = result.response.headers[header];
                    }
                });
                const generationHeader = getHeaderCaseInsensitive(
                    result.response.headers,
                    'x-goog-generation'
                );
                if (generationHeader !== undefined) {
                    objectGeneration = generationHeader;
                }
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
            if (objectGeneration) {
                result.VersionId = objectGeneration;
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
    return next => async args => {
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
            request.path = pathForSigning;
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

Object.assign(GcpClient.prototype, gcpApis);

module.exports = GcpClient;
