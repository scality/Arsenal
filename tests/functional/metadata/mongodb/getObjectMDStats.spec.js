const async = require('async');
const assert = require('assert');
const werelogs = require('werelogs');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const logger = new werelogs.Logger('MongoClientInterface', 'debug', 'debug');
const BucketInfo = require('../../../../lib/models/BucketInfo').default;
const MetadataWrapper =
    require('../../../../lib/storage/metadata/MetadataWrapper');
const { versioning } = require('../../../../index');
const { BucketVersioningKeyFormat } = versioning.VersioningConstants;

const IMPL_NAME = 'mongodb';
const DB_NAME = 'metadata';
const BUCKET_NAME = 'test-bucket';
const ACCOUNT_NAME = 'test-account';

const mongoserver = new MongoMemoryReplSet({
    debug: false,
    instanceOpts: [
        { port: 27018 },
    ],
    replSet: {
        name: 'rs0',
        count: 1,
        DB_NAME,
        storageEngine: 'ephemeralForTest',
    },
});

const variations = [
    { it: '(v0)', vFormat: BucketVersioningKeyFormat.v0 },
    { it: '(v1)', vFormat: BucketVersioningKeyFormat.v1 },
];

describe('MongoClientInterface::metadata.getObjectMDStats', () => {
    let metadata;

    beforeAll(done => {
        mongoserver.waitUntilRunning().then(() => {
            const opts = {
                mongodb: {
                    replicaSetHosts: 'localhost:27018',
                    writeConcern: 'majority',
                    replicaSet: 'rs0',
                    readPreference: 'primary',
                    database: DB_NAME,
                },
            };
            metadata = new MetadataWrapper(IMPL_NAME, opts, null, logger);
            metadata.setup(done);
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

    const bucketMD = BucketInfo.fromObj({
        _name: BUCKET_NAME,
        _owner: 'testowner',
        _ownerDisplayName: ACCOUNT_NAME,
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
    const versionedBucketMD = {
        ...bucketMD,
        _versioningConfiguration: {
            Status: 'Enabled',
        },
    };
    const suspendedBucketMD = {
        ...bucketMD,
        _versioningConfiguration: {
            Status: 'Suspended',
        },
    };

    describe('Should get correct results for versioning disabled bucket', () => {
        const versionParams = {
            versioning: false,
            versionId: null,
        };
        const object1Params = {
            'key': 'non-versioned-test-object1',
            'content-length': 10,
            'dataStoreName': 'us-east-1',
            'owner-display-name': ACCOUNT_NAME,
            'replicationInfo': {
                backends: [],
            },
        };
        const object2Params = {
            ...object1Params,
            key: 'non-versioned-test-object2',
        };
        variations.forEach(variation => {
            describe(variation.it, () => {
                beforeEach(done => {
                    async.series([
                        next => {
                            metadata.client.defaultBucketKeyFormat = variation.vFormat;
                            return next();
                        },
                        next => metadata.createBucket(BUCKET_NAME, bucketMD, logger, next),
                        next => metadata.putObjectMD(BUCKET_NAME, object1Params.key,
                            object1Params, versionParams, logger, next), // put object1
                        next => metadata.putObjectMD(BUCKET_NAME, object1Params.key,
                            object1Params, versionParams, logger, next), // put object1 again
                        next => metadata.putObjectMD(BUCKET_NAME, object2Params.key,
                            object2Params, versionParams, logger, next), // put object2
                    ], done);
                });

                afterEach(done => metadata.deleteBucket(BUCKET_NAME, logger, done));

                it(`Should get correct results ${variation.it}`, done => {
                    const expected = {
                        dataManaged: {
                            locations: { 'us-east-1': { curr: 20, prev: 0 } },
                            total: { curr: 20, prev: 0 },
                        },
                        objects: 2, stalled: 0, versions: 0,
                        dataMetrics: {
                            account: {
                                [ACCOUNT_NAME]: {
                                    objectCount: { current: 2, deleteMarker: 0, nonCurrent: 0 },
                                    usedCapacity: { current: 20, nonCurrent: 0 },
                                },
                            },
                            bucket: {
                                [BUCKET_NAME]: {
                                    objectCount: { current: 2, deleteMarker: 0, nonCurrent: 0 },
                                    usedCapacity: { current: 20, nonCurrent: 0 },
                                },
                            },
                            location: {
                                'us-east-1': {
                                    objectCount: { current: 2, deleteMarker: 0, nonCurrent: 0 },
                                    usedCapacity: { current: 20, nonCurrent: 0 },
                                },
                            },
                        },
                    };
                    return metadata.client.getBucketAttributes(BUCKET_NAME, logger, (err, bucketInfo) => {
                        assert.deepStrictEqual(err, null);
                        return metadata.client.getObjectMDStats(BUCKET_NAME, bucketInfo, false, logger, (err, data) => {
                            assert.deepStrictEqual(err, null);
                            assert.deepStrictEqual(data, expected);
                            return done();
                        });
                    });
                });
            });
        });
    });

    describe('Should get correct results for versioning enabled bucket', () => {
        const versionParams = {
            versioning: true,
            versionId: null,
        };
        const object1Params = {
            'key': 'versioned-test-object1',
            'content-length': 10,
            'dataStoreName': 'us-east-1',
            'owner-display-name': ACCOUNT_NAME,
            'replicationInfo': {
                backends: [],
            },
        };
        const object2Params = {
            ...object1Params,
            key: 'versioned-test-object2',
        };
        variations.forEach(variation => {
            const itOnlyInV1 = variation.vFormat === 'v1' ? it : it.skip;
            describe(variation.it, () => {
                beforeEach(done => {
                    async.series([
                        next => {
                            metadata.client.defaultBucketKeyFormat = variation.vFormat;
                            return next();
                        },
                        next => metadata.createBucket(BUCKET_NAME, versionedBucketMD, logger, next),
                    ], done);
                });

                afterEach(done => metadata.deleteBucket(BUCKET_NAME, logger, done));

                it(`Should get correct results ${variation.it}`, done => {
                    const expected = {
                        dataManaged: {
                            locations: { 'us-east-1': { curr: 20, prev: 10 } },
                            total: { curr: 20, prev: 10 },
                        },
                        objects: 2, stalled: 0, versions: 1,
                        dataMetrics: {
                            account: {
                                [ACCOUNT_NAME]: {
                                    objectCount: { current: 2, deleteMarker: 0, nonCurrent: 1 },
                                    usedCapacity: { current: 20, nonCurrent: 10 },
                                },
                            },
                            bucket: {
                                [BUCKET_NAME]: {
                                    objectCount: { current: 2, deleteMarker: 0, nonCurrent: 1 },
                                    usedCapacity: { current: 20, nonCurrent: 10 },
                                },
                            },
                            location: {
                                'us-east-1': {
                                    objectCount: { current: 2, deleteMarker: 0, nonCurrent: 1 },
                                    usedCapacity: { current: 20, nonCurrent: 10 },
                                },
                            },
                        },
                    };
                    return async.series([
                        next => metadata.putObjectMD(BUCKET_NAME, object1Params.key,
                            object1Params, versionParams, logger, next), // put object1
                        next => metadata.putObjectMD(BUCKET_NAME, object1Params.key,
                            object1Params, versionParams, logger, next), // put object1 again
                        next => metadata.putObjectMD(BUCKET_NAME, object2Params.key,
                            object2Params, versionParams, logger, next), // put object2
                    ], () =>
                        metadata.client.getBucketAttributes(BUCKET_NAME, logger, (err, bucketInfo) => {
                            assert.deepStrictEqual(err, null);
                            return metadata.client.getObjectMDStats(BUCKET_NAME, bucketInfo, false, logger,
                                (err, data) => {
                                    assert.deepStrictEqual(err, null);
                                    assert.deepStrictEqual(data, expected);
                                    return done();
                                });
                        }),
                    );
                });

                itOnlyInV1(`Should get correct results with deleteMarker ${variation.it}`, done => {
                    const expected = {
                        dataManaged: {
                            locations: { 'us-east-1': { curr: 0, prev: 20 } },
                            total: { curr: 0, prev: 20 },
                        },
                        objects: 0, stalled: 0, versions: 2,
                        dataMetrics: {
                            account: {
                                [ACCOUNT_NAME]: {
                                    objectCount: { current: 0, deleteMarker: 1, nonCurrent: 2 },
                                    usedCapacity: { current: 0, nonCurrent: 20 },
                                },
                            },
                            bucket: {
                                [BUCKET_NAME]: {
                                    objectCount: { current: 0, deleteMarker: 1, nonCurrent: 2 },
                                    usedCapacity: { current: 0, nonCurrent: 20 },
                                },
                            },
                            location: {
                                'us-east-1': {
                                    objectCount: { current: 0, deleteMarker: 1, nonCurrent: 2 },
                                    usedCapacity: { current: 0, nonCurrent: 20 },
                                },
                            },
                        },
                    };
                    return async.series([
                        next => metadata.putObjectMD(BUCKET_NAME, object1Params.key,
                            object1Params, versionParams, logger, next), // put object1
                        next => metadata.putObjectMD(BUCKET_NAME, object1Params.key,
                            object1Params, versionParams, logger, next), // put object1 again
                        next => metadata.putObjectMD(BUCKET_NAME, object1Params.key,
                            {
                                ...object1Params,
                                'isDeleteMarker': true,
                                'content-length': 0,
                            }, versionParams, logger, next), // delete object1
                    ], () =>
                        metadata.client.getBucketAttributes(BUCKET_NAME, logger, (err, bucketInfo) => {
                            assert.deepStrictEqual(err, null);
                            return metadata.client.getObjectMDStats(BUCKET_NAME, bucketInfo, false, logger,
                                (err, data) => {
                                    assert.deepStrictEqual(err, null);
                                    assert.deepStrictEqual(data, expected);
                                    return done();
                                });
                        }),
                    );
                });

                it('should get correct results with lifecycle replication enabled ' +
                `and location transient is true ${variation.it}`, done => {
                    const expected = {
                        dataManaged: {
                            locations: {
                                'us-east-1': { curr: 10, prev: 0 },
                                'completed': { curr: 10, prev: 0 },
                            },
                            total: { curr: 20, prev: 0 },
                        },
                        objects: 2, stalled: 0, versions: 0,
                        dataMetrics: {
                            account: {
                                [ACCOUNT_NAME]: {
                                    objectCount: { current: 2, deleteMarker: 0, nonCurrent: 0 },
                                    usedCapacity: { current: 20, nonCurrent: 0 },
                                },
                            },
                            bucket: {
                                [BUCKET_NAME]: {
                                    objectCount: { current: 2, deleteMarker: 0, nonCurrent: 0 },
                                    usedCapacity: { current: 20, nonCurrent: 0 },
                                },
                            },
                            location: {
                                'us-east-1': {
                                    objectCount: { current: 1, deleteMarker: 0, nonCurrent: 0 },
                                    usedCapacity: { current: 10, nonCurrent: 0 },
                                },
                                'completed': {
                                    objectCount: { current: 1, deleteMarker: 0, nonCurrent: 0 },
                                    usedCapacity: { current: 10, nonCurrent: 0 },
                                },
                            },
                        },
                    };
                    return async.series([
                        next => metadata.putObjectMD(BUCKET_NAME, object1Params.key,
                            {
                                ...object1Params,
                                replicationInfo: {
                                    status: 'PENDING',
                                    backends: [
                                        {
                                            status: 'PENDING',
                                            site: 'not-completed',
                                        },
                                        {
                                            status: 'COMPLETED',
                                            site: 'completed',
                                        },
                                    ],
                                },
                            }, versionParams, logger, next), // object1 with one site pending and one site complete
                        next => metadata.putObjectMD(BUCKET_NAME, object2Params.key,
                            {
                                ...object2Params,
                                replicationInfo: {
                                    status: 'COMPLETED',
                                    backends: [
                                        {
                                            status: 'COMPLETE',
                                            site: 'completed',
                                        },
                                    ],
                                },
                            }, versionParams, logger, next), // object2 with one site complete
                    ], () =>
                        metadata.client.getBucketAttributes(BUCKET_NAME, logger, (err, bucketInfo) => {
                            assert.deepStrictEqual(err, null);
                            return metadata.client.getObjectMDStats(BUCKET_NAME, bucketInfo, true, logger,
                                (err, data) => {
                                    assert.deepStrictEqual(err, null);
                                    assert.deepStrictEqual(data, expected);
                                    return done();
                                });
                        }),
                    );
                });

                it('should get correct results with lifecycle replication enabled' +
                `and location transient is false ${variation.it}`, done => {
                    const expected = {
                        dataManaged: {
                            locations: {
                                'us-east-1': { curr: 20, prev: 0 },
                                'completed': { curr: 10, prev: 0 },
                            },
                            total: { curr: 30, prev: 0 },
                        },
                        objects: 2, stalled: 0, versions: 0,
                        dataMetrics: {
                            account: {
                                [ACCOUNT_NAME]: {
                                    objectCount: { current: 2, deleteMarker: 0, nonCurrent: 0 },
                                    usedCapacity: { current: 20, nonCurrent: 0 },
                                },
                            },
                            bucket: {
                                [BUCKET_NAME]: {
                                    objectCount: { current: 2, deleteMarker: 0, nonCurrent: 0 },
                                    usedCapacity: { current: 20, nonCurrent: 0 },
                                },
                            },
                            location: {
                                'us-east-1': {
                                    objectCount: { current: 2, deleteMarker: 0, nonCurrent: 0 },
                                    usedCapacity: { current: 20, nonCurrent: 0 },
                                },
                                'completed': {
                                    objectCount: { current: 1, deleteMarker: 0, nonCurrent: 0 },
                                    usedCapacity: { current: 10, nonCurrent: 0 },
                                },
                            },
                        },
                    };
                    return async.series([
                        next => metadata.putObjectMD(BUCKET_NAME, object1Params.key,
                            {
                                ...object1Params,
                                replicationInfo: {
                                    status: 'PENDING',
                                    backends: [
                                        {
                                            status: 'PENDING',
                                            site: 'not-completed',
                                        },
                                        {
                                            status: 'COMPLETED',
                                            site: 'completed',
                                        },
                                    ],
                                },
                            }, versionParams, logger, next), // object1 with one site pending and one site complete
                        next => metadata.putObjectMD(BUCKET_NAME, object2Params.key,
                            {
                                ...object2Params,
                                replicationInfo: {
                                    status: 'COMPLETED',
                                    backends: [
                                        {
                                            status: 'COMPLETE',
                                            site: 'completed',
                                        },
                                    ],
                                },
                            }, versionParams, logger, next), // object2 with one site complete
                    ], () =>
                        metadata.client.getBucketAttributes(BUCKET_NAME, logger, (err, bucketInfo) => {
                            assert.deepStrictEqual(err, null);
                            return metadata.client.getObjectMDStats(BUCKET_NAME, bucketInfo, false, logger,
                                (err, data) => {
                                    assert.deepStrictEqual(err, null);
                                    assert.deepStrictEqual(data, expected);
                                    return done();
                                });
                        }),
                    );
                });
            });
        });
    });

    describe('Should get correct results for versioning suspended bucket', () => {
        const object1Params = {
            'key': 'test-object1',
            'content-length': 10,
            'dataStoreName': 'us-east-1',
            'owner-display-name': ACCOUNT_NAME,
            'replicationInfo': {
                backends: [],
            },
        };
        const object2Params = {
            ...object1Params,
            key: 'test-object2',
        };
        variations.forEach(variation => {
            describe(variation.it, () => {
                beforeEach(done => {
                    async.series([
                        next => {
                            metadata.client.defaultBucketKeyFormat = variation.vFormat;
                            return next();
                        },
                        next => metadata.createBucket(BUCKET_NAME, suspendedBucketMD, logger, next),
                    ], done);
                });

                afterEach(done => metadata.deleteBucket(BUCKET_NAME, logger, done));

                it(`Should get correct results ${variation.it}`, done => {
                    const expected = {
                        dataManaged: {
                            locations: { 'us-east-1': { curr: 20, prev: 10 } },
                            total: { curr: 20, prev: 10 },
                        },
                        objects: 2, stalled: 0, versions: 1,
                        dataMetrics: {
                            account: {
                                [ACCOUNT_NAME]: {
                                    objectCount: { current: 2, deleteMarker: 0, nonCurrent: 1 },
                                    usedCapacity: { current: 20, nonCurrent: 10 },
                                },
                            },
                            bucket: {
                                [BUCKET_NAME]: {
                                    objectCount: { current: 2, deleteMarker: 0, nonCurrent: 1 },
                                    usedCapacity: { current: 20, nonCurrent: 10 },
                                },
                            },
                            location: {
                                'us-east-1': {
                                    objectCount: { current: 2, deleteMarker: 0, nonCurrent: 1 },
                                    usedCapacity: { current: 20, nonCurrent: 10 },
                                },
                            },
                        },
                    };
                    return async.series([
                        next => metadata.putObjectMD(BUCKET_NAME, object1Params.key,
                            object1Params, {
                                versionId: null,
                                versioning: true,
                            }, logger, next), // versioned object1 put before suspend
                        next => metadata.putObjectMD(BUCKET_NAME, object1Params.key,
                            {
                                ...object1Params,
                                isNull: true,
                            },
                            {
                                versionId: null,

                            }, logger, next), // null versioned object1
                        next => metadata.putObjectMD(BUCKET_NAME, object2Params.key,
                            {
                                ...object2Params,
                                isNull: true,
                            },
                            {
                                versionId: null,
                            }, logger, next), // null versioned object2
                    ], () =>
                        metadata.client.getBucketAttributes(BUCKET_NAME, logger, (err, bucketInfo) => {
                            assert.deepStrictEqual(err, null);
                            return metadata.client.getObjectMDStats(BUCKET_NAME, bucketInfo, false, logger,
                                (err, data) => {
                                    assert.deepStrictEqual(err, null);
                                    assert.deepStrictEqual(data, expected);
                                    return done();
                                });
                        }),
                    );
                });
            });
        });
    });
});
