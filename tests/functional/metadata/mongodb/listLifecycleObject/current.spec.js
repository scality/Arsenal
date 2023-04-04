const async = require('async');
const assert = require('assert');
const werelogs = require('werelogs');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const logger = new werelogs.Logger('MongoClientInterface', 'debug', 'debug');
const MetadataWrapper =
    require('../../../../../lib/storage/metadata/MetadataWrapper');
const { versioning } = require('../../../../../index');
const { BucketVersioningKeyFormat } = versioning.VersioningConstants;
const { flagObjectForDeletion, makeBucketMD, putBulkObjectVersions } = require('./utils');

const IMPL_NAME = 'mongodb';
const DB_NAME = 'metadata';
const BUCKET_NAME = 'test-lifecycle-list-current-bucket';

const mongoserver = new MongoMemoryReplSet({
    debug: false,
    instanceOpts: [
        { port: 27020 },
    ],
    replSet: {
        name: 'rs0',
        count: 1,
        DB_NAME,
        storageEngine: 'ephemeralForTest',
    },
});

describe('MongoClientInterface::metadata.listLifecycleObject::current', () => {
    let metadata;
    let collection;

    beforeAll(done => {
        mongoserver.start().then(() => {
            mongoserver.waitUntilRunning().then(() => {
                const opts = {
                    mongodb: {
                        replicaSetHosts: 'localhost:27020',
                        writeConcern: 'majority',
                        replicaSet: 'rs0',
                        readPreference: 'primary',
                        database: DB_NAME,
                    },
                };
                metadata = new MetadataWrapper(IMPL_NAME, opts, null, logger);
                metadata.client.defaultBucketKeyFormat = BucketVersioningKeyFormat.v1;
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

    beforeEach(done => {
        const bucketMD = makeBucketMD(BUCKET_NAME);
        const versionParams = {
            versioning: true,
            versionId: null,
            repairMaster: null,
        };
        async.series([
            next => metadata.createBucket(BUCKET_NAME, bucketMD, logger, err => {
                if (err) {
                    return next(err);
                }

                collection = metadata.client.getCollection(BUCKET_NAME);
                return next();
            }),
            next => {
                const params = {
                    objName: 'pfx1-test-object',
                    objVal: {
                        key: 'pfx1-test-object',
                        versionId: 'null',
                    },
                    nbVersions: 5,
                };
                const timestamp = 0;
                putBulkObjectVersions(metadata, BUCKET_NAME, params.objName, params.objVal, versionParams,
                    params.nbVersions, timestamp, logger, next);
                /* eslint-disable max-len */
                // The following versions are created:
                // { "_id" : "Mpfx1-test-object", "value" : { "key" : "pfx1-test-object", "versionId" : "vid4", "last-modified" : "1970-01-01T00:00:00.005Z" } }
                // { "_id" : "Vpfx1-test-object{sep}id4", "value" : { "key" : "pfx1-test-object", "versionId" : "vid4", "last-modified" : "1970-01-01T00:00:00.005Z" } }
                // { "_id" : "Vpfx1-test-object{sep}id3", "value" : { "key" : "pfx1-test-object", "versionId" : "vid3", "last-modified" : "1970-01-01T00:00:00.004Z" } }
                // { "_id" : "Vpfx1-test-object{sep}id2", "value" : { "key" : "pfx1-test-object", "versionId" : "vid2", "last-modified" : "1970-01-01T00:00:00.003Z" } }
                // { "_id" : "Vpfx1-test-object{sep}id1", "value" : { "key" : "pfx1-test-object", "versionId" : "vid1", "last-modified" : "1970-01-01T00:00:00.002Z" } }
                // { "_id" : "Vpfx1-test-object{sep}id0", "value" : { "key" : "pfx1-test-object", "versionId" : "vid0", "last-modified" : "1970-01-01T00:00:00.001Z" } }
                /* eslint-enable max-len */
            },
            next => {
                const params = {
                    objName: 'pfx2-test-object',
                    objVal: {
                        key: 'pfx2-test-object',
                        versionId: 'null',
                    },
                    nbVersions: 5,
                };
                const timestamp = 2000;
                putBulkObjectVersions(metadata, BUCKET_NAME, params.objName, params.objVal, versionParams,
                    params.nbVersions, timestamp, logger, next);
                /* eslint-disable max-len */
                // The following versions are created:
                // { "_id" : "Mpfx2-test-object", "value" : { "key" : "pfx2-test-object", "versionId" : "vid4", "last-modified" : "1970-01-01T00:00:02.005Z" } }
                // { "_id" : "Vpfx2-test-object{sep}id4", "value" : { "key" : "pfx2-test-object", "versionId" : "vid4", "last-modified" : "1970-01-01T00:00:02.005Z" } }
                // { "_id" : "Vpfx2-test-object{sep}id3", "value" : { "key" : "pfx2-test-object", "versionId" : "vid3", "last-modified" : "1970-01-01T00:00:02.004Z" } }
                // { "_id" : "Vpfx2-test-object{sep}id2", "value" : { "key" : "pfx2-test-object", "versionId" : "vid2", "last-modified" : "1970-01-01T00:00:02.003Z" } }
                // { "_id" : "Vpfx2-test-object{sep}id1", "value" : { "key" : "pfx2-test-object", "versionId" : "vid1", "last-modified" : "1970-01-01T00:00:02.002Z" } }
                // { "_id" : "Vpfx1-test-object{sep}id0", "value" : { "key" : "pfx2-test-object", "versionId" : "vid0", "last-modified" : "1970-01-01T00:00:02.001Z" } }
                /* eslint-enable max-len */
            },
            next => {
                const params = {
                    objName: 'pfx3-test-object',
                    objVal: {
                        key: 'pfx3-test-object',
                        versionId: 'null',
                    },
                    nbVersions: 5,
                };
                const timestamp = 1000;
                putBulkObjectVersions(metadata, BUCKET_NAME, params.objName, params.objVal, versionParams,
                    params.nbVersions, timestamp, logger, next);
                /* eslint-disable max-len */
                // The following versions are created:
                // { "_id" : "Mpfx3-test-object", "value" : { "key" : "pfx3-test-object", "versionId" : "vid4", "last-modified" : "1970-01-01T00:00:01.005Z" } }
                // { "_id" : "Vpfx3-test-object{sep}id4", "value" : { "key" : "pfx3-test-object", "versionId" : "vid4", "last-modified" : "1970-01-01T00:00:01.005Z" } }
                // { "_id" : "Vpfx3-test-object{sep}id3", "value" : { "key" : "pfx3-test-object", "versionId" : "vid3", "last-modified" : "1970-01-01T00:00:01.004Z" } }
                // { "_id" : "Vpfx3-test-object{sep}id2", "value" : { "key" : "pfx3-test-object", "versionId" : "vid2", "last-modified" : "1970-01-01T00:00:01.003Z" } }
                // { "_id" : "Vpfx3-test-object{sep}id1", "value" : { "key" : "pfx3-test-object", "versionId" : "vid1", "last-modified" : "1970-01-01T00:00:01.002Z" } }
                // { "_id" : "Vpfx3-test-object{sep}id0", "value" : { "key" : "pfx3-test-object", "versionId" : "vid0", "last-modified" : "1970-01-01T00:00:01.001Z" } }
                /* eslint-enable max-len */
            },
        ], done);
    });

    afterEach(done => {
        metadata.deleteBucket(BUCKET_NAME, logger, done);
    });

    it('Should list current versions of objects', done => {
        const params = {
            listingType: 'DelimiterCurrent',
        };
        return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
            assert.ifError(err);
            assert.strictEqual(data.IsTruncated, false);
            assert.strictEqual(data.Contents.length, 3);
            assert.strictEqual(data.Contents[0].key, 'pfx1-test-object');
            assert.strictEqual(data.Contents[1].key, 'pfx2-test-object');
            assert.strictEqual(data.Contents[2].key, 'pfx3-test-object');

            return done();
        });
    });

    it('Should return empty list when beforeDate is before the objects creation date', done => {
        const params = {
            listingType: 'DelimiterCurrent',
            beforeDate: '1970-01-01T00:00:00.000Z',
        };
        return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
            assert.ifError(err);
            assert.strictEqual(data.IsTruncated, false);
            assert.strictEqual(data.Contents.length, 0);

            return done();
        });
    });

    it('Should return the current version modified before 1970-01-01T00:00:00.010Z', done => {
        const params = {
            listingType: 'DelimiterCurrent',
            beforeDate: '1970-01-01T00:00:00.10Z',
        };
        return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
            assert.ifError(err);
            assert.strictEqual(data.IsTruncated, false);
            assert.strictEqual(data.Contents.length, 1);
            assert.strictEqual(data.Contents[0].key, 'pfx1-test-object');

            return done();
        });
    });

    it('Should return the current versions modified before 1970-01-01T00:00:01.010Z', done => {
        const params = {
            listingType: 'DelimiterCurrent',
            beforeDate: '1970-01-01T00:00:01.010Z',
        };
        return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
            assert.ifError(err);
            assert.strictEqual(data.IsTruncated, false);
            assert.strictEqual(data.Contents.length, 2);
            assert.strictEqual(data.Contents[0].key, 'pfx1-test-object');
            assert.strictEqual(data.Contents[1].key, 'pfx3-test-object');

            return done();
        });
    });

    it('Should return the current versions modified before 1970-01-01T00:00:02.010Z', done => {
        const params = {
            listingType: 'DelimiterCurrent',
            beforeDate: '1970-01-01T00:00:02.010Z',
        };
        return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
            assert.ifError(err);
            assert.strictEqual(data.IsTruncated, false);
            assert.strictEqual(data.Contents.length, 3);
            assert.strictEqual(data.Contents[0].key, 'pfx1-test-object');
            assert.strictEqual(data.Contents[1].key, 'pfx2-test-object');
            assert.strictEqual(data.Contents[2].key, 'pfx3-test-object');

            return done();
        });
    });

    it('Should truncate the list of current versions modified before 1970-01-01T00:00:01.010Z', done => {
        const params = {
            listingType: 'DelimiterCurrent',
            beforeDate: '1970-01-01T00:00:01.010Z',
            maxKeys: 1,
        };
        return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
            assert.ifError(err);
            assert.strictEqual(data.IsTruncated, true);
            assert.strictEqual(data.Contents.length, 1);
            assert.strictEqual(data.Contents[0].key, 'pfx1-test-object');
            assert.strictEqual(data.NextMarker, 'pfx1-test-object');

            params.marker = 'pfx1-test-object';

            return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
                assert.ifError(err);
                assert.strictEqual(data.IsTruncated, false);
                assert.strictEqual(data.Contents.length, 1);
                assert.strictEqual(data.Contents[0].key, 'pfx3-test-object');

                return done();
            });
        });
    });

    it('Should truncate list of current versions of objects', done => {
        const params = {
            listingType: 'DelimiterCurrent',
            maxKeys: 2,
        };
        return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
            assert.ifError(err);
            assert.strictEqual(data.IsTruncated, true);
            assert.strictEqual(data.NextMarker, 'pfx2-test-object');
            assert.strictEqual(data.Contents.length, 2);
            assert.strictEqual(data.Contents[0].key, 'pfx1-test-object');
            assert.strictEqual(data.Contents[1].key, 'pfx2-test-object');

            return done();
        });
    });

    it('Should list the following current versions of objects', done => {
        const params = {
            listingType: 'DelimiterCurrent',
            marker: 'pfx2-test-object',
        };
        return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
            assert.ifError(err);
            assert.strictEqual(data.IsTruncated, false);
            assert.strictEqual(data.Contents.length, 1);
            assert.strictEqual(data.Contents[0].key, 'pfx3-test-object');

            return done();
        });
    });

    it('Should list current versions that start with prefix', done => {
        const params = {
            listingType: 'DelimiterCurrent',
            prefix: 'pfx2',
        };
        return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
            assert.ifError(err);
            assert.strictEqual(data.IsTruncated, false);
            assert.strictEqual(data.Contents.length, 1);
            assert.strictEqual(data.Contents[0].key, 'pfx2-test-object');

            return done();
        });
    });

    it('Should return the list of current versions modified before 1970-01-01T00:00:01.010Z with prefix pfx1', done => {
        const params = {
            listingType: 'DelimiterCurrent',
            beforeDate: '1970-01-01T00:00:01.010Z',
            maxKeys: 1,
            prefix: 'pfx1',
        };
        return metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
            assert.ifError(err);
            assert.strictEqual(data.IsTruncated, false);
            assert.strictEqual(data.Contents.length, 1);
            assert.strictEqual(data.Contents[0].key, 'pfx1-test-object');

            return done();
        });
    });

    it('Should not list deleted object', done => {
        const objVal = {
            'key': 'pfx4-test-object',
            'last-modified': new Date(0).toISOString(),
        };
        const versionParams = {
            versioning: true,
        };
        const params = {
            listingType: 'DelimiterCurrent',
        };
        async.series([
            next => metadata.putObjectMD(BUCKET_NAME, objVal.key, objVal, versionParams,
                logger, next),
            next => metadata.deleteObjectMD(BUCKET_NAME, objVal.key, null, logger, next),
            next => metadata.listObject(BUCKET_NAME, params, logger, (err, data) => {
                assert.ifError(err);
                assert.strictEqual(data.Contents.length, 3);
                assert.strictEqual(data.Contents[0].key, 'pfx1-test-object');
                assert.strictEqual(data.Contents[1].key, 'pfx2-test-object');
                assert.strictEqual(data.Contents[2].key, 'pfx3-test-object');
                return next();
            }),
        ], done);
    });

    it('Should not list phd master key when listing current versions', done => {
        const objVal = {
            'key': 'pfx4-test-object',
            'versionId': 'null',
            'last-modified': new Date(0).toISOString(),
        };
        const versionParams = {
            versioning: true,
        };
        const params = {
            listingType: 'DelimiterCurrent',
            prefix: 'pfx4',
        };
        let versionId;
        let lastVersionId;
        async.series([
            next => metadata.putObjectMD(BUCKET_NAME, 'pfx4-test-object', objVal, versionParams,
                logger, (err, res) => {
                    if (err) {
                        return next(err);
                    }
                    versionId = JSON.parse(res).versionId;
                    return next(null);
                }),
            next => metadata.putObjectMD(BUCKET_NAME, 'pfx4-test-object', objVal, versionParams,
                logger, (err, res) => {
                    if (err) {
                        return next(err);
                    }
                    lastVersionId = JSON.parse(res).versionId;
                    return next(null);
                }),
            next => metadata.deleteObjectMD(BUCKET_NAME, 'pfx4-test-object', { versionId: lastVersionId },
                logger, next),
            next => metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
                assert.ifError(err);
                assert.strictEqual(data.Contents[0].value.VersionId, versionId);
                return next();
            }),
        ], done);
    });

    it('Should not list the current version tagged for deletion', done => {
        const objVal = {
            'key': 'pfx4-test-object',
            'last-modified': new Date(0).toISOString(),
        };
        const versionParams = {
            versioning: true,
        };
        const params = {
            listingType: 'DelimiterCurrent',
        };
        async.series([
            next => metadata.putObjectMD(BUCKET_NAME, objVal.key, objVal, versionParams,
                logger, next),
            next => flagObjectForDeletion(collection, objVal.key, next),
            next => metadata.listObject(BUCKET_NAME, params, logger, (err, data) => {
                assert.ifError(err);
                assert.strictEqual(data.Contents.length, 3);
                assert.strictEqual(data.Contents[0].key, 'pfx1-test-object');
                assert.strictEqual(data.Contents[1].key, 'pfx2-test-object');
                assert.strictEqual(data.Contents[2].key, 'pfx3-test-object');
                return next();
            }),
        ], done);
    });
});
