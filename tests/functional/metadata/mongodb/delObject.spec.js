const async = require('async');
const assert = require('assert');
const sinon = require('sinon');
const werelogs = require('werelogs');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { errors, versioning } = require('../../../../index');
const logger = new werelogs.Logger('MongoClientInterface', 'debug', 'debug');
const BucketInfo = require('../../../../lib/models/BucketInfo');
const MetadataWrapper =
    require('../../../../lib/storage/metadata/MetadataWrapper');
const genVID = require('../../../../lib/versioning/VersionID').generateVersionId;
const { BucketVersioningKeyFormat } = versioning.VersioningConstants;

const IMPL_NAME = 'mongodb';
const DB_NAME = 'metadata';
const BUCKET_NAME = 'test-bucket';
const replicationGroupId = 'RG001';

const mongoserver = new MongoMemoryReplSet({
    debug: false,
    instanceOpts: [
        { port: 27018 },
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
describe('MongoClientInterface::metadata.deleteObjectMD', () => {
    let metadata;
    let collection;

    function getObjectCount(cb) {
        collection.countDocuments((err, count) => {
            if (err) {
                cb(err);
            }
            cb(null, count);
        });
    }

    function getObject(key, cb) {
        collection.findOne({
            _id: key,
        }, {}, (err, doc) => {
            if (err) {
                return cb(err);
            }
            if (!doc) {
                return cb(errors.NoSuchKey);
            }
            return cb(null, doc.value);
        });
    }

    beforeAll(done => {
        mongoserver.waitUntilRunning().then(() => {
            const opts = {
                mongodb: {
                    replicaSetHosts: 'localhost:27018',
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
                ], done);
            });

            afterEach(done => {
                metadata.deleteBucket(BUCKET_NAME, logger, done);
            });

            it(`Should delete non versioned object ${variation.vFormat}`, done => {
                const params = {
                    objName: 'non-deleted-object',
                    objVal: {
                        key: 'non-deleted-object',
                        versionId: 'null',
                    },
                };
                const versionParams = {
                    versioning: false,
                    versionId: null,
                    repairMaster: null,
                };
                return async.series([
                    next => {
                        // we put the master version of object
                        metadata.putObjectMD(BUCKET_NAME, params.objName, params.objVal,
                            versionParams, logger, next);
                    },
                    next => {
                        // we put the master version of a second object
                        params.objName = 'object-to-deleted';
                        params.objVal.key = 'object-to-deleted';
                        metadata.putObjectMD(BUCKET_NAME, params.objName, params.objVal,
                            versionParams, logger, next);
                    },
                    next => {
                        // We delete the first object
                        metadata.deleteObjectMD(BUCKET_NAME, params.objName, null, logger, next);
                    },
                    next => {
                        // Object must be removed
                        metadata.getObjectMD(BUCKET_NAME, params.objName, null, logger, err => {
                            expect(err.is.NoSuchKey).toBeTruthy();
                            return next();
                        });
                    },
                    next => {
                        // only 1 object remaining in db
                        getObjectCount((err, count) => {
                            assert.deepStrictEqual(err, null);
                            assert.strictEqual(count, 1);
                            return next();
                        });
                    },
                ], done);
            });

            it(`Should not throw error when object non existent ${variation.vFormat}`, done => {
                const objName = 'non-existent-object';
                metadata.deleteObjectMD(BUCKET_NAME, objName, null, logger, err => {
                    assert.deepStrictEqual(err, null);
                    return done();
                });
            });

            it(`Should not throw error when bucket non existent ${variation.vFormat}`, done => {
                const objName = 'non-existent-object';
                metadata.deleteObjectMD(BUCKET_NAME, objName, null, logger, err => {
                    assert.deepStrictEqual(err, null);
                    return done();
                });
            });

            it(`Master should not be updated when non lastest version is deleted ${variation.vFormat}`, done => {
                let versionId1 = null;
                const params = {
                    objName: 'test-object',
                    objVal: {
                        key: 'test-object',
                        versionId: 'null',
                    },
                    vFormat: 'v0',
                };
                const versionParams = {
                    versioning: true,
                    versionId: null,
                    repairMaster: null,
                };
                return async.series([
                    next => {
                        // we start by creating a new version and master
                        versionId1 = generateVersionId(this.replicationGroupId);
                        params.versionId = versionId1;
                        params.objVal.versionId = versionId1;
                        versionParams.versionId = versionId1;
                        metadata.putObjectMD(BUCKET_NAME, params.objName, params.objVal,
                            versionParams, logger, next);
                    },
                    next => {
                        // we create a second version of the same object (master is updated)
                        params.objVal.versionId = 'version2';
                        versionParams.versionId = null;
                        metadata.putObjectMD(BUCKET_NAME, params.objName, params.objVal,
                            versionParams, logger, next);
                    },
                    next => {
                        // we delete the first version
                        metadata.deleteObjectMD(BUCKET_NAME, params.objName, { versionId: versionId1 },
                            logger, next);
                    },
                    next => {
                        // the first version should no longer be available
                        metadata.getObjectMD(BUCKET_NAME, params.objName, { versionId: versionId1 }, logger, err => {
                            expect(err.is.NoSuchKey).toBeTruthy();
                            return next();
                        });
                    },
                    next => {
                        // master must be containing second version metadata
                        metadata.getObjectMD(BUCKET_NAME, params.objName, null, logger, (err, data) => {
                            assert.deepStrictEqual(err, null);
                            assert.notStrictEqual(data.versionId, versionId1);
                            return next();
                        });
                    },
                    next => {
                        // master and one version remaining in db
                        getObjectCount((err, count) => {
                            assert.deepStrictEqual(err, null);
                            assert.strictEqual(count, 2);
                            return next();
                        });
                    },
                ], done);
            });

            it(`Master should be updated when last version is deleted ${variation.vFormat}`, done => {
                let versionId1;
                let versionId2;

                const params = {
                    objName: 'test-object',
                    objVal: {
                        key: 'test-object',
                        versionId: 'null',
                        isLast: false,
                    },
                };
                const versionParams = {
                    versioning: true,
                    versionId: null,
                    repairMaster: null,
                };
                return async.series([
                    next => {
                        // we start by creating a new version and master
                        versionId1 = generateVersionId(this.replicationGroupId);
                        params.versionId = versionId1;
                        params.objVal.versionId = versionId1;
                        versionParams.versionId = versionId1;
                        metadata.putObjectMD(BUCKET_NAME, params.objName, params.objVal,
                            versionParams, logger, next);
                    },
                    next => {
                        // we create a second version of the same object (master is updated)
                        // params.objVal.versionId = 'version2';
                        // versionParams.versionId = null;
                        versionId2 = generateVersionId(this.replicationGroupId);
                        params.versionId = versionId2;
                        params.objVal.versionId = versionId2;
                        versionParams.versionId = versionId2;
                        metadata.putObjectMD(BUCKET_NAME, params.objName, params.objVal,
                            versionParams, logger, next);
                    },
                    next => {
                        // deleting latest version
                        metadata.deleteObjectMD(BUCKET_NAME, params.objName, { versionId: versionId2 },
                            logger, next);
                    },
                    next => {
                        // latest version must be removed
                        metadata.getObjectMD(BUCKET_NAME, params.objName, { versionId: versionId2 }, logger, err => {
                            expect(err.is.NoSuchKey).toBeTruthy();
                            return next();
                        });
                    },
                    next => {
                        // master must be updated to contain first version data
                        metadata.getObjectMD(BUCKET_NAME, params.objName, null, logger, (err, data) => {
                            assert.deepStrictEqual(err, null);
                            assert.strictEqual(data.versionId, versionId1);
                            return next();
                        });
                    },
                    next => {
                        // one master and version in the db
                        getObjectCount((err, count) => {
                            assert.deepStrictEqual(err, null);
                            assert.strictEqual(count, 2);
                            return next();
                        });
                    },
                ], done);
            });

            it(`Should fail when version id non existent ${variation.vFormat}`, done => {
                const versionId = generateVersionId(this.replicationGroupId);
                const objName = 'test-object';
                metadata.deleteObjectMD(BUCKET_NAME, objName, { versionId }, logger, err => {
                    expect(err.is.NoSuchKey).toBeTruthy();
                    return done();
                });
            });

            itOnlyInV1(`Should create master when delete marker removed ${variation.vFormat}`, done => {
                const objVal = {
                    key: 'test-object',
                    isDeleteMarker: false,
                };
                const params = {
                    versioning: true,
                    versionId: null,
                    repairMaster: null,
                };
                let firstVersionVersionId;
                let deleteMarkerVersionId;
                async.series([
                    // We first create a new version and master
                    next => metadata.putObjectMD(BUCKET_NAME, 'test-object', objVal, params, logger, (err, res) => {
                        if (err) {
                            return next(err);
                        }
                        firstVersionVersionId = JSON.parse(res).versionId;
                        return next();
                    }),
                    // putting a delete marker as last version
                    next => {
                        objVal.isDeleteMarker = true;
                        params.versionId = null;
                        return metadata.putObjectMD(BUCKET_NAME, 'test-object', objVal, params, logger, (err, res) => {
                            if (err) {
                                return next(err);
                            }
                            deleteMarkerVersionId = JSON.parse(res).versionId;
                            return next();
                        });
                    },
                    next => {
                        // using fake clock to override the setTimeout used by the repair
                        const clock = sinon.useFakeTimers();
                        return metadata.deleteObjectMD(BUCKET_NAME, 'test-object', { versionId: deleteMarkerVersionId },
                            logger, () => {
                                // running the repair callback
                                clock.runAll();
                                clock.restore();
                                return next();
                            });
                    },
                    // waiting for the repair callback to finish
                    next => setTimeout(next, 100),
                    // master should be created
                    next => {
                        getObject('\x7fMtest-object', (err, object) => {
                            assert.deepStrictEqual(err, null);
                            assert.strictEqual(object.key, 'test-object');
                            assert.strictEqual(object.versionId, firstVersionVersionId);
                            assert.strictEqual(object.isDeleteMarker, false);
                            return next();
                        });
                    },
                ], done);
            });

            itOnlyInV1(`Should delete master when delete marker becomes last version ${variation.vFormat}`, done => {
                const objVal = {
                    key: 'test-object',
                    isDeleteMarker: false,
                };
                const params = {
                    versioning: true,
                    versionId: null,
                    repairMaster: null,
                };
                let versionId;
                async.series([
                    // We first create a new version and master
                    next => metadata.putObjectMD(BUCKET_NAME, 'test-object', objVal, params, logger, next),
                    // putting a delete marker as last version
                    next => {
                        objVal.isDeleteMarker = true;
                        params.versionId = null;
                        return metadata.putObjectMD(BUCKET_NAME, 'test-object', objVal, params, logger, next);
                    },
                    // putting new version on top of delete marker
                    next => {
                        objVal.isDeleteMarker = false;
                        return metadata.putObjectMD(BUCKET_NAME, 'test-object', objVal, params, logger, (err, res) => {
                            if (err) {
                                return next(err);
                            }
                            versionId = JSON.parse(res).versionId;
                            return next();
                        });
                    },
                    next => {
                        // using fake clock to override the setTimeout used by the repair
                        const clock = sinon.useFakeTimers();
                        return metadata.deleteObjectMD(BUCKET_NAME, 'test-object', { versionId },
                            logger, () => {
                                // running the repair callback
                                clock.runAll();
                                clock.restore();
                                return next();
                            });
                    },
                    // waiting for the repair callback to finish
                    next => setTimeout(next, 100),
                    // master must be deleted
                    next => {
                        getObject('\x7fMtest-object', err => {
                            expect(err.is.NoSuchKey).toBeTruthy();
                            return next();
                        });
                    },
                ], done);
            });
        });
    });
});
