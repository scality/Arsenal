const async = require('async');
const assert = require('assert');
const werelogs = require('werelogs');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { errors, versioning } = require('../../../../index');
const logger = new werelogs.Logger('MongoClientInterface', 'debug', 'debug');
const BucketInfo = require('../../../../lib/models/BucketInfo').default;
const MetadataWrapper =
    require('../../../../lib/storage/metadata/MetadataWrapper');
const genVID = versioning.VersionID.generateVersionId;
const { BucketVersioningKeyFormat } = versioning.VersioningConstants;
const { formatMasterKey } = require('../../../../lib/storage/metadata/mongoclient/utils');

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

const variations = [
    { it: '(v0)', vFormat: BucketVersioningKeyFormat.v0 },
    { it: '(v1)', vFormat: BucketVersioningKeyFormat.v1 },
];

describe('MongoClientInterface::metadata.getObjectMD', () => {
    let metadata;
    let collection;
    let versionId1;
    let versionId2;

    let params = {
        objName: 'pfx1-test-object',
        objVal: {
            key: 'pfx1-test-object',
            versionId: 'null',
        },
    };

    function updateMasterObject(objName, versionId, objVal, vFormat, cb) {
        const mKey = formatMasterKey(objName, vFormat);
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
                $set: { _id: mKey, value: objVal },
            },
            { upsert: true },
            err => {
                if (err) {
                    return cb(err);
                }
                return cb(null);
            });
    }

    /**
     * Sets the "deleted" property to true
     * @param {string} key object name
     * @param {Function} cb callback
     * @return {undefined}
     */
    function flagObjectForDeletion(key, cb) {
        collection.updateMany(
            { 'value.key': key },
            { $set: { 'value.deleted': true } },
            { upsert: false }, cb);
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

    variations.forEach(variation => {
        const itOnlyInV1 = variation.vFormat === 'v1' ? it : it.skip;
        describe(`vFormat : ${variation.vFormat}`, () => {
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
                    next => {
                        metadata.client.defaultBucketKeyFormat = variation.vFormat;
                        return next();
                    },
                    next => metadata.createBucket(BUCKET_NAME, bucketMD, logger, err => {
                        if (err) {
                            return next(err);
                        }
                        collection = metadata.client.getCollection(BUCKET_NAME);
                        return next();
                    }),
                    next => {
                        metadata.putObjectMD(BUCKET_NAME, params.objName, params.objVal,
                            versionParams, logger, (err, res) => {
                                if (err) {
                                    return next(err);
                                }
                                versionId1 = JSON.parse(res).versionId;
                                return next(null);
                            });
                    },
                    next => {
                        metadata.putObjectMD(BUCKET_NAME, params.objName, params.objVal,
                            versionParams, logger, (err, res) => {
                                if (err) {
                                    return next(err);
                                }
                                versionId2 = JSON.parse(res).versionId;
                                return next(null);
                            });
                    },
                ], done);
            });

            afterEach(done => {
                // reset params
                params = {
                    objName: 'pfx1-test-object',
                    objVal: {
                        key: 'pfx1-test-object',
                        versionId: 'null',
                    },
                };
                metadata.deleteBucket(BUCKET_NAME, logger, done);
            });

            it(`Should return latest version of object ${variation.it}`, done =>
                metadata.getObjectMD(BUCKET_NAME, params.objName, null, logger, (err, object) => {
                    assert.deepStrictEqual(err, null);
                    assert.strictEqual(object.key, params.objName);
                    assert.strictEqual(object.versionId, versionId2);
                    return done();
                }));

            it(`Should return the specified version of object ${variation.it}`, done =>
                metadata.getObjectMD(BUCKET_NAME, params.objName, { versionId: versionId1 }, logger, (err, object) => {
                    assert.deepStrictEqual(err, null);
                    assert.strictEqual(object.key, params.objName);
                    assert.strictEqual(object.versionId, versionId1);
                    return done();
                }));

            it(`Should throw error when version non existent ${variation.it}`, done => {
                const versionId = '1234567890';
                return metadata.getObjectMD(BUCKET_NAME, params.objName, { versionId }, logger, (err, object) => {
                    assert.deepStrictEqual(object, undefined);
                    assert.deepStrictEqual(err, errors.NoSuchKey);
                    return done();
                });
            });

            it(`Should throw error when object non existent ${variation.it}`, done => {
                const objName = 'non-existent-object';
                return metadata.getObjectMD(BUCKET_NAME, objName, null, logger, err => {
                    assert.deepStrictEqual(err, errors.NoSuchKey);
                    return done();
                });
            });

            it(`Should throw error when object non existent ${variation.it}`, done => {
                const bucketName = 'non-existent-bucket';
                return metadata.getObjectMD(bucketName, params.objName, null, logger, (err, object) => {
                    assert.deepStrictEqual(object, undefined);
                    assert.deepStrictEqual(err, errors.NoSuchKey);
                    return done();
                });
            });

            it(`Should return latest version when master is PHD ${variation.it}`, done => {
                async.series([
                    next => {
                        const objectName = variation.vFormat === 'v0' ? 'pfx1-test-object' : '\x7fMpfx1-test-object';
                        // adding isPHD flag to master
                        const phdVersionId = generateVersionId();
                        params.objVal.versionId = phdVersionId;
                        params.objVal.isPHD = true;
                        updateMasterObject(objectName, phdVersionId, params.objVal,
                            variation.vFormat, next);
                    },
                    // Should return latest object version
                    next => metadata.getObjectMD(BUCKET_NAME, params.objName, null, logger, (err, object) => {
                        assert.deepStrictEqual(err, null);
                        assert.strictEqual(object.key, params.objName);
                        assert.strictEqual(object.versionId, versionId2);
                        delete params.isPHD;
                        return next();
                    }),
                ], done);
            });

            it('Should fail to get an object tagged for deletion', done => {
                async.series([
                    next => flagObjectForDeletion(params.objName, next),
                    next => metadata.getObjectMD(BUCKET_NAME, params.objName, null, logger, (err, object) => {
                        assert.deepStrictEqual(object, undefined);
                        assert.deepStrictEqual(err, errors.NoSuchKey);
                        return next();
                    }),
                ], done);
            });

            itOnlyInV1(`Should return last version when master deleted ${variation.vFormat}`, done => {
                const versioningParams = {
                    versioning: true,
                    versionId: null,
                    repairMaster: null,
                };
                async.series([
                    // putting a delete marker as last version
                    next => {
                        params.versionId = null;
                        params.objVal.isDeleteMarker = true;
                        return metadata.putObjectMD(BUCKET_NAME, params.objName, params.objVal, versioningParams,
                            logger, next);
                    },
                    next => metadata.getObjectMD(BUCKET_NAME, params.objName, null, logger, (err, object) => {
                        assert.deepStrictEqual(err, null);
                        assert.strictEqual(object.key, params.objName);
                        assert.strictEqual(object.isDeleteMarker, true);
                        params.objVal.isDeleteMarker = null;
                        return next();
                    }),
                ], done);
            });
        });
    });
});
