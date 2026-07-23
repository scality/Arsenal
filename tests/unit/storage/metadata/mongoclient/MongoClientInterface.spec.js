const async = require('async');
const assert = require('assert');
const werelogs = require('werelogs');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const sinon = require('sinon');
const errors = require('../../../../../lib/errors').default;

const MongoClientInterface = require('../../../../../lib/storage/metadata/mongoclient/MongoClientInterface');
const DummyConfigObject = require('./utils/DummyConfigObject');
const logger = new werelogs.Logger('MongoClientInterface', 'debug', 'debug');
const BucketInfo = require('../../../../../lib/models/BucketInfo').default;
const MongoUtils = require('../../../../../lib/storage/metadata/mongoclient/utils');
const ObjectMD = require('../../../../../lib/models/ObjectMD').default;
const { BucketVersioningKeyFormat } = require('../../../../../lib/versioning/constants').VersioningConstants;
const { formatMasterKey } = require('../../../../../lib/storage/metadata/mongoclient/utils');
const { promisify } = require('util');

const dbName = 'metadata';
const baseBucket = BucketInfo.fromObj({
    _name: 'test-bucket-createbucket',
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

// Setup MongoDB once for all tests
let _mongoServer;

/**
 * Setup MongoDB server
 * @param {Function} done - callback
 * @returns {void}
 */
function setupMongoDB(done) {
    if (_mongoServer && _mongoServer.state === 'running') {
        done();
        return;
    }

    _mongoServer = new MongoMemoryReplSet({
        debug: false,
        instanceOpts: [{ port: 27021 }],
        replSet: {
            name: 'customSetName',
            count: 1,
            dbName,
            storageEngine: 'wiredTiger',
        },
    });

    _mongoServer
        .start()
        .then(() => _mongoServer.waitUntilRunning())
        .then(() => {
            done();
        })
        .catch(done);
}

/**
 * Create a MongoDB client with default test options
 * @returns {MongoClientInterface} client instance
 */
function createClient() {
    const opts = {
        replicaSetHosts: 'localhost:27021',
        writeConcern: 'majority',
        replicaSet: 'customSetName',
        readPreference: 'primary',
        database: dbName,
        replicationGroupId: 'GR001',
        logger,
        authCredentials: {},
        isLocationTransient: () => false,
        shardCollections: false,
    };
    return new MongoClientInterface(opts);
}

/**
 * Teardown MongoDB server and client
 * @param {Function} done - callback
 * @returns {void}
 */
function teardownMongoDB(done) {
    if (_mongoServer) {
        _mongoServer
            .stop()
            .then(() => done())
            .catch(done);
    } else {
        done();
    }
}

beforeAll(done => {
    setupMongoDB(done);
});

afterAll(done => {
    teardownMongoDB(done);
});

const mongoTestClient = new MongoClientInterface({});

describe('MongoClientInterface, misc', () => {
    let s3ConfigObj;

    beforeEach(() => {
        s3ConfigObj = new DummyConfigObject();
    });

    it('should filter out collections with special names', () => {
        const mongoClient = new MongoClientInterface({ config: s3ConfigObj });
        assert.equal(mongoClient._isSpecialCollection('__foo'), true);
        assert.equal(mongoClient._isSpecialCollection('bar'), false);
    });
});

describe('MongoClientInterface::_isReplicationEntryStalled', () => {
    const hr = 1000 * 60 * 60;
    const testDate = new Date();
    const tests = [
        [
            'return false if status != PENDING',
            {
                _id: 'testkey',
                value: {
                    'last-modified': new Date(testDate.getTime() - hr),
                    replicationInfo: {
                        status: 'FAILED',
                        backends: [
                            {
                                status: 'FAILED',
                                site: 'not-completed',
                            },
                        ],
                        content: [],
                        destination: '',
                        storageClass: '',
                        role: '',
                        storageType: '',
                        dataStoreVersionId: '',
                        isNFS: null,
                    },
                    dataStoreName: 'us-east-1',
                    'content-length': 42,
                    versionId: '0123456789abcdefg',
                },
            },
            false,
        ],
        [
            'return false if status == PENDING and object is not expired',
            {
                _id: 'testkey',
                value: {
                    'last-modified': new Date(testDate.getTime() + hr),
                    replicationInfo: {
                        status: 'PENDING',
                        backends: [
                            {
                                status: 'PENDING',
                                site: 'not-completed',
                            },
                        ],
                        content: [],
                        destination: '',
                        storageClass: '',
                        role: '',
                        storageType: '',
                        dataStoreVersionId: '',
                        isNFS: null,
                    },
                    dataStoreName: 'us-east-1',
                    'content-length': 42,
                    versionId: '0123456789abcdefg',
                },
            },
            false,
        ],
        [
            'return true if status == PENDING and object is expired',
            {
                _id: 'testkey',
                value: {
                    'last-modified': new Date(testDate.getTime() - hr),
                    replicationInfo: {
                        status: 'PENDING',
                        backends: [
                            {
                                status: 'PENDING',
                                site: 'not-completed',
                            },
                        ],
                        content: [],
                        destination: '',
                        storageClass: '',
                        role: '',
                        storageType: '',
                        dataStoreVersionId: '',
                        isNFS: null,
                    },
                    dataStoreName: 'us-east-1',
                    'content-length': 42,
                    versionId: '0123456789abcdefg',
                },
            },
            true,
        ],
    ];
    tests.forEach(([msg, params, expected]) =>
        it(msg, () => {
            assert.deepStrictEqual(mongoTestClient._isReplicationEntryStalled(params, testDate), expected);
        }),
    );
});

describe('MongoClientInterface::getDiskUsage', () => {
    it('should return error if database is not connected', done => {
        // Create a client with no db/client initialized
        const testClient = new MongoClientInterface({});

        testClient.getDiskUsage((err, result) => {
            assert.strictEqual(result, undefined);
            assert(err);
            assert(err.is.InternalError);
            assert.strictEqual(err.description, 'Cannot get disk usage: database not connected');
            done();
        });
    });

    it('should handle MongoDB command error', done => {
        // Setup a client with mock db
        const testClient = new MongoClientInterface({
            logger,
            replicaSetHosts: 'localhost:27017',
            writeConcern: 'majority',
            replicaSet: 'test',
            readPreference: 'primary',
            database: 'test',
            replicationGroupId: 'test',
            authCredentials: {},
            isLocationTransient: () => false,
            shardCollections: false,
        });

        // Mock the database and command
        testClient.db = {
            command: sinon.stub().rejects(new Error('DB command error')),
        };
        testClient.client = {}; // Just to pass the initial check

        testClient.getDiskUsage((err, result) => {
            assert.strictEqual(result, undefined);
            assert(err);
            assert(err.is.InternalError);
            assert(testClient.db.command.calledOnce);
            assert(testClient.db.command.calledWith({ dbStats: 1, scale: 1 }));
            done();
        });
    });

    it('should return disk usage stats successfully', done => {
        // Setup a client with mock db
        const testClient = new MongoClientInterface({
            logger,
            replicaSetHosts: 'localhost:27017',
            writeConcern: 'majority',
            replicaSet: 'test',
            readPreference: 'primary',
            database: 'test',
            replicationGroupId: 'test',
            authCredentials: {},
            isLocationTransient: () => false,
            shardCollections: false,
        });

        // Mock MongoDB stats response
        const mockStats = {
            fsUsedSize: 4000000,
            fsTotalSize: 5000000,
        };

        // Mock the database and command
        testClient.db = {
            command: sinon.stub().resolves(mockStats),
        };
        testClient.client = {}; // Just to pass the initial check

        testClient.getDiskUsage((err, result) => {
            assert.strictEqual(err, null);
            assert.deepStrictEqual(result, {
                available: 1000000,
                free: 1000000,
                total: mockStats.fsTotalSize,
            });
            assert(testClient.db.command.calledOnce);
            assert(testClient.db.command.calledWith({ dbStats: 1, scale: 1 }));
            done();
        });
    });

    it('should return error when stats properties are missing', done => {
        // Setup a client with mock db
        const testClient = new MongoClientInterface({
            logger,
            replicaSetHosts: 'localhost:27017',
            writeConcern: 'majority',
            replicaSet: 'test',
            readPreference: 'primary',
            database: 'test',
            replicationGroupId: 'test',
            authCredentials: {},
            isLocationTransient: () => false,
            shardCollections: false,
        });

        // Mock MongoDB stats response with missing properties
        const mockStats = {
            db: 'test',
            collections: 5,
        };

        // Mock the database and command
        testClient.db = {
            command: sinon.stub().resolves(mockStats),
        };
        testClient.client = {}; // Just to pass the initial check

        testClient.getDiskUsage((err, result) => {
            assert.strictEqual(result, undefined);
            assert(err);
            assert(err.is.InternalError);
            done();
        });
    });
});

describe('MongoClientInterface::createBucket', () => {
    let client;
    let createCollectionStub;
    let commandStub;

    function makeMongoError(codeName, code) {
        return Object.assign(new Error(codeName), { code, codeName });
    }

    function setupMockClient(shardCollections, updateOneResult) {
        client = new MongoClientInterface({
            logger,
            replicaSetHosts: 'localhost:27017',
            writeConcern: 'majority',
            replicaSet: 'test',
            readPreference: 'primary',
            database: 'test',
            replicationGroupId: 'test',
            authCredentials: {},
            isLocationTransient: () => false,
            shardCollections,
        });
        createCollectionStub = sinon.stub().resolves({});
        commandStub = sinon.stub().resolves({});
        client.db = {
            collection: sinon.stub().returns({
                updateOne: sinon.stub().resolves(
                    updateOneResult || {
                        matchedCount: 0,
                        modifiedCount: 0,
                        upsertedCount: 1,
                    },
                ),
            }),
            createCollection: createCollectionStub,
        };
        client.adminDb = { command: commandStub };
        client.client = {};
    }

    function createBucketPromised(bucketName, bucketMD = baseBucket) {
        return new Promise((resolve, reject) => {
            client.createBucket(bucketName, bucketMD, logger, err => {
                if (err) {
                    return reject(err);
                }
                return resolve();
            });
        });
    }

    it('should return BucketAlreadyExists when metastore entry already exists', async () => {
        setupMockClient(false, {
            matchedCount: 1,
            modifiedCount: 0,
            upsertedCount: 0,
        });
        await assert.rejects(
            () => createBucketPromised('test-bucket'),
            err => err?.is?.BucketAlreadyExists,
        );
        assert.strictEqual(createCollectionStub.called, false);
        const updateOne = client.db.collection().updateOne;
        assert(updateOne.calledOnce);
        assert(updateOne.firstCall.args[1].$setOnInsert);
        assert.strictEqual(updateOne.firstCall.args[1].$set, undefined);
    });

    it('should succeed when the backing collection already exists (NamespaceExists)', async () => {
        setupMockClient(false);
        createCollectionStub.rejects(makeMongoError('NamespaceExists', 48));
        await createBucketPromised('test-bucket');
        assert(createCollectionStub.calledOnceWith('test-bucket'));
        assert.strictEqual(commandStub.called, false);
    });

    it('should shard when the backing collection already exists (NamespaceExists)', async () => {
        setupMockClient(true);
        createCollectionStub.rejects(makeMongoError('NamespaceExists', 48));
        await createBucketPromised('test-bucket');
        assert(createCollectionStub.calledOnceWith('test-bucket'));
        assert(
            commandStub.calledOnceWith({
                shardCollection: 'test.test-bucket',
                key: { _id: 1 },
            }),
        );
    });

    it('should return InternalError on other createCollection errors', async () => {
        setupMockClient(false);
        createCollectionStub.rejects(makeMongoError('HostUnreachable', 6));
        await assert.rejects(
            () => createBucketPromised('test-bucket'),
            err => err?.is?.InternalError,
        );
    });

    it('should shard the collection after a successful createCollection', async () => {
        setupMockClient(true);
        await createBucketPromised('test-bucket');
        assert(createCollectionStub.calledOnceWith('test-bucket'));
        assert(
            commandStub.calledOnceWith({
                shardCollection: 'test.test-bucket',
                key: { _id: 1 },
            }),
        );
    });

    it('should succeed when the collection is already sharded (AlreadyInitialized)', async () => {
        setupMockClient(true);
        commandStub.rejects(makeMongoError('AlreadyInitialized', 23));
        await createBucketPromised('test-bucket');
    });

    it('should return InternalError on other shardCollection errors', async () => {
        setupMockClient(true);
        commandStub.rejects(makeMongoError('HostUnreachable', 6));
        await assert.rejects(
            () => createBucketPromised('test-bucket'),
            err => err?.is?.InternalError,
        );
    });

    it('should not invoke the callback again when it throws', async () => {
        setupMockClient(false);
        const callbackError = new Error('callback failure');
        const callback = sinon.stub().throws(callbackError);

        await assert.rejects(
            () => client.createBucket('test-bucket', baseBucket, logger, callback),
            err => err === callbackError,
        );
        assert(callback.calledOnce);
    });
});

function createBucket(client, bucketName, isVersioned, callback) {
    const bucketMD = BucketInfo.fromObj({
        _name: bucketName,
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
        _versioningConfiguration: isVersioned ? { Status: 'Enabled' } : null,
        _locationConstraint: 'us-east-1',
        _readLocationConstraint: null,
        _cors: null,
        _replicationConfiguration: null,
        _lifecycleConfiguration: null,
        _uid: '',
        _isNFS: null,
        ingestion: null,
    });
    client.createBucket(bucketName, bucketMD, logger, callback);
}

describe('MongoClientInterface, tests', () => {
    let client;

    beforeEach(done => {
        client = createClient();
        client.setup(done);
    });

    afterEach(done => {
        if (client) {
            client.close(done);
        } else {
            done();
        }
    });

    it('shall encode/decode tags properly', done => {
        const bucketName = 'foo';
        const objectName = 'bar';
        const tags = {
            tag1: 'value1',
            tag2: 'value.2',
            'tag.3': 'value3',
            'tag.4': 'value.4',
            tag6: 'value6',
            tag7: 'value$7',
            tag$8: 'value8',
            tag$9: 'value$9',
        };
        async.waterfall(
            [
                next => createBucket(client, bucketName, false, err => next(err)),
                next => {
                    const objMD = new ObjectMD()
                        .setKey(objectName)
                        .setDataStoreName('us-east-1')
                        .setContentLength(100)
                        .setTags(tags)
                        .setLastModified(new Date(Date.now()));
                    client.putObject(bucketName, objectName, objMD.getValue(), {}, logger, err => next(err));
                },
                next => {
                    const c = client.getCollection(bucketName);
                    const mObjectName = formatMasterKey(objectName, BucketVersioningKeyFormat.v1);
                    c.findOne(
                        {
                            _id: mObjectName,
                        },
                        {},
                    )
                        .then(doc => {
                            if (!doc) {
                                return next(new Error('key not found'));
                            }
                            assert.deepStrictEqual(doc.value.tags, {
                                tag1: 'value1',
                                tag2: 'value.2',
                                'tag\uFF0E3': 'value3',
                                'tag\uFF0E4': 'value.4',
                                tag6: 'value6',
                                tag7: 'value$7',
                                'tag\uFF048': 'value8',
                                'tag\uFF049': 'value$9',
                            });
                            MongoUtils.unserialize(doc.value);
                            assert.deepStrictEqual(doc.value.tags, tags);
                            return next();
                        })
                        .catch(err => next(err));
                },
                next => client.deleteObject(bucketName, objectName, {}, logger, next),
                next => client.deleteBucket(bucketName, logger, next),
            ],
            done,
        );
    });

    const bucketName = 'test-bucket';
    const capabilityName = 'VeeamSOSApi';
    const capabilityField = 'CapacityInfo';
    const capabilityValue = {
        Capacity: 1n,
        Available: 1n,
        Used: 0n,
        LastModified: '2021-09-29T14:00:00.000Z',
    };

    it('should update the bucket with quota', done => {
        const quotaValue = 1099511627776000n;
        async.waterfall(
            [
                next => createBucket(client, bucketName, false, err => next(err)),
                next => {
                    const bucketMD = new BucketInfo(
                        bucketName,
                        'testowner',
                        'testdisplayname',
                        new Date().toJSON(),
                        BucketInfo.currentModelVersion(),
                    );
                    bucketMD.setQuota(quotaValue);
                    client.putBucketAttributes(bucketName, bucketMD, logger, err => next(err));
                },
                next =>
                    client.getBucketAttributes(bucketName, logger, (err, bucketMd) => {
                        assert(!err);
                        assert.strictEqual(bucketMd._quotaMax, quotaValue);
                        return next();
                    }),
                next => client.deleteBucket(bucketName, logger, err => next(err)),
            ],
            done,
        );
    });

    it('should add a capability to a bucket', done => {
        async.waterfall(
            [
                next => createBucket(client, bucketName, false, err => next(err)),
                next =>
                    client.putBucketAttributesCapabilities(
                        bucketName,
                        capabilityName,
                        capabilityField,
                        capabilityValue,
                        logger,
                        err => next(err),
                    ),
                next =>
                    client.getBucketAttributes(bucketName, logger, (err, bucketInfo) => {
                        if (err) {
                            return next(err);
                        }
                        const capabilities = bucketInfo._capabilities || {};
                        assert.deepStrictEqual(capabilities[capabilityName][capabilityField], capabilityValue);
                        return next();
                    }),
                next => client.deleteBucket(bucketName, logger, err => next(err)),
            ],
            done,
        );
    });

    it('should create a bucket whose backing collection already exists', done => {
        const bucketName = `test-bucket-collection-exists-${Date.now()}`;
        async.waterfall(
            [
                next => {
                    client.db
                        .createCollection(bucketName)
                        .then(() => next())
                        .catch(next);
                },
                next => createBucket(client, bucketName, false, err => next(err)),
                next =>
                    client.getBucketAttributes(bucketName, logger, (err, bucketInfo) => {
                        assert.ifError(err);
                        assert.strictEqual(bucketInfo._name, bucketName);
                        return next();
                    }),
                next => client.deleteBucket(bucketName, logger, err => next(err)),
            ],
            done,
        );
    });

    it('should return BucketAlreadyExists on concurrent createBucket calls', done => {
        const bucketName = 'test-bucket-concurrent-create';
        const results = [];
        async.times(
            5,
            (n, next) =>
                createBucket(client, bucketName, false, err => {
                    results.push(err);
                    next();
                }),
            err => {
                assert.ifError(err);
                const successes = results.filter(e => !e).length;
                const alreadyExists = results.filter(e => e?.is?.BucketAlreadyExists).length;
                assert.strictEqual(successes, 1);
                assert.strictEqual(alreadyExists, 4);
                client.deleteBucket(bucketName, logger, done);
            },
        );
    });

    it('should delete a capability from a bucket', done => {
        async.waterfall(
            [
                next => createBucket(client, bucketName, false, err => next(err)),
                next =>
                    client.putBucketAttributesCapabilities(
                        bucketName,
                        capabilityName,
                        capabilityField,
                        capabilityValue,
                        logger,
                        err => next(err),
                    ),
                next =>
                    client.deleteBucketAttributesCapability(bucketName, capabilityName, '', logger, err => next(err)),
                next =>
                    client.getBucketAttributes(bucketName, logger, (err, bucketInfo) => {
                        if (err) {
                            return next(err);
                        }
                        const capabilities = bucketInfo._capabilities || {};
                        assert(!capabilities[capabilityName]);
                        return next();
                    }),
                next => client.deleteBucket(bucketName, logger, err => next(err)),
            ],
            done,
        );
    });

    describe('MongoClientInterface, putObjectVerCase3 error handling', () => {
        const bucketName = 'test-bucket-error';
        let collection;

        beforeEach(done => {
            createBucket(client, bucketName, true, err => {
                if (err) {
                    return done(err);
                }
                collection = client.getCollection(bucketName);
                return done();
            });
        });

        afterEach(done => {
            client.deleteBucket(bucketName, logger, err => {
                if (err) {
                    logger.error('Failed to delete bucket in cleanup', { error: err });
                }
                done();
            });
        });

        it('should handle MongoDB find error in putObjectVerCase3 directly', done => {
            const objName = 'test-object';
            const versionId = 'test-version-id';
            const objMD = new ObjectMD()
                .setKey(objName)
                .setDataStoreName('us-east-1')
                .setContentLength(100)
                .setLastModified(new Date());

            // Mock findOne to throw an error
            const originalFindOne = collection.findOne;
            collection.findOne = () => Promise.reject(new Error('Simulated MongoDB error'));

            const params = {
                vFormat: BucketVersioningKeyFormat.v1,
                versionId,
                repairMaster: false,
                versioning: false,
                needOplogUpdate: false,
                originOp: 'test',
                conditions: {},
            };

            // Call putObjectVerCase3 directly
            client.putObjectVerCase3(
                collection,
                bucketName,
                objName,
                objMD.getValue(),
                params,
                logger,
                (err, result) => {
                    // Restore original findOne
                    collection.findOne = originalFindOne;

                    try {
                        assert(err, 'Expected an error to be returned');
                        assert.strictEqual(err.code, 500, 'Expected 500');
                        assert(!result, 'Expected no result on error');
                        done();
                    } catch (assertionError) {
                        done(assertionError);
                    }
                },
            );
        });
    });

    it('should create a bucket with a very large quota and retrieve it correctly', done => {
        const bucketName = 'test-bucket-large-quota';
        const largeQuota = '9223372036854775807'; // Max signed 64-bit integer (2^63 - 1)

        async.waterfall(
            [
                next => {
                    const bucketMD = BucketInfo.fromObj({
                        _name: bucketName,
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
                        _quotaMax: largeQuota,
                    });
                    client.createBucket(bucketName, bucketMD, logger, err => next(err));
                },
                next =>
                    client.getBucketAttributes(bucketName, logger, (err, bucketMd) => {
                        if (err) {
                            return next(err);
                        }
                        const retrievedQuota = bucketMd._quotaMax;
                        assert.strictEqual(
                            retrievedQuota.toString(),
                            largeQuota,
                            'Quota should match the large value set during creation',
                        );
                        return next();
                    }),
                next => client.deleteBucket(bucketName, logger, err => next(err)),
            ],
            done,
        );
    });

    it('should create a bucket with VeeamSOSApi CapacityInfo and retrieve it correctly', done => {
        const bucketName = 'test-bucket-veeam-capacity';
        const veeamCapacity = {
            Capacity: '1000000000000000000',
            Available: '500000000000000000',
            Used: '500000000000000000',
            LastModified: new Date().toISOString(),
        };
        const expectedACL = {
            Canned: 'private',
            FULL_CONTROL: [],
            WRITE: [],
            WRITE_ACP: [],
            READ: [],
            READ_ACP: [],
        };

        async.waterfall(
            [
                next => {
                    const bucketMD = BucketInfo.fromObj({
                        _name: bucketName,
                        _owner: 'testowner',
                        _ownerDisplayName: 'testdisplayname',
                        _creationDate: new Date().toJSON(),
                        _acl: expectedACL,
                        _mdBucketModelVersion: 10,
                        _transient: false,
                        _deleted: false,
                        _serverSideEncryption: null,
                        _versioningConfiguration: null,
                        _locationConstraint: 'us-east-1',
                        _capabilities: {
                            VeeamSOSApi: {
                                SOSApiMode: 'enabled',
                                CapacityInfo: veeamCapacity,
                            },
                        },
                        _quotaMax: '0',
                    });
                    client.createBucket(bucketName, bucketMD, logger, err => next(err));
                },
                next => {
                    client.getBucketAttributes(bucketName, logger, (err, bucketInfo) => {
                        next(err, bucketInfo);
                    });
                },
            ],
            (err, bucketInfo) => {
                assert.ifError(err);
                assert.ok(bucketInfo, 'BucketInfo should be retrieved');

                const retrievedCapabilities = bucketInfo.getCapabilities();
                assert.ok(retrievedCapabilities, 'Capabilities should exist');
                assert.ok(retrievedCapabilities.VeeamSOSApi, 'VeeamSOSApi capabilities should exist');

                const retrievedCapacityInfo = retrievedCapabilities.VeeamSOSApi.CapacityInfo;
                assert.ok(retrievedCapacityInfo, 'VeeamSOSApi.CapacityInfo should exist');

                assert.strictEqual(typeof retrievedCapacityInfo.Capacity, 'bigint', 'Capacity should be a bigint');
                assert.strictEqual(
                    retrievedCapacityInfo.Capacity.toString(),
                    veeamCapacity.Capacity,
                    'Capacity value mismatch',
                );

                assert.strictEqual(typeof retrievedCapacityInfo.Available, 'bigint', 'Available should be a bigint');
                assert.strictEqual(
                    retrievedCapacityInfo.Available.toString(),
                    veeamCapacity.Available,
                    'Available value mismatch',
                );

                assert.strictEqual(typeof retrievedCapacityInfo.Used, 'bigint', 'Used should be a bigint');
                assert.strictEqual(retrievedCapacityInfo.Used.toString(), veeamCapacity.Used, 'Used value mismatch');

                assert.strictEqual(
                    retrievedCapacityInfo.LastModified,
                    veeamCapacity.LastModified,
                    'LastModified value mismatch',
                );
                done();
            },
        );
    });
});

describe('MongoClientInterface, updateDeleteMaster', () => {
    it('Should return delete operation', done => {
        const op = mongoTestClient.updateDeleteMaster(true, 'v1', {}, {}, true);
        assert(op.deleteOne);
        return done();
    });

    it('Should return update operation (no delete marker v1)', done => {
        const op = mongoTestClient.updateDeleteMaster(false, 'v1', {}, {}, true);
        assert(op.updateOne);
        return done();
    });

    it('Should return update operation (v0)', done => {
        const op = mongoTestClient.updateDeleteMaster(true, 'v0', {}, {}, true);
        assert(op.updateOne);
        return done();
    });

    it('Should return update operation (no delete marker v0)', done => {
        const op = mongoTestClient.updateDeleteMaster(false, 'v0', {}, {}, true);
        assert(op.updateOne);
        return done();
    });
});

describe('MongoClientInterface, getUUID', () => {
    let sandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    it('Should return error if writeUUIDIfNotExists fails', done => {
        sandbox.stub(mongoTestClient, 'writeUUIDIfNotExists').callsFake((uuid, log, cb) => {
            cb({ is: { InternalError: true } });
        });

        mongoTestClient.getUUID(logger, err => {
            assert(err);
            done();
        });
    });

    it('Should return error if writeUUIDIfNotExists result is not acknowledged', done => {
        sandbox.stub(mongoTestClient, 'writeUUIDIfNotExists').callsFake((uuid, log, cb) => {
            cb(errors.InternalError);
        });

        mongoTestClient.getUUID(logger, err => {
            assert(err);
            assert(err.is.InternalError);
            done();
        });
    });

    it('Should return uuid', done => {
        sandbox.stub(mongoTestClient, 'writeUUIDIfNotExists').callsFake((uuid, log, cb) => {
            cb();
        });

        sandbox.stub(mongoTestClient, 'readUUID').callsFake((log, cb) => {
            cb(null, 'uuid');
        });

        mongoTestClient.getUUID(logger, (err, uuid) => {
            assert.ifError(err);
            assert.strictEqual(typeof uuid, 'string');
            done();
        });
    });
});

describe('MongoClientInterface, putObjectVerCase2', () => {
    const bucketName = 'test-bucket-putvercase2';
    let client;
    let collection;
    let sandbox;

    beforeEach(done => {
        sandbox = sinon.createSandbox();
        client = createClient();
        client.setup(err => {
            if (err) {
                return done(err);
            }
            return createBucket(client, bucketName, true, err => {
                if (err) {
                    return done(err);
                }
                collection = client.getCollection(bucketName);
                return done();
            });
        });
    });

    afterEach(done => {
        sandbox.restore();
        if (client) {
            client.deleteBucket(bucketName, logger, () => {
                client.close(done);
            });
        } else {
            done();
        }
    });

    it('should handle MongoDB updateOne error in putObjectVerCase2', done => {
        const objName = 'test-object';
        const objMD = new ObjectMD()
            .setKey(objName)
            .setDataStoreName('us-east-1')
            .setContentLength(100)
            .setLastModified(new Date());

        sandbox.stub(collection, 'updateOne').rejects(new Error('Simulated MongoDB error'));

        const params = {
            vFormat: BucketVersioningKeyFormat.v1,
            versionId: '',
            repairMaster: false,
            versioning: false,
            needOplogUpdate: false,
            originOp: 'test',
            conditions: {},
        };

        client.putObjectVerCase2(collection, bucketName, objName, objMD.getValue(), params, logger, (err, result) => {
            try {
                assert(err, 'Expected an error to be returned');
                assert.strictEqual(err.code, 500, 'Expected 500 error code');
                assert(!result, 'Expected no result on error');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });
});

describe('MongoClientInterface, putObjectVerCase4', () => {
    const bucketName = 'test-bucket-putvercase4';
    let client;
    let collection;
    let sandbox;

    beforeEach(done => {
        sandbox = sinon.createSandbox();
        client = createClient();
        client.setup(err => {
            if (err) {
                return done(err);
            }

            client.putObjectVerCase4Promised = promisify(client.putObjectVerCase4).bind(client);

            return createBucket(client, bucketName, true, err => {
                if (err) {
                    return done(err);
                }
                collection = client.getCollection(bucketName);
                return done();
            });
        });
    });

    afterEach(done => {
        sandbox.restore();
        if (client) {
            client.deleteBucket(bucketName, logger, () => {
                client.close(done);
            });
        } else {
            done();
        }
    });

    it('should handle updateOne error in putObjectVerCase4', done => {
        const objName = 'test-object';
        const versionId = 'test-version-id';
        const objMD = new ObjectMD()
            .setKey(objName)
            .setDataStoreName('us-east-1')
            .setContentLength(100)
            .setLastModified(new Date());

        sandbox.stub(collection, 'updateOne').rejects(new Error('Simulated MongoDB error'));

        const params = {
            vFormat: BucketVersioningKeyFormat.v1,
            versionId,
            repairMaster: true,
            versioning: true,
            needOplogUpdate: false,
            originOp: 'test',
            conditions: {},
        };

        client.putObjectVerCase4(collection, bucketName, objName, objMD.getValue(), params, logger, (err, result) => {
            try {
                assert(err, 'Expected an error to be returned');
                assert.strictEqual(err.code, 500, 'Expected 500 error code');
                assert(!result, 'Expected no result on error');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });

    it('should handle getLatestVersion error in putObjectVerCase4', done => {
        const objName = 'test-object';
        const versionId = 'test-version-id';
        const objMD = new ObjectMD()
            .setKey(objName)
            .setDataStoreName('us-east-1')
            .setContentLength(100)
            .setLastModified(new Date());

        sandbox.stub(client, 'getLatestVersion').callsFake((c, objName, vFormat, log, cb) => {
            cb(errors.InternalError);
        });

        const params = {
            vFormat: BucketVersioningKeyFormat.v1,
            versionId,
            repairMaster: true,
            versioning: true,
            needOplogUpdate: false,
            originOp: 'test',
            conditions: {},
        };

        client.putObjectVerCase4(collection, bucketName, objName, objMD.getValue(), params, logger, (err, result) => {
            try {
                assert(err, 'Expected an error to be returned');
                assert.strictEqual(err.code, 500, 'Expected 500 error code');
                assert(!result, 'Expected no result on error');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });

    it('should handle bulkWrite error in putObjectVerCase4', done => {
        const objName = 'test-object';
        const versionId = 'test-version-id';
        const objMD = new ObjectMD()
            .setKey(objName)
            .setDataStoreName('us-east-1')
            .setContentLength(100)
            .setLastModified(new Date());

        const updateOneStub = sandbox.stub(collection, 'updateOne').resolves({ modifiedCount: 1 });

        sandbox.stub(client, 'getLatestVersion').callsFake((c, objName, vFormat, log, cb) => {
            cb(null, objMD.getValue());
        });

        sandbox.stub(collection, 'bulkWrite').rejects(new Error('Simulated bulkWrite error'));

        const params = {
            vFormat: BucketVersioningKeyFormat.v1,
            versionId,
            repairMaster: true,
            versioning: true,
            needOplogUpdate: false,
            originOp: 'test',
            conditions: {},
        };

        client.putObjectVerCase4(collection, bucketName, objName, objMD.getValue(), params, logger, (err, result) => {
            try {
                assert(err, 'Expected an error to be returned');
                assert.strictEqual(err.code, 500, 'Expected 500 error code');
                assert(!result, 'Expected no result on error');
                assert(updateOneStub.calledOnce, 'Expected updateOne to be called');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });

    it('should handle duplicate key error in putObjectVerCase4 bulkWrite gracefully', done => {
        const objName = 'test-object';
        const versionId = 'test-version-id';
        const objMD = new ObjectMD()
            .setKey(objName)
            .setDataStoreName('us-east-1')
            .setContentLength(100)
            .setLastModified(new Date());

        sandbox.stub(collection, 'updateOne').resolves({ modifiedCount: 1 });

        const objVal = objMD.getValue();
        objVal.versionId = versionId;
        sandbox.stub(client, 'getLatestVersion').callsFake((c, objName, vFormat, log, cb) => {
            cb(null, objVal);
        });

        const duplicateKeyError = new Error('Duplicate key error');
        duplicateKeyError.code = 11000;
        sandbox.stub(collection, 'bulkWrite').rejects(duplicateKeyError);

        const params = {
            vFormat: BucketVersioningKeyFormat.v1,
            versionId,
            repairMaster: true,
            versioning: true,
            needOplogUpdate: false,
            originOp: 'test',
            conditions: {},
        };

        client.putObjectVerCase4(collection, bucketName, objName, objMD.getValue(), params, logger, (err, result) => {
            try {
                assert(!err, 'Expected no error for duplicate key');
                assert(result, 'Expected result for duplicate key');
                assert.strictEqual(result, `{"versionId": "${versionId}"}`, 'Expected versionId in result');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });

    it('should handle missing versionId ($exists: false) in putObjectVerCase4 to update master', async () => {
        const objName = 'test-object';
        const versionId = 'test-version-id';
        const objMD = new ObjectMD()
            .setKey(objName)
            .setDataStoreName('us-east-1')
            .setContentLength(100)
            .setLastModified(new Date());

        const updateOneStub = sandbox.stub(collection, 'updateOne').resolves({ modifiedCount: 1 });

        sandbox.stub(client, 'getLatestVersion').callsFake((c, objName, vFormat, log, cb) => {
            cb(null, objMD.getValue());
        });

        const bulkWriteStub = sandbox.stub(collection, 'bulkWrite').resolves({
            modifiedCount: 1,
            upsertedCount: 1,
            matchedCount: 1,
        });

        const params = {
            vFormat: BucketVersioningKeyFormat.v1,
            versionId,
            repairMaster: true,
            versioning: true,
            needOplogUpdate: false,
            originOp: 'test',
            conditions: {},
        };

        const result = await client.putObjectVerCase4Promised(
            collection,
            bucketName,
            objName,
            objMD.getValue(),
            params,
            logger,
        );

        assert(result, 'Expected result on success');
        assert.strictEqual(result, `{"versionId": "undefined"}`, 'Expected versionId in result');
        assert(updateOneStub.calledOnce, 'Expected updateOne to be called');
        assert(bulkWriteStub.calledOnce, 'Expected bulkWrite to be called');
        const bulkOps = bulkWriteStub.firstCall.args[0];
        const masterUpdateOp = bulkOps.find(
            op => op.updateOne && op.updateOne.filter._id === formatMasterKey(objName, BucketVersioningKeyFormat.v1),
        );
        assert(masterUpdateOp, 'Expected master update operation');
        assert(
            masterUpdateOp.updateOne.filter.$or[0]['value.versionId'].$exists === false,
            'Expected filter to check for non-existing versionId',
        );
    });
});

describe('MongoClientInterface, putObjectNoVer', () => {
    const bucketName = 'test-bucket-putnover';
    let client;
    let collection;
    let sandbox;

    beforeEach(done => {
        sandbox = sinon.createSandbox();
        client = createClient();
        client.setup(err => {
            if (err) {
                return done(err);
            }
            return createBucket(client, bucketName, false, err => {
                if (err) {
                    return done(err);
                }
                collection = client.getCollection(bucketName);
                return done();
            });
        });
    });

    afterEach(done => {
        sandbox.restore();
        if (client) {
            client.deleteBucket(bucketName, logger, () => {
                client.close(done);
            });
        } else {
            done();
        }
    });

    it('should handle MongoDB updateOne error in putObjectNoVer', done => {
        const objName = 'test-object';
        const objMD = new ObjectMD()
            .setKey(objName)
            .setDataStoreName('us-east-1')
            .setContentLength(100)
            .setLastModified(new Date());

        sandbox.stub(collection, 'updateOne').rejects(new Error('Simulated MongoDB error'));

        const params = {
            vFormat: BucketVersioningKeyFormat.v0,
            needOplogUpdate: false,
            conditions: {},
        };

        client.putObjectNoVer(collection, bucketName, objName, objMD.getValue(), params, logger, err => {
            try {
                assert(err, 'Expected an error to be returned');
                assert.strictEqual(err.code, 500, 'Expected 500 error code');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });
});

describe('MongoClientInterface, putObjectNoVerWithOplogUpdate', () => {
    const bucketName = 'test-bucket-putnover-oplog';
    let client;
    let collection;
    let sandbox;

    beforeEach(done => {
        sandbox = sinon.createSandbox();
        client = createClient();
        client.setup(err => {
            if (err) {
                return done(err);
            }
            return createBucket(client, bucketName, false, err => {
                if (err) {
                    return done(err);
                }
                collection = client.getCollection(bucketName);
                return done();
            });
        });
    });

    afterEach(done => {
        sandbox.restore();
        if (client) {
            client.deleteBucket(bucketName, logger, () => {
                client.close(done);
            });
        } else {
            done();
        }
    });

    it('should handle findOneAndUpdate error in putObjectNoVerWithOplogUpdate', done => {
        const objName = 'test-object-oplog';
        const objMD = new ObjectMD()
            .setKey(objName)
            .setDataStoreName('us-east-1')
            .setContentLength(100)
            .setLastModified(new Date());

        client.putObject(
            bucketName,
            objName,
            objMD.getValue(),
            {
                vFormat: BucketVersioningKeyFormat.v0,
                versioning: false,
                versionId: '',
                repairMaster: false,
                needOplogUpdate: false,
                originOp: 'test',
                conditions: {},
            },
            logger,
            err => {
                if (err) {
                    return done(err);
                }

                sandbox.stub(collection, 'findOneAndUpdate').rejects(new Error('Simulated MongoDB error'));

                const params = {
                    vFormat: BucketVersioningKeyFormat.v0,
                    needOplogUpdate: true,
                    originOp: 'test',
                    conditions: {},
                };

                return client.putObjectNoVerWithOplogUpdate(
                    collection,
                    bucketName,
                    objName,
                    objMD.getValue(),
                    params,
                    logger,
                    err => {
                        try {
                            assert(err, 'Expected an error to be returned');
                            assert.strictEqual(err.code, 500, 'Expected 500 error code');
                            done();
                        } catch (assertionError) {
                            done(assertionError);
                        }
                    },
                );
            },
        );
    });

    it('should handle bulkWrite error in putObjectNoVerWithOplogUpdate', done => {
        const objName = 'test-object-oplog-bulkwrite';
        const objMD = new ObjectMD()
            .setKey(objName)
            .setDataStoreName('us-east-1')
            .setContentLength(100)
            .setLastModified(new Date());

        client.putObject(
            bucketName,
            objName,
            objMD.getValue(),
            {
                vFormat: BucketVersioningKeyFormat.v0,
                versioning: false,
                versionId: '',
                repairMaster: false,
                needOplogUpdate: false,
                originOp: 'test',
                conditions: {},
            },
            logger,
            err => {
                if (err) {
                    return done(err);
                }

                sandbox.stub(collection, 'findOneAndUpdate').resolves({
                    value: {
                        value: objMD.getValue(),
                    },
                });

                sandbox.stub(collection, 'bulkWrite').rejects(new Error('Simulated bulkWrite error'));

                const params = {
                    vFormat: BucketVersioningKeyFormat.v0,
                    needOplogUpdate: true,
                    originOp: 'test',
                    conditions: {},
                };

                return client.putObjectNoVerWithOplogUpdate(
                    collection,
                    bucketName,
                    objName,
                    objMD.getValue(),
                    params,
                    logger,
                    err => {
                        try {
                            assert(err, 'Expected an error to be returned');
                            assert.strictEqual(err.code, 500, 'Expected 500 error code');
                            done();
                        } catch (assertionError) {
                            done(assertionError);
                        }
                    },
                );
            },
        );
    });

    it('should handle NoSuchKey error in putObjectNoVerWithOplogUpdate', done => {
        const objName = 'test-object-oplog-nosuchkey';
        const objMD = new ObjectMD()
            .setKey(objName)
            .setDataStoreName('us-east-1')
            .setContentLength(100)
            .setLastModified(new Date());

        sandbox.stub(collection, 'findOneAndUpdate').resolves({ value: null });

        const params = {
            vFormat: BucketVersioningKeyFormat.v0,
            needOplogUpdate: true,
            originOp: 'test',
            conditions: {},
        };

        client.putObjectNoVerWithOplogUpdate(collection, bucketName, objName, objMD.getValue(), params, logger, err => {
            try {
                assert(err, 'Expected an error to be returned');
                assert.strictEqual(err.code, 500, 'Expected error code to be 500');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });
});

describe('MongoClientInterface, getBucketVFormat', () => {
    let client;
    let sandbox;

    beforeEach(done => {
        sandbox = sinon.createSandbox();
        client = createClient();
        client.setup(done);
    });

    afterEach(done => {
        sandbox.restore();
        if (client) {
            client.close(done);
        } else {
            done();
        }
    });

    it('should handle MongoDB findOne error in getBucketVFormat', done => {
        const bucketName = 'test-bucket-vformat-error';
        const mockCollection = {
            findOne: sandbox.stub().rejects(new Error('Simulated MongoDB error')),
        };

        sandbox.stub(client, 'getCollection').returns(mockCollection);

        client.getBucketVFormat(bucketName, logger, (err, vFormat) => {
            try {
                assert(err, 'Expected an error to be returned');
                assert.strictEqual(err.code, 500, 'Expected 500 error code');
                assert(!vFormat, 'Expected no vFormat on error');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });
});

describe('MongoClientInterface, readUUID', () => {
    let client;
    let sandbox;

    beforeEach(done => {
        sandbox = sinon.createSandbox();
        client = createClient();
        client.setup(done);
    });

    afterEach(done => {
        sandbox.restore();
        if (client) {
            client.close(done);
        } else {
            done();
        }
    });

    it('should handle MongoDB findOne error in readUUID', done => {
        const mockCollection = {
            findOne: sandbox.stub().rejects(new Error('Simulated MongoDB error')),
        };

        sandbox.stub(client, 'getCollection').returns(mockCollection);

        client.readUUID(logger, (err, uuid) => {
            try {
                assert(err, 'Expected an error to be returned');
                assert.strictEqual(err.code, 500, 'Expected 500 error code');
                assert(!uuid, 'Expected no UUID on error');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });
});

describe('MongoClientInterface, initializeBucketCapacity', () => {
    let client;
    let sandbox;

    beforeEach(async () => {
        sandbox = sinon.createSandbox();
        client = createClient();
        await promisify(client.setup).bind(client)();
    });

    afterEach(async () => {
        sandbox.restore();
        if (client) {
            await promisify(client.close).bind(client)();
        }
    });

    it('should insert a zero-value bucket capacity document', async () => {
        const bucketName = 'init-capacity-bucket';
        const creationDate = new Date('2023-03-08T14:13:28.000Z').toJSON();
        const expectedId = `bucket_${bucketName}_${new Date(creationDate).getTime()}`;
        await promisify(client.initializeBucketCapacity).bind(client)(bucketName, creationDate, logger);
        const doc = await client.getCollection('__infostore').findOne({ _id: expectedId });
        assert(doc, 'Expected the capacity document to be inserted');
        assert.strictEqual(doc.usedCapacity.current, 0);
        assert.strictEqual(doc.usedCapacity.nonCurrent, 0);
        assert.strictEqual(doc.objectCount.current, 0);
        assert.strictEqual(doc.objectCount.deleteMarker, 0);
        assert(doc.measuredOn, 'Expected measuredOn to be set');
    });

    it('should not overwrite an existing capacity document (idempotent)', async () => {
        const bucketName = 'existing-capacity-bucket';
        const creationDate = new Date('2023-03-08T14:13:28.000Z').toJSON();
        const expectedId = `bucket_${bucketName}_${new Date(creationDate).getTime()}`;
        const coll = client.getCollection('__infostore');
        await coll.insertOne({
            _id: expectedId,
            measuredOn: new Date().toJSON(),
            usedCapacity: { current: 12345, nonCurrent: 0 },
            objectCount: { current: 7, deleteMarker: 0 },
        });
        await promisify(client.initializeBucketCapacity).bind(client)(bucketName, creationDate, logger);
        const doc = await coll.findOne({ _id: expectedId });
        assert.strictEqual(doc.usedCapacity.current, 12345, 'Existing capacity must not be overwritten');
        assert.strictEqual(doc.objectCount.current, 7);
    });

    it('should return InternalError when the update fails', async () => {
        const mockCollection = {
            updateOne: sandbox.stub().rejects(new Error('Simulated MongoDB error')),
        };
        sandbox.stub(client, 'getCollection').returns(mockCollection);
        await assert.rejects(
            promisify(client.initializeBucketCapacity).bind(client)('b', new Date().toJSON(), logger),
            err => err.code === 500,
        );
    });

    it('should return InternalError when creationDate is invalid', async () => {
        await assert.rejects(
            promisify(client.initializeBucketCapacity).bind(client)('b', 'not-a-date', logger),
            err => err.code === 500,
        );
    });

    it('should return InternalError when the infostore collection is unavailable', async () => {
        sandbox.stub(client, 'getCollection').returns(null);
        await assert.rejects(
            promisify(client.initializeBucketCapacity).bind(client)('b', new Date().toJSON(), logger),
            err => err.code === 500,
        );
    });
});

describe('MongoClientInterface, writeUUIDIfNotExists', () => {
    let client;
    let sandbox;

    beforeEach(done => {
        sandbox = sinon.createSandbox();
        client = createClient();
        client.setup(done);
    });

    afterEach(done => {
        sandbox.restore();
        if (client) {
            client.close(done);
        } else {
            done();
        }
    });

    it('should handle MongoDB insertOne error in writeUUIDIfNotExists', done => {
        const mockCollection = {
            insertOne: sandbox.stub().rejects(new Error('Simulated MongoDB error')),
        };

        sandbox.stub(client, 'getCollection').returns(mockCollection);

        client.writeUUIDIfNotExists('test-uuid', logger, err => {
            try {
                assert(err, 'Expected an error to be returned');
                assert.strictEqual(err.code, 500, 'Expected 500 error code');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });

    it('should handle duplicate key error in writeUUIDIfNotExists correctly', done => {
        const duplicateKeyError = new Error('Duplicate key error');
        duplicateKeyError.code = 11000;

        const mockCollection = {
            insertOne: sandbox.stub().rejects(duplicateKeyError),
        };

        sandbox.stub(client, 'getCollection').returns(mockCollection);

        client.writeUUIDIfNotExists('test-uuid', logger, err => {
            try {
                assert(err, 'Expected an error to be returned');
                assert.strictEqual(err.code, 409, 'Expected KeyAlreadyExists error');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });

    it('should handle unacknowledged response in writeUUIDIfNotExists', done => {
        const mockCollection = {
            insertOne: sandbox.stub().resolves({
                acknowledged: false,
            }),
        };

        sandbox.stub(client, 'getCollection').returns(mockCollection);

        client.writeUUIDIfNotExists('test-uuid', logger, err => {
            try {
                assert(err, 'Expected an error to be returned');
                assert(err.is && err.is.InternalError, 'Expected InternalError');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });

    it('should handle null response in writeUUIDIfNotExists', done => {
        const mockCollection = {
            insertOne: sandbox.stub().resolves(null),
        };

        sandbox.stub(client, 'getCollection').returns(mockCollection);

        client.writeUUIDIfNotExists('test-uuid', logger, err => {
            try {
                assert(err, 'Expected an error to be returned');
                assert(err.is && err.is.InternalError, 'Expected InternalError');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });

    it('should succeed with acknowledged response in writeUUIDIfNotExists', done => {
        const mockCollection = {
            insertOne: sandbox.stub().resolves({
                acknowledged: true,
            }),
        };

        sandbox.stub(client, 'getCollection').returns(mockCollection);

        client.writeUUIDIfNotExists('test-uuid', logger, err => {
            try {
                assert.ifError(err, 'Expected no error to be returned');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });
});

describe('MongoClientInterface, getObject', () => {
    let client;
    let sandbox;
    const bucketName = 'test-bucket-getobject';
    const objName = 'test-object';

    beforeEach(done => {
        sandbox = sinon.createSandbox();
        client = createClient();
        client.setup(err => {
            if (err) {
                return done(err);
            }
            return createBucket(client, bucketName, true, done);
        });
    });

    afterEach(done => {
        sandbox.restore();
        if (client) {
            client.deleteBucket(bucketName, logger, () => {
                client.close(done);
            });
        } else {
            done();
        }
    });

    it('should handle getBucketVFormat error in getObject', done => {
        const originalGetBucketVFormat = client.getBucketVFormat;
        client.getBucketVFormat = (bucketName, log, cb) => {
            cb(errors.InternalError);
        };

        client.getObject(bucketName, objName, null, logger, err => {
            client.getBucketVFormat = originalGetBucketVFormat;

            try {
                assert(err, 'Expected an error to be returned');
                assert(err.is.InternalError, 'Expected InternalError');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });

    it('should handle MongoDB findOne error in getObject', done => {
        const originalGetCollection = client.getCollection;
        client.getCollection = name => {
            const collection = originalGetCollection.call(client, name);
            collection.findOne = () => Promise.reject(new Error('Simulated MongoDB error'));
            return collection;
        };

        client.getObject(bucketName, objName, null, logger, err => {
            client.getCollection = originalGetCollection;

            try {
                assert(err, 'Expected an error to be returned');
                assert(err.is.InternalError, 'Expected InternalError');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });
});

describe('MongoClientInterface, repair', () => {
    let client;
    const bucketName = 'test-bucket-repair';
    const objName = 'test-object';

    beforeEach(done => {
        client = createClient();
        client.setup(err => {
            if (err) {
                return done(err);
            }
            return createBucket(client, bucketName, true, done);
        });
    });

    afterEach(done => {
        if (client) {
            client.deleteBucket(bucketName, logger, () => {
                client.close(done);
            });
        } else {
            done();
        }
    });

    it('should handle findOneAndReplace error in repair', done => {
        const objMD = new ObjectMD()
            .setKey(objName)
            .setDataStoreName('us-east-1')
            .setContentLength(100)
            .setLastModified(new Date());

        const collection = client.getCollection(bucketName);

        const originalFindOneAndReplace = collection.findOneAndReplace;
        collection.findOneAndReplace = () => Promise.reject(new Error('Simulated MongoDB error'));

        client.repair(
            collection,
            bucketName,
            objName,
            objMD.getValue(),
            { versionId: 'test-version-id' },
            BucketVersioningKeyFormat.v1,
            logger,
            err => {
                collection.findOneAndReplace = originalFindOneAndReplace;

                try {
                    assert(err, 'Expected an error to be returned');
                    assert(err.is.InternalError, 'Expected InternalError');
                    done();
                } catch (assertionError) {
                    done(assertionError);
                }
            },
        );
    });
});

describe('MongoClientInterface, getBucketInfos errors', () => {
    let client;

    beforeEach(done => {
        client = createClient();
        client.setup(done);
    });

    afterEach(done => {
        if (client) {
            client.close(done);
        } else {
            done();
        }
    });

    it('should handle MongoDB find error in getBucketInfos', done => {
        const originalDb = client.db;
        client.db = {
            listCollections: () => ({
                toArray: () => Promise.reject(new Error('Simulated MongoDB error')),
            }),
            collection: () => ({
                find: () => ({
                    toArray: () => Promise.reject(new Error('Simulated MongoDB error')),
                }),
            }),
        };

        client.getBucketInfos(logger, (err, result) => {
            client.db = originalDb;

            try {
                assert(err, 'Expected an error to be returned');
                assert(err.is && err.is.InternalError, 'Expected InternalError');
                assert(!result, 'Expected no result on error');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });
});

describe('MongoClientInterface, getBucketInfos', () => {
    let client;
    const testBuckets = ['test-bucket-info-1', 'test-bucket-info-2', 'test-bucket-info-3'];

    beforeEach(done => {
        client = createClient();
        client.setup(err => {
            if (err) {
                return done(err);
            }

            return async.eachSeries(
                testBuckets,
                (bucketName, next) => {
                    createBucket(client, bucketName, bucketName.endsWith('3'), next);
                },
                done,
            );
        });
    });

    afterEach(done => {
        if (client) {
            async.eachSeries(
                testBuckets,
                (bucketName, next) => {
                    client.deleteBucket(bucketName, logger, next);
                },
                err => {
                    client.close(() => done(err));
                },
            );
        } else {
            done();
        }
    });

    it('should successfully retrieve bucket infos', done => {
        client.getBucketInfos(logger, (err, result) => {
            try {
                assert.ifError(err);
                assert(result, 'Expected result to be returned');
                assert(
                    result.bucketCount >= testBuckets.length,
                    `Expected at least ${testBuckets.length} buckets, got ${result.bucketCount}`,
                );
                assert(Array.isArray(result.bucketInfos), 'Expected bucketInfos to be an array');

                const foundBuckets = result.bucketInfos
                    .filter(info => testBuckets.includes(info.getName()))
                    .map(info => info.getName());

                assert.strictEqual(
                    foundBuckets.length,
                    testBuckets.length,
                    `Expected all ${testBuckets.length} test buckets to be found`,
                );
                const versionedBucket = result.bucketInfos.find(info => info.getName() === 'test-bucket-info-3');
                assert(versionedBucket, 'Expected to find the versioned bucket');
                assert(versionedBucket.isVersioningOn(), 'Expected versioning to be enabled');

                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });
});

describe('MongoClientInterface, createBucket', () => {
    let client;
    let sandbox;

    beforeEach(done => {
        sandbox = sinon.createSandbox();
        client = createClient();
        client.setup(done);
    });

    afterEach(done => {
        sandbox.restore();
        client.close(done);
    });

    it('should handle MongoDB createCollection error in createBucket', done => {
        const bucketName = 'test-bucket-createbucket';
        const originalCreateCollection = client.db.createCollection;
        client.db.createCollection = () => Promise.reject(new Error('Simulated MongoDB error'));

        client.createBucket(bucketName, baseBucket, logger, err => {
            client.db.createCollection = originalCreateCollection;

            try {
                assert(err, 'Expected an error to be returned');
                assert(err.is && err.is.InternalError, 'Expected InternalError');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });

    it('should handle modifiedCount 0 and upsertedCount 0 in createBucket', done => {
        const bucketName = 'test-bucket-createbucket';

        const mockCollection = {
            updateOne: sandbox.stub().resolves({
                modifiedCount: 0,
                upsertedCount: 0,
                matchedCount: 0,
            }),
        };

        sandbox.stub(client, 'getCollection').returns(mockCollection);

        client.createBucket(bucketName, baseBucket, logger, err => {
            try {
                assert(err, 'Expected an error to be returned');
                assert(err.is && err.is.InternalError, 'Expected InternalError');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });

    it('should successfully create a bucket', done => {
        const bucketName = 'test-bucket-createbucket-success';

        client.createBucket(bucketName, baseBucket, logger, err => {
            if (err) {
                done(err);
            } else {
                client.deleteBucket(bucketName, logger, deleteErr => {
                    done(deleteErr);
                });
            }
        });
    });
});

describe('MongoClientInterface, putBucketAttributes', () => {
    let client;
    let sandbox;

    beforeEach(done => {
        sandbox = sinon.createSandbox();
        client = createClient();
        client.setup(done);
    });

    afterEach(done => {
        sandbox.restore();
        client.close(done);
    });

    it('should handle MongoDB updateOne error in putBucketAttributes', done => {
        const bucketName = 'test-bucket-putbucketattributes';

        const mockCollection = {
            updateOne: sandbox.stub().rejects(new Error('Simulated MongoDB error')),
        };

        sandbox.stub(client, 'getCollection').returns(mockCollection);

        client.putBucketAttributes(bucketName, baseBucket, logger, err => {
            try {
                assert(err, 'Expected an error to be returned');
                assert(err.is && err.is.InternalError, 'Expected InternalError');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });

    it('should handle MongoDB modifiedCount === 0 and upsertedCount === 0 in putBucketAttributes', done => {
        const bucketName = 'test-bucket-putbucketattributes';

        const mockCollection = {
            updateOne: sandbox.stub().resolves({
                modifiedCount: 0,
                upsertedCount: 0,
                matchedCount: 0,
            }),
        };

        sandbox.stub(client, 'getCollection').returns(mockCollection);

        client.putBucketAttributes(bucketName, baseBucket, logger, err => {
            try {
                assert(err, 'Expected an error to be returned');
                assert(err.is.InternalError, 'Expected InternalError');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });
});

describe('MongoClientInterface, bucket capabilities', () => {
    let client;
    let sandbox;

    beforeEach(done => {
        sandbox = sinon.createSandbox();
        client = createClient();
        client.setup(done);
    });

    afterEach(done => {
        sandbox.restore();
        client.close(done);
    });

    it('should handle MongoDB updateOne error in putBucketAttributesCapabilities', done => {
        const bucketName = 'test-bucket-putbucketattributescapabilities';
        const capabilityName = 'VeeamSOSApi';
        const capabilityField = 'CapacityInfo';
        const capabilityValue = {
            Capacity: 1n,
            Available: 1n,
            Used: 0n,
            LastModified: '2021-09-29T14:00:00.000Z',
        };

        const mockCollection = {
            updateOne: sandbox.stub().rejects(new Error('Simulated MongoDB error')),
        };

        sandbox.stub(client, 'getCollection').returns(mockCollection);

        client.putBucketAttributesCapabilities(
            bucketName,
            capabilityName,
            capabilityField,
            capabilityValue,
            logger,
            err => {
                try {
                    assert(err, 'Expected an error to be returned');
                    assert(err.is && err.is.InternalError, 'Expected InternalError');
                    done();
                } catch (assertionError) {
                    done(assertionError);
                }
            },
        );
    });

    it('should handle MongoDB modifiedCount === 0 & upsertedCount === 0 in putBucketAttributesCapabilities', done => {
        const bucketName = 'test-bucket-putbucketattributescapabilities';
        const capabilityName = 'VeeamSOSApi';
        const capabilityField = 'CapacityInfo';
        const capabilityValue = {
            Capacity: 1n,
            Available: 1n,
            Used: 0n,
            LastModified: '2021-09-29T14:00:00.000Z',
        };

        const mockCollection = {
            updateOne: sandbox.stub().resolves({
                modifiedCount: 0,
                upsertedCount: 0,
                matchedCount: 0,
            }),
        };

        sandbox.stub(client, 'getCollection').returns(mockCollection);

        client.putBucketAttributesCapabilities(
            bucketName,
            capabilityName,
            capabilityField,
            capabilityValue,
            logger,
            err => {
                try {
                    assert(err, 'Expected an error to be returned');
                    assert(err.is && err.is.InternalError, 'Expected InternalError');
                    done();
                } catch (assertionError) {
                    done(assertionError);
                }
            },
        );
    });

    it('should handle MongoDB error in deleteBucketAttributesCapability', done => {
        const bucketName = 'test-bucket-deletebucketattributescapability';
        const capabilityName = 'VeeamSOSApi';
        const capabilityField = '';

        const mockCollection = {
            updateOne: sandbox.stub().rejects(new Error('Simulated MongoDB error')),
        };

        sandbox.stub(client, 'getCollection').returns(mockCollection);

        client.deleteBucketAttributesCapability(bucketName, capabilityName, capabilityField, logger, err => {
            try {
                assert(err, 'Expected an error to be returned');
                assert(err.is && err.is.InternalError, 'Expected InternalError');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });

    it('should handle MongoDB modifiedCount === 0 & upsertedCount === 0 in deleteBucketAttributesCapability', done => {
        const bucketName = 'test-bucket-deletebucketattributescapability';
        const capabilityName = 'VeeamSOSApi';
        const capabilityField = '';

        const mockCollection = {
            updateOne: sandbox.stub().resolves({
                modifiedCount: 0,
                upsertedCount: 0,
                matchedCount: 0,
            }),
        };

        sandbox.stub(client, 'getCollection').returns(mockCollection);

        client.deleteBucketAttributesCapability(bucketName, capabilityName, capabilityField, logger, err => {
            try {
                assert(err, 'Expected an error to be returned');
                assert(err.is && err.is.NoSuchBucket, 'Expected NoSuchBucket');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });

    // happy case for deleteBucketAttributesCapability
    it('should handle happy case for deleteBucketAttributesCapability', done => {
        const bucketName = 'test-bucket-deletebucketattributescapability';
        const capabilityName = 'VeeamSOSApi';
        const capabilityField = '';

        const mockCollection = {
            updateOne: sandbox.stub().resolves({
                modifiedCount: 1,
                upsertedCount: 0,
            }),
        };

        sandbox.stub(client, 'getCollection').returns(mockCollection);

        client.deleteBucketAttributesCapability(bucketName, capabilityName, capabilityField, logger, err => {
            try {
                assert.ifError(err, 'Expected no error to be returned');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });
});

describe('MongoClientInterface, internalDeleteObject', () => {
    const bucketName = 'test-bucket-internal-delete';
    let client;
    let collection;
    let sandbox;

    beforeEach(done => {
        sandbox = sinon.createSandbox();
        client = createClient();
        client.setup(err => {
            if (err) {
                return done(err);
            }
            return createBucket(client, bucketName, true, err => {
                if (err) {
                    return done(err);
                }
                collection = client.getCollection(bucketName);
                return done();
            });
        });
    });

    afterEach(done => {
        sandbox.restore();
        if (client) {
            client.deleteBucket(bucketName, logger, () => {
                client.close(done);
            });
        } else {
            done();
        }
    });

    it('should handle zero deletedCount in bulkWrite operation', done => {
        const key = 'test-delete-object';
        const objMD = new ObjectMD()
            .setKey(key)
            .setDataStoreName('us-east-1')
            .setContentLength(100)
            .setLastModified(new Date());

        sandbox.stub(collection, 'findOneAndUpdate').resolves({
            value: {
                value: objMD.getValue(),
            },
        });

        sandbox.stub(collection, 'bulkWrite').resolves({
            ok: 1,
            deletedCount: 0,
            matchedCount: 1,
            modifiedCount: 1,
        });

        const params = {
            vFormat: BucketVersioningKeyFormat.v1,
            versionId: '',
            repairMaster: false,
            versioning: true,
            needOplogUpdate: true,
            originOp: 'test',
            conditions: {},
        };

        client.internalDeleteObject(collection, bucketName, key, {}, params, logger, err => {
            try {
                assert(err, 'Expected an error to be returned');
                assert(err.is.DeleteConflict, 'Expected DeleteConflict error');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });

    it('should handle failures in bulkWrite operation', done => {
        const key = 'test-delete-object';
        const objMD = new ObjectMD()
            .setKey(key)
            .setDataStoreName('us-east-1')
            .setContentLength(100)
            .setLastModified(new Date());

        sandbox.stub(collection, 'findOneAndUpdate').resolves({
            value: {
                value: objMD.getValue(),
            },
        });

        sandbox.stub(collection, 'bulkWrite').resolves({
            ok: 0,
            deletedCount: 0,
            matchedCount: 0,
            modifiedCount: 0,
        });

        const params = {
            vFormat: BucketVersioningKeyFormat.v1,
            versionId: '',
            repairMaster: false,
            versioning: true,
            needOplogUpdate: true,
            originOp: 'test',
            conditions: {},
        };

        client.internalDeleteObject(collection, bucketName, key, {}, params, logger, err => {
            try {
                assert(err, 'Expected an error to be returned');
                assert(err.is.DeleteConflict, 'Expected DeleteConflict error');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });

    it('should handle error in bulkWrite operation', done => {
        const key = 'test-delete-object';
        const objMD = new ObjectMD()
            .setKey(key)
            .setDataStoreName('us-east-1')
            .setContentLength(100)
            .setLastModified(new Date());

        sandbox.stub(collection, 'findOneAndUpdate').resolves({
            value: {
                value: objMD.getValue(),
            },
        });

        sandbox.stub(collection, 'bulkWrite').rejects(new Error('Simulated bulkWrite error'));

        const params = {
            vFormat: BucketVersioningKeyFormat.v1,
            versionId: '',
            repairMaster: false,
            versioning: true,
            needOplogUpdate: true,
            originOp: 'test',
            conditions: {},
        };

        client.internalDeleteObject(collection, bucketName, key, {}, params, logger, err => {
            try {
                assert(err, 'Expected an error to be returned');
                assert(err.is.InternalError, 'Expected InternalError');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });

    it('should handle findOneAndUpdate returning no object', done => {
        const key = 'test-delete-object';

        sandbox.stub(collection, 'findOneAndUpdate').resolves({
            value: null,
        });

        const params = {
            vFormat: BucketVersioningKeyFormat.v1,
            versionId: '',
            repairMaster: false,
            versioning: true,
            needOplogUpdate: true,
            originOp: 'test',
            conditions: {},
        };

        client.internalDeleteObject(collection, bucketName, key, {}, params, logger, err => {
            try {
                assert(err, 'Expected an error to be returned');
                assert(err.is.NoSuchKey, 'Expected NoSuchKey error');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });

    it('should handle findOneAndUpdate error', done => {
        const key = 'test-delete-object';

        sandbox.stub(collection, 'findOneAndUpdate').rejects(new Error('Simulated findOneAndUpdate error'));

        const params = {
            vFormat: BucketVersioningKeyFormat.v1,
            versionId: '',
            repairMaster: false,
            versioning: true,
            needOplogUpdate: true,
            originOp: 'test',
            conditions: {},
        };

        client.internalDeleteObject(collection, bucketName, key, {}, params, logger, err => {
            try {
                assert(err, 'Expected an error to be returned');
                assert(err.is.InternalError, 'Expected InternalError');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });

    it('should handle deleteOne with deletedCount=0 when doesNotNeedOpogUpdate is true', done => {
        const key = 'test-delete-object';

        sandbox.stub(collection, 'deleteOne').resolves({
            deletedCount: 0,
        });

        const params = {
            vFormat: BucketVersioningKeyFormat.v1,
            versionId: '',
            repairMaster: false,
            versioning: true,
            needOplogUpdate: false,
            doesNotNeedOpogUpdate: true,
            originOp: 'test',
            conditions: {},
        };

        client.internalDeleteObject(collection, bucketName, key, {}, params, logger, err => {
            try {
                assert(err, 'Expected an error to be returned');
                assert(err.is.NoSuchKey, 'Expected NoSuchKey error');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });

    it('should handle error in deleteOne when doesNotNeedOpogUpdate is true', done => {
        const key = 'test-delete-object';

        sandbox.stub(collection, 'deleteOne').rejects(new Error('Simulated deleteOne error'));

        const params = {
            vFormat: BucketVersioningKeyFormat.v1,
            versionId: '',
            repairMaster: false,
            versioning: true,
            needOplogUpdate: false,
            doesNotNeedOpogUpdate: true,
            originOp: 'test',
            conditions: {},
        };

        client.internalDeleteObject(collection, bucketName, key, {}, params, logger, err => {
            try {
                assert(err, 'Expected an error to be returned');
                assert(err.is.InternalError, 'Expected InternalError');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });

    it('should successfully delete object when bulkWrite returns proper values', done => {
        const key = 'test-delete-object';
        const objMD = new ObjectMD()
            .setKey(key)
            .setDataStoreName('us-east-1')
            .setContentLength(100)
            .setLastModified(new Date());

        sandbox.stub(collection, 'findOneAndUpdate').resolves({
            value: {
                value: objMD.getValue(),
            },
        });

        sandbox.stub(collection, 'bulkWrite').resolves({
            ok: 1,
            deletedCount: 1,
            matchedCount: 1,
            modifiedCount: 1,
        });

        const params = {
            vFormat: BucketVersioningKeyFormat.v1,
            versionId: '',
            repairMaster: false,
            versioning: true,
            needOplogUpdate: true,
            originOp: 'test',
            conditions: {},
        };

        client.internalDeleteObject(collection, bucketName, key, {}, params, logger, (err, result) => {
            try {
                assert.ifError(err);
                assert.strictEqual(result, undefined, 'Expected  result');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });

    it('should successfully delete object when doesNotNeedOpogUpdate is true', done => {
        const key = 'test-delete-object';

        sandbox.stub(collection, 'deleteOne').resolves({
            deletedCount: 1,
        });

        const params = {
            vFormat: BucketVersioningKeyFormat.v1,
            versionId: '',
            repairMaster: false,
            versioning: true,
            needOplogUpdate: false,
            doesNotNeedOpogUpdate: true,
            originOp: 'test',
            conditions: {},
        };

        client.internalDeleteObject(collection, bucketName, key, {}, params, logger, (err, result) => {
            try {
                assert.ifError(err);
                assert.strictEqual(result, undefined, 'Expected undefined result');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });
});

describe('MongoClientInterface, indexes', () => {
    let client;
    let sandbox;

    beforeEach(done => {
        sandbox = sinon.createSandbox();
        client = createClient();
        client.setup(done);
    });

    afterEach(done => {
        sandbox.restore();
        client.close(done);
    });

    it('should handle MongoDB updateOne error in putBucketIndexes', done => {
        const bucketName = 'test-bucket-putbucketindexes';
        const mockCollection = {
            createIndexes: sandbox.stub().rejects(new Error('Simulated MongoDB error')),
        };

        sandbox.stub(client, 'getCollection').returns(mockCollection);

        const indexSpecs = [
            {
                name: 'testIndex',
                keys: [{ key: 'testKey', order: 1 }],
            },
        ];

        client.putBucketIndexes(bucketName, indexSpecs, logger, err => {
            try {
                assert(err, 'Expected an error to be returned');
                assert(err.is && err.is.InternalError, 'Expected InternalError');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });

    it('should handle empty result in putBucketIndexes', done => {
        const bucketName = 'test-bucket-putbucketindexes';
        const mockCollection = {
            createIndexes: sandbox.stub().resolves({}),
        };

        sandbox.stub(client, 'getCollection').returns(mockCollection);

        client.putBucketIndexes(bucketName, [], logger, err => {
            try {
                // For empty index specs, we should still resolve properly, just no indexes were created
                assert.ifError(err, 'Expected no error when empty index specs are provided');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });

    it('should handle MongoDB dropIndex error in deleteBucketIndexes', done => {
        const bucketName = 'test-bucket-deletebucketindexes';
        const mockCollection = {
            dropIndex: sandbox.stub().rejects(new Error('Simulated MongoDB error')),
        };

        sandbox.stub(client, 'getCollection').returns(mockCollection);

        client.deleteBucketIndexes(bucketName, [{ name: 'testIndex' }], logger, err => {
            try {
                assert(err, 'Expected an error to be returned');
                assert(err.is && err.is.InternalError, 'Expected InternalError');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });

    it('should handle empty result in deleteBucketIndexes', done => {
        const bucketName = 'test-bucket-deletebucketindexes';
        const mockCollection = {
            dropIndex: sandbox.stub().resolves({}),
        };

        sandbox.stub(client, 'getCollection').returns(mockCollection);

        client.deleteBucketIndexes(bucketName, [], logger, err => {
            try {
                // No indexes to delete, should resolve without error
                assert.ifError(err, 'Expected no error when empty index specs are provided');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });
});

describe('MongoClientInterface, putBucketIndexes', () => {
    let client;
    let sandbox;

    beforeEach(done => {
        sandbox = sinon.createSandbox();
        client = createClient();
        client.setup(done);
    });

    afterEach(done => {
        sandbox.restore();
        if (client) {
            client.close(done);
        } else {
            done();
        }
    });

    it('should handle null result in putBucketIndexes', done => {
        const bucketName = 'test-bucket-putbucketindexes-null';
        const mockCollection = {
            createIndexes: sandbox.stub().resolves(null),
        };

        sandbox.stub(client, 'getCollection').returns(mockCollection);

        const indexSpecs = [
            {
                name: 'testIndex',
                keys: [{ key: 'testKey', order: 1 }],
            },
        ];

        client.putBucketIndexes(bucketName, indexSpecs, logger, err => {
            try {
                assert.strictEqual(err, null);
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });

    it('should succeed with valid result in putBucketIndexes', done => {
        const bucketName = 'test-bucket-putbucketindexes-success';
        const mockCollection = {
            createIndexes: sandbox.stub().resolves({
                createdCollectionAutomatically: false,
                numIndexesBefore: 1,
                numIndexesAfter: 2,
            }),
        };

        sandbox.stub(client, 'getCollection').returns(mockCollection);

        const indexSpecs = [
            {
                name: 'testIndex',
                keys: [{ key: 'testKey', order: 1 }],
            },
        ];

        client.putBucketIndexes(bucketName, indexSpecs, logger, err => {
            try {
                assert.ifError(err, 'Expected no error');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });
});

describe('MongoClientInterface, deleteBucketIndexes', () => {
    let client;
    let sandbox;

    beforeEach(done => {
        sandbox = sinon.createSandbox();
        client = createClient();
        client.setup(done);
    });

    afterEach(done => {
        sandbox.restore();
        if (client) {
            client.close(done);
        } else {
            done();
        }
    });

    it('should handle null result in dropIndex', done => {
        const bucketName = 'test-bucket-deletebucketindexes-null';
        const mockCollection = {
            dropIndex: sandbox.stub().resolves(null),
        };

        sandbox.stub(client, 'getCollection').returns(mockCollection);

        const indexSpecs = [{ name: 'testIndex' }];

        client.deleteBucketIndexes(bucketName, indexSpecs, logger, err => {
            try {
                assert(err, 'Expected an error to be returned');
                assert.strictEqual(err.is.InternalError, true, 'Expected InternalError');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });

    it('should handle result with ok=0 in dropIndex', done => {
        const bucketName = 'test-bucket-deletebucketindexes-notok';
        const mockCollection = {
            dropIndex: sandbox.stub().resolves({ ok: 0 }),
        };

        sandbox.stub(client, 'getCollection').returns(mockCollection);

        const indexSpecs = [{ name: 'testIndex' }];

        client.deleteBucketIndexes(bucketName, indexSpecs, logger, err => {
            try {
                assert(err, 'Expected an error to be returned');
                assert.strictEqual(err.is.InternalError, true, 'Expected InternalError');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });

    it('should succeed with valid result in dropIndex', done => {
        const bucketName = 'test-bucket-deletebucketindexes-success';
        const mockCollection = {
            dropIndex: sandbox.stub().resolves({ ok: 1 }),
        };

        sandbox.stub(client, 'getCollection').returns(mockCollection);

        const indexSpecs = [{ name: 'testIndex' }];

        client.deleteBucketIndexes(bucketName, indexSpecs, logger, err => {
            try {
                assert.ifError(err, 'Expected no error');
                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });
});

module.exports = {
    createClient,
    createBucket,
};
