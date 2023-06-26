const async = require('async');
const assert = require('assert');
const werelogs = require('werelogs');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const logger = new werelogs.Logger('MongoClientInterface', 'debug', 'debug');
const MetadataWrapper =
require('../../../../../lib/storage/metadata/MetadataWrapper');
const { versioning } = require('../../../../../index');
const { BucketVersioningKeyFormat } = versioning.VersioningConstants;
const { makeBucketMD } = require('./utils');

const IMPL_NAME = 'mongodb';
const DB_NAME = 'metadata';

const BUCKET_NAME = 'test-lifecycle-list-bucket-null';

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

describe('MongoClientInterface::metadata.listLifecycleObject::nullVersion', () => {
    let metadata;

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
        return metadata.createBucket(BUCKET_NAME, bucketMD, logger, done);
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
                const objName = 'key0';
                const timestamp = 0;

                const lastModified = new Date(timestamp).toISOString();
                const objVal = {
                    'key': objName,
                    'versionId': 'null',
                    'isNull': true,
                    'last-modified': lastModified,
                };
                return metadata.putObjectMD(BUCKET_NAME, objName, objVal, versionParams, logger, next);
            },
            next => {
                const objName = 'key1';
                const timestamp = 0;

                const lastModified = new Date(timestamp).toISOString();
                const objVal = {
                    'key': objName,
                    'versionId': 'null',
                    'isNull': true,
                    'last-modified': lastModified,
                };
                return metadata.putObjectMD(BUCKET_NAME, objName, objVal, versionParams, logger, next);
            },
            next => {
                const objName = 'key1';
                const timestamp = 0;

                const lastModified = new Date(timestamp).toISOString();
                const objVal = {
                    'key': objName,
                    'last-modified': lastModified,
                };
                return metadata.putObjectMD(BUCKET_NAME, objName, objVal, versionParams, logger, next);
            },
            // key2 simulates a scenario where:
            // 1) bucket is versioned
            // 2) put object key2
            // 3) bucket versioning gets suspended
            // 4) put object key2
            // result:
            // {
            //     "_id" : "Mkey0",
            //     "value" : {
            //         "key" : "key2",
            //         "isNull" : true,
            //         "versionId" : "<VersionId2>",
            //         "last-modified" : "2023-07-11T14:16:00.151Z",
            //     }
            // },
            // {
            //     "_id" : "Vkey0\u0000<VersionId1>",
            //     "value" : {
            //         "key" : "key2",
            //         "versionId" : "<VersionId1>",
            //         "tags" : {
            //         },
            //         "last-modified" : "2023-07-11T14:15:36.713Z",
            //     }
            // },
            next => {
                const objName = 'key2';
                const timestamp = 0;

                const lastModified = new Date(timestamp).toISOString();
                const objVal = {
                    'key': objName,
                    'last-modified': lastModified,
                };
                return metadata.putObjectMD(BUCKET_NAME, objName, objVal, versionParams, logger, next);
            },
            next => {
                const objName = 'key2';
                const timestamp = 0;
                const params = {
                    versionId: '',
                };

                const lastModified = new Date(timestamp).toISOString();
                const objVal = {
                    'key': objName,
                    'last-modified': lastModified,
                    'isNull': true,
                };
                return metadata.putObjectMD(BUCKET_NAME, objName, objVal, params, logger, next);
            },
        ], done);
    });

    afterEach(done => metadata.deleteBucket(BUCKET_NAME, logger, done));

    it('Should list the null current version and set IsNull to true', done => {
        const params = {
            listingType: 'DelimiterCurrent',
        };
        return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
            assert.ifError(err);
            assert.strictEqual(data.IsTruncated, false);
            assert.strictEqual(data.Contents.length, 3);

            // check that key0 has a null current version
            const firstKey = data.Contents[0];
            assert.strictEqual(firstKey.key, 'key0');
            assert.strictEqual(firstKey.value.IsNull, true);

            // check that key1 has no null current version
            const secondKey = data.Contents[1];
            assert.strictEqual(secondKey.key, 'key1');
            assert(!secondKey.value.IsNull);

            // check that key2 has a null current version
            const thirdKey = data.Contents[2];
            assert.strictEqual(thirdKey.key, 'key2');
            assert.strictEqual(thirdKey.value.IsNull, true);
            return done();
        });
    });

    it('Should list the null non-current version and set IsNull to true', done => {
        const params = {
            listingType: 'DelimiterNonCurrent',
        };
        return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
            assert.deepStrictEqual(err, null);
            assert.strictEqual(data.IsTruncated, false);
            assert.strictEqual(data.Contents.length, 2);

            // check that key1 has a null non-current version
            const firstKey = data.Contents[0];
            assert.strictEqual(firstKey.key, 'key1');
            assert.strictEqual(firstKey.value.IsNull, true);

            // check that key2 has no null non-current version
            const secondKey = data.Contents[1];
            assert.strictEqual(secondKey.key, 'key2');
            assert(!secondKey.value.IsNull);
            return done();
        });
    });
});
