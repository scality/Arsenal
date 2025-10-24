const assert = require('assert');
const sinon = require('sinon');
const werelogs = require('werelogs');

const BucketClientInterface = require(
    '../../../../../lib/storage/metadata/bucketclient/BucketClientInterface');
const BucketInfo = require('../../../../../lib/models/BucketInfo').default;

const logger = new werelogs.Logger('BucketClientInterface', 'debug', 'debug');

describe('BucketClientInterface', () => {
    let sandbox;
    let mockRESTClient;
    let bucketClient;
    let mockLog;

    const bucketName = 'test-bucket';
    const objName = 'test-object';
    const testRaftSessionId = 42;

    const mockBucketData = JSON.stringify({
        name: bucketName,
        owner: 'testowner',
        ownerDisplayName: 'testdisplayname',
        creationDate: new Date().toJSON(),
        acl: {
            Canned: 'private',
            FULL_CONTROL: [],
            WRITE: [],
            WRITE_ACP: [],
            READ: [],
            READ_ACP: [],
        },
        mdBucketModelVersion: 19,
        transient: false,
        deleted: false,
        serverSideEncryption: null,
        versioningConfiguration: null,
        locationConstraint: 'us-east-1',
        readLocationConstraint: null,
        cors: null,
        replicationConfiguration: null,
        lifecycleConfiguration: null,
        uid: '',
        isNFS: null,
        ingestion: null,
    });

    const mockObjectData = JSON.stringify({
        bucket: bucketName,
        key: objName,
    });

    beforeEach(() => {
        sandbox = sinon.createSandbox();

        // Create mock REST client
        mockRESTClient = {
            getBucketAttributes: sandbox.stub(),
            getBucketAndObject: sandbox.stub(),
        };

        // Mock the bucketclient module to return our mock REST client
        const mockBucketClient = {
            RESTClient: sandbox.stub().returns(mockRESTClient),
        };

        // Create mock log
        mockLog = {
            getSerializedUids: () => 'test-uid',
        };

        // Create BucketClientInterface instance
        const params = {
            bucketdBootstrap: ['localhost:9000'],
            bucketdLog: null,
        };

        bucketClient = new BucketClientInterface(params, mockBucketClient, logger);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('getBucketAttributes', () => {
        it('should propagate raftSessionId as third callback parameter when present', (done) => {
            mockRESTClient.getBucketAttributes.callsFake((bucketName, uid, callback) => {
                process.nextTick(() => callback(null, mockBucketData, testRaftSessionId));
            });

            bucketClient.getBucketAttributes(bucketName, mockLog, (err, bucketInfo, raftSessionId) => {
                assert.ifError(err);
                assert(bucketInfo instanceof BucketInfo);
                assert.strictEqual(raftSessionId, testRaftSessionId);
                done();
            });
        });

        it('should handle undefined raftSessionId', (done) => {
            mockRESTClient.getBucketAttributes.callsFake((bucketName, uid, callback) => {
                process.nextTick(() => callback(null, mockBucketData, undefined));
            });

            bucketClient.getBucketAttributes(bucketName, mockLog, (err, bucketInfo, raftSessionId) => {
                assert.ifError(err);
                assert(bucketInfo instanceof BucketInfo);
                assert.strictEqual(raftSessionId, undefined);
                done();
            });
        });

        it('should not propagate raftSessionId when error occurs', (done) => {
            const testError = new Error('Test error');
            mockRESTClient.getBucketAttributes.callsFake((bucketName, uid, callback) => {
                process.nextTick(() => callback(testError));
            });

            bucketClient.getBucketAttributes(bucketName, mockLog, (...args) => {
                assert.strictEqual(args.length, 1, 'Error callback should have only 1 parameter');
                assert.strictEqual(args[0], testError);
                done();
            });
        });
    });

    describe('getBucketAndObject', () => {
        it('should propagate raftSessionId when present', (done) => {
            mockRESTClient.getBucketAndObject.callsFake((bucket, obj, uid, callback) => {
                process.nextTick(() => callback(null, mockObjectData, testRaftSessionId));
            });

            bucketClient.getBucketAndObject(bucketName, objName, {}, mockLog, (err, data, raftSessionId) => {
                assert.ifError(err);
                assert.deepStrictEqual(data, JSON.parse(mockObjectData));
                assert.strictEqual(raftSessionId, testRaftSessionId);
                done();
            });
        });

        it('should handle undefined raftSessionId', (done) => {
            mockRESTClient.getBucketAndObject.callsFake((bucket, obj, uid, callback) => {
                process.nextTick(() => callback(null, mockObjectData, undefined));
            });

            bucketClient.getBucketAndObject(bucketName, objName, {}, mockLog, (err, data, raftSessionId) => {
                assert.ifError(err);
                assert.deepStrictEqual(data, JSON.parse(mockObjectData));
                assert.strictEqual(raftSessionId, undefined);
                done();
            });
        });

        it('should not propagate raftSessionId when error occurs', (done) => {
            const testError = new Error('error message');
            testError.is = { SomeError: true };

            mockRESTClient.getBucketAndObject.callsFake((bucket, obj, uid, callback) => {
                process.nextTick(() => callback(testError));
            });

            bucketClient.getBucketAndObject(bucketName, objName, {}, mockLog, (...args) => {
                assert.strictEqual(args.length, 1, 'Error callback should have only 1 parameter');
                assert.strictEqual(args[0], testError);
                done();
            });
        });
    });
});
