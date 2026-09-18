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
    instanceOpts: [{ port: 27019 }],
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

describe('MongoClientInterface::hideNonLocalizedVersions', () => {
    let metadata;
    let createBucket;
    let deleteBucket;
    let putObjectMD;
    let getObject;
    let getObjects;
    let listObject;

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
     * Writes a localized version of an object, through the regular write path:
     * the master key follows the version.
     * @param {String} objName - object key
     * @param {Object} [extraMD] - additional object metadata fields
     * @return {Promise<String>} the version id written
     */
    async function putLocalizedVersion(objName, extraMD) {
        const objVal = Object.assign(
            {
                key: objName,
                dataStoreName: LOCAL_LOCATION,
                'last-modified': new Date().toJSON(),
            },
            extraMD,
        );
        const versionParams = {
            versioning: true,
            versionId: null,
            repairMaster: null,
        };
        const res = await putObjectMD(BUCKET_NAME, objName, objVal, versionParams, logger);
        return JSON.parse(res).versionId;
    }

    /**
     * Writes a non-localized version of an object: its data location still
     * refers to the source site until the data is copied locally. Only the
     * version key is written, the master key never pointing at a
     * non-localized version (write-time handling, ARSN-618): the version key
     * is inserted directly, the write path not implementing it yet.
     * @param {String} objName - object key
     * @param {String} vFormat - bucket key format
     * @return {Promise<String>} the version id written
     */
    async function putNonLocalizedVersion(objName, vFormat) {
        const versionId = generateVersionId();
        const objVal = {
            key: objName,
            versionId,
            dataStoreName: SOURCE_LOCATION,
            'last-modified': new Date().toJSON(),
        };
        await metadata.client
            .getCollection(BUCKET_NAME)
            .insertOne({ _id: formatVersionKey(objName, versionId, vFormat), value: objVal });
        return versionId;
    }

    function listMasters(hideNonLocalizedVersions) {
        return listObject(
            BUCKET_NAME,
            { listingType: 'DelimiterMaster', maxKeys: 100, hideNonLocalizedVersions },
            logger,
        );
    }

    function listVersions(hideNonLocalizedVersions) {
        return listObject(
            BUCKET_NAME,
            { listingType: 'DelimiterVersions', maxKeys: 100, hideNonLocalizedVersions },
            logger,
        );
    }

    beforeAll(async () => {
        await mongoserver.start();
        await mongoserver.waitUntilRunning();
        const opts = {
            mongodb: {
                replicaSetHosts: 'localhost:27019',
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
        getObject = promisify(metadata.client.getObject.bind(metadata.client));
        getObjects = promisify(metadata.client.getObjects.bind(metadata.client));
        listObject = promisify(metadata.client.listObject.bind(metadata.client));
        await promisify(metadata.setup.bind(metadata))();
    });

    afterAll(async () => {
        await promisify(metadata.close.bind(metadata))();
        await mongoserver.stop();
    });

    variations.forEach(variation => {
        describe(`vFormat : ${variation.vFormat}`, () => {
            // 'pfx-localized': two localized versions, master on the newest
            // 'pfx-mixed': localized version kept as master, newer version not
            //              localized
            // 'pfx-nonlocalized': single non-localized version, no master
            // 'pfx-deletemarker': localized version, hidden by a delete marker
            let localizedV1;
            let mixedLocalizedVersionId;
            let mixedNonLocalizedVersionId;
            let nonLocalizedVersionId;

            beforeEach(async () => {
                metadata.client.defaultBucketKeyFormat = variation.vFormat;
                await createBucket(BUCKET_NAME, bucketMD, logger);
                localizedV1 = await putLocalizedVersion('pfx-localized', null);
                await putLocalizedVersion('pfx-localized', null);
                mixedLocalizedVersionId = await putLocalizedVersion('pfx-mixed', null);
                mixedNonLocalizedVersionId = await putNonLocalizedVersion('pfx-mixed', variation.vFormat);
                nonLocalizedVersionId = await putNonLocalizedVersion('pfx-nonlocalized', variation.vFormat);
                await putLocalizedVersion('pfx-deletemarker', null);
                await putLocalizedVersion('pfx-deletemarker', { isDeleteMarker: true, dataStoreName: '' });
            });

            afterEach(() => deleteBucket(BUCKET_NAME, logger));

            /**
             * Emulates the bootstrap load of a clean room, where the master
             * restored from the source site still points at a non-localized
             * version: copies a version over the master key.
             * @param {String} objName - object key
             * @param {String} versionId - version to copy over the master
             * @return {Promise<undefined>}
             */
            async function copyVersionOverMaster(objName, versionId) {
                const c = metadata.client.getCollection(BUCKET_NAME);
                const doc = await c.findOne({ _id: formatVersionKey(objName, versionId, variation.vFormat) });
                await c.updateOne({ _id: formatMasterKey(objName, variation.vFormat) }, { $set: { value: doc.value } });
            }

            it('should list the master as the newest localized version', async () => {
                const data = await listMasters(true);
                const mixed = JSON.parse(data.Contents.find(entry => entry.key === 'pfx-mixed').value);
                assert.strictEqual(mixed.versionId, mixedLocalizedVersionId);
                assert.strictEqual(mixed.dataStoreName, LOCAL_LOCATION);
            });

            it('should leave the master listing untouched, the master being localized', async () => {
                const unfiltered = await listMasters(false);
                const filtered = await listMasters(true);
                assert.deepStrictEqual(filtered.Contents, unfiltered.Contents);
            });

            it('should list all the versions when the flag is not set', async () => {
                const data = await listVersions(false);
                // 2 versions each for 'pfx-localized', 'pfx-mixed' and
                // 'pfx-deletemarker' (including its delete marker), plus
                // the single version of 'pfx-nonlocalized'
                assert.strictEqual(data.Versions.length, 7);
            });

            it('should exclude the non-localized versions from the version listing', async () => {
                const data = await listVersions(true);
                const versions = data.Versions.map(entry => entry.key);
                // 2 versions of 'pfx-localized', the localized version of
                // 'pfx-mixed', and the delete marker plus the localized
                // version of 'pfx-deletemarker'
                assert.deepStrictEqual(versions, [
                    'pfx-deletemarker',
                    'pfx-deletemarker',
                    'pfx-localized',
                    'pfx-localized',
                    'pfx-mixed',
                ]);
            });

            it('should keep the delete markers visible', async () => {
                const data = await listVersions(true);
                const deleteMarkers = data.Versions.filter(entry => JSON.parse(entry.value).isDeleteMarker);
                assert.strictEqual(deleteMarkers.length, 1);
            });

            it('should page the version listing consistently', async () => {
                const listed = [];
                let keyMarker;
                let versionIdMarker;
                for (;;) {
                    const data = await listObject(
                        BUCKET_NAME,
                        {
                            listingType: 'DelimiterVersions',
                            maxKeys: 1,
                            hideNonLocalizedVersions: true,
                            keyMarker,
                            versionIdMarker,
                        },
                        logger,
                    );
                    data.Versions.forEach(entry => listed.push(entry.key));
                    if (!data.IsTruncated) {
                        break;
                    }
                    keyMarker = data.NextKeyMarker;
                    versionIdMarker = data.NextVersionIdMarker;
                }
                assert.deepStrictEqual(listed, [
                    'pfx-deletemarker',
                    'pfx-deletemarker',
                    'pfx-localized',
                    'pfx-localized',
                    'pfx-mixed',
                ]);
            });

            if (variation.vFormat === BucketVersioningKeyFormat.v1) {
                it('should resolve a listed PHD key against the localized versions only', async () => {
                    const phdLocalizedVersionId = await putLocalizedVersion('pfx-phd', null);
                    await putNonLocalizedVersion('pfx-phd', variation.vFormat);
                    await metadata.client
                        .getCollection(BUCKET_NAME)
                        .updateOne(
                            { _id: formatMasterKey('pfx-phd', variation.vFormat) },
                            { $set: { 'value.isPHD': true } },
                        );
                    const data = await listMasters(false);
                    const phd = JSON.parse(data.Contents.find(entry => entry.key === 'pfx-phd').value);
                    assert.strictEqual(phd.versionId, phdLocalizedVersionId);
                });
            }

            it('should return NoSuchKey when getting a non-localized version', async () => {
                await assert.rejects(
                    getObject(
                        BUCKET_NAME,
                        'pfx-mixed',
                        { versionId: mixedNonLocalizedVersionId, hideNonLocalizedVersions: true },
                        logger,
                    ),
                    err => err.is.NoSuchKey,
                );
            });

            it('should return a localized version with the flag set', async () => {
                const data = await getObject(
                    BUCKET_NAME,
                    'pfx-localized',
                    { versionId: localizedV1, hideNonLocalizedVersions: true },
                    logger,
                );
                assert.strictEqual(data.dataStoreName, LOCAL_LOCATION);
            });

            it('should return NoSuchKey on an object having no localized version', async () => {
                await assert.rejects(
                    getObject(BUCKET_NAME, 'pfx-nonlocalized', { hideNonLocalizedVersions: true }, logger),
                    err => err.is.NoSuchKey,
                );
            });

            it('should return the master, i.e. the newest localized version', async () => {
                const data = await getObject(BUCKET_NAME, 'pfx-mixed', { hideNonLocalizedVersions: true }, logger);
                assert.strictEqual(data.versionId, mixedLocalizedVersionId);
                assert.strictEqual(data.dataStoreName, LOCAL_LOCATION);
            });

            it('should resolve a non-localized master to the newest localized version', async () => {
                await copyVersionOverMaster('pfx-mixed', mixedNonLocalizedVersionId);
                const data = await getObject(BUCKET_NAME, 'pfx-mixed', { hideNonLocalizedVersions: true }, logger);
                assert.strictEqual(data.versionId, mixedLocalizedVersionId);
                assert.strictEqual(data.dataStoreName, LOCAL_LOCATION);
            });

            it('should return a non-localized master when the flag is not set', async () => {
                await copyVersionOverMaster('pfx-mixed', mixedNonLocalizedVersionId);
                const data = await getObject(BUCKET_NAME, 'pfx-mixed', {}, logger);
                assert.strictEqual(data.versionId, mixedNonLocalizedVersionId);
                assert.strictEqual(data.dataStoreName, SOURCE_LOCATION);
            });

            it('should resolve an absent master against the localized versions only', async () => {
                await assert.rejects(getObject(BUCKET_NAME, 'pfx-nonlocalized', {}, logger), err => err.is.NoSuchKey);
            });

            it('should filter a batch of objects', async () => {
                const objects = [
                    { key: 'pfx-localized', params: { hideNonLocalizedVersions: true } },
                    {
                        key: 'pfx-nonlocalized',
                        params: { versionId: nonLocalizedVersionId, hideNonLocalizedVersions: true },
                    },
                ];
                const data = await getObjects(BUCKET_NAME, objects, logger);
                assert.ifError(data[0].err);
                assert.strictEqual(data[0].doc.dataStoreName, LOCAL_LOCATION);
                assert(data[1].err?.is.NoSuchKey);
            });

            it('should not filter anything when the flag is not set', async () => {
                const data = await getObject(
                    BUCKET_NAME,
                    'pfx-nonlocalized',
                    { versionId: nonLocalizedVersionId },
                    logger,
                );
                assert.strictEqual(data.dataStoreName, SOURCE_LOCATION);
            });
        });
    });
});
