const async = require('async');
const assert = require('assert');
const werelogs = require('werelogs');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const logger = new werelogs.Logger('MongoClientInterface', 'debug', 'debug');
const MetadataWrapper =
    require('../../../../../lib/storage/metadata/MetadataWrapper');
const { versioning } = require('../../../../../index');
const { BucketVersioningKeyFormat } = versioning.VersioningConstants;
const { assertContents, makeBucketMD, putBulkObjectVersions, flagObjectForDeletion } = require('./utils');

const IMPL_NAME = 'mongodb';
const DB_NAME = 'metadata';
const BUCKET_NAME = 'test-lifecycle-list-non-current-bucket';

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

describe('MongoClientInterface::metadata.listLifecycleObject::noncurrent', () => {
    let metadata;
    let collection;
    const expectedVersionIds = {};
    const key1 = 'pfx1-test-object';
    const key2 = 'pfx2-test-object';
    const key3 = 'pfx3-test-object';
    const location1 = 'loc1';
    const location2 = 'loc2';

    beforeAll(done => {
        mongoserver.start().then(() => {
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
    });

    afterAll(done => {
        async.series([
            next => metadata.close(next),
            next => mongoserver.stop()
                .then(() => next())
                .catch(next),
        ], done);
    });

    [BucketVersioningKeyFormat.v0, BucketVersioningKeyFormat.v1].forEach(v => {
        describe(`bucket format version: ${v}`, () => {
            beforeEach(done => {
                const bucketMD = makeBucketMD(BUCKET_NAME);
                const versionParams = {
                    versioning: true,
                    versionId: null,
                    repairMaster: null,
                };
                metadata.client.defaultBucketKeyFormat = v;
                async.series([
                    next => metadata.createBucket(BUCKET_NAME, bucketMD, logger, err => {
                        if (err) {
                            return next(err);
                        }

                        collection = metadata.client.getCollection(BUCKET_NAME);
                        return next();
                    }),
                    next => {
                        const objVal = {
                            key: key1,
                            versionId: 'null',
                            dataStoreName: location1,
                        };
                        const nbVersions = 5;
                        const timestamp = 0;
                        putBulkObjectVersions(metadata, BUCKET_NAME, key1, objVal, versionParams,
                            nbVersions, timestamp, logger, (err, data) => {
                                expectedVersionIds[key1] = data.expectedVersionIds;
                                return next(err);
                            });
                        /* eslint-disable max-len */
                        // { "_id" : "Mpfx1-test-object", "value" : { "key" : "pfx1-test-object", "versionId" : "vid4", "last-modified" : "1970-01-01T00:00:00.005Z" } }
                        // { "_id" : "Vpfx1-test-object{sep}id4", "value" : { "key" : "pfx1-test-object", "versionId" : "vid4", "last-modified" : "1970-01-01T00:00:00.005Z" } }
                        // { "_id" : "Vpfx1-test-object{sep}id3", "value" : { "key" : "pfx1-test-object", "versionId" : "vid3", "last-modified" : "1970-01-01T00:00:00.004Z" } }
                        // { "_id" : "Vpfx1-test-object{sep}id2", "value" : { "key" : "pfx1-test-object", "versionId" : "vid2", "last-modified" : "1970-01-01T00:00:00.003Z" } }
                        // { "_id" : "Vpfx1-test-object{sep}id1", "value" : { "key" : "pfx1-test-object", "versionId" : "vid1", "last-modified" : "1970-01-01T00:00:00.002Z" } }
                        // { "_id" : "Vpfx1-test-object{sep}id0", "value" : { "key" : "pfx1-test-object", "versionId" : "vid0", "last-modified" : "1970-01-01T00:00:00.001Z" } }
                        /* eslint-enable max-len */
                    },
                    next => {
                        const objVal = {
                            key: key2,
                            versionId: 'null',
                            dataStoreName: location2,
                        };
                        const nbVersions = 5;
                        const timestamp = 0;
                        putBulkObjectVersions(metadata, BUCKET_NAME, key2, objVal, versionParams,
                            nbVersions, timestamp, logger, (err, data) => {
                                expectedVersionIds[key2] = data.expectedVersionIds;
                                return next(err);
                            });
                        /* eslint-disable max-len */
                        // { "_id" : "Mpfx2-test-object", "value" : { "key" : "pfx2-test-object", "versionId" : "vid4", "last-modified" : "1970-01-01T00:00:00.005Z" } }
                        // { "_id" : "Vpfx2-test-object{sep}id4", "value" : { "key" : "pfx2-test-object", "versionId" : "vid4", "last-modified" : "1970-01-01T00:00:00.005Z" } }
                        // { "_id" : "Vpfx2-test-object{sep}id3", "value" : { "key" : "pfx2-test-object", "versionId" : "vid3", "last-modified" : "1970-01-01T00:00:00.004Z" } }
                        // { "_id" : "Vpfx2-test-object{sep}id2", "value" : { "key" : "pfx2-test-object", "versionId" : "vid2", "last-modified" : "1970-01-01T00:00:00.003Z" } }
                        // { "_id" : "Vpfx2-test-object{sep}id1", "value" : { "key" : "pfx2-test-object", "versionId" : "vid1", "last-modified" : "1970-01-01T00:00:00.002Z" } }
                        // { "_id" : "Vpfx1-test-object{sep}id0", "value" : { "key" : "pfx2-test-object", "versionId" : "vid0", "last-modified" : "1970-01-01T00:00:00.001Z" } }
                        /* eslint-enable max-len */
                    },
                    next => {
                        const objVal = {
                            key: key3,
                            versionId: 'null',
                            dataStoreName: location1,
                        };
                        const nbVersions = 5;
                        const timestamp = 0;
                        putBulkObjectVersions(metadata, BUCKET_NAME, key3, objVal, versionParams,
                            nbVersions, timestamp, logger, (err, data) => {
                                expectedVersionIds[key3] = data.expectedVersionIds;
                                return next(err);
                            });
                        /* eslint-disable max-len */
                        // { "_id" : "Mpfx3-test-object", "value" : { "key" : "pfx3-test-object", "versionId" : "vid4", "last-modified" : "1970-01-01T00:00:00.005Z" } }
                        // { "_id" : "Vpfx3-test-object{sep}id4", "value" : { "key" : "pfx3-test-object", "versionId" : "vid4", "last-modified" : "1970-01-01T00:00:00.005Z" } }
                        // { "_id" : "Vpfx3-test-object{sep}id3", "value" : { "key" : "pfx3-test-object", "versionId" : "vid3", "last-modified" : "1970-01-01T00:00:00.004Z" } }
                        // { "_id" : "Vpfx3-test-object{sep}id2", "value" : { "key" : "pfx3-test-object", "versionId" : "vid2", "last-modified" : "1970-01-01T00:00:00.003Z" } }
                        // { "_id" : "Vpfx3-test-object{sep}id1", "value" : { "key" : "pfx3-test-object", "versionId" : "vid1", "last-modified" : "1970-01-01T00:00:00.002Z" } }
                        // { "_id" : "Vpfx3-test-object{sep}id0", "value" : { "key" : "pfx3-test-object", "versionId" : "vid0", "last-modified" : "1970-01-01T00:00:00.001Z" } }
                        /* eslint-enable max-len */
                    },
                ], done);
            });

            afterEach(done => metadata.deleteBucket(BUCKET_NAME, logger, done));

            it('Should list non-current versions', done => {
                const params = {
                    listingType: 'DelimiterNonCurrent',
                };
                return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
                    assert.deepStrictEqual(err, null);
                    assert.strictEqual(data.IsTruncated, false);
                    assert.strictEqual(data.Contents.length, 12);
                    const expected = [
                        {
                            key: key1,
                            LastModified: '1970-01-01T00:00:00.004Z',
                            staleDate: '1970-01-01T00:00:00.005Z',
                            dataStoreName: location1,
                        },
                        {
                            key: key1,
                            LastModified: '1970-01-01T00:00:00.003Z',
                            staleDate: '1970-01-01T00:00:00.004Z',
                            dataStoreName: location1,
                        },
                        {
                            key: key1,
                            LastModified: '1970-01-01T00:00:00.002Z',
                            staleDate: '1970-01-01T00:00:00.003Z',
                            dataStoreName: location1,
                        },
                        {
                            key: key1,
                            LastModified: '1970-01-01T00:00:00.001Z',
                            staleDate: '1970-01-01T00:00:00.002Z',
                            dataStoreName: location1,
                        },
                        {
                            key: key2,
                            LastModified: '1970-01-01T00:00:00.004Z',
                            staleDate: '1970-01-01T00:00:00.005Z',
                            dataStoreName: location2,
                        },
                        {
                            key: key2,
                            LastModified: '1970-01-01T00:00:00.003Z',
                            staleDate: '1970-01-01T00:00:00.004Z',
                            dataStoreName: location2,
                        },
                        {
                            key: key2,
                            LastModified: '1970-01-01T00:00:00.002Z',
                            staleDate: '1970-01-01T00:00:00.003Z',
                            dataStoreName: location2,
                        },
                        {
                            key: key2,
                            LastModified: '1970-01-01T00:00:00.001Z',
                            staleDate: '1970-01-01T00:00:00.002Z',
                            dataStoreName: location2,
                        },
                        {
                            key: key3,
                            LastModified: '1970-01-01T00:00:00.004Z',
                            staleDate: '1970-01-01T00:00:00.005Z',
                            dataStoreName: location1,
                        },
                        {
                            key: key3,
                            LastModified: '1970-01-01T00:00:00.003Z',
                            staleDate: '1970-01-01T00:00:00.004Z',
                            dataStoreName: location1,
                        },
                        {
                            key: key3,
                            LastModified: '1970-01-01T00:00:00.002Z',
                            staleDate: '1970-01-01T00:00:00.003Z',
                            dataStoreName: location1,
                        },
                        {
                            key: key3,
                            LastModified: '1970-01-01T00:00:00.001Z',
                            staleDate: '1970-01-01T00:00:00.002Z',
                            dataStoreName: location1,
                        },
                    ];
                    assertContents(data.Contents, expected);

                    const key1VersionIds = data.Contents.filter(k => k.key === key1).map(k => k.value.VersionId);
                    assert.deepStrictEqual(key1VersionIds, expectedVersionIds[key1]);

                    const key2VersionIds = data.Contents.filter(k => k.key === key2).map(k => k.value.VersionId);
                    assert.deepStrictEqual(key2VersionIds, expectedVersionIds[key2]);

                    const key3VersionIds = data.Contents.filter(k => k.key === key2).map(k => k.value.VersionId);
                    assert.deepStrictEqual(key3VersionIds, expectedVersionIds[key2]);

                    return done();
                });
            });

            it('Should return empty list when beforeDate is before the objects stale date', done => {
                const params = {
                    listingType: 'DelimiterNonCurrent',
                    beforeDate: '1970-01-01T00:00:00.000Z',
                };
                return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
                    assert.deepStrictEqual(err, null);
                    assert.strictEqual(data.IsTruncated, false);
                    assert.strictEqual(data.Contents.length, 0);

                    return done();
                });
            });

            it('Should list non-current versions excluding keys stored in location1', done => {
                const params = {
                    listingType: 'DelimiterNonCurrent',
                    excludedDataStoreName: location1,
                };
                return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
                    assert.deepStrictEqual(err, null);
                    assert.strictEqual(data.IsTruncated, false);
                    assert.strictEqual(data.Contents.length, 4);
                    const expected = [
                        {
                            key: key2,
                            LastModified: '1970-01-01T00:00:00.004Z',
                            staleDate: '1970-01-01T00:00:00.005Z',
                            VersionId: expectedVersionIds[key2][0],
                            dataStoreName: location2,
                        },
                        {
                            key: key2,
                            LastModified: '1970-01-01T00:00:00.003Z',
                            staleDate: '1970-01-01T00:00:00.004Z',
                            VersionId: expectedVersionIds[key2][1],
                            dataStoreName: location2,
                        },
                        {
                            key: key2,
                            LastModified: '1970-01-01T00:00:00.002Z',
                            staleDate: '1970-01-01T00:00:00.003Z',
                            VersionId: expectedVersionIds[key2][2],
                            dataStoreName: location2,
                        },
                        {
                            key: key2,
                            LastModified: '1970-01-01T00:00:00.001Z',
                            staleDate: '1970-01-01T00:00:00.002Z',
                            VersionId: expectedVersionIds[key2][3],
                            dataStoreName: location2,
                        },
                    ];
                    assertContents(data.Contents, expected);

                    const key2VersionIds = data.Contents.filter(k => k.key === key2).map(k => k.value.VersionId);
                    assert.deepStrictEqual(key2VersionIds, expectedVersionIds[key2]);

                    return done();
                });
            });

            it('Should list non-current versions older than a specific date and excluding keys stored in location1',
                done => {
                    const params = {
                        listingType: 'DelimiterNonCurrent',
                        excludedDataStoreName: location1,
                        beforeDate: '1970-01-01T00:00:00.004Z',
                    };
                    return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
                        assert.deepStrictEqual(err, null);
                        assert.strictEqual(data.IsTruncated, false);
                        assert.strictEqual(data.Contents.length, 2);
                        const expected = [
                            {
                                key: key2,
                                LastModified: '1970-01-01T00:00:00.002Z',
                                staleDate: '1970-01-01T00:00:00.003Z',
                                VersionId: expectedVersionIds[key2][2],
                                dataStoreName: location2,
                            },
                            {
                                key: key2,
                                LastModified: '1970-01-01T00:00:00.001Z',
                                staleDate: '1970-01-01T00:00:00.002Z',
                                VersionId: expectedVersionIds[key2][3],
                                dataStoreName: location2,
                            },
                        ];
                        assertContents(data.Contents, expected);

                        return done();
                    });
                });

            
                it('Should return trucated list of non-current versions excluding keys stored in location1', done => {
                const params = {
                    listingType: 'DelimiterNonCurrent',
                    excludedDataStoreName: location1,
                    maxKeys: 2,
                };
                return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
                    assert.deepStrictEqual(err, null);
                    assert.strictEqual(data.IsTruncated, true);
                    assert.strictEqual(data.NextKeyMarker, key2);
                    assert.strictEqual(data.NextVersionIdMarker, data.Contents[1].value.VersionId);
                    assert.strictEqual(data.Contents.length, 2);
                    const expected = [
                        {
                            key: key2,
                            LastModified: '1970-01-01T00:00:00.004Z',
                            staleDate: '1970-01-01T00:00:00.005Z',
                            VersionId: expectedVersionIds[key2][0],
                            dataStoreName: location2,
                        },
                        {
                            key: key2,
                            LastModified: '1970-01-01T00:00:00.003Z',
                            staleDate: '1970-01-01T00:00:00.004Z',
                            VersionId: expectedVersionIds[key2][1],
                            dataStoreName: location2,
                        },
                    ];
                    assertContents(data.Contents, expected);

                    params.keyMarker = data.NextKeyMarker;
                    params.versionIdMarker = data.NextVersionIdMarker;

                    return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
                        assert.deepStrictEqual(err, null);
                        assert.strictEqual(data.IsTruncated, true);
                        assert.strictEqual(data.NextKeyMarker, key2);
                        assert.strictEqual(data.NextVersionIdMarker, data.Contents[1].value.VersionId);
                        assert.strictEqual(data.Contents.length, 2);
                        const expected = [
                            {
                                key: key2,
                                LastModified: '1970-01-01T00:00:00.002Z',
                                staleDate: '1970-01-01T00:00:00.003Z',
                                VersionId: expectedVersionIds[key2][2],
                                dataStoreName: location2,
                            },
                            {
                                key: key2,
                                LastModified: '1970-01-01T00:00:00.001Z',
                                staleDate: '1970-01-01T00:00:00.002Z',
                                VersionId: expectedVersionIds[key2][3],
                                dataStoreName: location2,
                            },
                        ];
                        assertContents(data.Contents, expected);

                        params.keyMarker = data.NextKeyMarker;
                        params.versionIdMarker = data.NextVersionIdMarker;

                        return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
                            assert.deepStrictEqual(err, null);
                            assert.strictEqual(data.IsTruncated, false);
                            assert.strictEqual(data.Contents.length, 0);
                            return done();
                        });
                    });
                });
            });

            it('Should return the non-current versions with stale date older than 1970-01-01T00:00:00.003Z', done => {
                const params = {
                    listingType: 'DelimiterNonCurrent',
                    beforeDate: '1970-01-01T00:00:00.003Z',
                };
                return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
                    assert.deepStrictEqual(err, null);
                    assert.strictEqual(data.IsTruncated, false);
                    assert.strictEqual(data.Contents.length, 3);
                    const expected = [
                        {
                            key: key1,
                            LastModified: '1970-01-01T00:00:00.001Z',
                            staleDate: '1970-01-01T00:00:00.002Z',
                            VersionId: expectedVersionIds[key1][3],
                            dataStoreName: location1,
                        },
                        {
                            key: key2,
                            LastModified: '1970-01-01T00:00:00.001Z',
                            staleDate: '1970-01-01T00:00:00.002Z',
                            VersionId: expectedVersionIds[key2][3],
                            dataStoreName: location2,
                        },
                        {
                            key: key3,
                            LastModified: '1970-01-01T00:00:00.001Z',
                            staleDate: '1970-01-01T00:00:00.002Z',
                            VersionId: expectedVersionIds[key3][3],
                            dataStoreName: location1,
                        },
                    ];
                    assertContents(data.Contents, expected);

                    return done();
                });
            });

            it('Should list non-current versions three by three', done => {
                const params = {
                    listingType: 'DelimiterNonCurrent',
                    maxKeys: 3,
                };

                return async.series([
                    next => metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
                        assert.deepStrictEqual(err, null);
                        assert.strictEqual(data.IsTruncated, true);
                        assert.strictEqual(data.NextKeyMarker, key1);
                        assert.strictEqual(data.NextVersionIdMarker, data.Contents[2].value.VersionId);
                        assert.strictEqual(data.Contents.length, 3);
                        const expected = [
                            {
                                key: key1,
                                LastModified: '1970-01-01T00:00:00.004Z',
                                staleDate: '1970-01-01T00:00:00.005Z',
                                VersionId: expectedVersionIds[key1][0],
                                dataStoreName: location1,
                            },
                            {
                                key: key1,
                                LastModified: '1970-01-01T00:00:00.003Z',
                                staleDate: '1970-01-01T00:00:00.004Z',
                                VersionId: expectedVersionIds[key1][1],
                                dataStoreName: location1,
                            },
                            {
                                key: key1,
                                LastModified: '1970-01-01T00:00:00.002Z',
                                staleDate: '1970-01-01T00:00:00.003Z',
                                VersionId: expectedVersionIds[key1][2],
                                dataStoreName: location1,
                            },
                        ];
                        assertContents(data.Contents, expected);

                        params.keyMarker = data.NextKeyMarker;
                        params.versionIdMarker = data.NextVersionIdMarker;

                        return next();
                    }),
                    next => metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
                        assert.deepStrictEqual(err, null);
                        assert.strictEqual(data.IsTruncated, true);
                        assert.strictEqual(data.NextKeyMarker, key2);
                        assert.strictEqual(data.NextVersionIdMarker, data.Contents[2].value.VersionId);
                        assert.strictEqual(data.Contents.length, 3);
                        const expected = [
                            {
                                key: key1,
                                LastModified: '1970-01-01T00:00:00.001Z',
                                staleDate: '1970-01-01T00:00:00.002Z',
                                VersionId: expectedVersionIds[key1][3],
                                dataStoreName: location1,
                            },
                            {
                                key: key2,
                                LastModified: '1970-01-01T00:00:00.004Z',
                                staleDate: '1970-01-01T00:00:00.005Z',
                                VersionId: expectedVersionIds[key2][0],
                                dataStoreName: location2,
                            },
                            {
                                key: key2,
                                LastModified: '1970-01-01T00:00:00.003Z',
                                staleDate: '1970-01-01T00:00:00.004Z',
                                VersionId: expectedVersionIds[key2][1],
                                dataStoreName: location2,
                            },
                        ];
                        assertContents(data.Contents, expected);

                        params.keyMarker = data.NextKeyMarker;
                        params.versionIdMarker = data.NextVersionIdMarker;

                        return next();
                    }),
                    next => metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
                        assert.deepStrictEqual(err, null);
                        assert.strictEqual(data.IsTruncated, true);
                        assert.strictEqual(data.NextKeyMarker, key3);
                        assert.strictEqual(data.NextVersionIdMarker, data.Contents[2].value.VersionId);
                        assert.strictEqual(data.Contents.length, 3);
                        const expected = [
                            {
                                key: key2,
                                LastModified: '1970-01-01T00:00:00.002Z',
                                staleDate: '1970-01-01T00:00:00.003Z',
                                VersionId: expectedVersionIds[key2][2],
                                dataStoreName: location2,
                            },
                            {
                                key: key2,
                                LastModified: '1970-01-01T00:00:00.001Z',
                                staleDate: '1970-01-01T00:00:00.002Z',
                                VersionId: expectedVersionIds[key2][3],
                                dataStoreName: location2,
                            },
                            {
                                key: key3,
                                LastModified: '1970-01-01T00:00:00.004Z',
                                staleDate: '1970-01-01T00:00:00.005Z',
                                VersionId: expectedVersionIds[key3][0],
                                dataStoreName: location1,
                            },
                        ];
                        assertContents(data.Contents, expected);

                        params.keyMarker = data.NextKeyMarker;
                        params.versionIdMarker = data.NextVersionIdMarker;

                        return next();
                    }),
                    next => metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
                        assert.deepStrictEqual(err, null);
                        assert.strictEqual(data.IsTruncated, false);
                        assert.strictEqual(data.Contents.length, 3);
                        const expected = [
                            {
                                key: key3,
                                LastModified: '1970-01-01T00:00:00.003Z',
                                staleDate: '1970-01-01T00:00:00.004Z',
                                VersionId: expectedVersionIds[key3][1],
                                dataStoreName: location1,
                            },
                            {
                                key: key3,
                                LastModified: '1970-01-01T00:00:00.002Z',
                                staleDate: '1970-01-01T00:00:00.003Z',
                                VersionId: expectedVersionIds[key3][2],
                                dataStoreName: location1,
                            },
                            {
                                key: key3,
                                LastModified: '1970-01-01T00:00:00.001Z',
                                staleDate: '1970-01-01T00:00:00.002Z',
                                VersionId: expectedVersionIds[key3][3],
                                dataStoreName: location1,
                            },
                        ];
                        assertContents(data.Contents, expected);

                        return next();
                    }),
                ], done);
            });

            it('Should list non-current versions four by four', done => {
                const params = {
                    listingType: 'DelimiterNonCurrent',
                    maxKeys: 4,
                };

                return async.series([
                    next => metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
                        assert.deepStrictEqual(err, null);

                        assert.strictEqual(data.IsTruncated, true);
                        assert.strictEqual(data.NextKeyMarker, key1);
                        assert.strictEqual(data.NextVersionIdMarker, data.Contents[3].value.VersionId);
                        assert.strictEqual(data.Contents.length, 4);

                        const expected = [
                            {
                                key: key1,
                                LastModified: '1970-01-01T00:00:00.004Z',
                                staleDate: '1970-01-01T00:00:00.005Z',
                                dataStoreName: location1,
                            },
                            {
                                key: key1,
                                LastModified: '1970-01-01T00:00:00.003Z',
                                staleDate: '1970-01-01T00:00:00.004Z',
                                dataStoreName: location1,
                            },
                            {
                                key: key1,
                                LastModified: '1970-01-01T00:00:00.002Z',
                                staleDate: '1970-01-01T00:00:00.003Z',
                                dataStoreName: location1,
                            },
                            {
                                key: key1,
                                LastModified: '1970-01-01T00:00:00.001Z',
                                staleDate: '1970-01-01T00:00:00.002Z',
                                dataStoreName: location1,
                            },
                        ];

                        assertContents(data.Contents, expected);

                        const key1VersionIds = data.Contents.filter(k => k.key === key1).map(k => k.value.VersionId);
                        assert.deepStrictEqual(key1VersionIds, expectedVersionIds[key1]);

                        params.keyMarker = data.NextKeyMarker;
                        params.versionIdMarker = data.NextVersionIdMarker;

                        return next();
                    }),
                    next => metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
                        assert.deepStrictEqual(err, null);
                        assert.strictEqual(data.IsTruncated, true);
                        assert.strictEqual(data.NextKeyMarker, key2);
                        assert.strictEqual(data.NextVersionIdMarker, data.Contents[3].value.VersionId);
                        assert.strictEqual(data.Contents.length, 4);
                        const expected = [
                            {
                                key: key2,
                                LastModified: '1970-01-01T00:00:00.004Z',
                                staleDate: '1970-01-01T00:00:00.005Z',
                                dataStoreName: location2,
                            },
                            {
                                key: key2,
                                LastModified: '1970-01-01T00:00:00.003Z',
                                staleDate: '1970-01-01T00:00:00.004Z',
                                dataStoreName: location2,
                            },
                            {
                                key: key2,
                                LastModified: '1970-01-01T00:00:00.002Z',
                                staleDate: '1970-01-01T00:00:00.003Z',
                                dataStoreName: location2,
                            },
                            {
                                key: key2,
                                LastModified: '1970-01-01T00:00:00.001Z',
                                staleDate: '1970-01-01T00:00:00.002Z',
                                dataStoreName: location2,
                            },
                        ];
                        assertContents(data.Contents, expected);

                        const key2VersionIds = data.Contents.filter(k => k.key === key2).map(k => k.value.VersionId);
                        assert.deepStrictEqual(key2VersionIds, expectedVersionIds[key2]);

                        params.keyMarker = data.NextKeyMarker;
                        params.versionIdMarker = data.NextVersionIdMarker;

                        return next();
                    }),
                    next => metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
                        assert.deepStrictEqual(err, null);
                        assert.strictEqual(data.IsTruncated, false);
                        assert.strictEqual(data.Contents.length, 4);
                        const expected = [
                            {
                                key: key3,
                                LastModified: '1970-01-01T00:00:00.004Z',
                                staleDate: '1970-01-01T00:00:00.005Z',
                                dataStoreName: location1,
                            },
                            {
                                key: key3,
                                LastModified: '1970-01-01T00:00:00.003Z',
                                staleDate: '1970-01-01T00:00:00.004Z',
                                dataStoreName: location1,
                            },
                            {
                                key: key3,
                                LastModified: '1970-01-01T00:00:00.002Z',
                                staleDate: '1970-01-01T00:00:00.003Z',
                                dataStoreName: location1,
                            },
                            {
                                key: key3,
                                LastModified: '1970-01-01T00:00:00.001Z',
                                staleDate: '1970-01-01T00:00:00.002Z',
                                dataStoreName: location1,
                            },
                        ];
                        assertContents(data.Contents, expected);

                        const key3VersionIds = data.Contents.filter(k => k.key === key3).map(k => k.value.VersionId);
                        assert.deepStrictEqual(key3VersionIds, expectedVersionIds[key3]);

                        return next();
                    }),
                ], done);
            });

            it('Should list non-current versions with a specific prefix two by two', done => {
                const params = {
                    listingType: 'DelimiterNonCurrent',
                    maxKeys: 2,
                    prefix: 'pfx2',
                };

                return async.series([
                    next => metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
                        assert.deepStrictEqual(err, null);

                        assert.strictEqual(data.IsTruncated, true);
                        assert.strictEqual(data.NextKeyMarker, key2);
                        assert.strictEqual(data.NextVersionIdMarker, data.Contents[1].value.VersionId);
                        assert.strictEqual(data.Contents.length, 2);

                        const expected = [
                            {
                                key: key2,
                                LastModified: '1970-01-01T00:00:00.004Z',
                                staleDate: '1970-01-01T00:00:00.005Z',
                                VersionId: expectedVersionIds[key2][0],
                                dataStoreName: location2,
                            },
                            {
                                key: key2,
                                LastModified: '1970-01-01T00:00:00.003Z',
                                staleDate: '1970-01-01T00:00:00.004Z',
                                VersionId: expectedVersionIds[key2][1],
                                dataStoreName: location2,
                            },
                        ];

                        assertContents(data.Contents, expected);

                        params.keyMarker = data.NextKeyMarker;
                        params.versionIdMarker = data.NextVersionIdMarker;

                        return next();
                    }),
                    next => metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
                        assert.deepStrictEqual(err, null);
                        assert.strictEqual(data.IsTruncated, false);
                        assert.strictEqual(data.Contents.length, 2);
                        const expected = [
                            {
                                key: key2,
                                LastModified: '1970-01-01T00:00:00.002Z',
                                staleDate: '1970-01-01T00:00:00.003Z',
                                VersionId: expectedVersionIds[key2][2],
                                dataStoreName: location2,
                            },
                            {
                                key: key2,
                                LastModified: '1970-01-01T00:00:00.001Z',
                                staleDate: '1970-01-01T00:00:00.002Z',
                                VersionId: expectedVersionIds[key2][3],
                                dataStoreName: location2,
                            },
                        ];
                        assertContents(data.Contents, expected);

                        params.keyMarker = data.NextKeyMarker;
                        params.versionIdMarker = data.NextVersionIdMarker;

                        return next();
                    }),
                ], done);
            });

            it('Should return truncated list of non-current versions after pfx1-test-object key marker', done => {
                const params = {
                    listingType: 'DelimiterNonCurrent',
                    maxKeys: 4,
                    keyMarker: key1,
                };

                return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
                    assert.deepStrictEqual(err, null);
                    assert.strictEqual(data.IsTruncated, true);
                    assert.strictEqual(data.NextKeyMarker, key2);
                    assert.strictEqual(data.NextVersionIdMarker, data.Contents[3].value.VersionId);
                    assert.strictEqual(data.Contents.length, 4);
                    const expected = [
                        {
                            key: key2,
                            LastModified: '1970-01-01T00:00:00.004Z',
                            staleDate: '1970-01-01T00:00:00.005Z',
                            dataStoreName: location2,
                        },
                        {
                            key: key2,
                            LastModified: '1970-01-01T00:00:00.003Z',
                            staleDate: '1970-01-01T00:00:00.004Z',
                            dataStoreName: location2,
                        },
                        {
                            key: key2,
                            LastModified: '1970-01-01T00:00:00.002Z',
                            staleDate: '1970-01-01T00:00:00.003Z',
                            dataStoreName: location2,
                        },
                        {
                            key: key2,
                            LastModified: '1970-01-01T00:00:00.001Z',
                            staleDate: '1970-01-01T00:00:00.002Z',
                            dataStoreName: location2,
                        },
                    ];
                    assertContents(data.Contents, expected);

                    const key2VersionIds = data.Contents.filter(k => k.key === key2).map(k => k.value.VersionId);
                    assert.deepStrictEqual(key2VersionIds, expectedVersionIds[key2]);

                    return done();
                });
            });

            it('Should list non-current versions that start with prefix', done => {
                const params = {
                    listingType: 'DelimiterNonCurrent',
                    prefix: 'pfx2',
                };
                return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
                    assert.deepStrictEqual(err, null);
                    assert.strictEqual(data.IsTruncated, false);
                    assert.strictEqual(data.Contents.length, 4);
                    const expected = [{
                        key: key2,
                        LastModified: '1970-01-01T00:00:00.004Z',
                        staleDate: '1970-01-01T00:00:00.005Z',
                        dataStoreName: location2,
                    },
                    {
                        key: key2,
                        LastModified: '1970-01-01T00:00:00.003Z',
                        staleDate: '1970-01-01T00:00:00.004Z',
                        dataStoreName: location2,
                    },
                    {
                        key: key2,
                        LastModified: '1970-01-01T00:00:00.002Z',
                        staleDate: '1970-01-01T00:00:00.003Z',
                        dataStoreName: location2,
                    },
                    {
                        key: key2,
                        LastModified: '1970-01-01T00:00:00.001Z',
                        staleDate: '1970-01-01T00:00:00.002Z',
                        dataStoreName: location2,
                    }];
                    assertContents(data.Contents, expected);

                    const key2VersionIds = data.Contents.filter(k => k.key === key2).map(k => k.value.VersionId);
                    assert.deepStrictEqual(key2VersionIds, expectedVersionIds[key2]);

                    return done();
                });
            });

            it('Should list non-current version that start with prefix and older than beforedate', done => {
                const params = {
                    listingType: 'DelimiterNonCurrent',
                    prefix: 'pfx2',
                    maxKeys: 1,
                    beforeDate: '1970-01-01T00:00:00.003Z',
                };
                return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
                    assert.deepStrictEqual(err, null);
                    assert.strictEqual(data.IsTruncated, false);
                    assert.strictEqual(data.Contents.length, 1);
                    const expected = [{
                        key: key2,
                        LastModified: '1970-01-01T00:00:00.001Z',
                        staleDate: '1970-01-01T00:00:00.002Z',
                        VersionId: expectedVersionIds[key2][3],
                        dataStoreName: location2,
                    }];
                    assertContents(data.Contents, expected);

                    return done();
                });
            });

            it('Should truncate list of non-current versions that start with prefix and older than beforedate',
                done => {
                    const params = {
                        listingType: 'DelimiterNonCurrent',
                        prefix: 'pfx2',
                        maxKeys: 2,
                        beforeDate: '1970-01-01T00:00:00.005Z',
                    };
                    return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
                        assert.deepStrictEqual(err, null);
                        assert.strictEqual(data.IsTruncated, true);
                        assert.strictEqual(data.NextKeyMarker, key2);
                        assert.strictEqual(data.NextVersionIdMarker, data.Contents[1].value.VersionId);
                        const expected = [
                            {
                                key: key2,
                                LastModified: '1970-01-01T00:00:00.003Z',
                                staleDate: '1970-01-01T00:00:00.004Z',
                                VersionId: expectedVersionIds[key2][1],
                                dataStoreName: location2,
                            },
                            {
                                key: key2,
                                LastModified: '1970-01-01T00:00:00.002Z',
                                staleDate: '1970-01-01T00:00:00.003Z',
                                VersionId: expectedVersionIds[key2][2],
                                dataStoreName: location2,
                            },
                        ];
                        assert.strictEqual(data.Contents.length, 2);
                        assertContents(data.Contents, expected);

                        return done();
                    });
                });

            it('Should not take phd master key into account when listing non-current versions', done => {
                const objVal = {
                    'key': 'pfx4-test-object',
                    'versionId': 'null',
                    'last-modified': new Date(10000).toISOString(),
                };
                const versionParams = {
                    versioning: true,
                };
                const params = {
                    listingType: 'DelimiterNonCurrent',
                    prefix: 'pfx4',
                };
                let earlyVersionId;
                let lastVersionId;
                async.series([
                    next => metadata.putObjectMD(BUCKET_NAME, 'pfx4-test-object', objVal, versionParams,
                        logger, (err, res) => {
                            if (err) {
                                return next(err);
                            }
                            earlyVersionId = JSON.parse(res).versionId;
                            return next(null);
                        }),
                    next => metadata.putObjectMD(BUCKET_NAME, 'pfx4-test-object', objVal, versionParams,
                        logger, next),
                    next => metadata.putObjectMD(BUCKET_NAME, 'pfx4-test-object', objVal, versionParams,
                        logger, (err, res) => {
                            if (err) {
                                return next(err);
                            }
                            lastVersionId = JSON.parse(res).versionId;
                            return next(null);
                        }),
                    next => metadata.deleteObjectMD(BUCKET_NAME, 'pfx4-test-object', { versionId: lastVersionId },
                        logger, next),
                    next => metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
                        assert.ifError(err);
                        assert.strictEqual(data.Contents.length, 1);
                        assert.strictEqual(data.Contents[0].value.VersionId, earlyVersionId);

                        return next();
                    }),
                ], done);
            });

            it('Should not list non current versions tagged for deletion', done => {
                const objVal = {
                    'key': 'pfx4-test-object',
                    'versionId': 'null',
                    'last-modified': new Date(10000).toISOString(),
                };
                const versionParams = {
                    versioning: true,
                };
                const params = {
                    listingType: 'DelimiterNonCurrent',
                    prefix: 'pfx4',
                };

                async.series([
                    next => metadata.putObjectMD(BUCKET_NAME, 'pfx4-test-object', objVal, versionParams,
                        logger, next),
                    next => metadata.putObjectMD(BUCKET_NAME, 'pfx4-test-object', objVal, versionParams,
                        logger, next),
                    next => flagObjectForDeletion(collection, 'pfx4-test-object', next),
                    next => metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
                        assert.ifError(err);

                        assert.strictEqual(data.IsTruncated, false);
                        assert.strictEqual(data.Contents.length, 0);
                        return next();
                    }),
                ], done);
            });

            it('Should exclude keys stored in location1', done => {
                let expectedId;
                const objLoc1 = {
                    'key': 'pfx4-test-object',
                    'versionId': 'null',
                    'dataStoreName': location1,
                    'last-modified': new Date(0).toISOString(),
                };

                const objLoc2 = {
                    'key': 'pfx4-test-object',
                    'versionId': 'null',
                    'dataStoreName': location2,
                    'last-modified': new Date(0).toISOString(),
                };
                const versionParams = {
                    versioning: true,
                };
                const params = {
                    listingType: 'DelimiterNonCurrent',
                    prefix: 'pfx4',
                    excludedDataStoreName: location1,
                };

                async.series([
                    next => metadata.putObjectMD(BUCKET_NAME, 'pfx4-test-object', objLoc1, versionParams,
                        logger, next),
                    next => metadata.putObjectMD(BUCKET_NAME, 'pfx4-test-object', objLoc2, versionParams,
                        logger, (err, data) => {
                            expectedId = JSON.parse(data).versionId;
                            return next(err);
                        }),
                    next => metadata.putObjectMD(BUCKET_NAME, 'pfx4-test-object', objLoc1, versionParams,
                        logger, next),
                    next => metadata.putObjectMD(BUCKET_NAME, 'pfx4-test-object', objLoc2, versionParams,
                        logger, next),
                    next => metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
                        assert.ifError(err);
                        assert.strictEqual(data.IsTruncated, false);
                        assert.strictEqual(data.Contents.length, 1);

                        const firstKey = data.Contents[0];
                        assert.strictEqual(firstKey.key, 'pfx4-test-object');
                        assert.strictEqual(firstKey.value.VersionId, expectedId);
                        assert.strictEqual(firstKey.value.dataStoreName, location2);
                        return next();
                    }),
                ], done);
            });
        });
    });
});
