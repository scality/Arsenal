const assert = require('assert');
const util = require('util');
const werelogs = require('werelogs');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const logger = new werelogs.Logger('MongoClientInterface', 'debug', 'debug');
const BucketInfo = require('../../../../lib/models/BucketInfo').default;
const MetadataWrapper = require('../../../../lib/storage/metadata/MetadataWrapper');

const IMPL_NAME = 'mongodb';
const DB_NAME = 'metadata';
const BUCKET_NAME = 'test-put-bucket-indexes';

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
    instanceOpts: [{ port: 27024 }],
    replSet: {
        name: 'rs0',
        count: 1,
        DB_NAME,
        storageEngine: 'wiredTiger',
    },
});

describe('MongoClientInterface:putBucketIndexes error handling', () => {
    let metadata;
    let putBucketIndexes;

    beforeAll(async () => {
        await mongoserver.start();
        await mongoserver.waitUntilRunning();

        const opts = {
            mongodb: {
                replicaSetHosts: 'localhost:27024',
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
        putBucketIndexes = util.promisify(metadata.client.putBucketIndexes.bind(metadata.client));

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

    const okSpec = [
        {
            keys: [{ key: 'value.last-modified', order: 1 }],
            name: 'lastModified',
        },
    ];

    it('should succeed on a valid index spec', async () => {
        await putBucketIndexes(BUCKET_NAME, okSpec, logger);
    });

    it('should return InternalError when indexBuildMinAvailableDiskSpaceMB exceeds available disk', async () => {
        const adminDb = metadata.client.client.db('admin');
        const getRes = await adminDb.command({
            getParameter: 1,
            indexBuildMinAvailableDiskSpaceMB: 1,
        });
        const prevValue = getRes.indexBuildMinAvailableDiskSpaceMB;
        // 100 TiB in MB — larger than any plausible test machine disk
        await adminDb.command({
            setParameter: 1,
            indexBuildMinAvailableDiskSpaceMB: 100 * 1024 * 1024,
        });
        const spec = [
            {
                keys: [{ key: 'value.creation-date', order: 1 }],
                name: 'disk-kill-test-idx',
            },
        ];
        try {
            await putBucketIndexes(BUCKET_NAME, spec, logger);
        } catch (err) {
            assert(err.is.InternalError, `expected InternalError, got ${err.name} (${err.message})`);
            return;
        } finally {
            await adminDb.command({
                setParameter: 1,
                indexBuildMinAvailableDiskSpaceMB: prevValue,
            });
        }
        assert.fail('expected an error from putBucketIndexes');
    });

    it('should return InternalError on a spec conflict (same name, different keys)', async () => {
        const conflictingSpec = [
            {
                keys: [{ key: 'value.dataStoreName', order: 1 }],
                name: 'lastModified',
            },
        ];
        try {
            await putBucketIndexes(BUCKET_NAME, conflictingSpec, logger);
        } catch (err) {
            assert(err.is.InternalError, `expected InternalError, got ${err.name} (${err.message})`);
            return;
        }
        assert.fail('expected an error from putBucketIndexes');
    });
});
