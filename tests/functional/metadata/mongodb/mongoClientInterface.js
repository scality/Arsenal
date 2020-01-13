const async = require('async');
const assert = require('assert');
const werelogs = require('werelogs');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const errors = require('../../../../lib/errors');
const logger = new werelogs.Logger('MongoClientInterface', 'debug', 'debug');
const BucketInfo = require('../../../../lib/models/BucketInfo');
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
