const async = require('async');
const assert = require('assert');
const werelogs = require('werelogs');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { errors, versioning } = require('../../../../index');
const logger = new werelogs.Logger('MongoClientInterface', 'debug', 'debug');
const BucketInfo = require('../../../../lib/models/BucketInfo');
const MetadataWrapper =
    require('../../../../lib/storage/metadata/MetadataWrapper');
const { BucketVersioningKeyFormat } = versioning.VersioningConstants;

const IMPL_NAME = 'mongodb';
const DB_NAME = 'metadata';
const BUCKET_NAME = 'test-bucket';
const OBJECT_NAME = 'test-object';
const VERSION_ID = '98451712418844999999RG001  22019.0';

const mongoserver = new MongoMemoryReplSet({
    debug: false,
    instanceOpts: [
        { port: 27021 },
    ],
    replSet: {
        name: 'rs0',
        count: 1,
        DB_NAME,
        storageEngine: 'ephemeralForTest',
    },
});

const variations = [
    { it: '(v0)', vFormat: BucketVersioningKeyFormat.v0 },
    { it: '(v1)', vFormat: BucketVersioningKeyFormat.v1 },
];

describe('MongoClientInterface:metadata.putObjectMD', () => {
    let metadata;
    let collection;

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

    function getObjectCount(cb) {
        collection.countDocuments((err, count) => {
            if (err) {
                cb(err);
            }
            cb(null, count);
        });
    }

    beforeAll(done => {
        mongoserver.waitUntilRunning().then(() => {
            const opts = {
                mongodb: {
                    replicaSetHosts: 'localhost:27021',
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

            it(`Should put a new non versionned object ${variation.it}`, done => {
                const objVal = {
                    key: OBJECT_NAME,
                    versionId: 'null',
                    updated: false,
                };
                const params = {
                    versioning: null,
                    versionId: null,
                    repairMaster: null,
                };
                async.series([
                    next => metadata.putObjectMD(BUCKET_NAME, OBJECT_NAME, objVal, params, logger, next),
                    next => {
                        const key = variation.vFormat === 'v0' ? 'test-object' : '\x7fMtest-object';
                        getObject(key, (err, object) => {
                            assert.deepStrictEqual(err, null);
                            assert.strictEqual(object.key, OBJECT_NAME);
                            return next();
                        });
                    },
                    // When versionning not active only one document is created (master)
                    next => getObjectCount((err, count) => {
                        assert.deepStrictEqual(err, null);
                        assert.strictEqual(count, 1);
                        return next();
                    }),
                ], done);
            });

            it(`Should update the metadata ${variation.it}`, done => {
                const objVal = {
                    key: OBJECT_NAME,
                    versionId: 'null',
                    updated: false,
                };
                const params = {
                    versioning: null,
                    versionId: null,
                    repairMaster: null,
                };
                async.series([
                    next => metadata.putObjectMD(BUCKET_NAME, OBJECT_NAME, objVal, params, logger, next),
                    next => {
                        objVal.updated = true;
                        metadata.putObjectMD(BUCKET_NAME, OBJECT_NAME, objVal, params, logger, next);
                    },
                    // object metadata must be updated
                    next => {
                        const key = variation.vFormat === 'v0' ? 'test-object' : '\x7fMtest-object';
                        getObject(key, (err, object) => {
                            assert.deepStrictEqual(err, null);
                            assert.strictEqual(object.key, OBJECT_NAME);
                            assert.strictEqual(object.updated, true);
                            return next();
                        });
                    },
                    // Only a master version should be created
                    next => getObjectCount((err, count) => {
                        assert.deepStrictEqual(err, null);
                        assert.strictEqual(count, 1);
                        return next();
                    }),
                ], done);
            });

            it(`Should put versionned object with the specific versionId ${variation.it}`, done => {
                const objVal = {
                    key: OBJECT_NAME,
                    versionId: VERSION_ID,
                    updated: false,
                };
                const params = {
                    versioning: true,
                    versionId: VERSION_ID,
                    repairMaster: null,
                };
                async.series([
                    next => metadata.putObjectMD(BUCKET_NAME, OBJECT_NAME, objVal, params, logger, next),
                    // checking if metadata corresponds to what was given to the function
                    next => {
                        const key = variation.vFormat === 'v0' ? 'test-object' : '\x7fMtest-object';
                        getObject(key, (err, object) => {
                            assert.deepStrictEqual(err, null);
                            assert.strictEqual(object.key, OBJECT_NAME);
                            assert.strictEqual(object.versionId, VERSION_ID);
                            return next();
                        });
                    },
                    // We'll have one master and one version
                    next => getObjectCount((err, count) => {
                        assert.deepStrictEqual(err, null);
                        assert.strictEqual(count, 2);
                        return next();
                    }),
                ], done);
            });

            it(`Should put new version and update master ${variation.it}`, done => {
                const objVal = {
                    key: OBJECT_NAME,
                    versionId: VERSION_ID,
                    updated: false,
                };
                const params = {
                    versioning: true,
                    versionId: null,
                    repairMaster: null,
                };
                let versionId = null;

                async.series([
                    // We first create a master and a version
                    next => metadata.putObjectMD(BUCKET_NAME, OBJECT_NAME, objVal, params, logger, (err, data) => {
                        assert.deepStrictEqual(err, null);
                        versionId = JSON.parse(data).versionId;
                        return next();
                    }),
                    // We put another version of the object
                    next => metadata.putObjectMD(BUCKET_NAME, OBJECT_NAME, objVal, params, logger, next),
                    // Master must be updated
                    next => {
                        const key = variation.vFormat === 'v0' ? 'test-object' : '\x7fMtest-object';
                        getObject(key, (err, object) => {
                            assert.deepStrictEqual(err, null);
                            assert.strictEqual(object.key, OBJECT_NAME);
                            assert.notStrictEqual(object.versionId, versionId);
                            return next();
                        });
                    },
                    // we'll have two versions and one master
                    next => getObjectCount((err, count) => {
                        assert.deepStrictEqual(err, null);
                        assert.strictEqual(count, 3);
                        return next();
                    }),
                ], done);
            });

            it(`Should update master when versionning is disabled ${variation.it}`, done => {
                const objVal = {
                    key: OBJECT_NAME,
                    versionId: VERSION_ID,
                    updated: false,
                };
                const params = {
                    versioning: true,
                    versionId: null,
                    repairMaster: null,
                };
                let versionId = null;
                async.series([
                    // We first create a new version and master
                    next => metadata.putObjectMD(BUCKET_NAME, OBJECT_NAME, objVal, params, logger, (err, data) => {
                        assert.deepStrictEqual(err, null);
                        versionId = JSON.parse(data).versionId;
                        return next();
                    }),
                    next => {
                        // Disabling versionning and putting new version
                        params.versioning = false;
                        params.versionId = '';
                        return metadata.putObjectMD(BUCKET_NAME, OBJECT_NAME, objVal, params, logger, next);
                    },
                    // Master must be updated
                    next => {
                        const key = variation.vFormat === 'v0' ? 'test-object' : '\x7fMtest-object';
                        getObject(key, (err, object) => {
                            assert.deepStrictEqual(err, null);
                            assert.strictEqual(object.key, OBJECT_NAME);
                            assert.notStrictEqual(object.versionId, versionId);
                            return next();
                        });
                    },
                    // The second put shouldn't create a new version
                    next => getObjectCount((err, count) => {
                        assert.deepStrictEqual(err, null);
                        assert.strictEqual(count, 2);
                        return next();
                    }),
                ], done);
            });

            it(`Should update latest version and repair master ${variation.it}`, done => {
                const objVal = {
                    key: OBJECT_NAME,
                    versionId: VERSION_ID,
                    updated: false,
                };
                const params = {
                    versioning: true,
                    versionId: VERSION_ID,
                    repairMaster: null,
                };
                async.series([
                    // We first create a new version and master
                    next => metadata.putObjectMD(BUCKET_NAME, OBJECT_NAME, objVal, params, logger, next),
                    next => {
                        // Updating the version and repairing master
                        params.repairMaster = true;
                        objVal.updated = true;
                        return metadata.putObjectMD(BUCKET_NAME, OBJECT_NAME, objVal, params, logger, next);
                    },
                    // Master must be updated
                    next => {
                        const key = variation.vFormat === 'v0' ? 'test-object' : '\x7fMtest-object';
                        getObject(key, (err, object) => {
                            assert.deepStrictEqual(err, null);
                            assert.strictEqual(object.key, OBJECT_NAME);
                            assert.strictEqual(object.versionId, VERSION_ID);
                            assert.strictEqual(object.updated, true);
                            return next();
                        });
                    },
                    // The second put shouldn't create a new version
                    next => getObjectCount((err, count) => {
                        assert.deepStrictEqual(err, null);
                        assert.strictEqual(count, 2);
                        return next();
                    }),
                ], done);
            });

            itOnlyInV1(`Should delete master when last version is delete marker ${variation.it}`, done => {
                const objVal = {
                    key: OBJECT_NAME,
                    versionId: VERSION_ID,
                    updated: false,
                    isDeleteMarker: false,
                };
                const params = {
                    versioning: true,
                    versionId: VERSION_ID,
                    repairMaster: null,
                };
                async.series([
                    // We first create a new version and master
                    next => metadata.putObjectMD(BUCKET_NAME, OBJECT_NAME, objVal, params, logger, next),
                    // putting a delete marker as last version
                    next => {
                        objVal.isDeleteMarker = true;
                        params.versionId = null;
                        return metadata.putObjectMD(BUCKET_NAME, OBJECT_NAME, objVal, params, logger, next);
                    },
                    // master must be deleted
                    next => getObject('\x7fMtest-object', err => {
                        expect(err.is.NoSuchKey).toBeTruthy();
                        return next();
                    }),
                ], done);
            });

            itOnlyInV1(`Should create master when new version is put on top of delete marker ${variation.it}`, done => {
                const objVal = {
                    key: OBJECT_NAME,
                    versionId: VERSION_ID,
                    updated: false,
                    isDeleteMarker: false,
                };
                const params = {
                    versioning: true,
                    versionId: VERSION_ID,
                    repairMaster: null,
                };
                async.series([
                    // We first create a new version and master
                    next => metadata.putObjectMD(BUCKET_NAME, OBJECT_NAME, objVal, params, logger, next),
                    // putting a delete marker as last version
                    next => {
                        objVal.isDeleteMarker = true;
                        params.versionId = null;
                        return metadata.putObjectMD(BUCKET_NAME, OBJECT_NAME, objVal, params, logger, next);
                    },
                    // We put a new version on top of delete marker
                    next => {
                        objVal.isDeleteMarker = false;
                        objVal.updated = true;
                        return metadata.putObjectMD(BUCKET_NAME, OBJECT_NAME, objVal, params, logger, next);
                    },
                    // master must be created
                    next => getObject('\x7fMtest-object', (err, object) => {
                        assert.deepStrictEqual(err, null);
                        assert.strictEqual(object.key, OBJECT_NAME);
                        assert.strictEqual(object.updated, true);
                        assert.strictEqual(object.isDeleteMarker, false);
                        return next();
                    }),
                ], done);
            });
        });
    });
});
