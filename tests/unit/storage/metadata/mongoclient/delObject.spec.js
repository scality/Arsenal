const assert = require('assert');
const werelogs = require('werelogs');
const logger = new werelogs.Logger('MongoClientInterface', 'debug', 'debug');
const errors = require('../../../../../lib/errors').default;
const sinon = require('sinon');
const MongoClientInterface =
    require('../../../../../lib/storage/metadata/mongoclient/MongoClientInterface');
const utils = require('../../../../../lib/storage/metadata/mongoclient/utils');

const objMD = {
    _id: 'example-object',
    value: {
        key: 'example-object',
    },
};

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
            assert(err.is.InternalError);
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

    it('deleteObjectNoVer:: should fail when internalDeleteObject fails', done => {
        const internalDeleteObjectStub = sinon.stub(client, 'internalDeleteObject')
            .callsArgWith(6, errors.InternalError);
        client.deleteObjectNoVer(null, 'example-bucket', 'example-object', {}, logger, err => {
            assert(internalDeleteObjectStub.calledOnce);
            assert(err.is.InternalError);
            return done();
        });
    });

    it('deleteObjectNoVer:: should not fail', done => {
        sinon.stub(client, 'internalDeleteObject').callsArgWith(6, null, { ok: 1 });
        client.deleteObjectNoVer(null, 'example-bucket', 'example-object', {}, logger, err => {
            assert.deepStrictEqual(err, null);
            return done();
        });
    });

    it('deleteObjectVer:: should fail when findOne fails', done => {
        const collection = {
            findOne: () => Promise.resolve(errors.InternalError),
        };
        client.deleteObjectVer(collection, 'example-bucket', 'example-object', {}, logger, err => {
            assert(err.is.InternalError);
            return done();
        });
    });

    it('deleteObjectVer:: should fail when no key found', done => {
        const collection = {
            findOne: () => Promise.resolve(null),
        };
        sinon.stub(client, 'getLatestVersion').callsFake((...args) => args[4](errors.NoSuchKey));
        client.deleteObjectVer(collection, 'example-bucket', 'example-object', {}, logger, err => {
            assert(err.is.NoSuchKey);
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
            findOne: () => Promise.resolve(mst),
        };
        const deleteObjectVerMasterSpy = sinon.spy();
        sinon.stub(client, 'deleteObjectVerMaster').callsFake((c, bucketName, objName, params, logs, next) => {
            deleteObjectVerMasterSpy();
            return next();
        });
        client.deleteObjectVer(collection, 'example-bucket', 'example-object', {}, logger, () => {
            assert(deleteObjectVerMasterSpy.calledOnce);
            return done();
        });
    });


    it('deleteObjectVer:: should call deleteObjectVerMaster when version is last', done => {
        const mst = {
            value: {
                versionId: '1234',
            },
        };
        const collection = {
            findOne: () => Promise.resolve(mst),
        };
        const deleteObjectVerMasterSpy = sinon.spy();
        sinon.stub(client, 'deleteObjectVerMaster').callsFake((c, bucketName, objName, params, logs, next) => {
            deleteObjectVerMasterSpy();
            return next();
        });
        client.deleteObjectVer(collection, 'example-bucket', 'example-object', { versionId: '1234' }, logger, () => {
            assert(deleteObjectVerMasterSpy.calledOnce);
            return done();
        });
    });

    it('deleteObjectVerNotMaster:: should fail when findOneAndDelete fails', done => {
        sinon.stub(client, 'internalDeleteObject').callsArgWith(6, errors.InternalError);
        client.deleteObjectVerNotMaster(null, 'example-bucket', 'example-object', {}, logger, err => {
            assert(err.is.InternalError);
            return done();
        });
    });

    it('deleteObjectVerMaster:: should fail when deleteOrRepairPHD fails', done => {
        const collection = {
            updateOne: () => Promise.resolve(),
        };
        sinon.stub(client, 'internalDeleteObject').callsArg(6);
        sinon.stub(client, 'deleteOrRepairPHD').callsFake((...args) => args[6](errors.InternalError));
        client.deleteObjectVerMaster(collection, 'example-bucket', 'example-object', {}, logger, err => {
            assert(err.is.InternalError);
            return done();
        });
    });

    it('deleteObjectVerMaster:: should not fail', done => {
        const collection = {
            updateOne: () => Promise.resolve(),
        };
        sinon.stub(client, 'internalDeleteObject').callsArg(6);
        sinon.stub(client, 'deleteOrRepairPHD').callsArg(6);
        client.deleteObjectVerMaster(collection, 'example-bucket', 'example-object', {}, logger, err => {
            assert.deepStrictEqual(err, undefined);
            return done();
        });
    });

    it('deleteOrRepairPHD:: should not fail', done => {
        sinon.useFakeTimers();
        sinon.stub(client, 'getLatestVersion').callsFake((...args) => args[4](null, { isDeleteMarker: false }));
        sinon.stub(client, 'internalDeleteObject').callsArg(6);
        sinon.stub(client, 'asyncRepair').callsArg(5);
        client.deleteOrRepairPHD({}, 'example-bucket', 'example-object', {}, 'v0', logger, err => {
            assert.deepStrictEqual(err, null);
            return done();
        });
    });

    it('repair:: should set correct originOp', done => {
        const collection = {
            findOneAndReplace: sinon.stub().resolves({ ok: 1 }),
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

    it('internalDeleteObject:: should fail when no object is found', done => {
        const collection = {
            findOneAndUpdate: sinon.stub().resolves({}),
        };
        client.internalDeleteObject(collection, 'example-bucket', 'example-object', null, null, logger, err => {
            assert(err.is.NoSuchKey);
            return done();
        });
    });

    it('internalDeleteObject:: should set correct originOp when', done => {
        const collection = {
            bulkWrite: sinon.stub().resolves({ ok: 1 }),
            findOneAndUpdate: sinon.stub().resolves({ value: { value: objMD } }),
        };
        const originOp = 's3:TestOriginOp:Created';
        client.internalDeleteObject(collection, 'example-bucket', 'example-object', {}, null, logger, () => {
            assert.deepEqual(collection.bulkWrite.args[0][0][0].updateOne.update.$set.value.originOp,
                originOp);
            return done();
        }, originOp);
    });

    it('internalDeleteObject:: should directly delete object if params.doesNotNeedOpogUpdate is true', done => {
        const collection = {
            deleteOne: sinon.stub().returns(Promise.resolve()),
        };
        const params = {
            doesNotNeedOpogUpdate: true,
        };
        client.internalDeleteObject(collection, 'example-bucket', 'example-object', null, params, logger, err => {
            assert.deepEqual(err, null);
            assert(collection.deleteOne.calledOnce);
            return done();
        }, 's3:ObjectRemoved:Delete');
    });

    it('internalDeleteObject:: should go through the normal flow if params is null', done => {
        const findOneAndUpdate = sinon.stub().resolves({ value: { value: objMD } });
        const bulkWrite = sinon.stub().resolves({ ok: 1 });
        const collection = {
            findOneAndUpdate,
            bulkWrite,
        };
        client.internalDeleteObject(collection, 'example-bucket', 'example-object', null, null, logger, err => {
            assert.deepEqual(err, null);
            assert(findOneAndUpdate.calledOnce);
            assert(bulkWrite.calledOnce);
            return done();
        });
    });

    it('internalDeleteObject:: should get PHD object with versionId', done => {
        const findOneAndUpdate = sinon.stub().resolves({ value: { value: objMD } });
        const collection = {
            findOneAndUpdate,
            bulkWrite: () => Promise.resolve(),
        };
        const filter = {
            'value.isPHD': true,
            'value.versionId': '1234',
        };
        client.internalDeleteObject(collection, 'example-bucket', 'example-object', filter, null, logger, err => {
            assert.deepEqual(err, undefined);
            assert(findOneAndUpdate.args[0][0]['value.isPHD']);
            assert.strictEqual(findOneAndUpdate.args[0][0]['value.versionId'], '1234');
            return done();
        });
    });
});
