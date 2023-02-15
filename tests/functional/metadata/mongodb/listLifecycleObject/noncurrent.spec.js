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
            metadata.client.defaultBucketKeyFormat = BucketVersioningKeyFormat.v1;
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
        const bucketMD = makeBucketMD(BUCKET_NAME);
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
                const params = {
                    objName: 'pfx1-test-object',
                    objVal: {
                        key: 'pfx1-test-object',
                        versionId: 'null',
                    },
                    nbVersions: 5,
                };
                const timestamp = 0;
                putBulkObjectVersions(metadata, BUCKET_NAME, params.objName, params.objVal, versionParams,
                    params.nbVersions, timestamp, logger, next);
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
                const params = {
                    objName: 'pfx2-test-object',
                    objVal: {
                        key: 'pfx2-test-object',
                        versionId: 'null',
                    },
                    nbVersions: 5,
                };
                const timestamp = 0;
                putBulkObjectVersions(metadata, BUCKET_NAME, params.objName, params.objVal, versionParams,
                    params.nbVersions, timestamp, logger, next);
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
                const params = {
                    objName: 'pfx3-test-object',
                    objVal: {
                        key: 'pfx3-test-object',
                        versionId: 'null',
                    },
                    nbVersions: 5,
                };
                const timestamp = 0;
                putBulkObjectVersions(metadata, BUCKET_NAME, params.objName, params.objVal, versionParams,
                    params.nbVersions, timestamp, logger, next);
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
                    key: 'pfx1-test-object',
                    LastModified: '1970-01-01T00:00:00.004Z',
                    staleDate: '1970-01-01T00:00:00.005Z',
                },
                {
                    key: 'pfx1-test-object',
                    LastModified: '1970-01-01T00:00:00.003Z',
                    staleDate: '1970-01-01T00:00:00.004Z',
                },
                {
                    key: 'pfx1-test-object',
                    LastModified: '1970-01-01T00:00:00.002Z',
                    staleDate: '1970-01-01T00:00:00.003Z',
                },
                {
                    key: 'pfx1-test-object',
                    LastModified: '1970-01-01T00:00:00.001Z',
                    staleDate: '1970-01-01T00:00:00.002Z',
                },
                {
                    key: 'pfx2-test-object',
                    LastModified: '1970-01-01T00:00:00.004Z',
                    staleDate: '1970-01-01T00:00:00.005Z',
                },
                {
                    key: 'pfx2-test-object',
                    LastModified: '1970-01-01T00:00:00.003Z',
                    staleDate: '1970-01-01T00:00:00.004Z',
                },
                {
                    key: 'pfx2-test-object',
                    LastModified: '1970-01-01T00:00:00.002Z',
                    staleDate: '1970-01-01T00:00:00.003Z',
                },
                {
                    key: 'pfx2-test-object',
                    LastModified: '1970-01-01T00:00:00.001Z',
                    staleDate: '1970-01-01T00:00:00.002Z',
                },
                {
                    key: 'pfx3-test-object',
                    LastModified: '1970-01-01T00:00:00.004Z',
                    staleDate: '1970-01-01T00:00:00.005Z',
                },
                {
                    key: 'pfx3-test-object',
                    LastModified: '1970-01-01T00:00:00.003Z',
                    staleDate: '1970-01-01T00:00:00.004Z',
                },
                {
                    key: 'pfx3-test-object',
                    LastModified: '1970-01-01T00:00:00.002Z',
                    staleDate: '1970-01-01T00:00:00.003Z',
                },
                {
                    key: 'pfx3-test-object',
                    LastModified: '1970-01-01T00:00:00.001Z',
                    staleDate: '1970-01-01T00:00:00.002Z',
                },
            ];
            assertContents(data.Contents, expected);

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
                    key: 'pfx1-test-object',
                    LastModified: '1970-01-01T00:00:00.001Z',
                    staleDate: '1970-01-01T00:00:00.002Z',
                },
                {
                    key: 'pfx2-test-object',
                    LastModified: '1970-01-01T00:00:00.001Z',
                    staleDate: '1970-01-01T00:00:00.002Z',
                },
                {
                    key: 'pfx3-test-object',
                    LastModified: '1970-01-01T00:00:00.001Z',
                    staleDate: '1970-01-01T00:00:00.002Z',
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
                assert.strictEqual(data.NextKeyMarker, 'pfx1-test-object');
                assert.strictEqual(data.NextVersionIdMarker, data.Contents[2].value.VersionId);
                assert.strictEqual(data.Contents.length, 3);
                const expected = [
                    {
                        key: 'pfx1-test-object',
                        LastModified: '1970-01-01T00:00:00.004Z',
                        staleDate: '1970-01-01T00:00:00.005Z',
                    },
                    {
                        key: 'pfx1-test-object',
                        LastModified: '1970-01-01T00:00:00.003Z',
                        staleDate: '1970-01-01T00:00:00.004Z',
                    },
                    {
                        key: 'pfx1-test-object',
                        LastModified: '1970-01-01T00:00:00.002Z',
                        staleDate: '1970-01-01T00:00:00.003Z',
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
                assert.strictEqual(data.NextKeyMarker, 'pfx2-test-object');
                assert.strictEqual(data.NextVersionIdMarker, data.Contents[2].value.VersionId);
                assert.strictEqual(data.Contents.length, 3);
                const expected = [
                    {
                        key: 'pfx1-test-object',
                        LastModified: '1970-01-01T00:00:00.001Z',
                        staleDate: '1970-01-01T00:00:00.002Z',
                    },
                    {
                        key: 'pfx2-test-object',
                        LastModified: '1970-01-01T00:00:00.004Z',
                        staleDate: '1970-01-01T00:00:00.005Z',
                    },
                    {
                        key: 'pfx2-test-object',
                        LastModified: '1970-01-01T00:00:00.003Z',
                        staleDate: '1970-01-01T00:00:00.004Z',
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
                assert.strictEqual(data.NextKeyMarker, 'pfx3-test-object');
                assert.strictEqual(data.NextVersionIdMarker, data.Contents[2].value.VersionId);
                assert.strictEqual(data.Contents.length, 3);
                const expected = [
                    {
                        key: 'pfx2-test-object',
                        LastModified: '1970-01-01T00:00:00.002Z',
                        staleDate: '1970-01-01T00:00:00.003Z',
                    },
                    {
                        key: 'pfx2-test-object',
                        LastModified: '1970-01-01T00:00:00.001Z',
                        staleDate: '1970-01-01T00:00:00.002Z',
                    },
                    {
                        key: 'pfx3-test-object',
                        LastModified: '1970-01-01T00:00:00.004Z',
                        staleDate: '1970-01-01T00:00:00.005Z',
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
                        key: 'pfx3-test-object',
                        LastModified: '1970-01-01T00:00:00.003Z',
                        staleDate: '1970-01-01T00:00:00.004Z',
                    },
                    {
                        key: 'pfx3-test-object',
                        LastModified: '1970-01-01T00:00:00.002Z',
                        staleDate: '1970-01-01T00:00:00.003Z',
                    },
                    {
                        key: 'pfx3-test-object',
                        LastModified: '1970-01-01T00:00:00.001Z',
                        staleDate: '1970-01-01T00:00:00.002Z',
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
                assert.strictEqual(data.NextKeyMarker, 'pfx1-test-object');
                assert.strictEqual(data.NextVersionIdMarker, data.Contents[3].value.VersionId);
                assert.strictEqual(data.Contents.length, 4);

                const expected = [
                    {
                        key: 'pfx1-test-object',
                        LastModified: '1970-01-01T00:00:00.004Z',
                        staleDate: '1970-01-01T00:00:00.005Z',
                    },
                    {
                        key: 'pfx1-test-object',
                        LastModified: '1970-01-01T00:00:00.003Z',
                        staleDate: '1970-01-01T00:00:00.004Z',
                    },
                    {
                        key: 'pfx1-test-object',
                        LastModified: '1970-01-01T00:00:00.002Z',
                        staleDate: '1970-01-01T00:00:00.003Z',
                    },
                    {
                        key: 'pfx1-test-object',
                        LastModified: '1970-01-01T00:00:00.001Z',
                        staleDate: '1970-01-01T00:00:00.002Z',
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
                assert.strictEqual(data.NextKeyMarker, 'pfx2-test-object');
                assert.strictEqual(data.NextVersionIdMarker, data.Contents[3].value.VersionId);
                assert.strictEqual(data.Contents.length, 4);
                const expected = [
                    {
                        key: 'pfx2-test-object',
                        LastModified: '1970-01-01T00:00:00.004Z',
                        staleDate: '1970-01-01T00:00:00.005Z',
                    },
                    {
                        key: 'pfx2-test-object',
                        LastModified: '1970-01-01T00:00:00.003Z',
                        staleDate: '1970-01-01T00:00:00.004Z',
                    },
                    {
                        key: 'pfx2-test-object',
                        LastModified: '1970-01-01T00:00:00.002Z',
                        staleDate: '1970-01-01T00:00:00.003Z',
                    },
                    {
                        key: 'pfx2-test-object',
                        LastModified: '1970-01-01T00:00:00.001Z',
                        staleDate: '1970-01-01T00:00:00.002Z',
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
                assert.strictEqual(data.Contents.length, 4);
                const expected = [
                    {
                        key: 'pfx3-test-object',
                        LastModified: '1970-01-01T00:00:00.004Z',
                        staleDate: '1970-01-01T00:00:00.005Z',
                    },
                    {
                        key: 'pfx3-test-object',
                        LastModified: '1970-01-01T00:00:00.003Z',
                        staleDate: '1970-01-01T00:00:00.004Z',
                    },
                    {
                        key: 'pfx3-test-object',
                        LastModified: '1970-01-01T00:00:00.002Z',
                        staleDate: '1970-01-01T00:00:00.003Z',
                    },
                    {
                        key: 'pfx3-test-object',
                        LastModified: '1970-01-01T00:00:00.001Z',
                        staleDate: '1970-01-01T00:00:00.002Z',
                    },
                ];
                assertContents(data.Contents, expected);

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
                assert.strictEqual(data.NextKeyMarker, 'pfx2-test-object');
                assert.strictEqual(data.NextVersionIdMarker, data.Contents[1].value.VersionId);
                assert.strictEqual(data.Contents.length, 2);

                const expected = [
                    {
                        key: 'pfx2-test-object',
                        LastModified: '1970-01-01T00:00:00.004Z',
                        staleDate: '1970-01-01T00:00:00.005Z',
                    },
                    {
                        key: 'pfx2-test-object',
                        LastModified: '1970-01-01T00:00:00.003Z',
                        staleDate: '1970-01-01T00:00:00.004Z',
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
                        key: 'pfx2-test-object',
                        LastModified: '1970-01-01T00:00:00.002Z',
                        staleDate: '1970-01-01T00:00:00.003Z',
                    },
                    {
                        key: 'pfx2-test-object',
                        LastModified: '1970-01-01T00:00:00.001Z',
                        staleDate: '1970-01-01T00:00:00.002Z',
                    },
                ];
                assertContents(data.Contents, expected);

                params.keyMarker = data.NextKeyMarker;
                params.versionIdMarker = data.NextVersionIdMarker;

                return next();
            }),
        ], done);
    });

    it('Should return trucated list of non-current versions after pfx1-test-object key marker', done => {
        const params = {
            listingType: 'DelimiterNonCurrent',
            maxKeys: 4,
            keyMarker: 'pfx1-test-object',
        };

        return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
            assert.deepStrictEqual(err, null);
            assert.strictEqual(data.IsTruncated, true);
            assert.strictEqual(data.NextKeyMarker, 'pfx2-test-object');
            assert.strictEqual(data.NextVersionIdMarker, data.Contents[3].value.VersionId);
            assert.strictEqual(data.Contents.length, 4);
            const expected = [
                {
                    key: 'pfx2-test-object',
                    LastModified: '1970-01-01T00:00:00.004Z',
                    staleDate: '1970-01-01T00:00:00.005Z',
                },
                {
                    key: 'pfx2-test-object',
                    LastModified: '1970-01-01T00:00:00.003Z',
                    staleDate: '1970-01-01T00:00:00.004Z',
                },
                {
                    key: 'pfx2-test-object',
                    LastModified: '1970-01-01T00:00:00.002Z',
                    staleDate: '1970-01-01T00:00:00.003Z',
                },
                {
                    key: 'pfx2-test-object',
                    LastModified: '1970-01-01T00:00:00.001Z',
                    staleDate: '1970-01-01T00:00:00.002Z',
                },
            ];
            assertContents(data.Contents, expected);

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
                key: 'pfx2-test-object',
                LastModified: '1970-01-01T00:00:00.004Z',
                staleDate: '1970-01-01T00:00:00.005Z',
            },
            {
                key: 'pfx2-test-object',
                LastModified: '1970-01-01T00:00:00.003Z',
                staleDate: '1970-01-01T00:00:00.004Z',
            },
            {
                key: 'pfx2-test-object',
                LastModified: '1970-01-01T00:00:00.002Z',
                staleDate: '1970-01-01T00:00:00.003Z',
            },
            {
                key: 'pfx2-test-object',
                LastModified: '1970-01-01T00:00:00.001Z',
                staleDate: '1970-01-01T00:00:00.002Z',
            }];
            assertContents(data.Contents, expected);

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
                key: 'pfx2-test-object',
                LastModified: '1970-01-01T00:00:00.001Z',
                staleDate: '1970-01-01T00:00:00.002Z',
            }];
            assertContents(data.Contents, expected);

            return done();
        });
    });

    it('Should truncate list of non-current versions that start with prefix and older than beforedate', done => {
        const params = {
            listingType: 'DelimiterNonCurrent',
            prefix: 'pfx2',
            maxKeys: 2,
            beforeDate: '1970-01-01T00:00:00.005Z',
        };
        return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
            assert.deepStrictEqual(err, null);
            assert.strictEqual(data.IsTruncated, true);
            assert.strictEqual(data.Contents.length, 2);
            assert.strictEqual(data.NextKeyMarker, 'pfx2-test-object');
            assert.strictEqual(data.NextVersionIdMarker, data.Contents[1].value.VersionId);
            const expected = [
                {
                    key: 'pfx2-test-object',
                    LastModified: '1970-01-01T00:00:00.003Z',
                    staleDate: '1970-01-01T00:00:00.004Z',
                },
                {
                    key: 'pfx2-test-object',
                    LastModified: '1970-01-01T00:00:00.002Z',
                    staleDate: '1970-01-01T00:00:00.003Z',
                },
            ];
            assertContents(data.Contents, expected);

            return done();
        });
    });

    it('Should return Internal error when bucket non existent (non-current)', done => {
        const bucketName = 'non-existent-bucket';
        const params = {
            listingType: 'DelimiterNonCurrent',
        };
        return metadata.listLifecycleObject(bucketName, params, logger, (err, data) => {
            expect(err.InternalError).toBe(true);
            assert(!data);
            return done();
        });
    });

    it('Should not take phd master into account key when listing non-current versions', done => {
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
                assert.strictEqual(data.Contents[0].value.VersionId, earlyVersionId);
                return next();
            }),
        ], done);
    });

    it('Should not take phd master into account key when listing non-current versions', done => {
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
});
