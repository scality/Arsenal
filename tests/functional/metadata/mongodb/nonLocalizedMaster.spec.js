const assert = require('assert');
const { promisify } = require('util');
const werelogs = require('werelogs');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { versioning } = require('../../../../index');
const logger = new werelogs.Logger('MongoClientInterface', 'debug', 'debug');
const BucketInfo = require('../../../../lib/models/BucketInfo').default;
const MetadataWrapper = require('../../../../lib/storage/metadata/MetadataWrapper');
const { formatMasterKey, formatVersionKey } = require('../../../../lib/storage/metadata/mongoclient/utils');
const genVID = versioning.VersionID.generateVersionId;
const { BucketVersioningKeyFormat } = versioning.VersioningConstants;

const IMPL_NAME = 'mongodb';
const DB_NAME = 'metadata';
const BUCKET_NAME = 'test-bucket';
const replicationGroupId = 'RG001';

const LOCAL_LOCATION = 'us-east-1';
const SOURCE_LOCATION = 'dr-source';

const locations = {
    [LOCAL_LOCATION]: { isCRR: false },
    [SOURCE_LOCATION]: { isCRR: true },
};

const mongoserver = new MongoMemoryReplSet({
    debug: false,
    instanceOpts: [{ port: 27025 }],
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

describe('MongoClientInterface::master key of non-localized versions', () => {
    let metadata;
    let createBucket;
    let deleteBucket;
    let putObjectMD;

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
     * Replicates a version the way the clean-room mongo-processor does: the
     * version id is preserved and the master is repaired, i.e. putObjectVerCase4.
     * @param {String} objName - object key
     * @param {String} dataStoreName - location the version data lives on
     * @param {String} [versionId] - version id, generated when omitted
     * @return {Promise<String>} the version id written
     */
    async function replicateVersion(objName, dataStoreName, versionId) {
        const vid = versionId || generateVersionId();
        const objVal = {
            key: objName,
            versionId: vid,
            dataStoreName,
            'last-modified': new Date().toJSON(),
        };
        await putObjectMD(BUCKET_NAME, objName, objVal, { versionId: vid, repairMaster: true }, logger);
        return vid;
    }

    function getMaster(objName, vFormat) {
        return metadata.client.getCollection(BUCKET_NAME).findOne({ _id: formatMasterKey(objName, vFormat) });
    }

    function getVersion(objName, versionId, vFormat) {
        return metadata.client
            .getCollection(BUCKET_NAME)
            .findOne({ _id: formatVersionKey(objName, versionId, vFormat) });
    }

    beforeAll(async () => {
        await mongoserver.start();
        await mongoserver.waitUntilRunning();
        const opts = {
            mongodb: {
                replicaSetHosts: 'localhost:27025',
                writeConcern: 'majority',
                replicaSet: 'rs0',
                readPreference: 'primary',
                database: DB_NAME,
            },
            locations,
        };
        metadata = new MetadataWrapper(IMPL_NAME, opts, null, logger);
        createBucket = promisify(metadata.createBucket.bind(metadata));
        deleteBucket = promisify(metadata.deleteBucket.bind(metadata));
        putObjectMD = promisify(metadata.putObjectMD.bind(metadata));
        await promisify(metadata.setup.bind(metadata))();
    });

    afterAll(async () => {
        await promisify(metadata.close.bind(metadata))();
        await mongoserver.stop();
    });

    variations.forEach(variation => {
        describe(`vFormat : ${variation.vFormat}`, () => {
            beforeEach(async () => {
                metadata.client.defaultBucketKeyFormat = variation.vFormat;
                await createBucket(BUCKET_NAME, bucketMD, logger);
            });

            afterEach(async () => {
                await deleteBucket(BUCKET_NAME, logger);
            });

            it('should write the version without creating a master', async () => {
                const versionId = await replicateVersion('pfx-nonlocalized', SOURCE_LOCATION);
                const version = await getVersion('pfx-nonlocalized', versionId, variation.vFormat);
                assert(version, 'the version key should have been written');
                assert.strictEqual(version.value.dataStoreName, SOURCE_LOCATION);
                assert.strictEqual(await getMaster('pfx-nonlocalized', variation.vFormat), null);
            });

            it('should create a master for a localized version', async () => {
                const versionId = await replicateVersion('pfx-localized', LOCAL_LOCATION);
                const master = await getMaster('pfx-localized', variation.vFormat);
                assert(master, 'the master key should have been written');
                assert.strictEqual(master.value.versionId, versionId);
            });

            it('should keep the master on the localized version when a newer one is not localized', async () => {
                const localizedVersionId = await replicateVersion('pfx-mixed', LOCAL_LOCATION);
                // a newer version sorts first, and would take over the master if localized
                await replicateVersion('pfx-mixed', SOURCE_LOCATION);
                const master = await getMaster('pfx-mixed', variation.vFormat);
                assert(master, 'the master key should still be there');
                assert.strictEqual(master.value.versionId, localizedVersionId);
                assert.strictEqual(master.value.dataStoreName, LOCAL_LOCATION);
            });

            it('should repair the master when the version gets localized', async () => {
                const versionId = await replicateVersion('pfx-localizing', SOURCE_LOCATION);
                assert.strictEqual(await getMaster('pfx-localizing', variation.vFormat), null);
                // the data copy rewrites the location, replaying the same version id
                await replicateVersion('pfx-localizing', LOCAL_LOCATION, versionId);
                const master = await getMaster('pfx-localizing', variation.vFormat);
                assert(master, 'the master key should have been repaired');
                assert.strictEqual(master.value.versionId, versionId);
                assert.strictEqual(master.value.dataStoreName, LOCAL_LOCATION);
            });
        });
    });
});
