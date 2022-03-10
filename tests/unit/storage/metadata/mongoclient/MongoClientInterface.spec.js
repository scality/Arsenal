const async = require('async');
const assert = require('assert');
const werelogs = require('werelogs');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const logger = new werelogs.Logger('MongoClientInterface', 'debug', 'debug');
const BucketInfo = require('../../../../../lib/models/BucketInfo');
const MongoUtils = require('../../../../../lib/storage/metadata/mongoclient/utils');
const ObjectMD = require('../../../../../lib/models/ObjectMD');
const { BucketVersioningKeyFormat } = require('../../../../../lib/versioning/constants').VersioningConstants;
const { formatMasterKey } = require('../../../../../lib/storage/metadata/mongoclient/utils');

const dbName = 'metadata';

const mongoserver = new MongoMemoryReplSet({
    debug: false,
    instanceOpts: [
        { port: 27018 },
    ],
    replSet: {
        name: 'customSetName',
        count: 1,
        dbName,
        storageEngine: 'ephemeralForTest',
    },
});

const MongoClientInterface = require(
    '../../../../../lib/storage/metadata/mongoclient/MongoClientInterface');
const DummyConfigObject = require('./utils/DummyConfigObject');

const mongoTestClient = new MongoClientInterface({});

describe('MongoClientInterface::_handleResults', () => {
    it('should return zero-result', () => {
        const testInput = {
            masterCount: 0, masterData: {},
            nullCount: 0, nullData: {},
            versionCount: 0, versionData: {},
        };
        const testResults = mongoTestClient._handleResults(testInput, true);
        const expectedRes = {
            versions: 0, objects: 0,
            dataManaged: {
                total: { curr: 0, prev: 0 },
                locations: {},
            },
        };
        assert.deepStrictEqual(testResults, expectedRes);
    });

    it('should return correct value if isVer is false', () => {
        const testInput = {
            masterCount: 2, masterData: { test1: 10, test2: 10 },
            nullCount: 2, nullData: { test1: 10, test2: 10 },
            versionCount: 2, versionData: { test1: 20, test2: 20 },
        };
        const testResults = mongoTestClient._handleResults(testInput, false);
        const expectedRes = {
            versions: 0, objects: 4,
            dataManaged: {
                total: { curr: 40, prev: 0 },
                locations: {
                    test1: { curr: 20, prev: 0 },
                    test2: { curr: 20, prev: 0 },
                },
            },
        };
        assert.deepStrictEqual(testResults, expectedRes);
    });

    it('should return correct value if isVer is true', () => {
        const testInput = {
            masterCount: 2, masterData: { test1: 10, test2: 10 },
            nullCount: 2, nullData: { test1: 10, test2: 10 },
            versionCount: 4, versionData: { test1: 20, test2: 20 },
        };
        const testResults = mongoTestClient._handleResults(testInput, true);
        const expectedRes = {
            versions: 2, objects: 4,
            dataManaged: {
                total: { curr: 40, prev: 20 },
                locations: {
                    test1: { curr: 20, prev: 10 },
                    test2: { curr: 20, prev: 10 },
                },
            },
        };
        assert.deepStrictEqual(testResults, expectedRes);
    });
});

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

describe('MongoClientInterface::_processEntryData', () => {
    const tests = [
        [
            'should add content-length to total if replication status != ' +
            'COMPLETED and transient == true',
            true,
            {
                _id: 'testkey',
                value: {
                    'last-modified': new Date(),
                    'replicationInfo': {
                        status: 'PENDING',
                        backends: [],
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
            {
                data: {
                    'us-east-1': 42,
                },
                error: null,
            },
        ],
        [
            'should not add content-length to total if replication ' +
            'status == COMPLETED and transient == true',
            true,
            {
                _id: 'testkey',
                value: {
                    'last-modified': new Date(),
                    'replicationInfo': {
                        status: 'COMPLETED',
                        backends: [],
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
            {
                data: {
                    'us-east-1': 0,
                },
                error: null,
            },
        ],
        [
            'should add content-length to total if replication status != ' +
            'COMPLETED and transient == false',
            false,
            {
                _id: 'testkey',
                value: {
                    'last-modified': new Date(),
                    'replicationInfo': {
                        status: 'PENDING',
                        backends: [],
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
            {
                data: {
                    'us-east-1': 42,
                },
                error: null,
            },
        ],
        [
            'should add content-length to total if replication ' +
            'status == COMPLETED and transient == false',
            false,
            {
                _id: 'testkey',
                value: {
                    'last-modified': new Date(),
                    'replicationInfo': {
                        status: 'COMPLETED',
                        backends: [],
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
            {
                data: {
                    'us-east-1': 42,
                },
                error: null,
            },
        ],
        [
            'should add content-length to total for each COMPLETED backends ' +
            '(replication status: COMPLETED)',
            true,
            {
                _id: 'testkey',
                value: {
                    'last-modified': new Date(),
                    'replicationInfo': {
                        status: 'COMPLETED',
                        backends: [
                            {
                                status: 'COMPLETED',
                                site: 'completed-1',
                            },
                            {
                                status: 'COMPLETED',
                                site: 'completed-2',
                            },
                            {
                                status: 'COMPLETED',
                                site: 'completed-3',
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
            {
                data: {
                    'us-east-1': 0,
                    'completed-1': 42,
                    'completed-2': 42,
                    'completed-3': 42,
                },
                error: null,
            },
        ],
        [
            'should add content-length to total for each COMPLETED backends ' +
            '(replication status: PENDING)',
            true,
            {
                _id: 'testkey',
                value: {
                    'last-modified': new Date(),
                    'replicationInfo': {
                        status: 'PENDING',
                        backends: [
                            {
                                status: 'PENDING',
                                site: 'not-completed',
                            },
                            {
                                status: 'COMPLETED',
                                site: 'completed-1',
                            },
                            {
                                status: 'COMPLETED',
                                site: 'completed-2',
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
            {
                data: {
                    'us-east-1': 42,
                    'completed-1': 42,
                    'completed-2': 42,
                },
                error: null,
            },
        ],
        [
            'should error if content-length is invalid',
            true,
            {
                _id: 'testkey',
                value: {
                    'last-modified': new Date(),
                    'replicationInfo': {
                        status: 'PENDING',
                        backends: [
                            {
                                status: 'PENDING',
                                site: 'not-completed',
                            },
                            {
                                status: 'COMPLETED',
                                site: 'completed-1',
                            },
                            {
                                status: 'COMPLETED',
                                site: 'completed-2',
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
                    'content-length': 'not-a-number',
                    'versionId': '0123456789abcdefg',
                },
            },
            {
                data: {},
                error: new Error('invalid content length'),
            },
        ],
        [
            'should correctly process entry with string typed content-length',
            true,
            {
                _id: 'testkey',
                value: {
                    'last-modified': new Date(),
                    'replicationInfo': {
                        status: 'PENDING',
                        backends: [],
                        content: [],
                        destination: '',
                        storageClass: '',
                        role: '',
                        storageType: '',
                        dataStoreVersionId: '',
                        isNFS: null,
                    },
                    'dataStoreName': 'us-east-1',
                    'content-length': '42',
                    'versionId': '0123456789abcdefg',
                },
            },
            {
                data: {
                    'us-east-1': 42,
                },
                error: null,
            },
        ],
    ];
    tests.forEach(([msg, isTransient, params, expected]) => it(msg, () => {
        assert.deepStrictEqual(
            mongoTestClient._processEntryData(params, isTransient),
            expected,
        );
    }));
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

function uploadObjects(client, bucketName, objectList, callback) {
    async.eachSeries(objectList, (obj, done) => {
        const objMD = new ObjectMD()
            .setKey(obj.name)
            .setDataStoreName('us-east-1')
            .setContentLength(100)
            .setLastModified(obj.lastModified);
        if (obj.repInfo) {
            objMD.setReplicationInfo(obj.repInfo);
        }
        client.putObject(bucketName, obj.name, objMD.getValue(), {
            versionId: obj.versionId,
            versioning: obj.versioning,
        }, logger, done);
    }, callback);
}

describe('MongoClientInterface, tests', () => {
    const hr = 1000 * 60 * 60;
    let client;
    beforeAll(done => {
        mongoserver.waitUntilRunning().then(() => {
            const opts = {
                replicaSetHosts: 'localhost:27018',
                writeConcern: 'majority',
                replicaSet: 'customSetName',
                readPreference: 'primary',
                database: dbName,
                replicationGroupId: 'GR001',
                logger,
            };

            client = new MongoClientInterface(opts);
            client.setup(done);
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

    const tests = [
        [
            'getObjectMDStats() should return correct results',
            {
                bucketName: 'test-bucket',
                isVersioned: true,
                objectList: [
                    // versioned object 1,
                    {
                        name: 'testkey',
                        versioning: true,
                        versionId: null,
                        lastModified: new Date(Date.now()),
                        repInfo: {
                            status: 'COMPLETED',
                            backends: [
                                {
                                    status: 'COMPLETED',
                                    site: 'rep-loc-1',
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
                    },
                    // versioned object 2,
                    {
                        name: 'testkey',
                        versioning: true,
                        versionId: null,
                        lastModified: new Date(Date.now()),
                        repInfo: {
                            status: 'COMPLETED',
                            backends: [
                                {
                                    status: 'COMPLETED',
                                    site: 'rep-loc-1',
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
                    },
                    // stalled object 1
                    {
                        name: 'testkey',
                        versioning: true,
                        versionId: null,
                        lastModified: new Date(Date.now() - hr),
                        repInfo: {
                            status: 'PENDING',
                            backends: [
                                {
                                    status: 'PENDING',
                                    site: 'rep-loc-1',
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
                    },
                    // null versioned object
                    {
                        name: 'nullkey',
                        lastModified: new Date(Date.now() - hr),
                    },
                ],
            },
            {
                dataManaged: {
                    locations: {
                        'rep-loc-1': {
                            curr: 0,
                            prev: 200,
                        },
                        'us-east-1': {
                            curr: 200,
                            prev: 200,
                        },
                    },
                    total: {
                        curr: 200,
                        prev: 400,
                    },
                },
                objects: 2,
                stalled: 1,
                versions: 2,
            },
        ],
    ];
    tests.forEach(([msg, testCase, expected]) => it(msg, done => {
        const {
            bucketName,
            isVersioned,
            objectList,
        } = testCase;
        async.waterfall([
            next => createBucket(
                client, bucketName, isVersioned, err => next(err)),
            next => uploadObjects(
                client, bucketName, objectList, err => next(err)),
            next => client.getBucketAttributes(bucketName, logger, next),
            (bucketInfo, next) => client.getObjectMDStats(
                bucketName,
                BucketInfo.fromObj(bucketInfo),
                false,
                logger,
                (err, res) => {
                    if (err) {
                        return next(err);
                    }
                    assert.deepStrictEqual(res, expected);
                    return next();
                }),
            next => client.deleteBucket(bucketName, logger, next),
        ], done);
    }));

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
                }, {}, (err, doc) => {
                    if (err) {
                        return next(err);
                    }
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
                });
            },
            next => client.deleteObject(bucketName, objectName, {}, logger, next),
            next => client.deleteBucket(bucketName, logger, next),
        ], done);
    });
});
