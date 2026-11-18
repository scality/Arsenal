// Mock @opentelemetry/api so the trace-context tests below can drive
// the active-span state without bringing up an OTEL SDK. Existing
// putObject tests don't touch OTEL; with these defaults the mocks
// behave like "no active span" and stampActiveTraceContext is a no-op.
const mockOtelActive = jest.fn();
const mockOtelGetSpan = jest.fn();
const mockOtelInject = jest.fn();
jest.mock('@opentelemetry/api', () => ({
    context: { active: mockOtelActive },
    trace: { getSpan: mockOtelGetSpan },
    propagation: { inject: mockOtelInject },
}));

const assert = require('assert');
const { promisify } = require('util');
const werelogs = require('werelogs');
const logger = new werelogs.Logger('MongoClientInterface', 'debug', 'debug');
const errors = require('../../../../../lib/errors').default;
const sinon = require('sinon');
const MongoClientInterface = require('../../../../../lib/storage/metadata/mongoclient/MongoClientInterface');
const utils = require('../../../../../lib/storage/metadata/mongoclient/utils');
const { createClient, createBucket } = require('./MongoClientInterface.spec');
const { BucketVersioningKeyFormat } = require('../../../../../lib/versioning/constants').VersioningConstants;
const { default: ObjectMD } = require('../../../../../lib/models/ObjectMD');
const DummyRequestLogger = require('../../../helpers').DummyRequestLogger;
const { makeOtelHelpers } = require('../otelMockHelpers');

const log = new DummyRequestLogger();
const otel = makeOtelHelpers({
    active: mockOtelActive,
    getSpan: mockOtelGetSpan,
    inject: mockOtelInject,
});

describe('MongoClientInterface:putObject', () => {
    let client;

    beforeAll(done => {
        client = new MongoClientInterface({});
        return done();
    });

    beforeEach(done => {
        sinon.stub(client, 'getCollection').callsFake(() => ({}));
        return done();
    });

    afterEach(done => {
        sinon.restore();
        return done();
    });

    it('Should fail when getBucketVFormat fails', done => {
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(errors.InternalError));
        client.putObject('example-bucket', 'example-object', {}, {}, log, err => {
            assert.deepStrictEqual(err, errors.InternalError);
            return done();
        });
    });

    it('Should call putObjectNoVer with correct params', done => {
        // Stubbing functions
        const putObjectNoVerSpy = sinon.spy();
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(null, 'v0'));
        sinon.stub(client, 'putObjectNoVer').callsFake(putObjectNoVerSpy);
        // checking if function called with correct params
        client.putObject('example-bucket', 'example-object', {}, {}, log, {});
        const args = [{}, 'example-bucket', 'example-object', {}, { vFormat: 'v0' }, log, {}];
        assert(putObjectNoVerSpy.calledOnceWith(...args));
        return done();
    });

    it('Should call putObjectVerCase1 with correct params', done => {
        // Stubbing functions
        const putObjectVerCase1Spy = sinon.spy();
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(null, 'v0'));
        sinon.stub(client, 'putObjectVerCase1').callsFake(putObjectVerCase1Spy);
        // checking if function called with correct params
        const params = {
            versioning: true,
            versionId: null,
            repairMaster: null,
        };
        client.putObject('example-bucket', 'example-object', {}, params, log, {});
        params.vFormat = 'v0';
        const args = [{}, 'example-bucket', 'example-object', {}, params, log, {}];
        assert(putObjectVerCase1Spy.calledOnceWith(...args));
        return done();
    });

    it('Should call putObjectVerCase2 with correct params', done => {
        // Stubbing functions
        const putObjectVerCase2Spy = sinon.spy();
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(null, 'v0'));
        sinon.stub(client, 'putObjectVerCase2').callsFake(putObjectVerCase2Spy);
        // checking if function called with correct params
        const params = {
            versioning: null,
            versionId: '',
            repairMaster: null,
        };
        client.putObject('example-bucket', 'example-object', {}, params, log, {});
        params.vFormat = 'v0';
        const args = [{}, 'example-bucket', 'example-object', {}, params, log, {}];
        assert(putObjectVerCase2Spy.calledOnceWith(...args));
        return done();
    });

    it('Should call putObjectVerCase3 with correct params', done => {
        // Stubbing functions
        const putObjectVerCase3Spy = sinon.spy();
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(null, 'v0'));
        sinon.stub(client, 'putObjectVerCase3').callsFake(putObjectVerCase3Spy);
        // checking if function called with correct params
        const params = {
            versioning: true,
            versionId: '1234',
            repairMaster: false,
        };
        client.putObject('example-bucket', 'example-object', {}, params, log, {});
        params.vFormat = 'v0';
        const args = [{}, 'example-bucket', 'example-object', {}, params, log, {}];
        assert(putObjectVerCase3Spy.calledOnceWith(...args));
        return done();
    });

    it('Should call putObjectVerCase4 with correct params', done => {
        // Stubbing functions
        const putObjectVerCase4Spy = sinon.spy();
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(null, 'v0'));
        sinon.stub(client, 'putObjectVerCase4').callsFake(putObjectVerCase4Spy);
        // checking if function called with correct params
        const params = {
            versioning: true,
            versionId: '1234',
            repairMaster: true,
        };
        client.putObject('example-bucket', 'example-object', {}, params, log, {});
        params.vFormat = 'v0';
        const args = [{}, 'example-bucket', 'example-object', {}, params, log, {}];
        assert(putObjectVerCase4Spy.calledOnceWith(...args));
        return done();
    });

    it('Should fail when putObjectNoVer fails', done => {
        // Stubbing functions
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(null, 'v0'));
        sinon.stub(client, 'putObjectNoVer').callsFake((...args) => args[6](errors.InternalError));
        // checking if function called with correct params
        client.putObject('example-bucket', 'example-object', {}, {}, log, err => {
            assert.deepStrictEqual(err, errors.InternalError);
            return done();
        });
    });

    it('Should fail when putObjectVerCase1 fails', done => {
        // Stubbing functions
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(null, 'v0'));
        sinon.stub(client, 'putObjectVerCase1').callsFake((...args) => args[6](errors.InternalError));
        const params = {
            versioning: true,
            versionId: null,
            repairMaster: null,
        };
        client.putObject('example-bucket', 'example-object', {}, params, log, err => {
            assert.deepStrictEqual(err, errors.InternalError);
            return done();
        });
    });

    it('Should fail when putObjectVerCase2 fails', done => {
        // Stubbing functions
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(null, 'v0'));
        sinon.stub(client, 'putObjectVerCase2').callsFake((...args) => args[6](errors.InternalError));
        const params = {
            versioning: null,
            versionId: '',
            repairMaster: null,
        };
        client.putObject('example-bucket', 'example-object', {}, params, log, err => {
            assert.deepStrictEqual(err, errors.InternalError);
            return done();
        });
    });

    it('Should fail when putObjectVerCase3 fails', done => {
        // Stubbing functions
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(null, 'v0'));
        sinon.stub(client, 'putObjectVerCase3').callsFake((...args) => args[6](errors.InternalError));
        const params = {
            versioning: true,
            versionId: '1234',
            repairMaster: null,
        };
        client.putObject('example-bucket', 'example-object', {}, params, log, err => {
            assert.deepStrictEqual(err, errors.InternalError);
            return done();
        });
    });

    it('Should fail when putObjectVerCase4 fails', done => {
        // Stubbing functions
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(null, 'v0'));
        sinon.stub(client, 'putObjectVerCase4').callsFake((...args) => args[6](errors.InternalError));
        const params = {
            versioning: true,
            versionId: '1234',
            repairMaster: true,
        };
        client.putObject('example-bucket', 'example-object', {}, params, log, err => {
            assert.deepStrictEqual(err, errors.InternalError);
            return done();
        });
    });
});

describe('MongoClientInterface:putObjectVerCase1 race condition error handling', () => {
    const bucketName = 'test-bucket-putvercase1';
    let client;
    let collection;
    let sandbox;

    beforeEach(done => {
        sandbox = sinon.createSandbox();
        client = createClient();
        client.setup(err => {
            if (err) {
                return done(err);
            }
            return createBucket(client, bucketName, true, err => {
                if (err) {
                    return done(err);
                }
                collection = client.getCollection(bucketName);
                return done();
            });
        });
    });

    afterEach(done => {
        sandbox.restore();
        if (client) {
            client.deleteBucket(bucketName, logger, () => {
                client.close(done);
            });
        } else {
            done();
        }
    });

    it('should handle MongoDB error on version operation (first operation)', done => {
        const objName = 'test-object';
        const objMD = new ObjectMD()
            .setKey(objName)
            .setDataStoreName('us-east-1')
            .setContentLength(100)
            .setLastModified(new Date());

        // Create error with writeErrors indicating failure on first operation (index 0)
        const versionError = new Error('Duplicate key error');
        versionError.code = 11000;
        // Simulate MongoDB's error structure with writeErrors
        versionError.writeErrors = [
            {
                index: 0, // First operation (version creation)
                code: 11000,
                errmsg: 'E11000 duplicate key error',
            },
        ];

        // Create a spy to track if putObjectVerCase1 is called with isRetry=true
        // This is a more reliable way to check the retry mechanism
        const putObjectVerCase1Spy = sandbox.spy(client, 'putObjectVerCase1');

        // Stub bulkWrite to simulate failure on first operation
        const bulkWriteStub = sandbox.stub(collection, 'bulkWrite');
        bulkWriteStub.onFirstCall().rejects(versionError);
        bulkWriteStub.onSecondCall().resolves({});

        const params = {
            vFormat: BucketVersioningKeyFormat.v1,
            versioning: true,
            needOplogUpdate: false,
            originOp: 'test',
            conditions: {},
        };

        // Call the method directly to avoid race conditions with the stub
        client.putObjectVerCase1(collection, bucketName, objName, objMD.getValue(), params, logger, () => {
            // Check that bulkWrite was called twice (original + retry)
            assert.strictEqual(bulkWriteStub.callCount, 2, 'Expected bulkWrite to be called twice');

            // Verify putObjectVerCase1 was called with isRetry=true for the retry
            assert(putObjectVerCase1Spy.calledTwice, 'Expected putObjectVerCase1 to be called twice');
            assert(putObjectVerCase1Spy.secondCall.args[7], 'Expected second call to have isRetry=true');

            done();
        });
    });

    it('should handle MongoDB error on master operation (second operation)', done => {
        const objName = 'test-object';
        const objMD = new ObjectMD()
            .setKey(objName)
            .setDataStoreName('us-east-1')
            .setContentLength(100)
            .setLastModified(new Date());

        // Create error with writeErrors indicating failure on second operation (index 1)
        const masterError = new Error('Duplicate key error');
        masterError.code = 11000;
        // Simulate MongoDB's error structure with writeErrors
        masterError.writeErrors = [
            {
                index: 1, // Second operation (master update)
                code: 11000,
                errmsg: 'E11000 duplicate key error',
            },
        ];

        // Add result info showing one operation succeeded
        masterError.result = {
            upsertedCount: 1, // The version was successfully upserted
            ok: 1,
        };

        // Stub bulkWrite to simulate failure on second operation
        const bulkWriteStub = sandbox.stub(collection, 'bulkWrite').rejects(masterError);

        const params = {
            vFormat: BucketVersioningKeyFormat.v1,
            versioning: true,
            needOplogUpdate: false,
            originOp: 'test',
            conditions: {},
        };

        client.putObjectVerCase1(collection, bucketName, objName, objMD.getValue(), params, logger, (err, result) => {
            assert.ifError(err, 'Expected no error when master operation fails but version succeeds');
            assert(result, 'Expected a result to be returned');
            assert(result.includes('versionId'), 'Expected versionId in result');
            assert(bulkWriteStub.calledOnce, 'Expected bulkWrite to be called once');
            done();
        });
    });

    it('should handle retry failure when version operation fails twice', done => {
        const objName = 'test-object-retry-fails';
        const objMD = new ObjectMD()
            .setKey(objName)
            .setDataStoreName('us-east-1')
            .setContentLength(100)
            .setLastModified(new Date());

        const versionError = new Error('Duplicate key error');
        versionError.code = 11000;
        versionError.writeErrors = [
            {
                index: 0,
                code: 11000,
                errmsg: 'E11000 duplicate key error',
            },
        ];

        const putObjectVerCase1Spy = sandbox.spy(client, 'putObjectVerCase1');

        // Stub bulkWrite to always fail with the same error
        // This simulates both the first attempt and the retry failing with the same error
        const bulkWriteStub = sandbox.stub(collection, 'bulkWrite').rejects(versionError);

        const params = {
            vFormat: BucketVersioningKeyFormat.v1,
            versioning: true,
            needOplogUpdate: false,
            originOp: 'test',
            conditions: {},
        };

        client.putObjectVerCase1(collection, bucketName, objName, objMD.getValue(), params, logger, (err, result) => {
            assert(err, 'Expected an error to be returned after retry failure');
            assert.strictEqual(err.is.InternalError, true, 'Expected InternalError after retry failure');
            assert(!result, 'Expected no result on error');
            assert.strictEqual(bulkWriteStub.callCount, 2, 'Expected bulkWrite to be called twice');
            assert(putObjectVerCase1Spy.calledTwice, 'Expected putObjectVerCase1 to be called twice');
            assert(putObjectVerCase1Spy.secondCall.args[7], 'Expected second call to have isRetry=true');
            done();
        });
    });

    it('should return version id when no error', done => {
        const objName = 'test-object-success';
        const objMD = new ObjectMD()
            .setKey(objName)
            .setDataStoreName('us-east-1')
            .setContentLength(100)
            .setLastModified(new Date());

        const bulkWriteStub = sandbox.stub(collection, 'bulkWrite').resolves({});

        const params = {
            vFormat: BucketVersioningKeyFormat.v1,
            versioning: true,
            needOplogUpdate: false,
            originOp: 'test',
            conditions: {},
        };

        client.putObjectVerCase1(collection, bucketName, objName, objMD.getValue(), params, logger, (err, result) => {
            assert.ifError(err, 'Expected no error on successful operation');
            assert(result, 'Expected a result to be returned');
            assert(result.includes('versionId'), 'Expected versionId in result');
            assert(bulkWriteStub.calledOnce, 'Expected bulkWrite to be called once');
            done();
        });
    });
});

describe('MongoClientInterface:putObjectVerCase2', () => {
    let client;

    beforeAll(done => {
        client = new MongoClientInterface({});
        return done();
    });

    beforeEach(done => {
        sinon.stub(utils, 'formatMasterKey').callsFake(() => 'example-master-key');
        return done();
    });

    afterEach(done => {
        sinon.restore();
        return done();
    });

    it('should return new object versionId', done => {
        const collection = {
            updateOne: () => Promise.resolve(),
        };
        client.putObjectVerCase2(collection, 'example-bucket', 'example-object', {}, {}, logger, (err, res) => {
            assert.deepStrictEqual(err, null);
            assert(res.includes('{"versionId": '));
            return done();
        });
    });

    it('should fail when update fails', done => {
        const collection = {
            updateOne: () => Promise.reject(errors.InternalError),
        };
        client.putObjectVerCase2(collection, 'example-bucket', 'example-object', {}, {}, logger, err => {
            assert.deepStrictEqual(err, errors.InternalError);
            return done();
        });
    });

    it('should apply params.conditions to the master filter', async () => {
        let capturedFilter;
        const collection = {
            updateOne: filter => {
                capturedFilter = filter;
                return Promise.resolve();
            },
        };
        const params = { conditions: { number: { $gt: 42 }, string: 'forty-two' } };
        const putObjectVerCase2 = promisify(client.putObjectVerCase2.bind(client));
        await putObjectVerCase2(collection, 'example-bucket', 'example-object', {}, params, logger);
        assert.deepStrictEqual(capturedFilter, {
            _id: 'example-master-key',
            'value.number': { $gt: 42 },
            'value.string': 'forty-two',
        });
    });

    it('should return PreconditionFailed when the stored master does not satisfy params.conditions', async () => {
        const collection = {
            updateOne: () => Promise.reject({ code: 11000 }),
        };
        const params = { conditions: { number: { $gt: 42 } } };
        const putObjectVerCase2 = promisify(client.putObjectVerCase2.bind(client));
        await assert.rejects(
            putObjectVerCase2(collection, 'example-bucket', 'example-object', {}, params, logger),
            err => err.is.PreconditionFailed,
        );
    });

    it('should return a retryable InternalError on a duplicate key without params.conditions', async () => {
        const collection = {
            updateOne: () => Promise.reject({ code: 11000 }),
        };
        const putObjectVerCase2 = promisify(client.putObjectVerCase2.bind(client));
        await assert.rejects(
            putObjectVerCase2(collection, 'example-bucket', 'example-object', {}, {}, logger),
            err => err.is.InternalError,
        );
    });
});

describe('MongoClientInterface:putObjectVerCase3', () => {
    let client;

    beforeAll(done => {
        client = new MongoClientInterface({});
        return done();
    });

    beforeEach(done => {
        sinon.stub(utils, 'formatMasterKey').callsFake(() => 'example-master-key');
        sinon.stub(utils, 'formatVersionKey').callsFake(() => 'example-version-key');
        return done();
    });

    afterEach(done => {
        sinon.restore();
        return done();
    });

    it('should throw InternalError when findOne fails', done => {
        const collection = {
            findOne: () => Promise.reject(errors.InternalError),
        };
        client.putObjectVerCase3(collection, 'example-bucket', 'example-object', {}, {}, logger, err => {
            assert.deepStrictEqual(err, errors.InternalError);
            return done();
        });
    });

    it('should throw NoSuchVersion when bulkWrite fails', done => {
        const collection = {
            findOne: () => Promise.resolve({}),
            bulkWrite: () => Promise.reject(errors.InternalError),
        };
        client.putObjectVerCase3(collection, 'example-bucket', 'example-object', {}, {}, logger, err => {
            assert.deepStrictEqual(err, errors.NoSuchVersion);
            return done();
        });
    });

    it('should throw internalError when error code 11000', done => {
        const error = {
            code: 11000,
        };
        const collection = {
            findOne: () => Promise.resolve({}),
            bulkWrite: () => Promise.reject(error),
        };
        client.putObjectVerCase3(collection, 'example-bucket', 'example-object', {}, {}, logger, err => {
            assert.deepStrictEqual(err, errors.InternalError);
            return done();
        });
    });

    it('should return versionId', done => {
        const collection = {
            findOne: () => Promise.resolve({}),
            bulkWrite: () => Promise.resolve(),
        };
        client.putObjectVerCase3(collection, 'example-bucket', 'example-object', {}, {}, logger, (err, res) => {
            assert.deepStrictEqual(err, null);
            assert(res.includes('{"versionId": '));
            return done();
        });
    });

    it('should apply params.conditions to the version filter', async () => {
        let capturedOps;
        const collection = {
            findOne: () => Promise.resolve({}),
            bulkWrite: ops => {
                capturedOps = ops;
                return Promise.resolve();
            },
        };
        const params = { conditions: { number: { $gt: 42 }, string: 'forty-two' } };
        const putObjectVerCase3 = promisify(client.putObjectVerCase3.bind(client));
        await putObjectVerCase3(collection, 'example-bucket', 'example-object', {}, params, logger);
        assert.deepStrictEqual(capturedOps[0].updateOne.filter, {
            _id: 'example-version-key',
            'value.number': { $gt: 42 },
            'value.string': 'forty-two',
        });
    });

    it('should return PreconditionFailed when the existing version does not satisfy params.conditions', async () => {
        const error = { code: 11000, writeErrors: [{ index: 0 }] };
        const collection = {
            findOne: () => Promise.resolve({}),
            bulkWrite: () => Promise.reject(error),
        };
        const params = { conditions: { number: { $gt: 42 } } };
        const putObjectVerCase3 = promisify(client.putObjectVerCase3.bind(client));
        await assert.rejects(
            putObjectVerCase3(collection, 'example-bucket', 'example-object', {}, params, logger),
            err => err.is.PreconditionFailed,
        );
    });

    it('should return a retryable InternalError when the master op races, even with params.conditions', async () => {
        const error = { code: 11000, writeErrors: [{ index: 1 }] };
        const collection = {
            findOne: () => Promise.resolve({}),
            bulkWrite: () => Promise.reject(error),
        };
        const params = { conditions: { number: { $gt: 42 } } };
        const putObjectVerCase3 = promisify(client.putObjectVerCase3.bind(client));
        await assert.rejects(
            putObjectVerCase3(collection, 'example-bucket', 'example-object', {}, params, logger),
            err => err.is.InternalError,
        );
    });
});

describe('MongoClientInterface:putObjectVerCase4', () => {
    let client;

    beforeAll(done => {
        client = new MongoClientInterface({});
        return done();
    });

    beforeEach(done => {
        sinon.stub(utils, 'formatMasterKey').callsFake(() => 'example-master-key');
        sinon.stub(utils, 'formatVersionKey').callsFake(() => 'example-version-key');
        return done();
    });

    afterEach(done => {
        sinon.restore();
        return done();
    });

    it('should return versionId', done => {
        sinon.stub(client, 'getLatestVersion').callsFake((...args) => args[4](null, {}));
        const collection = {
            updateOne: () => Promise.resolve(),
            bulkWrite: () => Promise.resolve({}),
        };
        client.putObjectVerCase4(collection, 'example-bucket', 'example-object', {}, {}, logger, (err, res) => {
            assert.deepStrictEqual(err, null);
            assert(res.includes('{"versionId": '));
            return done();
        });
    });

    it('should fail when update fails', done => {
        sinon.stub(client, 'getLatestVersion').callsFake((...args) => args[4](null, {}));
        const collection = {
            updateOne: () => Promise.reject(errors.InternalError),
            bulkWrite: () => Promise.reject(errors.InternalError),
        };
        client.putObjectVerCase4(collection, 'example-bucket', 'example-object', {}, {}, logger, err => {
            assert.deepStrictEqual(err, errors.InternalError);
            return done();
        });
    });

    it('should fail when getLatestVersion fails', done => {
        sinon.stub(client, 'getLatestVersion').callsFake((...args) => args[4](errors.InternalError));
        const collection = {
            updateOne: () => Promise.resolve(),
            bulkWrite: () => Promise.resolve(),
        };
        client.putObjectVerCase4(collection, 'example-bucket', 'example-object', {}, {}, logger, err => {
            assert.deepStrictEqual(err, errors.InternalError);
            return done();
        });
    });

    it('should apply params.conditions to the version filter', async () => {
        sinon.stub(client, 'getLatestVersion').callsFake((...args) => args[4](null, {}));
        let capturedFilter;
        const collection = {
            updateOne: filter => {
                capturedFilter = filter;
                return Promise.resolve();
            },
            bulkWrite: () => Promise.resolve({}),
        };
        const params = { conditions: { number: { $gt: 42 }, string: 'forty-two' } };
        const putObjectVerCase4 = promisify(client.putObjectVerCase4.bind(client));
        await putObjectVerCase4(collection, 'example-bucket', 'example-object', {}, params, logger);
        assert.deepStrictEqual(capturedFilter, {
            _id: 'example-version-key',
            'value.number': { $gt: 42 },
            'value.string': 'forty-two',
        });
    });

    it('should return PreconditionFailed when the existing version does not satisfy params.conditions', async () => {
        const collection = {
            updateOne: () => Promise.reject({ code: 11000 }),
        };
        const params = { conditions: { number: { $gt: 42 } } };
        const putObjectVerCase4 = promisify(client.putObjectVerCase4.bind(client));
        await assert.rejects(
            putObjectVerCase4(collection, 'example-bucket', 'example-object', {}, params, logger),
            err => err.is.PreconditionFailed,
        );
    });

    it('should return a retryable InternalError on a duplicate key without params.conditions', async () => {
        const collection = {
            updateOne: () => Promise.reject({ code: 11000 }),
        };
        const putObjectVerCase4 = promisify(client.putObjectVerCase4.bind(client));
        await assert.rejects(
            putObjectVerCase4(collection, 'example-bucket', 'example-object', {}, {}, logger),
            err => err.is.InternalError,
        );
    });
});

describe('MongoClientInterface:putObjectNoVer', () => {
    let client;

    beforeAll(done => {
        client = new MongoClientInterface({});
        return done();
    });

    beforeEach(done => {
        sinon.stub(utils, 'formatMasterKey').callsFake(() => 'example-master-key');
        return done();
    });

    afterEach(done => {
        sinon.restore();
        return done();
    });

    it('should not fail', done => {
        const collection = {
            updateOne: () => Promise.resolve({}),
        };
        client.putObjectNoVer(collection, 'example-bucket', 'example-object', {}, {}, logger, err => {
            assert.deepStrictEqual(err, null);
            return done();
        });
    });

    it('should fail when update fails', done => {
        const collection = {
            updateOne: () => Promise.reject(errors.InternalError),
        };
        client.putObjectNoVer(
            collection,
            'example-bucket',
            'example-object',
            {},
            {},
            logger,
            err => {
                assert.deepStrictEqual(err, errors.InternalError);
                return done();
            },
            false,
        );
    });

    it('should apply params.conditions to the object filter', async () => {
        let capturedFilter;
        const collection = {
            updateOne: filter => {
                capturedFilter = filter;
                return Promise.resolve({});
            },
        };
        const params = { conditions: { number: { $gt: 42 }, string: 'forty-two' } };
        const putObjectNoVer = promisify(client.putObjectNoVer.bind(client));
        await putObjectNoVer(collection, 'example-bucket', 'example-object', {}, params, logger);
        assert.deepStrictEqual(capturedFilter, {
            _id: 'example-master-key',
            'value.number': { $gt: 42 },
            'value.string': 'forty-two',
        });
    });

    it('should return PreconditionFailed when the stored object does not satisfy params.conditions', async () => {
        const collection = {
            updateOne: () => Promise.reject({ code: 11000 }),
        };
        const params = { conditions: { number: { $gt: 42 } } };
        const putObjectNoVer = promisify(client.putObjectNoVer.bind(client));
        await assert.rejects(
            putObjectNoVer(collection, 'example-bucket', 'example-object', {}, params, logger),
            err => err.is.PreconditionFailed,
        );
    });

    it('should return a retryable InternalError on a duplicate key without params.conditions', async () => {
        const collection = {
            updateOne: () => Promise.reject({ code: 11000 }),
        };
        const putObjectNoVer = promisify(client.putObjectNoVer.bind(client));
        await assert.rejects(
            putObjectNoVer(collection, 'example-bucket', 'example-object', {}, {}, logger),
            err => err.is.InternalError,
        );
    });
});

describe('MongoClientInterface:putObject trace-context plumbing', () => {
    let client;

    beforeAll(() => {
        client = new MongoClientInterface({});
    });

    beforeEach(() => {
        otel.resetMocks();
        sinon.stub(utils, 'formatMasterKey').callsFake(() => 'master-key');
        sinon.stub(utils, 'formatVersionKey').callsFake(() => 'version-key');
        sinon.stub(client, 'getCollection').callsFake(() => ({}));
        sinon.stub(client, 'getBucketVFormat').callsFake((b, l, cb) => cb(null, 'v0'));
    });

    afterEach(() => {
        sinon.restore();
    });

    it('stamps traceContext on the write when a span is active', done => {
        otel.activateSpan();
        const seen = {};
        sinon.stub(client, 'putObjectNoVer').callsFake((_c, _b, _o, objVal, _p, _l, cb) => {
            Object.assign(seen, objVal);
            cb();
        });

        client.putObject('bucket', 'example', { key: 'example' }, {}, log, err => {
            assert.ifError(err);
            assert.deepStrictEqual(seen.traceContext, { traceparent: otel.TRACEPARENT });
            done();
        });
    });

    it('omits traceContext when no span is active', done => {
        otel.deactivateSpan();
        const seen = {};
        sinon.stub(client, 'putObjectNoVer').callsFake((_c, _b, _o, objVal, _p, _l, cb) => {
            Object.assign(seen, objVal);
            cb();
        });

        client.putObject('bucket', 'example', { key: 'x' }, {}, log, err => {
            assert.ifError(err);
            assert.strictEqual(seen.traceContext, undefined);
            done();
        });
    });

    it('clears stale traceContext from a loaded objVal when no span is active', done => {
        // Regression: an objVal loaded from storage may already carry a
        // previous write's trace context. Without explicit clearing the
        // next write would inherit the stale value.
        otel.deactivateSpan();
        const seen = {};
        sinon.stub(client, 'putObjectNoVer').callsFake((_c, _b, _o, objVal, _p, _l, cb) => {
            Object.assign(seen, objVal);
            cb();
        });

        const objVal = {
            key: 'example',
            traceContext: { traceparent: 'stale-from-prior-write' },
        };
        client.putObject('bucket', 'example', objVal, {}, log, err => {
            assert.ifError(err);
            assert.strictEqual(seen.traceContext, undefined);
            done();
        });
    });
});

// putObjectNoVerWithOplogUpdate is reached on the archived-object replace
// path (cloudserver sets params.needOplogUpdate with originOp
// 's3:ReplaceArchivedObject'). It bulkWrites two oplog entries: a
// tombstone of the loaded existing object (consumed by downstream
// cleanup workers) and the new value. Both need traceContext so
// consumers reading either oplog event can correlate to the originating
// S3 request.
describe('MongoClientInterface:putObjectNoVerWithOplogUpdate trace-context plumbing', () => {
    let client;
    let collection;
    let bulkWriteArg;

    beforeAll(() => {
        client = new MongoClientInterface({});
    });

    beforeEach(() => {
        otel.resetMocks();
        bulkWriteArg = null;
        collection = {
            findOneAndUpdate: sinon.stub().callsFake(() =>
                Promise.resolve({
                    value: {
                        key: 'existing',
                        traceContext: { traceparent: 'stale-prior-trace' },
                    },
                }),
            ),
            bulkWrite: sinon.stub().callsFake(ops => {
                bulkWriteArg = ops;
                return Promise.resolve({ ok: 1 });
            }),
        };
    });

    afterEach(() => {
        sinon.restore();
    });

    it('stamps traceContext on the loaded-object tombstone when a span is active', done => {
        otel.activateSpan();
        client.putObjectNoVerWithOplogUpdate(
            collection,
            'bucket',
            'example',
            { key: 'replacement' },
            { vFormat: 'v0', originOp: 's3:ReplaceArchivedObject' },
            log,
            err => {
                assert.ifError(err);
                assert.ok(bulkWriteArg, 'bulkWrite was called');
                const tombstone = bulkWriteArg[0].updateOne.update.$set.value;
                assert.deepStrictEqual(tombstone.traceContext, { traceparent: otel.TRACEPARENT });
                done();
            },
        );
    });

    it('clears stale traceContext on the tombstone when no span is active', done => {
        otel.deactivateSpan();
        client.putObjectNoVerWithOplogUpdate(
            collection,
            'bucket',
            'example',
            { key: 'replacement' },
            { vFormat: 'v0', originOp: 's3:ReplaceArchivedObject' },
            log,
            err => {
                assert.ifError(err);
                const tombstone = bulkWriteArg[0].updateOne.update.$set.value;
                assert.strictEqual(tombstone.traceContext, undefined);
                done();
            },
        );
    });
});

describe('MongoClientInterface:putObjectNoVerWithOplogUpdate conditions', () => {
    let client;

    beforeAll(() => {
        client = new MongoClientInterface({});
    });

    beforeEach(() => {
        sinon.stub(utils, 'formatMasterKey').callsFake(() => 'example-master-key');
    });

    afterEach(() => {
        sinon.restore();
    });

    const params = {
        vFormat: 'v0',
        needOplogUpdate: true,
        originOp: 's3:ReplaceArchivedObject',
        conditions: { number: { $gt: 42 } },
    };

    it('should apply params.conditions to the find filter', async () => {
        let capturedFilter;
        const collection = {
            findOneAndUpdate: filter => {
                capturedFilter = filter;
                return Promise.resolve({ value: { key: 'existing' } });
            },
            bulkWrite: () => Promise.resolve({ ok: 1 }),
        };
        const putObjectNoVerWithOplogUpdate = promisify(client.putObjectNoVerWithOplogUpdate.bind(client));
        await putObjectNoVerWithOplogUpdate(collection, 'bucket', 'example', {}, params, log);
        assert.deepStrictEqual(capturedFilter.$and, [{ 'value.number': { $gt: 42 } }]);
        assert.deepStrictEqual(capturedFilter._id, 'example-master-key');
    });

    it('should return PreconditionFailed when the stored object does not satisfy params.conditions', async () => {
        const collection = {
            findOneAndUpdate: () => Promise.resolve(null),
            findOne: () => Promise.resolve({ _id: 'example-master-key' }),
        };
        const putObjectNoVerWithOplogUpdate = promisify(client.putObjectNoVerWithOplogUpdate.bind(client));
        await assert.rejects(
            putObjectNoVerWithOplogUpdate(collection, 'bucket', 'example', {}, params, log),
            err => err.is.PreconditionFailed,
        );
    });

    it('should exclude deleted objects from the condition mismatch disambiguation', async () => {
        let capturedFilter;
        const collection = {
            findOneAndUpdate: () => Promise.resolve(null),
            findOne: filter => {
                capturedFilter = filter;
                return Promise.resolve(null);
            },
        };
        const putObjectNoVerWithOplogUpdate = promisify(client.putObjectNoVerWithOplogUpdate.bind(client));
        await assert.rejects(
            putObjectNoVerWithOplogUpdate(collection, 'bucket', 'example', {}, params, log),
            err => err.is.InternalError,
        );
        assert.deepStrictEqual(capturedFilter, {
            _id: 'example-master-key',
            $or: [{ 'value.deleted': { $exists: false } }, { 'value.deleted': { $eq: false } }],
        });
    });

    it('should not return PreconditionFailed when the object is missing', async () => {
        const collection = {
            findOneAndUpdate: () => Promise.resolve(null),
            findOne: () => Promise.resolve(null),
        };
        const putObjectNoVerWithOplogUpdate = promisify(client.putObjectNoVerWithOplogUpdate.bind(client));
        await assert.rejects(
            putObjectNoVerWithOplogUpdate(collection, 'bucket', 'example', {}, params, log),
            err => err.is.InternalError,
        );
    });
});
