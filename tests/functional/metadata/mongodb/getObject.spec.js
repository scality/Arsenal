const async = require('async');
const assert = require('assert');
const werelogs = require('werelogs');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { errors, versioning } = require('../../../../index');
const logger = new werelogs.Logger('MongoClientInterface', 'debug', 'debug');
const BucketInfo = require('../../../../lib/models/BucketInfo');
const MetadataWrapper =
    require('../../../../lib/storage/metadata/MetadataWrapper');
const genVID = versioning.VersionID.generateVersionId;

const IMPL_NAME = 'mongodb';
const DB_NAME = 'metadata';
const BUCKET_NAME = 'test-bucket';
const replicationGroupId = 'RG001';

const mongoserver = new MongoMemoryReplSet({
    debug: false,
    instanceOpts: [
        { port: 27019 },
    ],
    replSet: {
        name: 'rs0',
        count: 1,
        DB_NAME,
        storageEngine: 'ephemeralForTest',
    },
});

let uidCounter = 0;
function generateVersionId() {
    return genVID(`${process.pid}.${uidCounter++}`,
        replicationGroupId);
}

describe('MongoClientInterface::metadata.getObjectMD', () => {
    let metadata;
    let collection;
    let versionId1;

    const params = {
        objName: 'pfx1-test-object',
        objVal: {
            key: 'pfx1-test-object',
            versionId: 'null',
        },
        vFormat: 'v0',
    };

    function updateMasterObject(mKey, objName, versionId, objVal, vFormat, cb) {
        collection.updateOne(
            {
                _id: mKey,
                $or: [{
                    'value.versionId': {
                        $exists: false,
                    },
                },
                {
                    'value.versionId': {
                        $gt: versionId,
                    },
                },
                ],
            },
            {
                $set: { _id: objName, value: objVal },
            },
            { upsert: true },
            err => {
                if (err) {
                    return cb(err);
                }
                return cb(null);
            });
    }

    beforeAll(done => {
        mongoserver.waitUntilRunning().then(() => {
            const opts = {
                mongodb: {
                    replicaSetHosts: 'localhost:27019',
                    writeConcern: 'majority',
                    replicaSet: 'rs0',
                    readPreference: 'primary',
                    database: DB_NAME,
                },
            };
            metadata = new MetadataWrapper(IMPL_NAME, opts, null, logger);
            metadata.setup(done);
        });
    });

    afterAll(done => {
        async.series([
            next => metadata.close(next),
            next => mongoserver.stop()
                .then(() => next())
                .catch(next),
        ], done);
    });

    beforeEach(done => {
        const bucketMD = BucketInfo.fromObj({
            _name: BUCKET_NAME,
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
            _mdBucketModelVersion: 10,
            _transient: false,
            _deleted: false,
            _serverSideEncryption: null,
            _versioningConfiguration: null,
            _locationConstraint: 'us-east-1',
            _readLocationConstraint: null,
            _cors: null,
            _replicationConfiguration: null,
            _lifecycleConfiguration: null,
            _uid: '',
            _isNFS: null,
            ingestion: null,
        });
        const versionParams = {
            versioning: true,
            versionId: null,
            repairMaster: null,
        };
        async.series([
            next => metadata.createBucket(BUCKET_NAME, bucketMD, logger, err => {
                if (err) {
                    return next(err);
                }
                collection = metadata.client.getCollection(BUCKET_NAME);
                return next();
            }),
            next => {
                versionId1 = generateVersionId();
                params.objVal.versionId = versionId1;
                versionParams.versionId = versionId1;
                metadata.putObjectMD(BUCKET_NAME, params.objName, params.objVal,
                    versionParams, logger, next);
            },
            next => {
                params.objVal.versionId = 'version2';
                metadata.putObjectMD(BUCKET_NAME, params.objName, params.objVal,
                    {}, logger, next);
            },
        ], done);
    });

    afterEach(done => {
        metadata.deleteBucket(BUCKET_NAME, logger, done);
    });

    it('Should return latest version of object', done =>
        metadata.getObjectMD(BUCKET_NAME, params.objName, null, logger, (err, object) => {
            assert.deepStrictEqual(err, null);
            assert.strictEqual(object.key, params.objName);
            assert.strictEqual(object.versionId, 'version2');
            return done();
        }));

    it('Should return the specified version of object', done =>
        metadata.getObjectMD(BUCKET_NAME, params.objName, { versionId: versionId1 }, logger, (err, object) => {
            assert.deepStrictEqual(err, null);
            assert.strictEqual(object.key, params.objName);
            assert.strictEqual(object.versionId, versionId1);
            return done();
        }));

    it('Should throw error when version non existent', done => {
        const versionId = '1234567890';
        return metadata.getObjectMD(BUCKET_NAME, params.objName, { versionId }, logger, (err, object) => {
            assert.deepStrictEqual(object, undefined);
            assert.deepStrictEqual(err, errors.NoSuchKey);
            return done();
        });
    });

    it('Should throw error when object non existent', done => {
        const objName = 'non-existent-object';
        return metadata.getObjectMD(BUCKET_NAME, objName, null, logger, err => {
            assert.deepStrictEqual(err, errors.NoSuchKey);
            return done();
        });
    });

    it('Should throw error when object non existent', done => {
        const bucketName = 'non-existent-bucket';
        return metadata.getObjectMD(bucketName, params.objName, null, logger, (err, object) => {
            assert.deepStrictEqual(object, undefined);
            assert.deepStrictEqual(err, errors.NoSuchKey);
            return done();
        });
    });

    it('Should return latest version when master is PHD', done => {
        async.waterfall([
            next => {
                // adding isPHD flag to master
                const phdVersionId = generateVersionId();
                params.objVal.versionId = phdVersionId;
                params.objVal.isPHD = true;
                updateMasterObject('pfx1-test-object', params.objName, phdVersionId, params.objVal,
                    params.vFormat, next);
            },
            // Should return latest object version
            next => metadata.getObjectMD(BUCKET_NAME, params.objName, null, logger, (err, object) => {
                assert.deepStrictEqual(err, null);
                assert.strictEqual(object.key, params.objName);
                assert.strictEqual(object.versionId, versionId1);
                delete params.objVal.isPHD;
                return next();
            }),
        ], done);
    });
});
