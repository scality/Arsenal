const async = require('async');
const assert = require('assert');
const werelogs = require('werelogs');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const logger = new werelogs.Logger('MongoClientInterface', 'debug', 'debug');
const MetadataWrapper =
    require('../../../../../lib/storage/metadata/MetadataWrapper');
const { versioning } = require('../../../../../index');
const { BucketVersioningKeyFormat } = versioning.VersioningConstants;
const { makeBucketMD, putBulkObjectVersions } = require('./utils');

const IMPL_NAME = 'mongodb';
const DB_NAME = 'metadata';
const BUCKET_NAME = 'test-lifecycle-list-orphan-bucket';

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

describe('MongoClientInterface::metadata.listLifecycleObject::orphan', () => {
    let metadata;

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
                metadata.client.defaultBucketKeyFormat = BucketVersioningKeyFormat.v1;
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

    beforeEach(done => {
        const bucketMD = makeBucketMD(BUCKET_NAME);
        const versionParams = {
            versioning: true,
            versionId: null,
            repairMaster: null,
        };
        async.series([
            next => metadata.createBucket(BUCKET_NAME, bucketMD, logger, next),
            next => {
                const keyName = 'pfx0-test-object';

                const objVal = {
                    'key': keyName,
                    'isDeleteMarker': true,
                    'last-modified': new Date(0).toISOString(), // 1970-01-01T00:00:00.000Z
                };
                const params = {
                    versioning: true,
                };
                return metadata.putObjectMD(BUCKET_NAME, keyName, objVal, params, logger, next);
            },
            next => {
                const params = {
                    objName: 'pfx1-test-object',
                    objVal: {
                        key: 'pfx1-test-object',
                        versionId: 'null',
                    },
                    nbVersions: 1,
                };
                const timestamp = 0;
                putBulkObjectVersions(metadata, BUCKET_NAME, params.objName, params.objVal, versionParams,
                    params.nbVersions, timestamp, logger, next);
            },
            next => {
                const params = {
                    objName: 'pfx2-test-object',
                    objVal: {
                        key: 'pfx2-test-object',
                        versionId: 'null',
                    },
                    nbVersions: 1,
                };
                const timestamp = 0;
                putBulkObjectVersions(metadata, BUCKET_NAME, params.objName, params.objVal, versionParams,
                    params.nbVersions, timestamp, logger, next);
            },
            next => {
                const keyName = 'pfx2-test-object';

                const objVal = {
                    'key': keyName,
                    'isDeleteMarker': true,
                    'last-modified': new Date(2).toISOString(), // 1970-01-01T00:00:00.002Z
                };
                const params = {
                    versioning: true,
                };
                return metadata.putObjectMD(BUCKET_NAME, keyName, objVal, params, logger, next);
            },
            next => {
                const keyName = 'pfx3-test-object';

                const objVal = {
                    'key': keyName,
                    'isDeleteMarker': true,
                    'last-modified': new Date(0).toISOString(), // 1970-01-01T00:00:00.000Z
                };
                const params = {
                    versioning: true,
                };
                return metadata.putObjectMD(BUCKET_NAME, keyName, objVal, params, logger, next);
            },
            next => {
                const keyName = 'pfx4-test-object';

                const objVal = {
                    'key': keyName,
                    'isDeleteMarker': true,
                    'last-modified': new Date(5).toISOString(), // 1970-01-01T00:00:00.005Z
                };
                const params = {
                    versioning: true,
                };
                return metadata.putObjectMD(BUCKET_NAME, keyName, objVal, params, logger, next);
            },
            next => {
                const keyName = 'pfx4-test-object2';

                const objVal = {
                    'key': keyName,
                    'isDeleteMarker': true,
                    'last-modified': new Date(6).toISOString(), // 1970-01-01T00:00:00.006Z
                };
                const params = {
                    versioning: true,
                };
                return metadata.putObjectMD(BUCKET_NAME, keyName, objVal, params, logger, next);
            },
        ], done);
    });
    /* eslint-disable max-len */
    // { "_id" : "Mpfx1-test-object", "value" : { "key" : "pfx1-test-object", "versionId" : "v1", "last-modified" : "1970-01-01T00:00:00.001Z" } }
    // { "_id" : "Vpfx0-test-object{sep}v0", "value" : { "key" : "pfx0-test-object", "isDeleteMarker" : true, "last-modified" : "1970-01-01T00:00:00.000Z", "versionId" : "v0" } }
    // { "_id" : "Vpfx1-test-object{sep}v1", "value" : { "key" : "pfx1-test-object", "versionId" : "v1", "last-modified" : "1970-01-01T00:00:00.001Z" } }
    // { "_id" : "Vpfx2-test-object{sep}v3", "value" : { "key" : "pfx2-test-object", "isDeleteMarker" : true, "last-modified" : "1970-01-01T00:00:00.002Z", "versionId" : "v3" } }
    // { "_id" : "Vpfx2-test-object{sep}v2", "value" : { "key" : "pfx2-test-object", "versionId" : "v2", "last-modified" : "1970-01-01T00:00:00.001Z" } }
    // { "_id" : "Vpfx3-test-object{sep}v4", "value" : { "key" : "pfx3-test-object", "isDeleteMarker" : true, "last-modified" : "1970-01-01T00:00:00.000Z", "versionId" : "v4" } }
    // { "_id" : "Vpfx4-test-object{sep}v5", "value" : { "key" : "pfx4-test-object", "isDeleteMarker" : true, "last-modified" : "1970-01-01T00:00:00.005Z", "versionId" : "v5" } }
    // { "_id" : "Vpfx4-test-object2{sep}v6", "value" : { "key" : "pfx4-test-object", "isDeleteMarker" : true, "last-modified" : "1970-01-01T00:00:00.006Z", "versionId" : "v6" } }
    /* eslint-enable max-len */

    afterEach(done => {
        metadata.deleteBucket(BUCKET_NAME, logger, done);
    });

    it('Should list orphan delete markers', done => {
        const params = {
            listingType: 'DelimiterOrphanDeleteMarker',
        };
        return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
            assert.deepStrictEqual(err, null);
            assert.strictEqual(data.IsTruncated, false);
            assert(!data.NextMarker);
            assert.strictEqual(data.Contents.length, 4);
            assert.strictEqual(data.Contents[0].key, 'pfx0-test-object');
            assert.strictEqual(data.Contents[1].key, 'pfx3-test-object');
            assert.strictEqual(data.Contents[2].key, 'pfx4-test-object');
            assert.strictEqual(data.Contents[3].key, 'pfx4-test-object2');
            return done();
        });
    });

    it('Should return empty list when beforeDate is before youngest last-modified', done => {
        const params = {
            listingType: 'DelimiterOrphanDeleteMarker',
            beforeDate: '1970-01-01T00:00:00.000Z',
        };
        return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
            assert.deepStrictEqual(err, null);
            assert.strictEqual(data.IsTruncated, false);
            assert(!data.NextMarker);
            assert.strictEqual(data.Contents.length, 0);

            return done();
        });
    });

    it('Should list orphan delete markers older than 1970-01-01T00:00:00.003Z', done => {
        const params = {
            listingType: 'DelimiterOrphanDeleteMarker',
            beforeDate: '1970-01-01T00:00:00.003Z',
        };
        return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
            assert.deepStrictEqual(err, null);
            assert.strictEqual(data.IsTruncated, false);
            assert(!data.NextMarker);
            assert.strictEqual(data.Contents.length, 2);
            assert.strictEqual(data.Contents[0].key, 'pfx0-test-object');
            assert.strictEqual(data.Contents[1].key, 'pfx3-test-object');

            return done();
        });
    });

    it('Should return the first part of the orphan delete markers listing', done => {
        const params = {
            listingType: 'DelimiterOrphanDeleteMarker',
            maxKeys: 1,
        };
        return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
            assert.deepStrictEqual(err, null);
            assert.strictEqual(data.IsTruncated, true);
            assert.strictEqual(data.NextMarker, 'pfx0-test-object');
            assert.strictEqual(data.Contents.length, 1);
            assert.strictEqual(data.Contents[0].key, 'pfx0-test-object');

            return done();
        });
    });

    it('Should return the second part of the orphan delete markers listing', done => {
        const params = {
            listingType: 'DelimiterOrphanDeleteMarker',
            marker: 'pfx0-test-object',
            maxKeys: 1,
        };
        return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
            assert.deepStrictEqual(err, null);
            assert.strictEqual(data.IsTruncated, true);
            assert.strictEqual(data.NextMarker, 'pfx3-test-object');
            assert.strictEqual(data.Contents.length, 1);
            assert.strictEqual(data.Contents[0].key, 'pfx3-test-object');

            return done();
        });
    });

    it('Should return the third part of the orphan delete markers listing', done => {
        const params = {
            listingType: 'DelimiterOrphanDeleteMarker',
            marker: 'pfx3-test-object',
            maxKeys: 1,
        };
        return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
            assert.deepStrictEqual(err, null);
            assert.strictEqual(data.IsTruncated, true);
            assert.strictEqual(data.NextMarker, 'pfx4-test-object');
            assert.strictEqual(data.Contents.length, 1);
            assert.strictEqual(data.Contents[0].key, 'pfx4-test-object');

            return done();
        });
    });

    it('Should return the fourth part of the orphan delete markers listing', done => {
        const params = {
            listingType: 'DelimiterOrphanDeleteMarker',
            marker: 'pfx4-test-object',
            maxKeys: 1,
        };
        return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
            assert.deepStrictEqual(err, null);
            assert.strictEqual(data.IsTruncated, false);
            assert(!data.NextMarker);
            assert.strictEqual(data.Contents.length, 1);
            assert.strictEqual(data.Contents[0].key, 'pfx4-test-object2');

            return done();
        });
    });

    it('Should list the two first orphan delete markers', done => {
        const params = {
            listingType: 'DelimiterOrphanDeleteMarker',
            maxKeys: 2,
        };
        return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
            assert.deepStrictEqual(err, null);
            assert.strictEqual(data.IsTruncated, true);
            assert.strictEqual(data.Contents.length, 2);
            assert.strictEqual(data.NextMarker, 'pfx3-test-object');
            assert.strictEqual(data.Contents[0].key, 'pfx0-test-object');
            assert.strictEqual(data.Contents[1].key, 'pfx3-test-object');

            return done();
        });
    });

    it('Should list the four first orphan delete markers', done => {
        const params = {
            listingType: 'DelimiterOrphanDeleteMarker',
            maxKeys: 4,
        };
        return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
            assert.deepStrictEqual(err, null);
            assert.strictEqual(data.IsTruncated, false);
            assert(!data.NextMarker);
            assert.strictEqual(data.Contents.length, 4);
            assert.strictEqual(data.Contents[0].key, 'pfx0-test-object');
            assert.strictEqual(data.Contents[1].key, 'pfx3-test-object');
            assert.strictEqual(data.Contents[2].key, 'pfx4-test-object');
            assert.strictEqual(data.Contents[3].key, 'pfx4-test-object2');

            return done();
        });
    });

    it('Should return an empty list if no orphan delete marker starts with prefix pfx2', done => {
        const params = {
            listingType: 'DelimiterOrphanDeleteMarker',
            prefix: 'pfx2',
        };
        return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
            assert.deepStrictEqual(err, null);
            assert.strictEqual(data.IsTruncated, false);
            assert(!data.NextMarker);
            assert.strictEqual(data.Contents.length, 0);

            return done();
        });
    });

    it('Should list orphan delete markers that start with prefix pfx4', done => {
        const params = {
            listingType: 'DelimiterOrphanDeleteMarker',
            prefix: 'pfx4',
        };
        return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
            assert.deepStrictEqual(err, null);
            assert.strictEqual(data.IsTruncated, false);
            assert(!data.NextMarker);
            assert.strictEqual(data.Contents.length, 2);
            assert.strictEqual(data.Contents[0].key, 'pfx4-test-object');
            assert.strictEqual(data.Contents[1].key, 'pfx4-test-object2');

            return done();
        });
    });

    it('Should return the first orphan delete marker version that starts with prefix', done => {
        const params = {
            listingType: 'DelimiterOrphanDeleteMarker',
            prefix: 'pfx4',
            maxKeys: 1,
        };
        return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
            assert.deepStrictEqual(err, null);
            assert.strictEqual(data.IsTruncated, true);
            assert.strictEqual(data.Contents.length, 1);
            assert.strictEqual(data.NextMarker, 'pfx4-test-object');
            assert.strictEqual(data.Contents[0].key, 'pfx4-test-object');

            return done();
        });
    });

    it('Should return the following orphan delete marker version that starts with prefix', done => {
        const params = {
            listingType: 'DelimiterOrphanDeleteMarker',
            marker: 'pfx4-test-object',
            prefix: 'pfx4',
            maxKeys: 1,
        };
        return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
            assert.deepStrictEqual(err, null);
            assert.strictEqual(data.IsTruncated, false);
            assert(!data.NextMarker);
            assert.strictEqual(data.Contents.length, 1);
            assert.strictEqual(data.Contents[0].key, 'pfx4-test-object2');

            return done();
        });
    });

    it('Should return the truncated list of orphan delete markers older than 1970-01-01T00:00:00.006Z', done => {
        const params = {
            listingType: 'DelimiterOrphanDeleteMarker',
            maxKeys: 2,
            beforeDate: '1970-01-01T00:00:00.006Z',
        };
        return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
            assert.deepStrictEqual(err, null);
            assert.strictEqual(data.IsTruncated, true);
            assert.strictEqual(data.Contents.length, 2);
            assert.strictEqual(data.Contents[0].key, 'pfx0-test-object');
            assert.strictEqual(data.Contents[1].key, 'pfx3-test-object');
            assert.strictEqual(data.NextMarker, 'pfx3-test-object');

            return done();
        });
    });

    it('Should return the following list of orphan delete markers older than 1970-01-01T00:00:00.006Z', done => {
        const params = {
            listingType: 'DelimiterOrphanDeleteMarker',
            maxKeys: 2,
            beforeDate: '1970-01-01T00:00:00.006Z',
            marker: 'pfx3-test-object',
        };
        return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
            assert.deepStrictEqual(err, null);
            assert.strictEqual(data.IsTruncated, false);
            assert.strictEqual(data.Contents.length, 1);
            assert.strictEqual(data.Contents[0].key, 'pfx4-test-object');

            return done();
        });
    });

    it('Should return the truncated list of orphan delete markers older than 1970-01-01T00:00:00.001Z', done => {
        const params = {
            listingType: 'DelimiterOrphanDeleteMarker',
            maxKeys: 2,
            beforeDate: '1970-01-01T00:00:00.001Z',
        };
        return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
            assert.deepStrictEqual(err, null);
            assert.strictEqual(data.IsTruncated, true);
            assert.strictEqual(data.Contents.length, 2);
            assert.strictEqual(data.Contents[0].key, 'pfx0-test-object');
            assert.strictEqual(data.Contents[1].key, 'pfx3-test-object');
            assert.strictEqual(data.NextMarker, 'pfx3-test-object');

            return done();
        });
    });
});
