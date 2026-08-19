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

const IMPL_NAME = 'mongodb';
const DB_NAME = 'metadata';
const BUCKET_NAME = 'test-bucket';
const replicationGroupId = 'RG001';

const LOCAL_LOCATION = 'us-east-1';
const SOURCE_LOCATION = 'dr-source';

const locationConstraints = {
    [LOCAL_LOCATION]: { isCRR: false },
    [SOURCE_LOCATION]: { isCRR: true },
};

const mongoserver = new MongoMemoryReplSet({
    debug: false,
    instanceOpts: [
        { port: 27019 },
    ],
    replSet: {
        name: 'rs0',
        count: 1,
        DB_NAME,
        storageEngine: 'wiredTiger',
    },
});

let uidCounter = 0;
function generateVersionId() {
    return genVID(`${process.pid}.${uidCounter++}`, replicationGroupId);
}

const variations = [
    { it: '(v0)', vFormat: BucketVersioningKeyFormat.v0 },
    { it: '(v1)', vFormat: BucketVersioningKeyFormat.v1 },
];

describe('MongoClientInterface::clean read', () => {
    let metadata;

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
        _locationConstraint: LOCAL_LOCATION,
        _readLocationConstraint: null,
        _cors: null,
        _replicationConfiguration: null,
        _lifecycleConfiguration: null,
        _uid: '',
        _isNFS: null,
        ingestion: null,
    });

    /**
     * Writes a version of an object, as the clean-room metadata processor
     * would: the data location is the source location until the data is
     * copied locally.
     * @param {String} objName - object key
     * @param {String} dataStoreName - location of the version data
     * @param {Object} [extraMD] - additional object metadata fields
     * @param {Function} cb - callback(err, versionId)
     * @return {undefined}
     */
    function putVersion(objName, dataStoreName, extraMD, cb) {
        const objVal = Object.assign({
            key: objName,
            dataStoreName,
            'last-modified': new Date().toJSON(),
        }, extraMD);
        const versionParams = {
            versioning: true,
            versionId: null,
            repairMaster: null,
        };
        return metadata.putObjectMD(BUCKET_NAME, objName, objVal, versionParams, logger, (err, res) => {
            if (err) {
                return cb(err);
            }
            return cb(null, JSON.parse(res).versionId);
        });
    }

    function listMasters(cleanRead, cb) {
        return metadata.client.listObject(
            BUCKET_NAME,
            { listingType: 'DelimiterMaster', maxKeys: 100, cleanRead },
            logger,
            cb,
        );
    }

    function listVersions(cleanRead, cb) {
        return metadata.client.listObject(
            BUCKET_NAME,
            { listingType: 'DelimiterVersions', maxKeys: 100, cleanRead },
            logger,
            cb,
        );
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
                    getLocationConstraints: () => locationConstraints,
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
        describe(`vFormat : ${variation.vFormat}`, () => {
            // 'pfx-localized': both versions localized
            // 'pfx-mixed': older version localized, newest one not
            // 'pfx-nonlocalized': single, non-localized version
            // 'pfx-deletemarker': localized version, hidden by a delete marker
            let localizedV1;
            let mixedLocalizedVersionId;
            let nonLocalizedVersionId;

            beforeEach(done => {
                async.series([
                    next => {
                        metadata.client.defaultBucketKeyFormat = variation.vFormat;
                        return next();
                    },
                    next => metadata.createBucket(BUCKET_NAME, bucketMD, logger, next),
                    next => putVersion('pfx-localized', LOCAL_LOCATION, null, (err, versionId) => {
                        localizedV1 = versionId;
                        return next(err);
                    }),
                    next => putVersion('pfx-localized', LOCAL_LOCATION, null, next),
                    next => putVersion('pfx-mixed', LOCAL_LOCATION, null, (err, versionId) => {
                        mixedLocalizedVersionId = versionId;
                        return next(err);
                    }),
                    next => putVersion('pfx-mixed', SOURCE_LOCATION, null, next),
                    next => putVersion('pfx-nonlocalized', SOURCE_LOCATION, null, (err, versionId) => {
                        nonLocalizedVersionId = versionId;
                        return next(err);
                    }),
                    next => putVersion('pfx-deletemarker', LOCAL_LOCATION, null, next),
                    next => putVersion('pfx-deletemarker', '', { isDeleteMarker: true }, next),
                ], done);
            });

            afterEach(done => metadata.deleteBucket(BUCKET_NAME, logger, done));

            it('should list all the masters when clean read is not set', done => {
                listMasters(false, (err, data) => {
                    assert.ifError(err);
                    assert.deepStrictEqual(
                        data.Contents.map(entry => entry.key),
                        ['pfx-localized', 'pfx-mixed', 'pfx-nonlocalized'],
                    );
                    return done();
                });
            });

            it('should hide the objects whose current version is not localized', done => {
                listMasters(true, (err, data) => {
                    assert.ifError(err);
                    assert.deepStrictEqual(data.Contents.map(entry => entry.key), ['pfx-localized']);
                    return done();
                });
            });

            it('should list all the versions when clean read is not set', done => {
                listVersions(false, (err, data) => {
                    assert.ifError(err);
                    // 2 versions each for 'pfx-localized', 'pfx-mixed' and
                    // 'pfx-deletemarker' (including its delete marker), plus
                    // the single version of 'pfx-nonlocalized'
                    assert.strictEqual(data.Versions.length, 7);
                    return done();
                });
            });

            it('should exclude the non-localized versions from the version listing', done => {
                listVersions(true, (err, data) => {
                    assert.ifError(err);
                    const versions = data.Versions.map(entry => entry.key);
                    // 2 versions of 'pfx-localized', the localized version of
                    // 'pfx-mixed', and the delete marker plus the localized
                    // version of 'pfx-deletemarker'
                    assert.deepStrictEqual(versions, [
                        'pfx-deletemarker',
                        'pfx-deletemarker',
                        'pfx-localized',
                        'pfx-localized',
                        'pfx-mixed',
                    ]);
                    return done();
                });
            });

            it('should keep the delete markers visible', done => {
                listVersions(true, (err, data) => {
                    assert.ifError(err);
                    const deleteMarkers = data.Versions.filter(entry => JSON.parse(entry.value).isDeleteMarker);
                    assert.strictEqual(deleteMarkers.length, 1);
                    return done();
                });
            });

            it('should page the version listing consistently', done => {
                const listed = [];
                const listPage = (keyMarker, versionIdMarker, next) => {
                    metadata.client.listObject(
                        BUCKET_NAME,
                        {
                            listingType: 'DelimiterVersions',
                            maxKeys: 1,
                            cleanRead: true,
                            keyMarker,
                            versionIdMarker,
                        },
                        logger,
                        (err, data) => {
                            if (err) {
                                return next(err);
                            }
                            data.Versions.forEach(entry => listed.push(entry.key));
                            if (!data.IsTruncated) {
                                return next();
                            }
                            return listPage(data.NextKeyMarker, data.NextVersionIdMarker, next);
                        },
                    );
                };
                listPage(undefined, undefined, err => {
                    assert.ifError(err);
                    assert.deepStrictEqual(listed, [
                        'pfx-deletemarker',
                        'pfx-deletemarker',
                        'pfx-localized',
                        'pfx-localized',
                        'pfx-mixed',
                    ]);
                    return done();
                });
            });

            it('should return NoSuchKey when getting a non-localized version', done => {
                metadata.client.getObject(
                    BUCKET_NAME,
                    'pfx-nonlocalized',
                    { versionId: nonLocalizedVersionId, cleanRead: true },
                    logger,
                    err => {
                        assert(err?.is.NoSuchKey);
                        return done();
                    },
                );
            });

            it('should return a localized version without clean read', done => {
                metadata.client.getObject(
                    BUCKET_NAME,
                    'pfx-localized',
                    { versionId: localizedV1, cleanRead: true },
                    logger,
                    (err, data) => {
                        assert.ifError(err);
                        assert.strictEqual(data.dataStoreName, LOCAL_LOCATION);
                        return done();
                    },
                );
            });

            it('should return NoSuchKey on the master of a fully non-localized object', done => {
                metadata.client.getObject(BUCKET_NAME, 'pfx-nonlocalized', { cleanRead: true }, logger, err => {
                    assert(err?.is.NoSuchKey);
                    return done();
                });
            });

            it('should fall back to the newest localized version of a mixed object', done => {
                // Until the master key is maintained at write time (ARSN-618),
                // the hidden master falls back to the newest visible version.
                metadata.client.getObject(BUCKET_NAME, 'pfx-mixed', { cleanRead: true }, logger, (err, data) => {
                    assert.ifError(err);
                    assert.strictEqual(data.versionId, mixedLocalizedVersionId);
                    assert.strictEqual(data.dataStoreName, LOCAL_LOCATION);
                    return done();
                });
            });

            it('should filter a batch of objects', done => {
                const objects = [
                    { key: 'pfx-localized', params: { cleanRead: true } },
                    { key: 'pfx-nonlocalized', params: { versionId: nonLocalizedVersionId, cleanRead: true } },
                ];
                metadata.client.getObjects(BUCKET_NAME, objects, logger, (err, data) => {
                    assert.ifError(err);
                    assert.ifError(data[0].err);
                    assert.strictEqual(data[0].doc.dataStoreName, LOCAL_LOCATION);
                    assert(data[1].err?.is.NoSuchKey);
                    return done();
                });
            });

            it('should not filter anything when clean read is not set', done => {
                metadata.client.getObject(
                    BUCKET_NAME,
                    'pfx-nonlocalized',
                    { versionId: nonLocalizedVersionId },
                    logger,
                    (err, data) => {
                        assert.ifError(err);
                        assert.strictEqual(data.dataStoreName, SOURCE_LOCATION);
                        return done();
                    },
                );
            });
        });
    });
});
