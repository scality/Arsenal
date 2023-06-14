const async = require('async');
const assert = require('assert');
const werelogs = require('werelogs');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { versioning } = require('../../../../index');
const logger = new werelogs.Logger('MongoClientInterface', 'debug', 'debug');
const BucketInfo = require('../../../../lib/models/BucketInfo').default;
const MetadataWrapper =
    require('../../../../lib/storage/metadata/MetadataWrapper');
const genVID = versioning.VersionID.generateVersionId;
const { BucketVersioningKeyFormat } = versioning.VersioningConstants;
const { formatMasterKey, formatVersionKey } = require('../../../../lib/storage/metadata/mongoclient/utils');

const IMPL_NAME = 'mongodb';
const DB_NAME = 'metadata';
const BUCKET_NAME = 'test-bucket-batching';
const replicationGroupId = 'RG001';
const N = 10;

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
    { it: '(v0)', vFormat: BucketVersioningKeyFormat.v0, versioning: false },
    { it: '(v0)', vFormat: BucketVersioningKeyFormat.v0, versioning: true },
    { it: '(v1)', vFormat: BucketVersioningKeyFormat.v1, versioning: false },
    { it: '(v1)', vFormat: BucketVersioningKeyFormat.v1, versioning: true },
];

describe('MongoClientInterface::metadata.getObjectsMD', () => {
    let metadata;
    let collection;
    let versionId2;

    const params = {
        key: 'pfx1-test-object',
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
            { upsert: true }).then(() => cb(null)).catch(err => cb(err));
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
            { upsert: false }).then(() => cb()).catch(err => cb(err));
    }

    beforeAll(done => {
        mongoserver.start().then(() => {
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
        const itOnlyInV1 = variation.vFormat === 'v1' && variation.versioning ? it : it.skip;
        describe(`vFormat : ${variation.vFormat}, versioning: ${variation.versioning}`, () => {
            let paramsArr = [];

            beforeEach(done => {
                // reset params
                paramsArr = Array.from({ length: N }, (_, i) => ({
                    key: `pfx1-test-object${i + 1}`,
                    objVal: {
                        key: `pfx1-test-object${i + 1}`,
                        versionId: 'null',
                    },
                }));
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
                    versioning: variation.versioning,
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
                        async.eachSeries(paramsArr, (params, eachCb) => {
                            metadata.putObjectMD(BUCKET_NAME, params.key, params.objVal,
                                versionParams, logger, (err, res) => {
                                    if (err) {
                                        return eachCb(err);
                                    }
                                    if (variation.versioning) {
                                        // eslint-disable-next-line no-param-reassign
                                        params.versionId = JSON.parse(res).versionId;
                                    }
                                    return eachCb(null);
                                });
                        }, next);
                    },
                    next => {
                        metadata.putObjectMD(BUCKET_NAME, paramsArr[N - 1].key, paramsArr[N - 1].objVal,
                            versionParams, logger, (err, res) => {
                                if (err) {
                                    return next(err);
                                }
                                if (variation.versioning) {
                                    versionId2 = JSON.parse(res).versionId;
                                } else {
                                    versionId2 = 'null';
                                }
                                return next(null);
                            });
                    },
                ], done);
            });

            afterEach(done => {
                metadata.deleteBucket(BUCKET_NAME, logger, done);
            });

            it(`should get ${N} objects${variation.versioning ? '' : ' master'} versions using batching`, done => {
                const request = paramsArr.map(({ key, objVal }) => ({
                    key,
                    params: {
                        versionId: variation.versioning ? objVal.versionId : null,
                    },
                }));
                metadata.getObjectsMD(BUCKET_NAME, request, logger, (err, objects) => {
                    assert.strictEqual(err, null);
                    assert.strictEqual(objects.length, N);
                    objects.forEach((obj, i) => {
                        assert.strictEqual(obj.doc.key, paramsArr[i].key);
                        if (variation.versioning) {
                            assert.strictEqual(obj.doc.versionId, paramsArr[i].objVal.versionId);
                        }
                    });
                    return done();
                });
            });

            it('should not throw an error if object or version is inexistent and return null doc', done => {
                const request = [{
                    key: 'nonexistent',
                    params: {
                        versionId: variation.versioning ? 'nonexistent' : null,
                    },
                }];
                metadata.getObjectsMD(BUCKET_NAME, request, logger, (err, objects) => {
                    assert.strictEqual(err, null);
                    assert.strictEqual(objects.length, 1);
                    assert.strictEqual(objects[0].doc, null);
                    done();
                });
            });

            it(`should return latest version when master is PHD ${variation.it}`, done => {
                if (!variation.versioning) {
                    return done();
                }
                const request = paramsArr.map(({ key, objVal }) => ({
                    key,
                    params: {
                        versionId: variation.versioning ? objVal.versionId : null,
                    },
                }));
                return async.series([
                    next => {
                        let objectName = null;
                        if (variations.versioning) {
                            objectName =
                                formatVersionKey(paramsArr[N - 1].key, paramsArr[N - 1].versionId, variation.vFormat);
                        } else {
                            objectName = formatMasterKey(paramsArr[N - 1].key, variation.vFormat);
                        }
                        // adding isPHD flag to master
                        const phdVersionId = generateVersionId();
                        paramsArr[N - 1].objVal.versionId = phdVersionId;
                        paramsArr[N - 1].objVal.isPHD = true;
                        updateMasterObject(objectName, phdVersionId, paramsArr[N - 1].objVal,
                            variation.vFormat, next);
                    },
                    // Should return latest object version
                    next => metadata.getObjectsMD(BUCKET_NAME, request, logger, (err, objects) => {
                        assert.deepStrictEqual(err, null);
                        objects.forEach((obj, i) => {
                            assert.strictEqual(obj.doc.key, paramsArr[i].objVal.key);
                            if (variation.versioning && i === N - 1) {
                                assert.strictEqual(obj.doc.versionId, versionId2);
                            } else {
                                assert.strictEqual(obj.doc.versionId, paramsArr[i].objVal.versionId);
                            }
                        });
                        delete params.isPHD;
                        return next();
                    }),
                ], done);
            });

            it('should fail to get an object tagged for deletion', done => {
                const key = paramsArr[0].key;
                flagObjectForDeletion(key, err => {
                    assert(err);
                    metadata.getObjectsMD(BUCKET_NAME, [{ key }], logger, (err, object) => {
                        assert.strictEqual(err, null);
                        assert.strictEqual(object[0].doc, null);
                        done();
                    });
                });
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
                        paramsArr[0].versionId = null;
                        paramsArr[0].objVal.isDeleteMarker = true;
                        return metadata.putObjectMD(BUCKET_NAME, paramsArr[0].key, paramsArr[0].objVal,
                            versioningParams, logger, next);
                    },
                    next => metadata.getObjectsMD(BUCKET_NAME, [{ key: paramsArr[0].key }], logger, (err, objects) => {
                        assert.strictEqual(err, null);
                        assert.strictEqual(objects[0].doc.key, paramsArr[0].key);
                        assert.strictEqual(objects[0].doc.isDeleteMarker, true);
                        paramsArr[0].objVal.isDeleteMarker = null;
                        return next();
                    }),
                ], done);
            });
        });
    });
});
