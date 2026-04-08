const assert = require('assert');
const util = require('util');
const werelogs = require('werelogs');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const logger = new werelogs.Logger('MongoClientInterface', 'debug', 'debug');
const BucketInfo = require('../../../../lib/models/BucketInfo').default;
const MetadataWrapper =
    require('../../../../lib/storage/metadata/MetadataWrapper');

const IMPL_NAME = 'mongodb';
const DB_NAME = 'metadata';
const BUCKET_NAME = 'test-bucket';
const BUCKET_MD = {
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
};

const mongoserver = new MongoMemoryReplSet({
    debug: false,
    instanceOpts: [
        { port: 27023 },
    ],
    replSet: {
        name: 'rs0',
        count: 1,
        DB_NAME,
        storageEngine: 'wiredTiger',
    },
});

describe('MongoClientInterface:getDiskUsage and getCollectionStats', () => {
    let metadata;

    beforeAll(async () => {
        await mongoserver.start();
        await mongoserver.waitUntilRunning();

        const opts = {
            mongodb: {
                replicaSetHosts: 'localhost:27023',
                writeConcern: 'majority',
                replicaSet: 'rs0',
                readPreference: 'primary',
                database: DB_NAME,
            },
        };
        metadata = new MetadataWrapper(IMPL_NAME, opts, null, logger);
        metadata.setup = util.promisify(metadata.setup.bind(metadata));
        metadata.createBucket = util.promisify(metadata.createBucket.bind(metadata));
        metadata.close = util.promisify(metadata.close.bind(metadata));

        await metadata.setup();

        const bucketMD = BucketInfo.fromObj({
            _name: BUCKET_NAME,
            ...BUCKET_MD,
        });
        await metadata.createBucket(BUCKET_NAME, bucketMD, logger);
    });

    afterAll(async () => {
        await metadata.close();
        await mongoserver.stop();
    });

    it('getDiskUsage should return disk usage with numeric values', done => {
        metadata.client.getDiskUsage((err, result) => {
            assert.ifError(err);
            assert(typeof result.available === 'number');
            assert(typeof result.free === 'number');
            assert(typeof result.total === 'number');
            assert(result.total > 0);
            assert(result.free >= 0);
            assert(result.available >= 0);
            assert.strictEqual(result.free, result.available);
            assert(result.free <= result.total);
            done();
        });
    });

    it('getCollectionStats should return stats with index sizes', done => {
        metadata.client.getCollectionStats(BUCKET_NAME, logger, (err, stats) => {
            assert.ifError(err);
            assert(typeof stats.totalIndexSize === 'number');
            assert(stats.totalIndexSize > 0);
            assert(typeof stats.indexSizes === 'object');
            assert(typeof stats.indexSizes._id_ === 'number');
            assert(stats.indexSizes._id_ > 0);
            done();
        });
    });
});
