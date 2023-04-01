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
                    'versionId': 'null',
                    'last-modified': lastModified,
                };
                return metadata.putObjectMD(BUCKET_NAME, objName, objVal, versionParams, logger, next);
            },
        ], done);
    });

    afterEach(done => {
        metadata.deleteBucket(BUCKET_NAME, logger, done);
    });

    it('Should list the null current version and set IsNull to true', done => {
        const params = {
            listingType: 'DelimiterCurrent',
        };
        return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
            assert.ifError(err);
            assert.strictEqual(data.IsTruncated, false);
            assert.strictEqual(data.Contents.length, 2);

            // check that key0 has a null current version
            const firstKey = data.Contents[0];
            assert.strictEqual(firstKey.key, 'key0');
            assert.strictEqual(firstKey.value.IsNull, true);

            // check that key1 has not a null current version
            const secondKey = data.Contents[1];
            assert.strictEqual(secondKey.key, 'key1');
            assert(!secondKey.value.IsNull);
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
            assert.strictEqual(data.Contents.length, 1);

            // check that key1 has a null non-current version
            const firstKey = data.Contents[0];
            assert.strictEqual(firstKey.key, 'key1');
            assert.strictEqual(firstKey.value.IsNull, true);
            return done();
        });
    });
});
