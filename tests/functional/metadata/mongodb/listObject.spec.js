const async = require('async');
const assert = require('assert');
const werelogs = require('werelogs');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const logger = new werelogs.Logger('MongoClientInterface', 'debug', 'debug');
const BucketInfo = require('../../../../lib/models/BucketInfo').default;
const MetadataWrapper =
require('../../../../lib/storage/metadata/MetadataWrapper');
const { versioning } = require('../../../../index');
const { BucketVersioningKeyFormat } = versioning.VersioningConstants;

const IMPL_NAME = 'mongodb';
const DB_NAME = 'metadata';
const BUCKET_NAME = 'test-bucket';

const mongoserver = new MongoMemoryReplSet({
    debug: false,
    instanceOpts: [
        { port: 27020 },
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

describe('MongoClientInterface::metadata.listObject', () => {
    let metadata;
    let collection;

    /**
     * Puts multpile versions of an object
     * @param {String} bucketName bucket name
     * @param {String} objName object key
     * @param {Object} objVal object metadata
     * @param {Object} params versioning parameters
     * @param {number} versionNb number of versions to put
     * @param {Function} cb callback
     * @returns {undefined}
     */
    function putBulkObjectVersions(bucketName, objName, objVal, params, versionNb, cb) {
        let count = 0;
        async.whilst(
            () => count < versionNb,
            cbIterator => {
                count++;
                // eslint-disable-next-line
                return metadata.putObjectMD(bucketName, objName, objVal, params,
                    logger, cbIterator);
            }, cb);
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
                    replicaSetHosts: 'localhost:27020',
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
                        const params = {
                            objName: 'pfx1-test-object',
                            objVal: {
                                key: 'pfx1-test-object',
                                versionId: 'null',
                            },
                            nbVersions: 5,
                        };
                        putBulkObjectVersions(BUCKET_NAME, params.objName, params.objVal, versionParams,
                            params.nbVersions, next);
                    },
                    next => {
                        const params = {
                            objName: 'pfx2-test-object',
                            objVal: {
                                key: 'pfx2-test-object',
                                versionId: 'null',
                            },
                            nbVersions: 5,
                        };
                        putBulkObjectVersions(BUCKET_NAME, params.objName, params.objVal, versionParams,
                            params.nbVersions, next);
                    },
                    next => {
                        const params = {
                            objName: 'pfx3-test-object',
                            objVal: {
                                key: 'pfx3-test-object',
                                versionId: 'null',
                            },
                            nbVersions: 5,
                        };
                        putBulkObjectVersions(BUCKET_NAME, params.objName, params.objVal, versionParams,
                            params.nbVersions, next);
                    },
                ], done);
            });

            afterEach(done => {
                metadata.deleteBucket(BUCKET_NAME, logger, done);
            });

            it(`Should list master versions of objects ${variation.it}`, done => {
                const params = {
                    listingType: 'DelimiterMaster',
                    maxKeys: 100,
                };
                return metadata.listObject(BUCKET_NAME, params, logger, (err, data) => {
                    assert.deepStrictEqual(err, null);
                    assert.strictEqual(data.Contents.length, 3);
                    assert.strictEqual(data.Contents[0].key, 'pfx1-test-object');
                    assert.strictEqual(data.Contents[1].key, 'pfx2-test-object');
                    assert.strictEqual(data.Contents[2].key, 'pfx3-test-object');
                    return done();
                });
            });

            it(`Should truncate list of master versions of objects ${variation.it}`, done => {
                const params = {
                    listingType: 'DelimiterMaster',
                    maxKeys: 2,
                };
                return metadata.listObject(BUCKET_NAME, params, logger, (err, data) => {
                    assert.deepStrictEqual(err, null);
                    assert.strictEqual(data.Contents.length, 2);
                    assert.strictEqual(data.Contents[0].key, 'pfx1-test-object');
                    assert.strictEqual(data.Contents[1].key, 'pfx2-test-object');
                    return done();
                });
            });

            it(`Should list master versions of objects that start with prefix ${variation.it}`, done => {
                const bucketName = BUCKET_NAME;
                const params = {
                    listingType: 'DelimiterMaster',
                    maxKeys: 100,
                    prefix: 'pfx2',
                };
                return metadata.listObject(bucketName, params, logger, (err, data) => {
                    assert.deepStrictEqual(err, null);
                    assert.strictEqual(data.Contents.length, 1);
                    assert.strictEqual(data.Contents[0].key, 'pfx2-test-object');
                    return done();
                });
            });

            it(`Should return empty results when bucket non existent (master) ${variation.it}`, done => {
                const bucketName = 'non-existent-bucket';
                const params = {
                    listingType: 'DelimiterMaster',
                    maxKeys: 100,
                };
                return metadata.listObject(bucketName, params, logger, (err, data) => {
                    assert.deepStrictEqual(err, null);
                    assert(data);
                    assert.strictEqual(data.Contents.length, 0);
                    return done();
                });
            });

            it(`Should list all versions of objects ${variation.it}`, done => {
                const bucketName = BUCKET_NAME;
                const params = {
                    listingType: 'DelimiterVersions',
                    maxKeys: 1000,
                };
                const versionsPerKey = {};
                return metadata.listObject(bucketName, params, logger, (err, data) => {
                    assert.deepStrictEqual(err, null);
                    assert.strictEqual(data.Versions.length, 15);
                    data.Versions.forEach(version => {
                        versionsPerKey[version.key] = (versionsPerKey[version.key] || 0) + 1;
                    });
                    assert.strictEqual(versionsPerKey['pfx1-test-object'], 5);
                    assert.strictEqual(versionsPerKey['pfx2-test-object'], 5);
                    assert.strictEqual(versionsPerKey['pfx3-test-object'], 5);
                    return done();
                });
            });

            it(`Should truncate list of master versions of objects ${variation.it}`, done => {
                const params = {
                    listingType: 'DelimiterVersions',
                    maxKeys: 5,
                };
                const versionsPerKey = {};
                return metadata.listObject(BUCKET_NAME, params, logger, (err, data) => {
                    assert.deepStrictEqual(err, null);
                    assert.strictEqual(data.Versions.length, 5);
                    data.Versions.forEach(version => {
                        versionsPerKey[version.key] = (versionsPerKey[version.key] || 0) + 1;
                    });
                    assert.strictEqual(versionsPerKey['pfx1-test-object'], 5);
                    return done();
                });
            });

            it(`Should list versions of objects that start with prefix ${variation.it}`, done => {
                const params = {
                    listingType: 'DelimiterVersions',
                    maxKeys: 100,
                    prefix: 'pfx2',
                };
                const versionsPerKey = {};
                return metadata.listObject(BUCKET_NAME, params, logger, (err, data) => {
                    assert.deepStrictEqual(err, null);
                    assert.strictEqual(data.Versions.length, 5);
                    data.Versions.forEach(version => {
                        versionsPerKey[version.key] = (versionsPerKey[version.key] || 0) + 1;
                    });
                    assert.strictEqual(versionsPerKey['pfx2-test-object'], 5);
                    return done();
                });
            });

            it(`Should return empty results when bucket not existing (version) ${variation.it}`, done => {
                const bucketName = 'non-existent-bucket';
                const params = {
                    listingType: 'DelimiterVersions',
                    maxKeys: 100,
                };
                return metadata.listObject(bucketName, params, logger, (err, data) => {
                    assert.deepStrictEqual(err, null);
                    assert(data);
                    assert.strictEqual(data.Versions.length, 0);
                    return done();
                });
            });

            it(`Should check entire list with pagination (version) ${variation.it}`, done => {
                const versionsPerKey = {};
                const bucketName = BUCKET_NAME;
                const get = (maxKeys, keyMarker, versionIdMarker, cb) => metadata.listObject(bucketName, {
                    listingType: 'DelimiterVersions',
                    maxKeys,
                    keyMarker,
                    versionIdMarker,
                }, logger, (err, res) => {
                    if (err) {
                        return cb(err);
                    }
                    res.Versions.forEach(version => {
                        versionsPerKey[version.key] = (versionsPerKey[version.key] || 0) + 1;
                    });
                    if (res.IsTruncated) {
                        return get(maxKeys, res.NextKeyMarker, res.NextVersionIdMarker, cb);
                    }
                    return cb(null);
                });
                return get(3, null, null, err => {
                    assert.deepStrictEqual(err, null);
                    assert.strictEqual(Object.keys(versionsPerKey).length, 3);
                    assert.strictEqual(versionsPerKey['pfx1-test-object'], 5);
                    assert.strictEqual(versionsPerKey['pfx2-test-object'], 5);
                    assert.strictEqual(versionsPerKey['pfx3-test-object'], 5);
                    done();
                });
            });

            it(`Should not list phd master key when listing masters ${variation.it}`, done => {
                const objVal = {
                    key: 'pfx1-test-object',
                    versionId: 'null',
                };
                const versionParams = {
                    versioning: true,
                };
                const params = {
                    listingType: 'DelimiterMaster',
                    prefix: 'pfx1',
                };
                let versionId;
                let lastVersionId;
                async.series([
                    next => metadata.putObjectMD(BUCKET_NAME, 'pfx1-test-object', objVal, versionParams,
                        logger, (err, res) => {
                            if (err) {
                                return next(err);
                            }
                            versionId = JSON.parse(res).versionId;
                            return next(null);
                        }),
                    next => metadata.putObjectMD(BUCKET_NAME, 'pfx1-test-object', objVal, versionParams,
                        logger, (err, res) => {
                            if (err) {
                                return next(err);
                            }
                            lastVersionId = JSON.parse(res).versionId;
                            return next(null);
                        }),
                    // when deleting the last version of an object a PHD master is created
                    // and kept for 15s before it's repaired
                    next => metadata.deleteObjectMD(BUCKET_NAME, 'pfx1-test-object', { versionId: lastVersionId },
                        logger, next),
                    next => metadata.listObject(BUCKET_NAME, params, logger, (err, data) => {
                        assert.ifError(err);
                        assert.strictEqual(data.Contents[0].value.VersionId, versionId);
                        return next();
                    }),
                ], done);
            });

            it(`Should not list phd master key when listing versions ${variation.it}`, done => {
                const objVal = {
                    key: 'pfx1-test-object',
                    versionId: 'null',
                };
                const versionParams = {
                    versioning: true,
                };
                const params = {
                    listingType: 'DelimiterVersions',
                    prefix: 'pfx1',
                };
                let lastVersionId;
                let versionIds;
                async.series([
                    next => metadata.listObject(BUCKET_NAME, params, logger, (err, data) => {
                        assert.ifError(err);
                        assert.strictEqual(data.Versions.length, 5);
                        versionIds = data.Versions.map(version => version.VersionId);
                        return next();
                    }),
                    next => metadata.putObjectMD(BUCKET_NAME, 'pfx1-test-object', objVal, versionParams,
                        logger, (err, res) => {
                            if (err) {
                                return next(err);
                            }
                            lastVersionId = JSON.parse(res).versionId;
                            return next(null);
                        }),
                    // when deleting the last version of an object a PHD master is created
                    // and kept for 15s before it's repaired
                    next => metadata.deleteObjectMD(BUCKET_NAME, 'pfx1-test-object', { versionId: lastVersionId },
                        logger, next),
                    next => metadata.listObject(BUCKET_NAME, params, logger, (err, data) => {
                        assert.ifError(err);
                        const newVersionIds = data.Versions.map(version => version.VersionId);
                        assert.strictEqual(data.Versions.length, 5);
                        assert(versionIds.every(version => newVersionIds.includes(version)));
                        return next();
                    }),
                ], done);
            });

            it('Should not list objects tagged for deletion (master keys)', done => {
                const objVal = {
                    key: 'pfx4-test-object',
                };
                const versionParams = {
                    versioning: true,
                };
                const params = {
                    listingType: 'DelimiterMaster',
                };
                async.series([
                    next => metadata.putObjectMD(BUCKET_NAME, objVal.key, objVal, versionParams,
                        logger, next),
                    next => flagObjectForDeletion(objVal.key, next),
                    next => metadata.listObject(BUCKET_NAME, params, logger, (err, data) => {
                        assert.ifError(err);
                        assert.strictEqual(data.Contents.length, 3);
                        const listedObjectNames = data.Contents.map(x => x.key);
                        assert(!listedObjectNames.includes(objVal.key));
                        return next();
                    }),
                ], done);
            });

            it('Should not list objects tagged for deletion (version keys)', done => {
                const objVal = {
                    key: 'pfx4-test-object',
                };
                const versionParams = {
                    versioning: true,
                };
                const params = {
                    listingType: 'DelimiterVersions',
                };
                async.series([
                    next => metadata.putObjectMD(BUCKET_NAME, objVal.key, objVal, versionParams,
                        logger, next),
                    next => flagObjectForDeletion(objVal.key, next),
                    next => metadata.listObject(BUCKET_NAME, params, logger, (err, data) => {
                        assert.ifError(err);
                        assert.strictEqual(data.Versions.length, 15);
                        const listedObjectNames = data.Versions.map(x => x.key);
                        assert(!listedObjectNames.includes(objVal.key));
                        return next();
                    }),
                ], done);
            });
        });
    });
});
