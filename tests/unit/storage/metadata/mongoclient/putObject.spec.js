const assert = require('assert');
const werelogs = require('werelogs');
const logger = new werelogs.Logger('MongoClientInterface', 'debug', 'debug');
const errors = require('../../../../../lib/errors').default;
const sinon = require('sinon');
const MongoClientInterface =
    require('../../../../../lib/storage/metadata/mongoclient/MongoClientInterface');
const utils = require('../../../../../lib/storage/metadata/mongoclient/utils');

describe('MongoClientInterface:putObject', () => {
    let client;

    beforeAll(done => {
        client = new MongoClientInterface({});
        return done();
    });

    beforeEach(done => {
        sinon.stub(client, 'getCollection').callsFake(() => null);
        return done();
    });

    afterEach(done => {
        sinon.restore();
        return done();
    });

    it('Should fail when getBucketVFormat fails', done => {
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(errors.InternalError));
        client.putObject('example-bucket', 'example-object', {}, {}, {}, err => {
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
        client.putObject('example-bucket', 'example-object', {}, {}, {}, {});
        const args = [null, 'example-bucket', 'example-object', {}, { vFormat: 'v0' }, {}, {}];
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
        client.putObject('example-bucket', 'example-object', {}, params, {}, {});
        params.vFormat = 'v0';
        const args = [null, 'example-bucket', 'example-object', {}, params, {}, {}];
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
        client.putObject('example-bucket', 'example-object', {}, params, {}, {});
        params.vFormat = 'v0';
        const args = [null, 'example-bucket', 'example-object', {}, params, {}, {}];
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
        client.putObject('example-bucket', 'example-object', {}, params, {}, {});
        params.vFormat = 'v0';
        const args = [null, 'example-bucket', 'example-object', {}, params, {}, {}];
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
        client.putObject('example-bucket', 'example-object', {}, params, {}, {});
        params.vFormat = 'v0';
        const args = [null, 'example-bucket', 'example-object', {}, params, {}, {}];
        assert(putObjectVerCase4Spy.calledOnceWith(...args));
        return done();
    });

    it('Should fail when putObjectNoVer fails', done => {
        // Stubbing functions
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(null, 'v0'));
        sinon.stub(client, 'putObjectNoVer').callsFake((...args) => args[6](errors.InternalError));
        // checking if function called with correct params
        client.putObject('example-bucket', 'example-object', {}, {}, {}, err => {
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
        client.putObject('example-bucket', 'example-object', {}, params, {}, err => {
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
        client.putObject('example-bucket', 'example-object', {}, params, {}, err => {
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
        client.putObject('example-bucket', 'example-object', {}, params, {}, err => {
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
        client.putObject('example-bucket', 'example-object', {}, params, {}, err => {
            assert.deepStrictEqual(err, errors.InternalError);
            return done();
        });
    });
});

describe('MongoClientInterface:putObjectVerCase1', () => {
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

    it('should fail when error code not 11000', done => {
        const collection = {
            bulkWrite: () => Promise.reject(errors.InternalError),
        };
        client.putObjectVerCase1(collection, 'example-bucket', 'example-object', {}, {}, logger, err => {
            assert.deepStrictEqual(err, errors.InternalError);
            return done();
        }, false);
    });

    it('should not fail when error code is 11000 and upsertedCount is 1', done => {
        const error = {
            code: 11000,
            result: {
                upsertedCount: 1,
            },
        };
        const collection = {
            bulkWrite: () => Promise.reject(error),
        };
        client.putObjectVerCase1(collection, 'example-bucket', 'example-object', {}, {}, logger, err => {
            assert.deepStrictEqual(err, null);
            return done();
        }, false);
    });

    it('should fail when error code is 11000, upsertedCount is not 1 and not retry', done => {
        const error = {
            code: 11000,
            result: {
                upsertedCount: 3,
            },
        };
        const collection = {
            bulkWrite: () => Promise.reject(error),
        };
        client.putObjectVerCase1(collection, 'example-bucket', 'example-object', {}, {}, logger, err => {
            assert.deepStrictEqual(err, errors.InternalError);
            return done();
        }, true);
    });

    it('should return version id when no error', done => {
        const collection = {
            bulkWrite: () => Promise.resolve(),
        };
        client.putObjectVerCase1(collection, 'example-bucket', 'example-object', {}, {}, logger, (err, res) => {
            assert.deepStrictEqual(err, null);
            assert(res.includes('{"versionId": '));
            return done();
        }, false);
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
            assert.deepStrictEqual(err, undefined);
            return done();
        });
    });

    it('should fail when update fails', done => {
        const collection = {
            updateOne: () => Promise.reject(errors.InternalError),
        };
        client.putObjectNoVer(collection, 'example-bucket', 'example-object', {}, {}, logger, err => {
            assert.deepStrictEqual(err, errors.InternalError);
            return done();
        }, false);
    });
});
