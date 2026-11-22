const assert = require('assert');
const { promisify } = require('util');
const werelogs = require('werelogs');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { versioning } = require('../../../../index');
const logger = new werelogs.Logger('MongoClientInterface', 'debug', 'debug');
const BucketInfo = require('../../../../lib/models/BucketInfo').default;
const MetadataWrapper = require('../../../../lib/storage/metadata/MetadataWrapper');
const { formatMasterKey } = require('../../../../lib/storage/metadata/mongoclient/utils');
const { BucketVersioningKeyFormat } = versioning.VersioningConstants;

const IMPL_NAME = 'mongodb';
const DB_NAME = 'metadata';
const BUCKET_NAME = 'test-bucket-condput';
const OBJECT_NAME = 'test-object';

const md5A = '9b2cf535f27731c974343645a3985328';
const md5B = '3c6e0b8a9c15224a8228b9a98ca1531d';

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

const formats = [BucketVersioningKeyFormat.v0, BucketVersioningKeyFormat.v1];
const states = [
    { name: 'not versioned', params: {} },
    { name: 'versioned', params: { versioning: true } },
    { name: 'suspended', params: { versionId: '' } },
];

function newBucketMD() {
    return BucketInfo.fromObj({
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
        _locationConstraint: 'us-east-1',
        _readLocationConstraint: null,
        _cors: null,
        _replicationConfiguration: null,
        _lifecycleConfiguration: null,
        _uid: '',
        _isNFS: null,
        ingestion: null,
    });
}

describe('MongoClientInterface: conditional puts on the master', () => {
    let metadata;
    let collection;
    let put;

    function putResult(value, params) {
        return new Promise(resolve =>
            metadata.putObjectMD(BUCKET_NAME, OBJECT_NAME, value, params, logger, (err, res) => resolve({ err, res })),
        );
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
        };
        metadata = new MetadataWrapper(IMPL_NAME, opts, null, logger);
        await promisify(metadata.setup.bind(metadata))();
        put = promisify(metadata.putObjectMD.bind(metadata));
    });

    afterAll(async () => {
        await promisify(metadata.close.bind(metadata))();
        await mongoserver.stop();
    });

    formats.forEach(vFormat => {
        states.forEach(state => {
            const label = `(${vFormat}, ${state.name})`;
            const masterKey = formatMasterKey(OBJECT_NAME, vFormat);
            const cond = extra => ({ ...state.params, ...extra });

            async function master() {
                const doc = await collection.findOne({ _id: masterKey });
                return doc ? doc.value : null;
            }

            async function documents() {
                return collection.find({}).sort({ _id: 1 }).toArray();
            }

            async function versionCount() {
                const docs = await documents();
                return docs.filter(d => d._id !== masterKey).length;
            }

            async function putDeleteMarker() {
                await put(
                    BUCKET_NAME,
                    OBJECT_NAME,
                    { 'isDeleteMarker': true, 'content-md5': md5A },
                    { versioning: true },
                    logger,
                );
            }

            describe(`${label}`, () => {
                beforeEach(async () => {
                    metadata.client.defaultBucketKeyFormat = vFormat;
                    await promisify(metadata.createBucket.bind(metadata))(BUCKET_NAME, newBucketMD(), logger);
                    collection = metadata.client.getCollection(BUCKET_NAME);
                });

                afterEach(async () => {
                    await promisify(metadata.deleteBucket.bind(metadata))(BUCKET_NAME, logger);
                });

                it('ifNoneMatch on an absent key should create the object with exactly the given value', async () => {
                    const value = { 'content-md5': md5A, 'content-length': 3, 'x-amz-meta-k': 'v' };
                    const { err } = await putResult({ ...value }, cond({ ifNoneMatch: '*' }));
                    assert.ifError(err);
                    const stored = await master();
                    assert.strictEqual(stored['content-md5'], md5A);
                    assert.strictEqual(stored['content-length'], 3);
                    assert.strictEqual(stored['x-amz-meta-k'], 'v');
                    assert.strictEqual(await versionCount(), state.params.versioning ? 1 : 0);
                });

                it('ifNoneMatch on an existing object should fail and leave all entries untouched', async () => {
                    await put(BUCKET_NAME, OBJECT_NAME, { 'content-md5': md5A }, state.params, logger);
                    const before = await documents();
                    const { err } = await putResult({ 'content-md5': md5B }, cond({ ifNoneMatch: '*' }));
                    assert(err && err.is.PreconditionFailed, `got ${err}`);
                    assert.deepStrictEqual(await documents(), before);
                });

                it('ifNoneMatch should succeed when the latest version is a delete marker', async () => {
                    await put(BUCKET_NAME, OBJECT_NAME, { 'content-md5': md5A }, { versioning: true }, logger);
                    await putDeleteMarker();
                    const { err } = await putResult({ 'content-md5': md5B }, cond({ ifNoneMatch: '*' }));
                    assert.ifError(err);
                    assert.strictEqual((await master())['content-md5'], md5B);
                });

                it('ifMatch with the current content-md5 should replace the object', async () => {
                    await put(BUCKET_NAME, OBJECT_NAME, { 'content-md5': md5A }, state.params, logger);
                    const { err } = await putResult({ 'content-md5': md5B }, cond({ ifMatch: md5A }));
                    assert.ifError(err);
                    assert.strictEqual((await master())['content-md5'], md5B);
                });

                it('ifMatch with another content-md5 should fail with PreconditionFailed', async () => {
                    await put(BUCKET_NAME, OBJECT_NAME, { 'content-md5': md5A }, state.params, logger);
                    const before = await documents();
                    const { err } = await putResult({ 'content-md5': md5B }, cond({ ifMatch: md5B }));
                    assert(err && err.is.PreconditionFailed, `got ${err}`);
                    assert.deepStrictEqual(await documents(), before);
                });

                it('ifMatch on an absent key or a delete marker should fail with NoSuchKey', async () => {
                    let res = await putResult({ 'content-md5': md5B }, cond({ ifMatch: md5A }));
                    assert(res.err && res.err.is.NoSuchKey, `got ${res.err}`);
                    assert.strictEqual((await documents()).length, 0);
                    await put(BUCKET_NAME, OBJECT_NAME, { 'content-md5': md5A }, { versioning: true }, logger);
                    await putDeleteMarker();
                    const before = await documents();
                    res = await putResult({ 'content-md5': md5B }, cond({ ifMatch: md5A }));
                    assert(res.err && res.err.is.NoSuchKey, `got ${res.err}`);
                    assert.deepStrictEqual(await documents(), before);
                });

                it(
                    'sixteen concurrent ifNoneMatch puts should give ' +
                        'exactly one success, one master and one version entry',
                    async () => {
                        const results = await Promise.all(
                            Array.from({ length: 16 }, (_, i) =>
                                putResult({ 'content-md5': `md5-${i}` }, cond({ ifNoneMatch: '*' })),
                            ),
                        );
                        const winners = results.filter(r => !r.err);
                        assert.strictEqual(winners.length, 1);
                        results
                            .filter(r => r.err)
                            .forEach(r => assert(r.err.is.PreconditionFailed || r.err.is.ConditionalRequestConflict));
                        assert(await master());
                        assert.strictEqual(await versionCount(), state.params.versioning ? 1 : 0);
                    },
                );

                it('sixteen concurrent ifMatch puts on one content-md5 should give exactly one success', async () => {
                    await put(BUCKET_NAME, OBJECT_NAME, { 'content-md5': md5A }, state.params, logger);
                    const versionsBefore = await versionCount();
                    const results = await Promise.all(
                        Array.from({ length: 16 }, (_, i) =>
                            putResult({ 'content-md5': `md5-${i}` }, cond({ ifMatch: md5A })),
                        ),
                    );
                    assert.strictEqual(results.filter(r => !r.err).length, 1);
                    results
                        .filter(r => r.err)
                        .forEach(r => assert(r.err.is.PreconditionFailed || r.err.is.ConditionalRequestConflict));
                    assert.strictEqual(await versionCount(), versionsBefore + (state.params.versioning ? 1 : 0));
                });

                it('a conditional put on a placeholder should fail with ConditionalRequestConflict', async () => {
                    await collection.insertOne({ _id: masterKey, value: { isPHD: true, versionId: 'phd' } });
                    for (const extra of [{ ifNoneMatch: '*' }, { ifMatch: md5A }]) {
                        const { err } = await putResult({ 'content-md5': md5B }, cond(extra));
                        assert(err && err.is.ConditionalRequestConflict, `got ${err}`);
                    }
                    assert.strictEqual((await master()).isPHD, true);
                });

                const itVersioned = state.params.versioning ? it : it.skip;
                itVersioned(
                    'a conditional put that only fails the version guard should fail with ConditionalRequestConflict',
                    async () => {
                        // version ids sort in reverse time order: this one is newer than any generated now
                        await collection.insertOne({
                            _id: masterKey,
                            value: { 'content-md5': md5A, 'versionId': '00000000000000000000RG001  0.0' },
                        });
                        const { err } = await putResult({ 'content-md5': md5B }, cond({ ifMatch: md5A }));
                        assert(err && err.is.ConditionalRequestConflict, `got ${err}`);
                        assert.strictEqual(await versionCount(), 0);
                    },
                );
            });
        });
    });
});
