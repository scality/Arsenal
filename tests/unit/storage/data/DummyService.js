const { v4: uuid } = require('uuid');
const { EventEmitter } = require('events');
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
    AbortMultipartUploadCommand
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
                const err = new Error();
                err.code = 'NotFound';
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
            const err = new Error();
            err.code = 'NotFound';
            throw err;
        }
        const retObj = {
            contentLength: `${OBJECT_SIZE}`,
            lastModified: new Date(),
        };
        return retObj;
    }

    async download(offset, length) {
        if (this.key === 'externalBackendTestBucket/externalBackendMissingKey') {
            const err = new Error();
            err.code = 'NotFound';
            throw err;
        }
        return {
            readableStreamBody: new DummyObjectStream(offset, length || OBJECT_SIZE),
        };
    }
}

class DummyService {
    constructor(config = {}) {
        this.versioning = config.versioning;
    }
    headBucket(params, callback) {
        return callback();
    }
    getBucketVersioning(params, callback) {
        if (this.versioning) {
            return callback(null, { Status: 'Enabled' });
        }
        return callback(null, {});
    }
    headObject(params, callback) {
        if (params.Key ===
            'externalBackendTestBucket/externalBackendMissingKey') {
            const err = new Error();
            err.code = 'NotFound';
            return callback(err);
        }
        const retObj = {
            ContentLength: `${OBJECT_SIZE}`,
        };
        return callback(null, retObj);
    }
    getObject(params) {
        return new DummyGetObjectRequest(params);
    }
    completeMultipartUpload(params, callback) {
        const retObj = {
            Bucket: params.Bucket,
            Key: params.Key,
            ETag: `"${uuid().replace(/-/g, '')}"`,
            ContentLength: `${OBJECT_SIZE}`,
        };
        if (this.versioning) {
            retObj.VersionId = uuid().replace(/-/g, '');
        }
        return callback(null, retObj);
    }
    upload(params, callback) {
        this.putObject(params, callback);
    }
    putObject(params, callback) {
        const retObj = {
            ETag: `"${uuid().replace(/-/g, '')}"`,
        };
        if (this.versioning) {
            retObj.VersionId = uuid().replace(/-/g, '');
        }
        return callback(null, retObj);
    }
    copyObject(params, callback) {
        const retObj = {
            CopyObjectResult: {
                ETag: `"${uuid().replace(/-/g, '')}"`,
                LastModified: new Date().toISOString(),
            },
            VersionId: null,
        };
        if (this.versioning) {
            retObj.VersionId = uuid().replace(/-/g, '');
        }
        return callback(null, retObj);
    }
    getBlockBlobClient(key) {
        return new AzureDummyContainerClient(key);
    }
    putObjectTagging(tagParams, callback) {
        if (tagParams.Key === 'externalBackendTestBucket/externalBackendMissingKey') {
            const err = errors.NoSuchKey;
            return callback(err);
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
        if (tagParams.Key === 'externalBackendTestBucket/externalBackendMissingKey') {
            const err = errors.NoSuchKey;
            return callback(err);
        }

        if (tagParams.VersionId) {
            assert.strictEqual(tagParams.VersionId, 'latestversion');
        }

        return callback();
    }
    
    send(command) {  // Remove callback parameter completely
        // Route based on command type and return promises (no callbacks)
        if (command instanceof PutObjectCommand) {
            return new Promise((resolve, reject) => {
                this.putObject(command.input, (err, result) => {
                    if (err) return reject(err);
                    resolve(result);
                });
            });
        }
        if (command instanceof CopyObjectCommand) {
            return new Promise((resolve, reject) => {
                this.copyObject(command.input, (err, result) => {
                    if (err) return reject(err);
                    resolve(result);
                });
            });
        }
        if (command instanceof HeadObjectCommand) {
            return new Promise((resolve, reject) => {
                this.headObject(command.input, (err, result) => {
                    if (err) return reject(err);
                    resolve(result);
                });
            });
        }
        if (command instanceof PutObjectTaggingCommand) {
            return new Promise((resolve, reject) => {
                this.putObjectTagging(command.input, (err, result) => {
                    if (err) return reject(err);
                    resolve(result);
                });
            });
        }
        if (command instanceof DeleteObjectTaggingCommand) {
            return new Promise((resolve, reject) => {
                this.deleteObjectTagging(command.input, (err, result) => {
                    if (err) return reject(err);
                    resolve(result);
                });
            });
        }
        if (command instanceof CompleteMultipartUploadCommand) {
            return new Promise((resolve, reject) => {
                this.completeMultipartUpload(command.input, (err, result) => {
                    if (err) return reject(err);
                    resolve(result);
                });
            });
        }
        if (command instanceof GetObjectCommand) {
            const stream = new DummyObjectStream(0, 10000000);
            stream.abort = () => {};
            const response = {
                createReadStream: () => stream,
                Body: stream,
                abort: () => {},
                $metadata: {
                    httpStatusCode: 200,
                    requestId: 'mock-request-id',
                    attempts: 1,
                    totalRetryDelay: 0
                }
            };
            return Promise.resolve(response);
        }
        if (command instanceof DeleteObjectCommand) {
            return new Promise((resolve, reject) => {
                this.deleteObject(command.input, (err, result) => {
                    if (err) return reject(err);
                    resolve(result);
                });
            });
        }
        if (command instanceof CreateMultipartUploadCommand) {
            return new Promise((resolve, reject) => {
                this.createMultipartUpload(command.input, (err, result) => {
                    if (err) return reject(err);
                    resolve(result);
                });
            });
        }
        if (command instanceof UploadPartCommand) {
            return new Promise((resolve, reject) => {
                this.uploadPart(command.input, (err, result) => {
                    if (err) return reject(err);
                    resolve(result);
                });
            });
        }
        if (command instanceof ListPartsCommand) {
            return new Promise((resolve, reject) => {
                this.listParts(command.input, (err, result) => {
                    if (err) return reject(err);
                    resolve(result);
                });
            });
        }
        if (command instanceof AbortMultipartUploadCommand) {
            return new Promise((resolve, reject) => {
                this.abortMultipartUpload(command.input, (err, result) => {
                    if (err) return reject(err);
                    resolve(result);
                });
            });
        }
        
        return Promise.reject(new Error('DummyService.send: Unhandled command type: ' + command.constructor.name));
    }
}


module.exports = DummyService;
