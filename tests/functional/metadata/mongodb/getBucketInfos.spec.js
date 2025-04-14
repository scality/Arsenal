const assert = require('assert');
const sinon = require('sinon');
const util = require('util');
const werelogs = require('werelogs');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const logger = new werelogs.Logger('MongoClientInterface', 'debug', 'debug');
const BucketInfo = require('../../../../lib/models/BucketInfo').default;
const MetadataWrapper =
    require('../../../../lib/storage/metadata/MetadataWrapper');

const IMPL_NAME = 'mongodb';
const DB_NAME = 'metadata';
const BUCKET_NAME = 'bucket';
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
        { port: 27021 },
    ],
    replSet: {
        name: 'rs0',
        count: 1,
        DB_NAME,
        storageEngine: 'wiredTiger',
    },
});

describe('MongoClientInterface:metadata.getBucketInfos', () => {
    let metadata;

    beforeAll(async () => {
        await mongoserver.start();
        await mongoserver.waitUntilRunning();

        const opts = {
            mongodb: {
                replicaSetHosts: 'localhost:27021',
                writeConcern: 'majority',
                replicaSet: 'rs0',
                readPreference: 'primary',
                database: DB_NAME,
            },
        };
        metadata = new MetadataWrapper(IMPL_NAME, opts, null, logger);
        metadata.setup = util.promisify(metadata.setup.bind(metadata));
        metadata.createBucket = util.promisify(metadata.createBucket.bind(metadata));
        metadata.getBucketInfos = util.promisify(metadata.client.getBucketInfos.bind(metadata.client));
        metadata.close = util.promisify(metadata.close.bind(metadata));

        await metadata.setup();

        // create collections + metastore info
        for (let i = 0; i < 10; i++) {
            const bucketName = `${BUCKET_NAME}${i}`;
            const bucketMD = BucketInfo.fromObj({
                _name: bucketName,
                ...BUCKET_MD,
            });

            await metadata.createBucket(bucketName, bucketMD, logger);
        }
    });

    afterAll(async () => {
        await metadata.close();
        await mongoserver.stop();
    });

    afterEach(() => {
        sinon.restore();
    });

    const checkBuckets = async (metadata) => {
        const { bucketCount, bucketInfos } = await metadata.getBucketInfos(logger);
        assert.strictEqual(bucketCount, 10);
        assert.strictEqual(bucketInfos.length, 10);

        bucketInfos.sort((a, b) => a.getName().localeCompare(b.getName()));
        bucketInfos.forEach((bucketInfo, index) => {
            assert.strictEqual(bucketInfo.getName(), `${BUCKET_NAME}${index}`);
        });
    };

    it('should return all collection', async () => {
        await checkBuckets(metadata);
    });

    it('should not return collection w/o bucket', async () => {
        await metadata.client.db.createCollection('coll1');

        await checkBuckets(metadata);
    });

    it('should ignore views & system.views collection', async () => {
        await metadata.client.db.command({
            create: 'view1', viewOn: `${BUCKET_NAME}0`, pipeline: [{
                $match: { _locationConstraint: 'us-east-1' },
            }],
        });

        await checkBuckets(metadata);
    });

    it('should fail on getBucketAttributes error', async () => {
        sinon.stub(metadata.client, 'getBucketAttributes')
            .callThrough()
            .onSecondCall().callsArgWith(2, new Error('error'));

        try {
            await metadata.getBucketInfos(logger);
            assert.fail('Expected an error');
        } catch (err) {
            assert.strictEqual(err.is?.InternalError, true);
        }
    });
});
