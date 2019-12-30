const async = require('async');
const assert = require('assert');
const werelogs = require('werelogs');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const errors = require('../../../../lib/errors');
const logger = new werelogs.Logger('MongoClientInterface', 'debug', 'debug');
const BucketInfo = require('../../../../lib/models/BucketInfo');
const ObjectMD = require('../../../../lib/models/ObjectMD');
const MongoClientInterface =
    require('../../../../lib/storage/metadata/mongoclient/MongoClientInterface');
const MetadataWrapper =
    require('../../../../lib/storage/metadata/MetadataWrapper');

const implName = 'mongodb';
const dbName = 'metadata';
const bucketName = 'testbucket';

const mongoserver = new MongoMemoryReplSet({
    debug: false,
    instanceOpts: [
        { port: 27018 },
    ],
    replSet: {
        name: 'rs0',
        count: 1,
        dbName,
        storageEngine: 'ephemeralForTest',
    },
});

describe('MongoClientInterface', () => {
    let metadata;
    before(done => {
        mongoserver.waitUntilRunning().then(() => {
            const opts = {
                mongodb: {
                    replicaSetHosts: 'localhost:27018',
                    writeConcern: 'majority',
                    replicaSet: 'rs0',
                    readPreference: 'primary',
                    database: dbName,
                },
            };
            metadata = new MetadataWrapper(implName, opts, null, logger);
            metadata.setup(done);
        });
    });

    after(done => {
        async.series([
            next => metadata.close(next),
            next => mongoserver.stop()
                .then(() => next())
                .catch(next),
        ], done);
    });

    beforeEach(done => {
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
            _readLocationConstraint: null,
            _cors: null,
            _replicationConfiguration: null,
            _lifecycleConfiguration: null,
            _uid: '',
            _isNFS: null,
            ingestion: null,
        });
        metadata.createBucket(bucketName, bucketMD, logger, done);
    });

    afterEach(done => {
        metadata.deleteBucket(bucketName, logger, done);
    });

    describe('::putObjectWithCond', () => {
        const tests = [
            [
                'should upsert object if an existing object does not exist',
                {
                    initVal: null,
                    upsertVal: { value: { number: 42, string: 'forty-two' } },
                    conditions: { value: { number: 24 } },
                    expectedVal: { value: { number: 42, string: 'forty-two' } },
                    error: null,
                },
            ],
            [
                'should not update an existing object if the conditions fails',
                {
                    initVal: { value: { number: 0, string: 'zero' } },
                    upsertVal: { value: { number: 42, string: 'forty-two' } },
                    conditions: { value: { number: 24 } },
                    expectedVal: { value: { number: 0, string: 'zero' } },
                    error: errors.InternalError,
                },
            ],
            [
                'should not update an existing object if the conditions fails',
                {
                    initVal: { value: { number: 0, string: 'zero' } },
                    upsertVal: { value: { number: 42, string: 'forty-two' } },
                    conditions: { value: { string: { $eq: 'twenty-four' } } },
                    expectedVal: { value: { number: 0, string: 'zero' } },
                    error: errors.InternalError,
                },
            ],
            [
                'should not update an existing object if the conditions fails',
                {
                    initVal: { value: { number: 0, string: 'zero' } },
                    upsertVal: { value: { number: 42, string: 'forty-two' } },
                    conditions: {
                        value: {
                            string: { $eq: 'twenty-four' },
                            number: { $eq: 0 },
                        },
                    },
                    expectedVal: { value: { number: 0, string: 'zero' } },
                    error: errors.InternalError,
                },
            ],
            [
                'should update an existing object if the conditions passes',
                {
                    initVal: { value: { number: 24, string: 'twenty-four' } },
                    upsertVal: { value: { number: 42, string: 'forty-two' } },
                    conditions: { value: { number: 24 } },
                    expectedVal: { value: { number: 42, string: 'forty-two' } },
                    error: null,
                },
            ],
            [
                'should update an existing object if the conditions passes',
                {
                    initVal: { value: { number: 24, string: 'twenty-four' } },
                    upsertVal: { value: { number: 42, string: 'forty-two' } },
                    conditions: { value: { string: { $eq: 'twenty-four' } } },
                    expectedVal: { value: { number: 42, string: 'forty-two' } },
                    error: null,
                },
            ],
            [
                'should update an existing object if the conditions passes',
                {
                    initVal: { value: { number: 24, string: 'twenty-four' } },
                    upsertVal: { value: { number: 42, string: 'forty-two' } },
                    conditions: {
                        value: {
                            string: { $eq: 'twenty-four' },
                            number: { $eq: 24 },
                        },
                    },
                    expectedVal: { value: { number: 42, string: 'forty-two' } },
                    error: null,
                },
            ],
        ];
        tests.forEach(([msg, testCase]) => it(msg, done => {
            const objectKey = 'testkey';
            const {
                initVal, upsertVal, conditions, expectedVal, error,
            } = testCase;
            const params = { conditions };
            async.series([
                next => {
                    if (!initVal) {
                        return next();
                    }
                    return metadata.putObjectMD(bucketName, objectKey, initVal,
                                                {}, logger, next);
                },
                next => metadata.putObjectWithCond(bucketName, objectKey,
                    upsertVal, params, logger, err => {
                        if (error) {
                            assert.deepStrictEqual(err, error);
                            return next();
                        }
                        assert(!err);
                        return next();
                    }),
                next => metadata.getObjectMD(bucketName, objectKey, {}, logger,
                    (err, res) => {
                        assert(!err);
                        assert.deepStrictEqual(res, expectedVal);
                        next();
                    }),
            ], done);
        }));
    });

    describe('::deleteObjectWithCond', () => {
        const tests = [
            [
                'should return no such key if the object does not exist',
                {
                    initVal: null,
                    conditions: { value: { number: 24 } },
                    expectedVal: null,
                    error: errors.NoSuchKey,
                },
            ],
            [
                'should return no such key if the conditions fails',
                {
                    initVal: { value: { number: 0, string: 'zero' } },
                    conditions: { value: { number: { $eq: 24 } } },
                    expectedVal: { value: { number: 0, string: 'zero' } },
                    error: errors.NoSuchKey,
                },
            ],
            [
                'should return no such key if the conditions fails',
                {
                    initVal: { value: { number: 0, string: 'zero' } },
                    conditions: { value: { string: 'twenty-four' } },
                    expectedVal: { value: { number: 0, string: 'zero' } },
                    error: errors.NoSuchKey,
                },
            ],
            [
                'should return no such key if the conditions fails',
                {
                    initVal: { value: { number: 0, string: 'zero' } },
                    conditions: {
                        value: {
                            string: 'twenty-four',
                            number: { $eq: 0 },
                        },
                    },
                    expectedVal: { value: { number: 0, string: 'zero' } },
                    error: errors.NoSuchKey,
                },
            ],
            [
                'should successfully delete matched object',
                {
                    initVal: { value: { number: 24, string: 'twenty-four' } },
                    conditions: { value: { number: 24 } },
                    expectedVal: null,
                    error: null,
                },
            ],
            [
                'should successfully delete matched object',
                {
                    initVal: { value: { number: 24, string: 'twenty-four' } },
                    conditions: { value: { string: { $eq: 'twenty-four' } } },
                    expectedVal: null,
                    error: null,
                },
            ],
            [
                'should successfully delete matched object',
                {
                    initVal: { value: { number: 24, string: 'twenty-four' } },
                    conditions: {
                        value: {
                            string: { $eq: 'twenty-four' },
                            number: { $eq: 24 },
                        },
                    },
                    expectedVal: null,
                    error: null,
                },
            ],
        ];
        tests.forEach(([msg, testCase]) => it(msg, done => {
            const objectKey = 'testkey';
            const { initVal, conditions, expectedVal, error } = testCase;
            const params = { conditions };
            async.series([
                next => {
                    if (!initVal) {
                        return next();
                    }
                    return metadata.putObjectMD(bucketName, objectKey, initVal,
                                                {}, logger, next);
                },
                next => metadata.deleteObjectWithCond(bucketName, objectKey,
                    params, logger, err => {
                        if (error) {
                            assert.deepStrictEqual(err, error);
                            return next();
                        }
                        assert(!err);
                        return next();
                    }),
                next => metadata.getObjectMD(bucketName, objectKey, {}, logger,
                    (err, res) => {
                        if (expectedVal) {
                            assert.deepStrictEqual(res, expectedVal);
                        } else {
                            assert.deepStrictEqual(err, errors.NoSuchKey);
                        }
                        return next();
                    }),
            ], done);
        }));
    });
});

function isTransientFn(locationName, log, callback) {
    if (locationName.startsWith('transient')) {
        return callback(null, true);
    }
    return callback(null, false);
}

function createBucketMD(locationName, bucketName, isVersioned, creationDate) {
    const bucketObj = {
        '_acl': {
            'Canned': 'private',
            'FULL_CONTROL': [],
            'WRITE': [],
            'WRITE_ACP': [],
            'READ': [],
            'READ_ACP': []
        },
        '_name': bucketName,
        '_owner': 'testOwner',
        '_ownerDisplayName':'testOwnerDisplayName',
        '_creationDate': creationDate,
        '_mdBucketModelVersion': 10,
        '_transient': false,
        '_deleted': false,
        '_serverSideEncryption': null,
        '_versioningConfiguration': isVersioned === null
            ? null
            : { Status: isVersioned ? 'Enabled' : 'Suspended' },
        '_locationConstraint': locationName,
        '_readLocationConstraint': null,
        '_cors': null,
        '_replicationConfiguration': null,
        '_lifecycleConfiguration': null,
        '_uid': '',
        '_isNFS': null,
        'ingestion': null
    };
    return BucketInfo.fromObj(bucketObj);
}

function createObjectMD(params) {
    const {
        locationName,
        objectKey,
        replicationInfo,
        lastModified,
        size,
        versionId,
    } = params;
    return new ObjectMD()
        .setLastModified(lastModified)
        .setContentLength(size)
        .setDataStoreName(locationName)
        .setReplicationInfo(replicationInfo)
        .setVersionId(versionId)
        .setKey(objectKey);
}

function createReplicationInfo(backends, status) {
    return {
        status,
        backends,
        content: [],
        destination: '',
        storageClass: '',
        role: '',
        storageType: '',
        dataStoreVersionId: '',
        isNFS: null,
    };
}

describe.only('MongoClientInterface::scanItemCount', () => {
    let mongoc;
    before(done => {
        mongoserver.waitUntilRunning().then(() => {
            const opts = {
                isLocationTransient: isTransientFn,
                replicaSetHosts: 'localhost:27018',
                writeConcern: 'majority',
                replicaSet: 'rs0',
                readPreference: 'primary',
                database: dbName,
                logger
            };
            mongoc = new MongoClientInterface(opts);
            mongoc.setup(done);
        });
    });

    after(done => {
        async.series([
            next => mongoc.close(next),
            next => mongoserver.stop()
                .then(() => next())
                .catch(next),
        ], done);
    });

    it('should return correct count with transient location (COMPLETED)', done => {
        const bucketName = 'test-bucket';
        const location = 'transient-loc-1';
        const createDate = new Date().toJSON();
        const objectName = 'test-object';
        const versionId = '00001';
        const params = {
            locationName: location,
            objectKey: objectName,
            replicationInfo: createReplicationInfo([
                {site: 'loc1', status: 'COMPLETED'},
                {site: 'loc2', status: 'COMPLETED'},
            ], 'COMPLETED'),
            size: 1,
            versionId,
            lastModified: new Date().toJSON(),
        };
        const expected = {
            total: { curr: 2, prev: 0 },
            byLocation: {
                'transient-loc-1': { curr: 0, prev: 0 },
                'loc1': { curr: 1, prev: 0 },
                'loc2': { curr: 1, prev: 0 },
            },
        };
        async.series([
            next => mongoc.createBucket(
                bucketName,
                createBucketMD(location, bucketName, false, createDate),
                logger,
                next),
            next => mongoc.putObject(
                bucketName,
                objectName,
                createObjectMD(params).getValue(),
                { versioning: false },
                logger,
                next),
            next => scanAndTest(mongoc, expected, next),
        ], done);
    });

    it('should return correct count with transient location (PENDING)', done => {
        const bucketName = 'test-bucket';
        const location = 'transient-loc-1';
        const createDate = new Date().toJSON();
        const objectName = 'test-object';
        const versionId = '00001';
        const params = {
            locationName: location,
            objectKey: objectName,
            replicationInfo: createReplicationInfo([
                {site: 'loc1', status: 'COMPLETED'},
                {site: 'loc2', status: 'COMPLETED'},
            ], 'PENDING'),
            size: 1,
            versionId,
            lastModified: new Date().toJSON(),
        };
        const expected = {
            total: { curr: 3, prev: 0 },
            byLocation: {
                'transient-loc-1': { curr: 1, prev: 0 },
                'loc1': { curr: 1, prev: 0 },
                'loc2': { curr: 1, prev: 0 },
            },
        };
        async.series([
            next => mongoc.createBucket(
                bucketName,
                createBucketMD(location, bucketName, false, createDate),
                logger,
                next),
            next => mongoc.putObject(
                bucketName,
                objectName,
                createObjectMD(params).getValue(),
                { versioning: false },
                logger,
                next),
            next => scanAndTest(mongoc, expected, next),
        ], done);
    });

    it('should correctly count null objects', done => {
        const bucketName = 'test-bucket';
        const location = 'test-loc-1';
        const createDate = new Date().toJSON();
        const objectName = 'test-object';
        const versionId = '00001';
        const params = {
            locationName: location,
            objectKey: objectName,
            replicationInfo: createReplicationInfo([], ''),
            size: 1,
            versionId,
            lastModified: new Date().toJSON(),
        };
        const expected = {
            total: { curr: 1, prev: 0 },
            byLocation: {
                'test-loc-1': { curr: 1, prev: 0 },
            },
        };
        async.series([
            next => mongoc.createBucket(
                bucketName,
                createBucketMD(location, bucketName, false, createDate),
                logger,
                next),
            next => mongoc.putObject(
                bucketName,
                objectName,
                createObjectMD(params).getValue(),
                { versioning: false },
                logger,
                next),
            next => mongoc.createBucket(
                bucketName,
                createBucketMD(location, bucketName, true, createDate),
                logger,
                next),
            next => scanAndTest(mongoc, expected, next),
        ], done);
    });

    it('should correctly count versioned objects', done => {
        const bucketName = 'test-bucket';
        const location = 'test-loc-1';
        const createDate = new Date().toJSON();
        const objectName = 'test-object';
        const versionId = '00001';
        const params = {
            locationName: location,
            objectKey: objectName,
            replicationInfo: createReplicationInfo([], ''),
            size: 1,
            versionId,
            lastModified: new Date().toJSON(),
        };
        const expected = {
            total: { curr: 1, prev: 1 },
            byLocation: {
                'test-loc-1': { curr: 1, prev: 1 },
            },
        };
        async.series([
            next => mongoc.createBucket(
                bucketName,
                createBucketMD(location, bucketName, true, createDate),
                logger,
                next),
            next => mongoc.putObject(
                bucketName,
                objectName,
                createObjectMD(params).getValue(),
                { versioning: true, versionId: '00001'},
                logger,
                next),
            next => mongoc.putObject(
                bucketName,
                objectName,
                createObjectMD(params).getValue(),
                { versioning: true, versionId: '00002' },
                logger,
                next),
            next => scanAndTest(mongoc, expected, next),
        ], done);
    });

    it('should correctly count stalled objects', done => {
        const bucketName = 'test-bucket';
        const location = 'test-loc-1';
        const createDate = new Date().toJSON();
        const objectName = 'test-object';
        const versionId = '00001';
        const params = {
            locationName: location,
            objectKey: objectName,
            replicationInfo: createReplicationInfo([], ''),
            size: 1,
            versionId,
            lastModified: new Date().toJSON(),
        };
        const expected = {
            total: { curr: 1, prev: 1 },
            byLocation: {
                'test-loc-1': { curr: 1, prev: 1 },
            },
        };
        async.series([
            next => mongoc.createBucket(
                bucketName,
                createBucketMD(location, bucketName, true, createDate),
                logger,
                next),
            next => mongoc.putObject(
                bucketName,
                objectName,
                createObjectMD(params).getValue(),
                { versioning: true, versionId: '00001'},
                logger,
                next),
            next => mongoc.putObject(
                bucketName,
                objectName,
                createObjectMD(params).getValue(),
                { versioning: true, versionId: '00002' },
                logger,
                next),
            next => scanAndTest(mongoc, expected, next),
        ], done);
    });
});

function scanAndTest(mongoc, expected, callback) {
    async.series([
        next => mongoc.scanItemCount(logger, next),
        next => mongoc.countItems(logger, (err, res) => {
            if (err) {
                return next(err);
            }
            console.log(res)
            assert.deepStrictEqual(res.dataManaged, expected);
            return next();
        }),
    ], callback);
}
