const { v4: uuid } = require('uuid');
const { EventEmitter } = require('events');
const { promisify } = require('util');
const assert = require('assert');

const DummyObjectStream = require('./DummyObjectStream');
const { parseRange } = require('../../../../lib/network/http/utils');
const errors = require('../../../../lib/errors').default;
const { 
    PutObjectCommand, 
    CopyObjectCommand, 
    HeadObjectCommand,
    PutObjectTaggingCommand, 
    DeleteObjectTaggingCommand,
    CompleteMultipartUploadCommand, 
    GetObjectCommand,
    DeleteObjectCommand,
    CreateMultipartUploadCommand,
    UploadPartCommand,
    ListPartsCommand,
    AbortMultipartUploadCommand,
    NotFound,
} = require('@aws-sdk/client-s3');

const OBJECT_SIZE = 1024 * 1024 * 1024;

class DummyGetObjectRequest {
    constructor(getObjectParams) {
        this.getObjectParams = getObjectParams;
    }

    createReadStream() {
        if (this.getObjectParams.Key === 'externalBackendTestBucket/externalBackendMissingKey') {
            const errorStream = new EventEmitter();
            process.nextTick(() => {
                const err = new NotFound();
                errorStream.emit('error', err);
            });
            return errorStream;
        }

        let [firstByte, lastByte] = [0, OBJECT_SIZE - 1];
        const { Range } = this.getObjectParams;
        if (Range) {
            const { range: byteRange, error: rangeError } = parseRange(Range, OBJECT_SIZE);
            if (rangeError) {
                // TODO add support for "requested range not satisfiable"
                throw new Error(rangeError);
            }
            if (byteRange) {
                [firstByte, lastByte] = byteRange;
            }
        }
        const streamSize = lastByte - firstByte + 1;
        return new DummyObjectStream(firstByte, streamSize);
    }

    // placeholder for nonessential event handler registration of 'success' event
    on() {
        return this;
    }

    abort() {
        return this;
    }
}

class AzureDummyContainerClient {
    constructor(key) {
        this.key = key;
    }

    async getProperties() {
        if (this.key === 'externalBackendTestBucket/externalBackendMissingKey') {
            throw new NotFound();
        }
        return {
            contentLength: `${OBJECT_SIZE}`,
            lastModified: new Date(),
        };
    }

    async download(offset, length) {
        if (this.key === 'externalBackendTestBucket/externalBackendMissingKey') {
            throw new NotFound();
        }
        return {
            readableStreamBody: new DummyObjectStream(offset, length || OBJECT_SIZE),
        };
    }
}

class DummyService {
    constructor(config = {}) {
        this.versioning = config.versioning;
        this.putObjectAsync = promisify(this.putObject.bind(this));
        this.copyObjectAsync = promisify(this.copyObject.bind(this));
        this.headObjectAsync = promisify(this.headObject.bind(this));
        this.putObjectTaggingAsync = promisify(this.putObjectTagging.bind(this));
        this.deleteObjectTaggingAsync = promisify(this.deleteObjectTagging.bind(this));
        this.completeMultipartUploadAsync = promisify(this.completeMultipartUpload.bind(this));
        this.deleteObjectAsync = promisify(this.deleteObject.bind(this));
        this.createMultipartUploadAsync = promisify(this.createMultipartUpload.bind(this));
        this.uploadPartAsync = promisify(this.uploadPart.bind(this));
        this.listPartsAsync = promisify(this.listParts.bind(this));
        this.abortMultipartUploadAsync = promisify(this.abortMultipartUpload.bind(this));
        
        this.commandHandlers = new Map([
            [PutObjectCommand, cmd => this.putObjectAsync(cmd.input)],
            [CopyObjectCommand, cmd => this.copyObjectAsync(cmd.input)],
            [HeadObjectCommand, cmd => this.headObjectAsync(cmd.input)],
            [PutObjectTaggingCommand, cmd => this.putObjectTaggingAsync(cmd.input)],
            [DeleteObjectTaggingCommand, cmd => this.deleteObjectTaggingAsync(cmd.input)],
            [CompleteMultipartUploadCommand, cmd => this.completeMultipartUploadAsync(cmd.input)],
            [GetObjectCommand, this._handleGetObject.bind(this)], // Special case - returns stream
            [DeleteObjectCommand, cmd => this.deleteObjectAsync(cmd.input)],
            [CreateMultipartUploadCommand, cmd => this.createMultipartUploadAsync(cmd.input)],
            [UploadPartCommand, cmd => this.uploadPartAsync(cmd.input)],
            [ListPartsCommand, cmd => this.listPartsAsync(cmd.input)],
            [AbortMultipartUploadCommand, cmd => this.abortMultipartUploadAsync(cmd.input)],
        ]);
    }

    // Helper method to check if key is missing
    _isMissingKey(key) {
        return key === 'externalBackendTestBucket/externalBackendMissingKey';
    }

    // Helper method to generate version ID when versioning is enabled
    _getVersionId() {
        return this.versioning ? uuid().replace(/-/g, '') : undefined;
    }

    // Helper method to generate ETag
    _generateETag() {
        return `"${uuid().replace(/-/g, '')}"`;
    }

    // Legacy callback-based methods (maintain backward compatibility)
    headBucket(params, callback) {
        return callback();
    }

    getBucketVersioning(params, callback) {
        const result = this.versioning ? { Status: 'Enabled' } : {};
        return callback(null, result);
    }

    headObject(params, callback) {
        if (this._isMissingKey(params.Key)) {
            return callback(new NotFound());
        }
        const retObj = {
            ContentLength: `${OBJECT_SIZE}`,
        };
        return callback(null, retObj);
    }

    getObject(params) {
        return new DummyGetObjectRequest(params);
    }

    putObject(params, callback) {
        const retObj = {
            ETag: this._generateETag(),
        };
        const versionId = this._getVersionId();
        if (versionId) {
            retObj.VersionId = versionId;
        }
        return callback(null, retObj);
    }

    copyObject(params, callback) {
        const retObj = {
            CopyObjectResult: {
                ETag: this._generateETag(),
                LastModified: new Date().toISOString(),
            },
            VersionId: null,
        };
        const versionId = this._getVersionId();
        if (versionId) {
            retObj.VersionId = versionId;
        }
        return callback(null, retObj);
    }

    completeMultipartUpload(params, callback) {
        const retObj = {
            Bucket: params.Bucket,
            Key: params.Key,
            ETag: this._generateETag(),
            ContentLength: `${OBJECT_SIZE}`,
        };
        const versionId = this._getVersionId();
        if (versionId) {
            retObj.VersionId = versionId;
        }
        return callback(null, retObj);
    }

    createMultipartUpload(params, callback) {
        const retObj = {
            Bucket: params.Bucket,
            Key: params.Key,
            UploadId: uuid(),
        };
        return callback(null, retObj);
    }

    uploadPart(params, callback) {
        const retObj = {
            ETag: this._generateETag(),
        };
        return callback(null, retObj);
    }

    listParts(params, callback) {
        const retObj = {
            Bucket: params.Bucket,
            Key: params.Key,
            UploadId: params.UploadId,
            Parts: [
                {
                    PartNumber: 1,
                    ETag: this._generateETag(),
                    Size: 1024,
                },
            ],
        };
        return callback(null, retObj);
    }

    abortMultipartUpload(params, callback) {
        return callback(null, {});
    }

    deleteObject(params, callback) {
        const retObj = {};
        const versionId = this._getVersionId();
        if (versionId) {
            retObj.VersionId = versionId;
        }
        return callback(null, retObj);
    }

    putObjectTagging(tagParams, callback) {
        if (this._isMissingKey(tagParams.Key)) {
            return callback(errors.NoSuchKey);
        }

        const keys = Object.keys(tagParams);
        assert(keys.length > 0);
        assert(tagParams.Tagging.TagSet.length > 0);
        tagParams.Tagging.TagSet.forEach(tag => {
            assert(tag.Key.length > 0);
            assert(tag.Value.length > 0);
        });

        if (tagParams.VersionId) {
            assert.strictEqual(tagParams.VersionId, 'latestversion');
        }

        return callback();
    }

    deleteObjectTagging(tagParams, callback) {
        if (this._isMissingKey(tagParams.Key)) {
            return callback(errors.NoSuchKey);
        }

        if (tagParams.VersionId) {
            assert.strictEqual(tagParams.VersionId, 'latestversion');
        }

        return callback();
    }

    upload(params, callback) {
        this.putObject(params, callback);
    }

    getBlockBlobClient(key) {
        return new AzureDummyContainerClient(key);
    }

    _handleGetObject(command) {
        const stream = new DummyObjectStream(0, 10000000);
        const response = {
            Body: stream,
            $metadata: {
                httpStatusCode: 200,
                requestId: 'mock-request-id',
                attempts: 1,
                totalRetryDelay: 0
            }
        };
        return Promise.resolve(response);
    }

    // Send method using the command mapping
    send(command) {
        const handler = this.commandHandlers.get(command.constructor);
        
        if (!handler) {
            return Promise.reject(new Error(
                `DummyService.send: Unhandled command type: ${command.constructor.name}`
            ));
        }
        try {
            return handler(command);
        } catch (error) {
            return Promise.reject(error);
        }
    }
}
module.exports = DummyService;
