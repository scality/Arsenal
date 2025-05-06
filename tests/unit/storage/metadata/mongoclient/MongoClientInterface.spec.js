const async = require('async');
const assert = require('assert');
const werelogs = require('werelogs');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const sinon = require('sinon');

const logger = new werelogs.Logger('MongoClientInterface', 'debug', 'debug');
const BucketInfo = require('../../../../../lib/models/BucketInfo').default;
const MongoUtils = require('../../../../../lib/storage/metadata/mongoclient/utils');
const ObjectMD = require('../../../../../lib/models/ObjectMD').default;
const { BucketVersioningKeyFormat } = require('../../../../../lib/versioning/constants').VersioningConstants;
const { formatMasterKey } = require('../../../../../lib/storage/metadata/mongoclient/utils');

const dbName = 'metadata';

const mongoserver = new MongoMemoryReplSet({
    debug: false,
    instanceOpts: [
        { port: 27021 },
    ],
    replSet: {
        name: 'customSetName',
        count: 1,
        dbName,
        storageEngine: 'wiredTiger',
    },
});

const MongoClientInterface = require(
    '../../../../../lib/storage/metadata/mongoclient/MongoClientInterface');
const DummyConfigObject = require('./utils/DummyConfigObject');

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
                    'replicationInfo': {
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
                    'dataStoreName': 'us-east-1',
                    'content-length': 42,
                    'versionId': '0123456789abcdefg',
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
                    'replicationInfo': {
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
                    'dataStoreName': 'us-east-1',
                    'content-length': 42,
                    'versionId': '0123456789abcdefg',
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
                    'replicationInfo': {
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
                    'dataStoreName': 'us-east-1',
                    'content-length': 42,
                    'versionId': '0123456789abcdefg',
                },

            },
            true,
        ],
    ];
    tests.forEach(([msg, params, expected]) => it(msg, () => {
        assert.deepStrictEqual(
            mongoTestClient._isReplicationEntryStalled(params, testDate),
            expected,
        );
    }));
});

describe('MongoClientInterface::getDiskUsage', () => {
    it('should return error if database is not connected', done => {
        // Create a client with no db/client initialized
        const testClient = new MongoClientInterface({});
        
        testClient.getDiskUsage((err, result) => {
            assert.strictEqual(result, undefined);
            assert(err);
            assert(err.is.InternalError);
            assert.strictEqual(
                err.description,
                'Cannot get disk usage: database not connected'
            );
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
            command: sinon.stub().rejects(new Error('DB command error'))
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
            fsFreeSize: 1000000,
            fsTotalSize: 5000000
        };
        
        // Mock the database and command
        testClient.db = {
            command: sinon.stub().resolves(mockStats)
        };
        testClient.client = {}; // Just to pass the initial check
        
        testClient.getDiskUsage((err, result) => {
            assert.strictEqual(err, null);
            assert.deepStrictEqual(result, {
                available: mockStats.fsFreeSize,
                free: mockStats.fsFreeSize,
                total: mockStats.fsTotalSize
            });
            assert(testClient.db.command.calledOnce);
            assert(testClient.db.command.calledWith({ dbStats: 1, scale: 1 }));
            done();
        });
    });

    it('should handle missing stats properties gracefully', done => {
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
            // No fsFreeSize or fsTotalSize
            db: 'test',
            collections: 5
        };
        
        // Mock the database and command
        testClient.db = {
            command: sinon.stub().resolves(mockStats)
        };
        testClient.client = {}; // Just to pass the initial check
        
        testClient.getDiskUsage((err, result) => {
            assert.strictEqual(err, null);
            assert.deepStrictEqual(result, {
                available: 0,
                free: 0,
                total: 0
            });
            assert(testClient.db.command.calledOnce);
            assert(testClient.db.command.calledWith({ dbStats: 1, scale: 1 }));
            done();
        });
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
        _versioningConfiguration: isVersioned
            ? { Status: 'Enabled' }
            : null,
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
    beforeAll(done => {
        mongoserver.start().then(() => {
            mongoserver.waitUntilRunning().then(() => {
                const opts = {
                    replicaSetHosts: 'localhost:27021',
                    writeConcern: 'majority',
                    replicaSet: 'customSetName',
                    readPreference: 'primary',
                    database: dbName,
                    replicationGroupId: 'GR001',
                    logger,
                };
                client = new MongoClientInterface(opts);
                client.setup(() => done());
            });
        });
    });

    afterAll(done => {
        async.series([
            next => client.close(next),
            next => mongoserver.stop()
                .then(() => next())
                .catch(next),
        ], done);
    });

    it('shall encode/decode tags properly', done => {
        const bucketName = 'foo';
        const objectName = 'bar';
        const tags = {
            'tag1': 'value1',
            'tag2': 'value.2',
            'tag.3': 'value3',
            'tag.4': 'value.4',
            'tag6': 'value6',
            'tag7': 'value$7',
            'tag$8': 'value8',
            'tag$9': 'value$9',
        };
        async.waterfall([
            next => createBucket(
                client, bucketName, false, err => next(err)),
            next => {
                const objMD = new ObjectMD()
                    .setKey(objectName)
                    .setDataStoreName('us-east-1')
                    .setContentLength(100)
                    .setTags(tags)
                    .setLastModified(new Date(Date.now()));
                client.putObject(bucketName, objectName, objMD.getValue(), {},
                    logger, err => next(err));
            },
            next => {
                const c = client.getCollection(bucketName);
                const mObjectName = formatMasterKey(objectName, BucketVersioningKeyFormat.v1);
                c.findOne({
                    _id: mObjectName,
                }, {}).then(doc => {
                    if (!doc) {
                        return next(new Error('key not found'));
                    }
                    assert.deepStrictEqual(doc.value.tags, {
                        'tag1': 'value1',
                        'tag2': 'value.2',
                        'tag\uFF0E3': 'value3',
                        'tag\uFF0E4': 'value.4',
                        'tag6': 'value6',
                        'tag7': 'value$7',
                        'tag\uFF048': 'value8',
                        'tag\uFF049': 'value$9',
                    });
                    MongoUtils.unserialize(doc.value);
                    assert.deepStrictEqual(doc.value.tags, tags);
                    return next();
                }).catch(err => next(err));
            },
            next => client.deleteObject(bucketName, objectName, {}, logger, next),
            next => client.deleteBucket(bucketName, logger, next),
        ], done);
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
        async.waterfall([
            next => createBucket(client, bucketName, false, err => next(err)),
            next => {
                const bucketMD = new BucketInfo(bucketName, 'testowner',
                    'testdisplayname', new Date().toJSON(),
                    BucketInfo.currentModelVersion());
                bucketMD.setQuota(quotaValue);
                client.putBucketAttributes(bucketName, bucketMD, logger, err => next(err));
            },
            next => client.getBucketAttributes(bucketName, logger, (err, bucketMd) => {
                assert(!err);
                assert.strictEqual(bucketMd._quotaMax, quotaValue);
                return next();
            }),
            next => client.deleteBucket(bucketName, logger, err => next(err)),
        ], done);
    });

    it('should add a capability to a bucket', done => {
        async.waterfall([
            next => createBucket(client, bucketName, false, err => next(err)),
            next => client.putBucketAttributesCapabilities(
                bucketName, capabilityName, capabilityField, capabilityValue, logger, err => next(err)),
            next => client.getBucketAttributes(bucketName, logger, (err, bucketInfo) => {
                if (err) {
                    return next(err);
                }
                const capabilities = bucketInfo._capabilities || {};
                assert.deepStrictEqual(capabilities[capabilityName][capabilityField], capabilityValue);
                return next();
            }),
            next => client.deleteBucket(bucketName, logger, err => next(err)),
        ], done);
    });

    it('should delete a capability from a bucket', done => {
        async.waterfall([
            next => createBucket(client, bucketName, false, err => next(err)),
            next => client.putBucketAttributesCapabilities(
                bucketName, capabilityName, capabilityField, capabilityValue, logger, err => next(err)),
            next => client.deleteBucketAttributesCapability(
                bucketName, capabilityName, '', logger, err => next(err)),
            next => client.getBucketAttributes(bucketName, logger, (err, bucketInfo) => {
                if (err) {
                    return next(err);
                }
                const capabilities = bucketInfo._capabilities || {};
                assert(!capabilities[capabilityName]);
                return next();
            }),
            next => client.deleteBucket(bucketName, logger, err => next(err)),
        ], done);
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
    
        async.waterfall([
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
            next => client.getBucketAttributes(bucketName, logger, (err, bucketMd) => {
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
        ], done);
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

        async.waterfall([
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
        ], (err, bucketInfo) => {
            assert.ifError(err);
            assert.ok(bucketInfo, 'BucketInfo should be retrieved');

            const retrievedCapabilities = bucketInfo.getCapabilities();
            assert.ok(retrievedCapabilities, 'Capabilities should exist');
            assert.ok(retrievedCapabilities.VeeamSOSApi, 'VeeamSOSApi capabilities should exist');

            const retrievedCapacityInfo = retrievedCapabilities.VeeamSOSApi.CapacityInfo;
            assert.ok(retrievedCapacityInfo, 'VeeamSOSApi.CapacityInfo should exist');

            assert.strictEqual(typeof retrievedCapacityInfo.Capacity, 'bigint', 'Capacity should be a bigint');
            assert.strictEqual(retrievedCapacityInfo.Capacity.toString(), veeamCapacity.Capacity, 'Capacity value mismatch');

            assert.strictEqual(typeof retrievedCapacityInfo.Available, 'bigint', 'Available should be a bigint');
            assert.strictEqual(retrievedCapacityInfo.Available.toString(), veeamCapacity.Available, 'Available value mismatch');

            assert.strictEqual(typeof retrievedCapacityInfo.Used, 'bigint', 'Used should be a bigint');
            assert.strictEqual(retrievedCapacityInfo.Used.toString(), veeamCapacity.Used, 'Used value mismatch');

            assert.strictEqual(retrievedCapacityInfo.LastModified, veeamCapacity.LastModified, 'LastModified value mismatch');
            done();
        });
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
    it('Should return error if writeUUIDIfNotExists fails', done => {
        const log = new werelogs.Logger('MongoClientInterface', 'debug', 'debug');
        const writeUUIDIfNotExists = mongoTestClient.writeUUIDIfNotExists;
        mongoTestClient.writeUUIDIfNotExists = (uuid, log, cb) => {
            return cb({ is: { InternalError: true } });
        };
        mongoTestClient.getUUID(log, err => {
            assert(err);
            mongoTestClient.writeUUIDIfNotExists = writeUUIDIfNotExists;
            return done();
        });
    });

    it('Should return uuid', done => {
        const log = new werelogs.Logger('MongoClientInterface', 'debug', 'debug');
        const writeUUIDIfNotExists = mongoTestClient.writeUUIDIfNotExists;
        mongoTestClient.writeUUIDIfNotExists = (uuid, log, cb) => {
            return cb();
        };
        const readUUID = mongoTestClient.readUUID;
        mongoTestClient.readUUID = (log, cb) => {
            return cb(null, 'uuid');
        };
        mongoTestClient.getUUID(log, (err, uuid) => {
            assert.ifError(err);
            assert.strictEqual(typeof uuid, 'string');
            mongoTestClient.writeUUIDIfNotExists = writeUUIDIfNotExists;
            mongoTestClient.readUUID = readUUID;
            return done();
        });
    });
});
