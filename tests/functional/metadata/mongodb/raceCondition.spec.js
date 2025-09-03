const async = require('async');
const assert = require('assert');
const werelogs = require('werelogs');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { errors, versioning } = require('../../../../index');
const logger = new werelogs.Logger('RaceConditionFunctional', 'debug', 'debug');
const BucketInfo = require('../../../../lib/models/BucketInfo').default;
const MetadataWrapper = require('../../../../lib/storage/metadata/MetadataWrapper');
const ObjectMD = require('../../../../lib/models/ObjectMD').default;
const constants = require('../../../../lib/constants');
const { BucketVersioningKeyFormat } = versioning.VersioningConstants;

const IMPL_NAME = 'mongodb';
const DB_NAME = 'metadata';
const replicationGroupId = 'RG001';

const mongoserver = new MongoMemoryReplSet({
    debug: false,
    instanceOpts: [
        { port: 27019 }, // Use different port from other tests
    ],
    replSet: {
        name: 'rs0',
        count: 1,
        DB_NAME,
        storageEngine: 'wiredTiger',
    },
});

const variations = [
    { it: '(v0)', vFormat: BucketVersioningKeyFormat.v0 },
    { it: '(v1)', vFormat: BucketVersioningKeyFormat.v1 },
];

describe('MongoClientInterface::Race Condition Functional Tests', () => {
    let metadata;
    let collection;
    
    const regularBucket = 'test-bucket';
    const mpuShadowBucket = `${constants.mpuBucketPrefix}test-bucket`;

    beforeAll(done => {
        mongoserver.start().then(() => {
            mongoserver.waitUntilRunning().then(() => {
                const opts = {
                    mongodb: {
                        replicaSetHosts: 'localhost:27019',
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
        describe(`vFormat : ${variation.vFormat}`, () => {
            beforeEach(done => {
                const bucketMD = BucketInfo.fromObj({
                    _name: regularBucket,
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
                    next => metadata.createBucket(regularBucket, bucketMD, logger, next),
                    next => metadata.createBucket(mpuShadowBucket, bucketMD, logger, next),
                    next => {
                        // Get collection reference for direct MongoDB operations when needed
                        collection = metadata.client.getCollection(mpuShadowBucket);
                        next();
                    },
                ], done);
            });

            afterEach(done => {
                async.series([
                    next => metadata.deleteBucket(regularBucket, logger, () => next()), // Ignore errors
                    next => metadata.deleteBucket(mpuShadowBucket, logger, () => next()), // Ignore errors
                ], done);
            });

            describe('Real MongoDB race condition scenarios', () => {
                it('should simulate concurrent MPU operations without InternalError', function(done) {
                    // Simulate the failing test scenario:
                    // 1. Multiple MPU parts being created/deleted concurrently
                    // 2. CompleteMultipartUpload trying to clean up shadow objects
                    // 3. UploadPartCopy trying to create/update shadow objects
                    
                    const mpuObjects = [
                        'uploadId123..|..00001',
                        'uploadId123..|..00002', 
                        'uploadId123..|..overview',
                    ];

                    // Step 1: Create MPU shadow objects (simulating active MPU)
                    async.waterfall([
                        next => {
                            async.eachSeries(mpuObjects, (objKey, objCb) => {
                                const objMD = new ObjectMD()
                                    .setKey(objKey)
                                    .setContentLength(5 * 1024 * 1024)
                                    .setContentMd5('test-etag-' + objKey.slice(-1))
                                    .setLastModified(new Date().toISOString());

                                const params = {
                                    vFormat: variation.vFormat,
                                    versioning: false,
                                };

                                metadata.putObjectMD(mpuShadowBucket, objKey, objMD, params, logger, objCb);
                            }, next);
                        },

                        // Step 2: Simulate concurrent operations that caused the original failure
                        next => {
                            const operations = [];
                            const results = [];

                            // Operation 1: CompleteMultipartUpload cleanup (deletes all MPU objects)
                            operations.push(callback => {
                                async.eachSeries(mpuObjects, (objKey, deleteCb) => {
                                    const params = {
                                        vFormat: variation.vFormat,
                                        versioning: false,
                                    };

                                    metadata.deleteObjectMD(mpuShadowBucket, objKey, params, logger, (err) => {
                                        if (err && !err.is.NoSuchKey) {
                                            results.push({ operation: 'delete', key: objKey, error: err });
                                        }
                                        deleteCb(); // Continue even if error
                                    });
                                }, callback);
                            });

                            // Operation 2: Concurrent UploadPartCopy (tries to overwrite parts)
                            operations.push(callback => {
                                setTimeout(() => {
                                    async.eachSeries(['uploadId123..|..00001'], (objKey, updateCb) => {
                                        const newObjMD = new ObjectMD()
                                            .setKey(objKey)
                                            .setContentLength(5 * 1024 * 1024)
                                            .setContentMd5('new-etag-' + Date.now())
                                            .setLastModified(new Date().toISOString());

                                        const params = {
                                            vFormat: variation.vFormat,
                                            versioning: false,
                                        };

                                        metadata.putObjectMD(mpuShadowBucket, objKey, newObjMD, params, logger, (err) => {
                                            if (err) {
                                                results.push({ operation: 'update', key: objKey, error: err });
                                            }
                                            updateCb();
                                        });
                                    }, callback);
                                }, 10); // Small delay to create race condition
                            });

                            // Operation 3: Another concurrent delete (simulating multiple cleanup attempts)
                            operations.push(callback => {
                                setTimeout(() => {
                                    const objKey = 'uploadId123..|..00001';
                                    const params = {
                                        vFormat: variation.vFormat,
                                        versioning: false,
                                    };

                                    metadata.deleteObjectMD(mpuShadowBucket, objKey, params, logger, (err) => {
                                        if (err && !err.is.NoSuchKey && !err.is.DeleteConflict) {
                                            results.push({ operation: 'concurrent-delete', key: objKey, error: err });
                                        }
                                        callback();
                                    });
                                }, 15); // Slightly different timing
                            });

                            // Execute all operations concurrently
                            async.parallel(operations, () => {
                                // Check results - should not have any InternalError
                                const hasInternalError = results.some(r => 
                                    r.error && (r.error.is.InternalError || r.error.code === 'InternalError')
                                );

                                assert.strictEqual(hasInternalError, false, 
                                    `Should not have InternalError: ${JSON.stringify(results.filter(r => 
                                        r.error && (r.error.is.InternalError || r.error.code === 'InternalError')
                                    ))}`);

                                console.log('Concurrent operations completed without InternalError');
                                console.log('Results summary:', results.map(r => 
                                    `${r.operation}(${r.key}): ${r.error ? r.error.code || 'UnknownError' : 'OK'}`
                                ).join(', '));

                                next(null, results);
                            });
                        },

                    ], (err, operationResults) => {
                        if (err) return done(err);

                        // Verify final state - check what objects remain
                        collection.find({}).toArray()
                            .then(docs => {
                                console.log(`Final state: ${docs.length} objects remaining in shadow bucket`);
                                
                                // The test passes if we completed without InternalError
                                // The exact final state may vary due to race conditions, but that's acceptable
                                // as long as no 500 errors occurred
                                done();
                            })
                            .catch(done);
                    });
                });

                it('should handle high-concurrency MPU shadow bucket operations', function(done) {
                    const concurrentOperations = 20;
                    const objectKeys = Array.from({length: 10}, (_, i) => `upload${i}..|..${String(i+1).padStart(5, '0')}`);
                    
                    // Create initial objects
                    async.waterfall([
                        next => {
                            async.eachLimit(objectKeys, 5, (objKey, objCb) => {
                                const objMD = new ObjectMD()
                                    .setKey(objKey)
                                    .setContentLength(1024)
                                    .setContentMd5(`etag-${objKey}`)
                                    .setLastModified(new Date().toISOString());

                                const params = {
                                    vFormat: variation.vFormat,
                                    versioning: false,
                                };

                                metadata.putObjectMD(mpuShadowBucket, objKey, objMD, params, logger, objCb);
                            }, next);
                        },

                        // Launch concurrent operations
                        next => {
                            const allOperations = [];
                            const errors = [];

                            // Create mixed operations: puts, deletes, updates
                            for (let i = 0; i < concurrentOperations; i++) {
                                const objKey = objectKeys[Math.floor(Math.random() * objectKeys.length)];
                                const operationType = ['put', 'delete', 'update'][Math.floor(Math.random() * 3)];

                                allOperations.push((callback) => {
                                    setTimeout(() => {
                                        const params = {
                                            vFormat: variation.vFormat,
                                            versioning: false,
                                        };

                                        if (operationType === 'delete') {
                                            metadata.deleteObjectMD(mpuShadowBucket, objKey, params, logger, (err) => {
                                                if (err && err.is.InternalError) {
                                                    errors.push({ operation: operationType, key: objKey, error: err });
                                                }
                                                callback();
                                            });
                                        } else {
                                            const objMD = new ObjectMD()
                                                .setKey(objKey)
                                                .setContentLength(2048)
                                                .setContentMd5(`${operationType}-${Date.now()}`)
                                                .setLastModified(new Date().toISOString());

                                            metadata.putObjectMD(mpuShadowBucket, objKey, objMD, params, logger, (err) => {
                                                if (err && err.is.InternalError) {
                                                    errors.push({ operation: operationType, key: objKey, error: err });
                                                }
                                                callback();
                                            });
                                        }
                                    }, Math.random() * 50); // Random timing
                                });
                            }

                            async.parallelLimit(allOperations, 10, () => {
                                // Check for any InternalErrors
                                assert.strictEqual(errors.length, 0, 
                                    `Found InternalErrors in concurrent operations: ${JSON.stringify(errors)}`);
                                
                                console.log(`✓ ${concurrentOperations} concurrent operations completed without InternalError`);
                                next();
                            });
                        },

                    ], done);
                });
            });

            describe('Validate race condition fix behavior', () => {
                it('should only apply fix to buckets starting with mpuBucketPrefix', function(done) {
                    const testCases = [
                        { bucket: `${constants.mpuBucketPrefix}Test`, shouldApplyFix: true },
                        { bucket: `${constants.mpuBucketPrefix}123`, shouldApplyFix: true },
                        { bucket: `prefix-${constants.mpuBucketPrefix}`, shouldApplyFix: false },
                        { bucket: 'normalBucket', shouldApplyFix: false },
                        { bucket: `bucket${constants.mpuBucketPrefix}`, shouldApplyFix: false },
                    ];

                    async.eachSeries(testCases, (testCase, testCb) => {
                        const { bucket, shouldApplyFix } = testCase;
                        console.log(`Testing bucket: ${bucket}, should apply fix: ${shouldApplyFix}`);

                        async.waterfall([
                            // Create bucket
                            next => {
                                const bucketMD = BucketInfo.fromObj({
                                    _name: bucket,
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
                                metadata.createBucket(bucket, bucketMD, logger, next);
                            },

                            // Test race condition behavior by creating an object first, then testing deletion
                            next => {
                                const testCollection = metadata.client.getCollection(bucket);
                                const key = 'testkey';

                                // First create an object to test deletion
                                const objMD = new ObjectMD()
                                    .setKey(key)
                                    .setContentLength(1024)
                                    .setContentMd5('test-etag')
                                    .setLastModified(new Date().toISOString());

                                const params = {
                                    vFormat: variation.vFormat,
                                    versioning: false,
                                };

                                metadata.putObjectMD(bucket, key, objMD, params, logger, (putErr) => {
                                    if (putErr) return next(putErr);

                                    // Now mock deleteOne to simulate race condition (deletedCount: 0)
                                    const originalDeleteOne = testCollection.deleteOne.bind(testCollection);
                                    testCollection.deleteOne = function(filter) {
                                        return Promise.resolve({
                                            acknowledged: true,
                                            deletedCount: 0, // Simulate object already deleted by concurrent operation
                                        });
                                    };

                                    // Use direct internalDeleteObject with doesNotNeedOpogUpdate to test the direct path
                                    const deleteParams = { doesNotNeedOpogUpdate: true };
                                    metadata.client.internalDeleteObject(testCollection, bucket, key, {}, deleteParams, logger, (err) => {
                                        testCollection.deleteOne = originalDeleteOne;

                                        try {
                                            if (shouldApplyFix) {
                                                // Should succeed for MPU shadow buckets (race condition fix applies)
                                                assert.ifError(err);
                                            } else {
                                                // Should fail with NoSuchKey for regular buckets  
                                                assert(err, 'Should have error for non-MPU buckets');
                                                assert(err.is.NoSuchKey, 'Should be NoSuchKey for non-MPU buckets');
                                            }

                                            // Clean up test bucket
                                            metadata.deleteBucket(bucket, logger, () => next());
                                        } catch (assertionError) {
                                            // Clean up test bucket even on assertion failure
                                            metadata.deleteBucket(bucket, logger, () => next(assertionError));
                                        }
                                    });
                                });
                            },

                        ], testCb);
                    }, done);
                });
            });
        });
    });
});
