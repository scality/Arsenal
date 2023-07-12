const assert = require('assert');
const werelogs = require('werelogs');
const logger = new werelogs.Logger('MongoClientInterface', 'debug', 'debug');
const errors = require('../../../../../lib/errors').default;
const sinon = require('sinon');
const MongoClientInterface =
    require('../../../../../lib/storage/metadata/mongoclient/MongoClientInterface');
const utils = require('../../../../../lib/storage/metadata/mongoclient/utils');

describe('MongoClientInterface:putObjectWithCond', () => {
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

    it('should fail when getBucketVFormat fails', done => {
        sinon.stub(client, 'getCollection').callsFake(() => null);
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(errors.InternalError));
        client.putObjectWithCond('example-bucket', 'example-object', {}, {}, logger, err => {
            assert.deepStrictEqual(err, errors.InternalError);
            return done();
        });
    });

    it('should fail when getBucketVFormat fails', done => {
        sinon.stub(client, 'getCollection').callsFake(() => null);
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(null));
        sinon.stub(utils, 'translateConditions').callsFake(() => {throw errors.InternalError;});
        client.putObjectWithCond('example-bucket', 'example-object', {}, {}, logger, err => {
            assert.deepStrictEqual(err, errors.InternalError);
            return done();
        });
    });

    it('should fail when findOneAndUpdate fails', done => {
        const collection = {
            findOneAndUpdate: () => Promise.reject(errors.InternalError),
        };
        sinon.stub(client, 'getCollection').callsFake(() => collection);
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(null));
        sinon.stub(utils, 'translateConditions').callsFake(() => null);
        client.putObjectWithCond('example-bucket', 'example-object', {}, {}, logger, err => {
            assert.deepStrictEqual(err, errors.InternalError);
            return done();
        });
    });
});

describe('MongoClientInterface:deleteObjectWithCond', () => {
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

    it('should fail when getBucketVFormat fails', done => {
        sinon.stub(client, 'getCollection').callsFake(() => null);
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(errors.InternalError));
        client.deleteObjectWithCond('example-bucket', 'example-object', {}, logger, err => {
            assert.deepStrictEqual(err, errors.InternalError);
            return done();
        });
    });

    it('should fail when getBucketVFormat fails', done => {
        sinon.stub(client, 'getCollection').callsFake(() => null);
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(null));
        sinon.stub(utils, 'translateConditions').callsFake(() => {throw errors.InternalError;});
        client.deleteObjectWithCond('example-bucket', 'example-object', {}, logger, err => {
            assert.deepStrictEqual(err, errors.InternalError);
            return done();
        });
    });

    it('should fail when internalDeleteObject fails', done => {
        sinon.stub(client, 'getCollection').callsFake(() => {});
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(null));
        sinon.stub(utils, 'translateConditions').callsFake(() => null);
        sinon.stub(client, 'internalDeleteObject').callsArgWith(6, errors.InternalError);
        client.deleteObjectWithCond('example-bucket', 'example-object', {}, logger, err => {
            assert(err.is.InternalError);
            return done();
        });
    });
});
