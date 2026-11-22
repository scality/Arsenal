const assert = require('assert');
const async = require('async');
const sinon = require('sinon');
const werelogs = require('werelogs');

const MetadataWrapper = require('../../../../lib/storage/metadata/MetadataWrapper');
const BucketInfo = require('../../../../lib/models/BucketInfo').default;

const logger = new werelogs.Logger('MetadataWrapper', 'debug', 'debug');

describe('MetadataWrapper::raftSessionId propagation', () => {
    let sandbox;
    let mockClient;
    let metadataWrapper;
    let mockLog;

    const bucketName = 'test-bucket';
    const objName = 'test-object';
    const testRaftSessionId = 123;

    const testBucketMD = {
        _name: bucketName,
        _owner: 'testowner',
        _ownerDisplayName: 'testdisplayname',
        _creationDate: new Date().toJSON(),
        _acl: {
            Canned: 'private',
            FULL_CONTROL: [],
            WRITE: [],
            WRITE_ACP: [],
            READ: [],
            READ_ACP: [],
        },
        _mdBucketModelVersion: 19,
        _transient: false,
        _deleted: false,
    };

    const testObjectData = {
        bucket: bucketName,
        key: objName,
    };

    beforeEach(() => {
        sandbox = sinon.createSandbox();

        // Create mock backend client
        mockClient = {
            getBucketAttributes: sandbox.stub(),
            getBucketAndObject: sandbox.stub(),
        };

        // Create mock log
        mockLog = {
            debug: sandbox.stub(),
            trace: sandbox.stub(),
            error: sandbox.stub(),
        };
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('getBucket', () => {
        beforeEach(() => {
            // Create MetadataWrapper with mocked client
            metadataWrapper = new MetadataWrapper('mem', {}, null, logger);
            // Replace the client with our mock
            metadataWrapper.client = mockClient;
        });

        it('should propagate raftSessionId as third callback parameter when present', done => {
            mockClient.getBucketAttributes.callsFake((bucketName, log, callback) => {
                process.nextTick(() => callback(null, testBucketMD, testRaftSessionId));
            });

            metadataWrapper.getBucket(bucketName, mockLog, (err, bucketInfo, raftSessionId) => {
                assert.ifError(err);
                assert(bucketInfo instanceof BucketInfo);
                assert.strictEqual(bucketInfo.getName(), bucketName);
                assert.strictEqual(raftSessionId, testRaftSessionId);
                done();
            });
        });

        it('should work without raftSessionId', done => {
            mockClient.getBucketAttributes.callsFake((bucketName, log, callback) => {
                process.nextTick(() => callback(null, testBucketMD, undefined));
            });

            metadataWrapper.getBucket(bucketName, mockLog, (err, bucketInfo, raftSessionId) => {
                assert.ifError(err);
                assert(bucketInfo instanceof BucketInfo);
                assert.strictEqual(raftSessionId, undefined);
                done();
            });
        });

        it('should not return raftSessionId when error occurs', done => {
            const testError = new Error('Test error');
            mockClient.getBucketAttributes.callsFake((bucketName, log, callback) => {
                process.nextTick(() => callback(testError));
            });

            metadataWrapper.getBucket(bucketName, mockLog, (...args) => {
                assert.strictEqual(args.length, 1, 'Error callback should have only 1 parameter');
                assert.strictEqual(args[0], testError);
                done();
            });
        });
    });

    describe('getBucketAndObjectMD', () => {
        beforeEach(() => {
            // Create MetadataWrapper with mocked client
            metadataWrapper = new MetadataWrapper('mem', {}, null, logger);
            // Replace the client with our mock
            metadataWrapper.client = mockClient;
        });

        it('should propagate raftSessionId from backend', done => {
            mockClient.getBucketAndObject.callsFake((bucket, obj, params, log, callback) => {
                process.nextTick(() => callback(null, testObjectData, testRaftSessionId));
            });

            metadataWrapper.getBucketAndObjectMD(bucketName, objName, {}, mockLog, (err, data, raftSessionId) => {
                assert.ifError(err);
                assert.deepStrictEqual(data, testObjectData);
                assert.strictEqual(raftSessionId, testRaftSessionId);
                done();
            });
        });

        it('should work without raftSessionId', done => {
            mockClient.getBucketAndObject.callsFake((bucket, obj, params, log, callback) => {
                process.nextTick(() => callback(null, testObjectData, undefined));
            });

            metadataWrapper.getBucketAndObjectMD(bucketName, objName, {}, mockLog, (err, data, raftSessionId) => {
                assert.ifError(err);
                assert.deepStrictEqual(data, testObjectData);
                assert.strictEqual(raftSessionId, undefined);
                done();
            });
        });

        it('should not propagate raftSessionId when error occurs', done => {
            const testError = new Error('Test error');
            mockClient.getBucketAndObject.callsFake((bucket, obj, params, log, callback) => {
                process.nextTick(() => callback(testError));
            });

            metadataWrapper.getBucketAndObjectMD(bucketName, objName, {}, mockLog, (...args) => {
                assert.strictEqual(args.length, 1, 'Error callback should have only 1 parameter');
                assert.strictEqual(args[0], testError);
                done();
            });
        });
    });
});

describe('MetadataWrapper::conditional puts', () => {
    const log = {
        debug: () => {},
        trace: () => {},
        error: () => {},
    };

    function wrapperWithClient(client) {
        const wrapper = new MetadataWrapper('mem', {}, null, logger);
        wrapper.client = client;
        return wrapper;
    }

    it(
        'putObjectMD should return NotImplemented for a ' +
            'conditional put on a backend without supportsConditionalPut',
        done => {
            const putObject = sinon.stub().callsFake((b, o, v, p, l, cb) => cb(null));
            const wrapper = wrapperWithClient({ putObject });
            async.eachSeries(
                [{ ifNoneMatch: '*' }, { ifMatch: 'd41d8cd98f00b204e9800998ecf8427e' }, { ifMatch: '' }],
                (params, next) =>
                    wrapper.putObjectMD('bucket', 'key', {}, params, log, err => {
                        assert(err && err.is.NotImplemented, `expected NotImplemented for ${JSON.stringify(params)}`);
                        next();
                    }),
                () => {
                    assert.strictEqual(putObject.callCount, 0);
                    done();
                },
            );
        },
    );

    it('putObjectMD should pass ifNoneMatch and ifMatch through to a backend with supportsConditionalPut', done => {
        const putObject = sinon.stub().callsFake((b, o, v, p, l, cb) => cb(null));
        const wrapper = wrapperWithClient({ putObject, supportsConditionalPut: true });
        wrapper.putObjectMD('bucket', 'key', {}, { ifNoneMatch: '*' }, log, err => {
            assert.ifError(err);
            wrapper.putObjectMD('bucket', 'key', {}, { ifMatch: 'abc', versioning: true }, log, err => {
                assert.ifError(err);
                assert.strictEqual(putObject.callCount, 2);
                assert.deepStrictEqual(putObject.firstCall.args[3], { ifNoneMatch: '*' });
                assert.deepStrictEqual(putObject.secondCall.args[3], { ifMatch: 'abc', versioning: true });
                done();
            });
        });
    });

    it('putObjectMD should not gate a put without condition', done => {
        const putObject = sinon.stub().callsFake((b, o, v, p, l, cb) => cb(null));
        const wrapper = wrapperWithClient({ putObject });
        wrapper.putObjectMD('bucket', 'key', {}, { versioning: true }, log, err => {
            assert.ifError(err);
            assert.strictEqual(putObject.callCount, 1);
            done();
        });
    });

    it('supportsConditionalPut should follow the client after switch', done => {
        const wrapper = new MetadataWrapper('mem', {}, null, logger);
        assert.strictEqual(wrapper.supportsConditionalPut(), true);
        wrapper.switch({ putObject: () => {} }, () => {
            assert.strictEqual(wrapper.supportsConditionalPut(), false);
            wrapper.switch({ putObject: () => {}, supportsConditionalPut: true }, () => {
                assert.strictEqual(wrapper.supportsConditionalPut(), true);
                done();
            });
        });
    });
});
