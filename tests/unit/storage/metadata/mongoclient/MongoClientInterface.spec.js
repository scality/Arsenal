const async = require('async');
const assert = require('assert');
const werelogs = require('werelogs');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

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
