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
const BUCKET_NAME = 'test-lifecycle-list-bucket-v0';

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

describe('MongoClientInterface::metadata.listLifecycleObject::global', () => {
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
            metadata.client.defaultBucketKeyFormat = BucketVersioningKeyFormat.v0;
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

    afterEach(done => {
        metadata.deleteBucket(BUCKET_NAME, logger, done);
    });

    it('Should return error listing current versions if v0 key format', done => {
        const params = {
            listingType: 'DelimiterCurrent',
        };
        return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
            expect(err.InternalError).toBe(true);
            assert(!data);

            return done();
        });
    });

    it('Should return error listing non-current versions if v0 key format', done => {
        const params = {
            listingType: 'DelimiterNonCurrent',
        };
        return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
            expect(err.InternalError).toBe(true);
            assert(!data);

            return done();
        });
    });

    it('Should return error listing orphans delete markers if v0 key format', done => {
        const params = {
            listingType: 'DelimiterOrphan',
        };
        return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
            expect(err.InternalError).toBe(true);
            assert(!data);

            return done();
        });
    });
});
