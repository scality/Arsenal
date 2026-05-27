const assert = require('assert');
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

const log = new DummyRequestLogger();

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
