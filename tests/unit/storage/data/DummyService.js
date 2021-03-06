const uuid = require('uuid/v4');
const { EventEmitter } = require('events');

const DummyObjectStream = require('./DummyObjectStream');
const { parseRange } = require('../../../../lib/network/http/utils');

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
    getBlobProperties(containerName, key, streamingOptions, callback) {
        if (key === 'externalBackendTestBucket/externalBackendMissingKey') {
            const err = new Error();
            err.code = 'NotFound';
            return callback(err);
        }
        const retObj = {
            ContentLength: `${OBJECT_SIZE}`,
        };
        return callback(null, retObj);
    }
    getBlobToStream(containerName, key, writeStream, options, callback) {
        if (key === 'externalBackendTestBucket/externalBackendMissingKey') {
            const err = new Error();
            err.code = 'NotFound';
            return callback(err);
        }
        const { rangeStart, rangeEnd } = options || {};
        const firstByte = rangeStart !== undefined ?
              Number.parseInt(rangeStart, 10) : 0;
        const lastByte = rangeEnd !== undefined ?
              Math.min(Number.parseInt(rangeEnd, 10), OBJECT_SIZE - 1) : OBJECT_SIZE - 1;
        const objStream = new DummyObjectStream(firstByte, lastByte - firstByte + 1);
        objStream.pipe(writeStream);
        return callback();
    }
    // To-Do: add tests for other methods
}

module.exports = DummyService;
