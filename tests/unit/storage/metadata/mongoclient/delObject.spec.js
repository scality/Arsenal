const assert = require('assert');
const werelogs = require('werelogs');
const logger = new werelogs.Logger('MongoClientInterface', 'debug', 'debug');
const errors = require('../../../../../lib/errors').default;
const sinon = require('sinon');
const MongoClientInterface =
    require('../../../../../lib/storage/metadata/mongoclient/MongoClientInterface');
const utils = require('../../../../../lib/storage/metadata/mongoclient/utils');

describe('MongoClientInterface:delObject', () => {
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

    it('delObject::should fail when getBucketVFormat fails', done => {
        sinon.stub(client, 'getCollection').callsFake(() => null);
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(errors.InternalError));
        client.deleteObject('example-bucket', 'example-object', {}, logger, err => {
            assert.deepStrictEqual(err, errors.InternalError);
            return done();
        });
    });

    it('delObject::should call deleteObjectNoVer when no versionId', done => {
        sinon.stub(client, 'getCollection').callsFake(() => null);
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(null, 'v0'));
        const deleteObjectNoVerSpy = sinon.spy();
        sinon.stub(client, 'deleteObjectNoVer').callsFake(deleteObjectNoVerSpy);
        client.deleteObject('example-bucket', 'example-object', {}, logger, {});
        const args = [null, 'example-bucket', 'example-object', { vFormat: 'v0' }, logger, {}];
        assert(deleteObjectNoVerSpy.calledOnceWith(...args));
        return done();
    });

    it('delObject::should call deleteObjectVer when no versionId', done => {
        sinon.stub(client, 'getCollection').callsFake(() => null);
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(null, 'v0'));
        const deleteObjectVerSpy = sinon.spy();
        sinon.stub(client, 'deleteObjectVer').callsFake(deleteObjectVerSpy);
        const params = {
            versionId: '1234',
        };
        client.deleteObject('example-bucket', 'example-object', params, logger, {});
        params.vFormat = 'v0';
        const args = [null, 'example-bucket', 'example-object', params, logger, {}];
        assert(deleteObjectVerSpy.calledOnceWith(...args));
        return done();
    });

    it('deleteObjectNoVer:: should fail when findOneAndDelete fails', done => {
        const collection = {
            findOneAndDelete: (filter, params, cb) => cb(errors.InternalError),
        };
        client.deleteObjectNoVer(collection, 'example-bucket', 'example-object', {}, logger, err => {
            assert.deepStrictEqual(err, errors.InternalError);
            return done();
        });
    });

    it('deleteObjectNoVer:: should no fail', done => {
        const collection = {
            findOneAndDelete: (filter, params, cb) => cb(null, { ok: 1 }),
        };
        client.deleteObjectNoVer(collection, 'example-bucket', 'example-object', {}, logger, err => {
            assert.deepStrictEqual(err, null);
            return done();
        });
    });

    it('deleteObjectVer:: should fail when findOne fails', done => {
        const collection = {
            findOne: (filter, params, cb) => cb(errors.InternalError),
        };
        client.deleteObjectVer(collection, 'example-bucket', 'example-object', {}, logger, err => {
            assert.deepStrictEqual(err, errors.InternalError);
            return done();
        });
    });

    it('deleteObjectVer:: should fail when no key found', done => {
        const collection = {
            findOne: (filter, params, cb) => cb(null, null),
        };
        sinon.stub(client, 'getLatestVersion').callsFake((...args) => args[4](errors.NoSuchKey));
        client.deleteObjectVer(collection, 'example-bucket', 'example-object', {}, logger, err => {
            assert.deepStrictEqual(err, errors.NoSuchKey);
            return done();
        });
    });

    it('deleteObjectVer:: should call deleteObjectVerMaster when mst is phd', done => {
        const mst = {
            value: {
                isPHD: true,
            },
        };
        const collection = {
            findOne: (filter, params, cb) => cb(null, mst),
        };
        const deleteObjectVerMasterSpy = sinon.spy();
        sinon.stub(client, 'deleteObjectVerMaster').callsFake(deleteObjectVerMasterSpy);
        client.deleteObjectVer(collection, 'example-bucket', 'example-object', {}, logger, {});
        assert(deleteObjectVerMasterSpy.calledOnce);
        return done();
    });

    it('deleteObjectVer:: should call deleteObjectVerMaster when version is last', done => {
        const mst = {
            value: {
                versionId: '1234',
            },
        };
        const collection = {
            findOne: (filter, params, cb) => cb(null, mst),
        };
        const deleteObjectVerMasterSpy = sinon.spy();
        sinon.stub(client, 'deleteObjectVerMaster').callsFake(deleteObjectVerMasterSpy);
        client.deleteObjectVer(collection, 'example-bucket', 'example-object', { versionId: '1234' }, logger, {});
        assert(deleteObjectVerMasterSpy.calledOnce);
        return done();
    });

    it('deleteObjectVerNotMaster:: should fail when findOneAndDelete fails', done => {
        const collection = {
            findOneAndDelete: (filter, params, cb) => cb(errors.InternalError),
        };
        client.deleteObjectVerNotMaster(collection, 'example-bucket', 'example-object', {}, logger, err => {
            assert.deepStrictEqual(err, errors.InternalError);
            return done();
        });
    });

    it('deleteObjectVerMaster:: should fail when bulkWrite fails', done => {
        const collection = {
            bulkWrite: (ops, params, cb) => cb(errors.InternalError),
        };
        client.deleteObjectVerMaster(collection, 'example-bucket', 'example-object', {}, logger, err => {
            assert.deepStrictEqual(err, errors.InternalError);
            return done();
        });
    });

    it('deleteObjectVerMaster:: should fail when deleteOrRepairPHD fails', done => {
        const collection = {
            bulkWrite: (ops, params, cb) => cb(null),
        };
        sinon.stub(client, 'deleteOrRepairPHD').callsFake((...args) => args[6](errors.InternalError));
        client.deleteObjectVerMaster(collection, 'example-bucket', 'example-object', {}, logger, err => {
            assert.deepStrictEqual(err, errors.InternalError);
            return done();
        });
    });

    it('deleteObjectVerMaster:: should not fail', done => {
        const collection = {
            bulkWrite: (ops, params, cb) => cb(null),
        };
        sinon.stub(client, 'deleteOrRepairPHD').callsFake((...args) => args[6](null));
        client.deleteObjectVerMaster(collection, 'example-bucket', 'example-object', {}, logger, err => {
            assert.deepStrictEqual(err, null);
            return done();
        });
    });

    it('deleteOrRepairPHD:: should not fail', done => {
        const collection = {
            bulkWrite: (ops, params, cb) => cb(null),
        };
        sinon.useFakeTimers();
        sinon.stub(client, 'getLatestVersion').callsFake((...args) => args[4](null, { isDeleteMarker: false }));
        sinon.stub(client, 'asyncRepair').callsFake((...args) => args[5](null));
        client.deleteOrRepairPHD(collection, 'example-bucket', 'example-object', {}, 'v0', logger, err => {
            assert.deepStrictEqual(err, null);
            return done();
        });
    });

    it('deleteOrRepairPHD:: should fail when no key found', done => {
        const collection = {
            bulkWrite: (ops, params, cb) => cb(null),
            findOneAndDelete: (filter, params, cb) => cb(errors.InternalError),
        };
        sinon.useFakeTimers();
        sinon.stub(client, 'getLatestVersion').callsFake((...args) => args[4](errors.NoSuchKey));
        sinon.stub(client, 'asyncRepair').callsFake((...args) => args[5](null));
        client.deleteOrRepairPHD(collection, 'example-bucket', 'example-object', {}, 'v0', logger, err => {
            assert(err.is.InternalError);
            return done();
        });
    });

    it('repair:: should set correct originOp', done => {
        const collection = {
            findOneAndReplace: sinon.stub().callsArgWith(3, null, { ok: 1 }),
        };
        const master = {
            versionId: '1234',
        };
        const objVal = {
            originOp: 's3:ObjectCreated:Put',
        };
        client.repair(collection, 'example-bucket', 'example-object', objVal, master, 'v0', logger, () => {
            assert.deepEqual(collection.findOneAndReplace.args[0][1], {
                _id: 'example-object',
                value: {
                    originOp: 's3:ObjectRemoved:Delete',
                },
            });
            return done();
        });
    });
});
