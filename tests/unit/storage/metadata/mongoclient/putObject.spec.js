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
            '_id': 'example-version-key',
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
});

describe('MongoClientInterface: non-localized versions never become master', () => {
    let client;
    const localized = { versionId: '1234', dataStoreName: 'us-east-1' };
    const nonLocalized = { versionId: '1234', dataStoreName: 'dr-source' };
    const params = { versionId: '1234', vFormat: 'v0' };

    beforeAll(done => {
        client = new MongoClientInterface({
            locations: {
                'us-east-1': { isCRR: false },
                'dr-source': { isCRR: true },
            },
        });
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

    describe('putObjectVerCase1', () => {
        function run(objVal) {
            const collection = { bulkWrite: sinon.stub().resolves({}) };
            return new Promise(resolve =>
                client.putObjectVerCase1(collection, 'example-bucket', 'example-object', objVal, params, logger, () =>
                    resolve(collection.bulkWrite),
                ),
            );
        }

        it('should write the version alone when it is non-localized', async () => {
            const bulkWrite = await run(Object.assign({}, nonLocalized));
            assert.strictEqual(bulkWrite.firstCall.args[0].length, 1);
            assert(bulkWrite.firstCall.args[0][0].insertOne, 'expected the version insert alone');
        });

        it('should write the master as well when it is localized', async () => {
            const bulkWrite = await run(Object.assign({}, localized));
            assert.strictEqual(bulkWrite.firstCall.args[0].length, 2);
        });
    });

    describe('putObjectVerCase3', () => {
        function run(objVal) {
            const collection = {
                // an existing master, so the master op is not skipped for other reasons
                findOne: sinon.stub().resolves({ _id: 'example-master-key', value: objVal }),
                bulkWrite: sinon.stub().resolves({}),
            };
            return new Promise(resolve =>
                client.putObjectVerCase3(collection, 'example-bucket', 'example-object', objVal, params, logger, () =>
                    resolve(collection),
                ),
            );
        }

        it('should write the version alone when it is non-localized', async () => {
            const { bulkWrite, findOne } = await run(Object.assign({}, nonLocalized));
            assert.strictEqual(bulkWrite.firstCall.args[0].length, 1);
            // the master and version lookups only serve the master operation
            sinon.assert.notCalled(findOne);
        });

        it('should write the master as well when it is localized', async () => {
            const { bulkWrite } = await run(Object.assign({}, localized));
            assert.strictEqual(bulkWrite.firstCall.args[0].length, 2);
        });
    });

    describe('the paths where the master is the only document written', () => {
        // they cannot keep a non-localized version out of the master, so they
        // refuse the write instead of breaking the invariant

        function runNoVer(method, objVal) {
            const collection = { updateOne: sinon.stub().resolves({}) };
            return new Promise(resolve =>
                client[method](
                    collection,
                    'example-bucket',
                    'example-object',
                    Object.assign({}, objVal),
                    params,
                    logger,
                    err => resolve({ err, collection }),
                ),
            );
        }

        it('putObjectVerCase2 should refuse a non-localized version', async () => {
            const error = sinon.spy(logger, 'error');
            const { err, collection } = await runNoVer('putObjectVerCase2', nonLocalized);
            assert(err?.is.InternalError, 'the write should have been refused');
            sinon.assert.notCalled(collection.updateOne);
            assert(error.calledWithMatch('putObjectVerCase2: refusing to write a non-localized version as master'));
        });

        it('putObjectNoVer should refuse a non-localized version', async () => {
            const error = sinon.spy(logger, 'error');
            const { err, collection } = await runNoVer('putObjectNoVer', nonLocalized);
            assert(err?.is.InternalError, 'the write should have been refused');
            sinon.assert.notCalled(collection.updateOne);
            assert(error.calledWithMatch('putObjectNoVer: refusing to write a non-localized version as master'));
        });

        it('putObjectWithCond should refuse a non-localized version', async () => {
            const error = sinon.spy(logger, 'error');
            sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(null, 'v0'));
            const collection = { findOneAndUpdate: sinon.stub().resolves({}) };
            sinon.stub(client, 'getCollection').returns(collection);
            const err = await new Promise(resolve =>
                client.putObjectWithCond(
                    'example-bucket',
                    'example-object',
                    Object.assign({}, nonLocalized),
                    { conditions: {} },
                    logger,
                    resolve,
                ),
            );
            assert(err?.is.InternalError, 'the write should have been refused');
            sinon.assert.notCalled(collection.findOneAndUpdate);
            assert(error.calledWithMatch('putObjectWithCond: refusing to write a non-localized version as master'));
        });

        it('should write a localized version', async () => {
            const error = sinon.spy(logger, 'error');
            const { err, collection } = await runNoVer('putObjectNoVer', localized);
            assert.ifError(err);
            sinon.assert.calledOnce(collection.updateOne);
            assert(!error.calledWithMatch('refusing to write a non-localized version as master'));
        });
    });
});

describe('MongoClientInterface:putObjectVerCase4 with non-localized versions', () => {
    let client;
    const localized = { versionId: '1234', dataStoreName: 'us-east-1' };
    const nonLocalized = { versionId: '1234', dataStoreName: 'dr-source' };
    const params = { versionId: '1234', vFormat: 'v0' };

    function collectionStub() {
        return {
            updateOne: sinon.stub().resolves(),
            bulkWrite: sinon.stub().resolves({}),
        };
    }

    function putVersion(mongoClient, collection, objVal) {
        return new Promise(resolve =>
            mongoClient.putObjectVerCase4(
                collection,
                'example-bucket',
                'example-object',
                objVal,
                params,
                logger,
                (err, res) => resolve({ err, res }),
            ),
        );
    }

    beforeAll(done => {
        client = new MongoClientInterface({
            locations: {
                'us-east-1': { isCRR: false },
                'dr-source': { isCRR: true },
            },
        });
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

    it('should write the version and leave the master alone', async () => {
        // resolves like a normal lookup, so that skipping it is what the test proves
        const getLatestVersion = sinon
            .stub(client, 'getLatestVersion')
            .callsFake((...args) => args[4](null, localized));
        const collection = collectionStub();
        const { err, res } = await putVersion(client, collection, nonLocalized);
        assert.deepStrictEqual(err, null);
        assert(res.includes('{"versionId": '));
        sinon.assert.calledOnce(collection.updateOne);
        assert.strictEqual(collection.updateOne.firstCall.args[0]._id, 'example-version-key');
        sinon.assert.notCalled(getLatestVersion);
        sinon.assert.notCalled(collection.bulkWrite);
    });

    it('should update the master when the version is localized', async () => {
        const getLatestVersion = sinon
            .stub(client, 'getLatestVersion')
            .callsFake((...args) => args[4](null, localized));
        const collection = collectionStub();
        const { err } = await putVersion(client, collection, localized);
        assert.deepStrictEqual(err, null);
        sinon.assert.calledOnce(getLatestVersion);
        sinon.assert.calledOnce(collection.bulkWrite);
    });

    it('should fail when writing the non-localized version fails', async () => {
        const collection = collectionStub();
        collection.updateOne = sinon.stub().rejects(errors.InternalError);
        const { err } = await putVersion(client, collection, nonLocalized);
        assert.deepStrictEqual(err, errors.InternalError);
        sinon.assert.notCalled(collection.bulkWrite);
    });

    it('should update the master when no location is flagged as non-localized', async () => {
        const noCrrClient = new MongoClientInterface({ locations: { 'dr-source': { isCRR: false } } });
        const getLatestVersion = sinon
            .stub(noCrrClient, 'getLatestVersion')
            .callsFake((...args) => args[4](null, localized));
        const collection = collectionStub();
        const { err } = await putVersion(noCrrClient, collection, nonLocalized);
        assert.deepStrictEqual(err, null);
        sinon.assert.calledOnce(getLatestVersion);
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

describe('MongoClientInterface: conditional puts on the master', () => {
    const md5A = '9b2cf535f27731c974343645a3985328';
    const md5B = '3c6e0b8a9c15224a8228b9a98ca1531d';
    const v0 = { vFormat: BucketVersioningKeyFormat.v0 };
    let client;

    function call(fn, ...args) {
        return new Promise(resolve => fn.call(client, ...args, log, (err, res) => resolve({ err, res })));
    }

    function dupKey() {
        return Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
    }

    const notDeleting = { 'value.isPHD': { $ne: true }, 'value.deleted': { $ne: true } };

    beforeAll(() => {
        client = new MongoClientInterface({});
    });

    afterEach(() => sinon.restore());

    it('putObjectNoVer with ifNoneMatch should upsert with the delete-marker filter', async () => {
        const collection = { updateOne: sinon.stub().resolves({ matchedCount: 0, upsertedCount: 1 }) };
        const value = { 'content-md5': md5B };
        const { err } = await call(client.putObjectNoVer, collection, 'b', 'key', value, { ...v0, ifNoneMatch: '*' });
        assert.ifError(err);
        assert(collection.updateOne.calledOnce);
        assert.deepStrictEqual(collection.updateOne.firstCall.args, [
            { '_id': 'key', ...notDeleting, 'value.isDeleteMarker': true },
            { $set: { _id: 'key', value } },
            { upsert: true },
        ]);
    });

    it('putObjectNoVer with ifNoneMatch should classify a duplicate key as PreconditionFailed', async () => {
        const collection = {
            updateOne: sinon.stub().rejects(dupKey()),
            findOne: sinon.stub().resolves({ _id: 'key', value: { 'content-md5': md5A } }),
        };
        const { err } = await call(client.putObjectNoVer, collection, 'b', 'key', {}, { ...v0, ifNoneMatch: '*' });
        assert(err && err.is.PreconditionFailed);
        assert.deepStrictEqual(collection.findOne.firstCall.args, [{ _id: 'key' }]);
    });

    it('putObjectNoVer with ifMatch should not upsert and should classify a missing master as NoSuchKey', async () => {
        const collection = {
            updateOne: sinon.stub().resolves({ matchedCount: 0 }),
            findOne: sinon.stub().resolves(null),
        };
        const value = { 'content-md5': md5B };
        const { err } = await call(client.putObjectNoVer, collection, 'b', 'key', value, { ...v0, ifMatch: md5A });
        assert(err && err.is.NoSuchKey);
        assert.deepStrictEqual(collection.updateOne.firstCall.args, [
            { '_id': 'key', ...notDeleting, 'value.content-md5': md5A, 'value.isDeleteMarker': { $ne: true } },
            { $set: { value } },
            { upsert: false },
        ]);
    });

    it('putObjectNoVer with ifMatch should succeed when the master matches', async () => {
        const collection = { updateOne: sinon.stub().resolves({ matchedCount: 1 }) };
        const { err } = await call(client.putObjectNoVer, collection, 'b', 'key', {}, { ...v0, ifMatch: md5A });
        assert.ifError(err);
    });

    it('putObjectNoVerWithOplogUpdate with a condition should classify a miss instead of InternalError', async () => {
        const collection = {
            findOneAndUpdate: sinon.stub().resolves(null),
            findOne: sinon.stub().resolves({ _id: 'key', value: { 'content-md5': md5A } }),
            bulkWrite: sinon.stub().resolves({}),
        };
        const params = { ...v0, needOplogUpdate: true, originOp: 's3:ObjectCreated:Put', ifMatch: md5B };
        const { err } = await call(client.putObjectNoVer, collection, 'b', 'key', {}, params);
        assert(err && err.is.PreconditionFailed);
        assert.strictEqual(collection.findOneAndUpdate.firstCall.args[0]['value.content-md5'], md5B);
        assert(collection.bulkWrite.notCalled);
    });

    it('putObjectVerCase2 with a condition should use the same filters', async () => {
        const collection = {
            updateOne: sinon.stub().rejects(dupKey()),
            findOne: sinon.stub().resolves({ _id: 'key', value: { 'content-md5': md5A } }),
        };
        let res = await call(client.putObjectVerCase2, collection, 'b', 'key', {}, { ...v0, ifNoneMatch: '*' });
        assert(res.err && res.err.is.PreconditionFailed);
        assert.deepStrictEqual(collection.updateOne.firstCall.args[0], {
            '_id': 'key',
            ...notDeleting,
            'value.isDeleteMarker': true,
        });

        collection.updateOne = sinon.stub().resolves({ matchedCount: 0 });
        res = await call(client.putObjectVerCase2, collection, 'b', 'key', {}, { ...v0, ifMatch: md5B });
        assert(res.err && res.err.is.PreconditionFailed);
        assert.strictEqual(collection.updateOne.firstCall.args[2].upsert, false);

        collection.updateOne = sinon.stub().resolves({ matchedCount: 1 });
        res = await call(client.putObjectVerCase2, collection, 'b', 'key', {}, { ...v0, ifMatch: md5A });
        assert.ifError(res.err);
        assert(res.res.includes('"versionId"'));
    });

    it('putObjectVerCase1 with a condition should write the master before the version entry', async () => {
        const collection = {
            findOneAndUpdate: sinon.stub().resolves(null),
            insertOne: sinon.stub().resolves({}),
            bulkWrite: sinon.stub().resolves({}),
        };
        const value = { 'content-md5': md5B };
        let res = await call(client.putObjectVerCase1, collection, 'b', 'key', value, {
            ...v0,
            versioning: true,
            ifNoneMatch: '*',
        });
        assert.ifError(res.err);
        sinon.assert.callOrder(collection.findOneAndUpdate, collection.insertOne);
        assert(collection.bulkWrite.notCalled);
        const versionId = value.versionId;
        const [filter, update, options] = collection.findOneAndUpdate.firstCall.args;
        assert.deepStrictEqual(filter, {
            '_id': 'key',
            ...notDeleting,
            'value.isDeleteMarker': true,
            '$or': [{ 'value.versionId': { $exists: false } }, { 'value.versionId': { $gt: versionId } }],
        });
        assert.deepStrictEqual(update, { $set: { _id: 'key', value } });
        assert.deepStrictEqual(options, { upsert: true, returnDocument: 'before' });
        assert.strictEqual(collection.insertOne.firstCall.args[0]._id, `key\0${versionId}`);
        assert(res.res.includes(versionId));

        collection.findOneAndUpdate = sinon.stub().resolves({ _id: 'key', value: { 'content-md5': md5A } });
        collection.insertOne = sinon.stub().resolves({});
        res = await call(
            client.putObjectVerCase1,
            collection,
            'b',
            'key',
            { 'content-md5': md5B },
            {
                ...v0,
                versioning: true,
                ifMatch: md5A,
            },
        );
        assert.ifError(res.err);
        assert.strictEqual(collection.findOneAndUpdate.firstCall.args[0]['value.content-md5'], md5A);
        assert.deepStrictEqual(collection.findOneAndUpdate.firstCall.args[2], {
            upsert: false,
            returnDocument: 'before',
        });
        sinon.assert.callOrder(collection.findOneAndUpdate, collection.insertOne);
    });

    it('putObjectVerCase1 should write nothing when the master does not match', async () => {
        const collection = {
            findOneAndUpdate: sinon.stub().rejects(dupKey()),
            findOne: sinon.stub().resolves({ _id: 'key', value: { 'content-md5': md5A, 'versionId': 'zzz' } }),
            insertOne: sinon.stub().resolves({}),
            bulkWrite: sinon.stub().resolves({}),
        };
        let res = await call(
            client.putObjectVerCase1,
            collection,
            'b',
            'key',
            {},
            {
                ...v0,
                versioning: true,
                ifNoneMatch: '*',
            },
        );
        assert(res.err && res.err.is.PreconditionFailed);
        collection.findOneAndUpdate = sinon.stub().resolves(null);
        res = await call(
            client.putObjectVerCase1,
            collection,
            'b',
            'key',
            {},
            {
                ...v0,
                versioning: true,
                ifMatch: md5B,
            },
        );
        assert(res.err && res.err.is.PreconditionFailed);
        assert(collection.insertOne.notCalled);
        assert(collection.bulkWrite.notCalled);
    });

    it('putObjectVerCase1 should restore the master when the version insert fails', async () => {
        const collection = {
            findOneAndUpdate: sinon.stub().resolves(null),
            insertOne: sinon.stub().rejects(new Error('insert failed')),
            deleteOne: sinon.stub().resolves({}),
            updateOne: sinon.stub().resolves({}),
        };
        const value = {};
        let res = await call(client.putObjectVerCase1, collection, 'b', 'key', value, {
            ...v0,
            versioning: true,
            ifNoneMatch: '*',
        });
        assert(res.err && res.err.is.InternalError);
        assert.deepStrictEqual(collection.deleteOne.firstCall.args[0], {
            '_id': 'key',
            'value.versionId': value.versionId,
        });
        assert(collection.updateOne.notCalled);

        const previous = { 'content-md5': md5A, 'versionId': 'older' };
        collection.findOneAndUpdate = sinon.stub().resolves({ _id: 'key', value: previous });
        collection.deleteOne = sinon.stub().resolves({});
        const value2 = {};
        res = await call(client.putObjectVerCase1, collection, 'b', 'key', value2, {
            ...v0,
            versioning: true,
            ifMatch: md5A,
        });
        assert(res.err && res.err.is.InternalError);
        assert.deepStrictEqual(collection.updateOne.firstCall.args, [
            { '_id': 'key', 'value.versionId': value2.versionId },
            { $set: { value: previous } },
        ]);
        assert(collection.deleteOne.notCalled);
    });

    it('putObjectVerCase1 with a condition should refuse a delete marker', async () => {
        const collection = { findOneAndUpdate: sinon.stub(), bulkWrite: sinon.stub() };
        const res = await call(
            client.putObjectVerCase1,
            collection,
            'b',
            'key',
            { isDeleteMarker: true },
            {
                ...v0,
                versioning: true,
                ifNoneMatch: '*',
            },
        );
        assert(res.err && res.err.is.NotImplemented);
        assert(collection.findOneAndUpdate.notCalled);
        assert(collection.bulkWrite.notCalled);
    });

    it(
        'classifyConditionalFailure should return ' +
            'ConditionalRequestConflict for a placeholder, a deleted flag or a lost version guard',
        async () => {
            const cases = [
                [{ isPHD: true, versionId: 'v' }, { ifNoneMatch: '*' }, 'ConditionalRequestConflict'],
                [{ isPHD: true, versionId: 'v' }, { ifMatch: md5A }, 'ConditionalRequestConflict'],
                [{ 'content-md5': md5A, 'deleted': true }, { ifNoneMatch: '*' }, 'ConditionalRequestConflict'],
                [{ 'content-md5': md5A, 'deleted': true }, { ifMatch: md5A }, 'ConditionalRequestConflict'],
                [{ 'content-md5': md5A }, { ifMatch: md5A }, 'ConditionalRequestConflict'],
                [{ isDeleteMarker: true }, { ifNoneMatch: '*' }, 'ConditionalRequestConflict'],
                [null, { ifNoneMatch: '*' }, 'ConditionalRequestConflict'],
                [{ isDeleteMarker: true }, { ifMatch: md5A }, 'NoSuchKey'],
                [null, { ifMatch: md5A }, 'NoSuchKey'],
                [{ 'content-md5': md5A }, { ifNoneMatch: '*' }, 'PreconditionFailed'],
                [{ 'content-md5': md5B }, { ifMatch: md5A }, 'PreconditionFailed'],
            ];
            for (const [master, params, expected] of cases) {
                const collection = { findOne: sinon.stub().resolves(master ? { _id: 'key', value: master } : null) };
                const { err } = await call(client.classifyConditionalFailure, collection, 'key', params);
                assert(err && err.is[expected], `${JSON.stringify(master)} ${JSON.stringify(params)}: ${expected}`);
            }
            const failing = { findOne: sinon.stub().rejects(new Error('read failed')) };
            const { err } = await call(client.classifyConditionalFailure, failing, 'key', { ifNoneMatch: '*' });
            assert(err && err.is.InternalError);
        },
    );

    it('putObjectVerCase3 and putObjectVerCase4 with a condition should return NotImplemented', async () => {
        const collection = { findOne: sinon.stub(), bulkWrite: sinon.stub(), updateOne: sinon.stub() };
        for (const fn of [client.putObjectVerCase3, client.putObjectVerCase4]) {
            for (const cond of [{ ifNoneMatch: '*' }, { ifMatch: md5A }]) {
                const { err } = await call(fn, collection, 'b', 'key', {}, { ...v0, versionId: 'v1', ...cond });
                assert(err && err.is.NotImplemented);
            }
        }
        assert(collection.findOne.notCalled);
        assert(collection.bulkWrite.notCalled);
        assert(collection.updateOne.notCalled);
    });

    it('puts without condition should send the same operations as before', async () => {
        const collection = {
            updateOne: sinon.stub().resolves({}),
            bulkWrite: sinon.stub().resolves({}),
            findOneAndUpdate: sinon.stub(),
            insertOne: sinon.stub(),
        };
        const value = { 'content-md5': md5A };
        await call(client.putObjectNoVer, collection, 'b', 'key', value, { ...v0 });
        assert.deepStrictEqual(collection.updateOne.firstCall.args, [
            { _id: 'key' },
            { $set: { _id: 'key', value } },
            { upsert: true },
        ]);
        await call(client.putObjectVerCase2, collection, 'b', 'key', value, { ...v0, versionId: '' });
        assert.deepStrictEqual(collection.updateOne.secondCall.args, [
            { _id: 'key' },
            { $set: { value }, $setOnInsert: { _id: 'key' } },
            { upsert: true },
        ]);
        const value1 = { 'content-md5': md5B };
        await call(client.putObjectVerCase1, collection, 'b', 'key', value1, { ...v0, versioning: true });
        const ops = collection.bulkWrite.firstCall.args[0];
        assert.strictEqual(ops.length, 2);
        assert.deepStrictEqual(ops[0], { insertOne: { document: { _id: `key\0${value1.versionId}`, value: value1 } } });
        assert.deepStrictEqual(ops[1].updateOne.filter, {
            _id: 'key',
            $or: [{ 'value.versionId': { $exists: false } }, { 'value.versionId': { $gt: value1.versionId } }],
        });
        assert(collection.findOneAndUpdate.notCalled);
        assert(collection.insertOne.notCalled);
    });
});
