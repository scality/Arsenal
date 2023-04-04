const async = require('async');
const assert = require('assert');
const werelogs = require('werelogs');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { errors, versioning } = require('../../../../index');
const logger = new werelogs.Logger('MongoClientInterface', 'debug', 'debug');
const BucketInfo = require('../../../../lib/models/BucketInfo').default;
const MetadataWrapper =
    require('../../../../lib/storage/metadata/MetadataWrapper');
const { BucketVersioningKeyFormat } = versioning.VersioningConstants;

const IMP_NAME = 'mongodb';
const DB_NAME = 'metadata';
const BUCKET_NAME = 'testbucket';

const mongoserver = new MongoMemoryReplSet({
    debug: false,
    instanceOpts: [
        { port: 27022 },
    ],
    replSet: {
        name: 'rs0',
        count: 1,
        DB_NAME,
        storageEngine: 'ephemeralForTest',
    },
});

describe('MongoClientInterface:withCond', () => {
    let metadata;

    const variations = [
        { it: '(v0)', vFormat: BucketVersioningKeyFormat.v0 },
        { it: '(v1)', vFormat: BucketVersioningKeyFormat.v1 },
    ];

    beforeAll(done => {
        mongoserver.start().then(() => {
            mongoserver.waitUntilRunning().then(() => {
                const opts = {
                    mongodb: {
                        replicaSetHosts: 'localhost:27022',
                        writeConcern: 'majority',
                        replicaSet: 'rs0',
                        readPreference: 'primary',
                        database: DB_NAME,
                    },
                };
                metadata = new MetadataWrapper(IMP_NAME, opts, null, logger);
                metadata.setup(done);
            });
        });
    });

    afterAll(done => {
        async.series([
            next => metadata.close(next),
            next => mongoserver.stop()
                .then(() => next())
                .catch(next),
        ], done);
    });

    variations.forEach(variation => {
        describe('::putObjectWithCond', () => {
            beforeEach(done => {
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
                    _locationConstraint: 'us-east-1',
                    _readLocationConstraint: null,
                    _cors: null,
                    _replicationConfiguration: null,
                    _lifecycleConfiguration: null,
                    _uid: '',
                    _isNFS: null,
                    ingestion: null,
                });
                async.series([
                    next => {
                        metadata.client.defaultBucketKeyFormat = variation.vFormat;
                        return next();
                    },
                    next => metadata.createBucket(BUCKET_NAME, bucketMD, logger, next),
                ], done);
            });

            afterEach(done => {
                metadata.deleteBucket(BUCKET_NAME, logger, done);
            });

            const tests = [
                [
                    `should upsert object if an existing object does not exist ${variation.it}`,
                    {
                        initVal: null,
                        upsertVal: { value: { number: 42, string: 'forty-two' } },
                        conditions: { value: { number: 24 } },
                        expectedVal: { value: { number: 42, string: 'forty-two' } },
                        error: null,
                    },
                ],
                [
                    `should not update an existing object if the conditions fails ${variation.it}`,
                    {
                        initVal: { value: { number: 0, string: 'zero' } },
                        upsertVal: { value: { number: 42, string: 'forty-two' } },
                        conditions: { value: { number: 24 } },
                        expectedVal: { value: { number: 0, string: 'zero' } },
                        error: errors.InternalError,
                    },
                ],
                [
                    `should not update an existing object if the conditions fails ${variation.it}`,
                    {
                        initVal: { value: { number: 0, string: 'zero' } },
                        upsertVal: { value: { number: 42, string: 'forty-two' } },
                        conditions: { value: { string: { $eq: 'twenty-four' } } },
                        expectedVal: { value: { number: 0, string: 'zero' } },
                        error: errors.InternalError,
                    },
                ],
                [
                    `should not update an existing object if the conditions fails ${variation.it}`,
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
                    `should update an existing object if the conditions passes ${variation.it}`,
                    {
                        initVal: { value: { number: 24, string: 'twenty-four' } },
                        upsertVal: { value: { number: 42, string: 'forty-two' } },
                        conditions: { value: { number: 24 } },
                        expectedVal: { value: { number: 42, string: 'forty-two' } },
                        error: null,
                    },
                ],
                [
                    `should update an existing object if the conditions passes ${variation.it}`,
                    {
                        initVal: { value: { number: 24, string: 'twenty-four' } },
                        upsertVal: { value: { number: 42, string: 'forty-two' } },
                        conditions: { value: { string: { $eq: 'twenty-four' } } },
                        expectedVal: { value: { number: 42, string: 'forty-two' } },
                        error: null,
                    },
                ],
                [
                    `should update an existing object if the conditions passes ${variation.it}`,
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
                        return metadata.putObjectMD(BUCKET_NAME, objectKey, initVal,
                            {}, logger, next);
                    },
                    next => metadata.putObjectWithCond(BUCKET_NAME, objectKey,
                        upsertVal, params, logger, err => {
                            if (error) {
                                assert.deepStrictEqual(err, error);
                                return next();
                            }
                            assert(!err);
                            return next();
                        }),
                    next => metadata.getObjectMD(BUCKET_NAME, objectKey, {}, logger,
                        (err, res) => {
                            assert(!err);
                            assert.deepStrictEqual(res, expectedVal);
                            next();
                        }),
                ], done);
            }));
        });

        describe('::deleteObjectWithCond', () => {
            afterEach(done => {
                metadata.deleteBucket(BUCKET_NAME, logger, done);
            });

            const tests = [
                [
                    `should return no such key if the object does not exist ${variation.it}`,
                    {
                        initVal: null,
                        conditions: { value: { number: 24 } },
                        expectedVal: null,
                        error: errors.NoSuchKey,
                    },
                ],
                [
                    `should return no such key if the conditions fails ${variation.it}`,
                    {
                        initVal: { value: { number: 0, string: 'zero' } },
                        conditions: { value: { number: { $eq: 24 } } },
                        expectedVal: { value: { number: 0, string: 'zero' } },
                        error: errors.NoSuchKey,
                    },
                ],
                [
                    `should return no such key if the conditions fails ${variation.it}`,
                    {
                        initVal: { value: { number: 0, string: 'zero' } },
                        conditions: { value: { string: 'twenty-four' } },
                        expectedVal: { value: { number: 0, string: 'zero' } },
                        error: errors.NoSuchKey,
                    },
                ],
                [
                    `should return no such key if the conditions fails ${variation.it}`,
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
                    `should successfully delete matched object ${variation.it}`,
                    {
                        initVal: { value: { number: 24, string: 'twenty-four' } },
                        conditions: { value: { number: 24 } },
                        expectedVal: null,
                        error: null,
                    },
                ],
                [
                    `should successfully delete matched object ${variation.it}`,
                    {
                        initVal: { value: { number: 24, string: 'twenty-four' } },
                        conditions: { value: { string: { $eq: 'twenty-four' } } },
                        expectedVal: null,
                        error: null,
                    },
                ],
                [
                    `should successfully delete matched object ${variation.it}`,
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
                        return metadata.putObjectMD(BUCKET_NAME, objectKey, initVal,
                            {}, logger, next);
                    },
                    next => metadata.deleteObjectWithCond(BUCKET_NAME, objectKey,
                        params, logger, err => {
                            if (error) {
                                assert.deepStrictEqual(err, error);
                                return next();
                            }
                            assert(!err);
                            return next();
                        }),
                    next => metadata.getObjectMD(BUCKET_NAME, objectKey, {}, logger,
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
});
