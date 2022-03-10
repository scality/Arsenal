const assert = require('assert');
const werelogs = require('werelogs');
const logger = new werelogs.Logger('MongoClientInterface', 'debug', 'debug');
const errors = require('../../../../../lib/errors');
const sinon = require('sinon');
const MongoClientInterface =
    require('../../../../../lib/storage/metadata/mongoclient/MongoClientInterface');
const utils = require('../../../../../lib/storage/metadata/mongoclient/utils');

describe('MongoClientInterface:getObjectNoVer', () => {
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

    it('should fail when getBucketVFormat fails', done => {
        const collection = {
            findOne: (filter, params, cb) => cb(null, {}),
        };
        sinon.stub(client, 'getCollection').callsFake(() => collection);
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(errors.InternalError));
        client.getObject('example-bucket', 'example-object', {}, logger, err => {
            assert.deepStrictEqual(err, errors.InternalError);
            return done();
        });
    });

    it('should fail when findOne fails', done => {
        const collection = {
            findOne: (filter, params, cb) => cb(errors.InternalError),
        };
        sinon.stub(client, 'getCollection').callsFake(() => collection);
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(null, 'v0'));
        client.getObject('example-bucket', 'example-object', {}, logger, err => {
            assert.deepStrictEqual(err, errors.InternalError);
            return done();
        });
    });

    it('should throw noSuchKey when no documents found', done => {
        const collection = {
            findOne: (filter, params, cb) => cb(null, null),
        };
        sinon.stub(client, 'getCollection').callsFake(() => collection);
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(null, 'v0'));
        client.getObject('example-bucket', 'example-object', {}, logger, err => {
            assert.deepStrictEqual(err, errors.NoSuchKey);
            return done();
        });
    });

    it('should fail when getLatestVersion fails', done => {
        const doc = {
            value: {
                isPHD: true,
            },
        };
        const collection = {
            findOne: (filter, params, cb) => cb(null, doc),
        };
        sinon.stub(client, 'getCollection').callsFake(() => collection);
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(null, 'v0'));
        sinon.stub(client, 'getLatestVersion').callsFake((...args) => args[4](errors.InternalError));
        client.getObject('example-bucket', 'example-object', {}, logger, err => {
            assert.deepStrictEqual(err, errors.InternalError);
            return done();
        });
    });

    it('should return latest version when master is PHD', done => {
        const doc = {
            value: {
                isPHD: true,
                last: false,
            },
        };
        const collection = {
            findOne: (filter, params, cb) => cb(null, doc),
        };
        sinon.stub(client, 'getCollection').callsFake(() => collection);
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(null, 'v0'));
        doc.value.last = true;
        sinon.stub(client, 'getLatestVersion').callsFake((...args) => args[4](null, doc.value));
        client.getObject('example-bucket', 'example-object', {}, logger, (err, res) => {
            assert.deepStrictEqual(err, null);
            assert.deepStrictEqual(res, doc.value);
            return done();
        });
    });

    it('should return master', done => {
        const doc = {
            value: {
                isPHD: false,
                last: true,
            },
        };
        const collection = {
            findOne: (filter, params, cb) => cb(null, doc),
        };
        sinon.stub(client, 'getCollection').callsFake(() => collection);
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(null, 'v0'));
        client.getObject('example-bucket', 'example-object', {}, logger, (err, res) => {
            assert.deepStrictEqual(err, null);
            assert.deepStrictEqual(res, doc.value);
            return done();
        });
    });
});
