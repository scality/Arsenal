const assert = require('assert');
const werelogs = require('werelogs');
const logger = new werelogs.Logger('MongoClientInterface', 'debug', 'debug');
const errors = require('../../../../../lib/errors').default;
const sinon = require('sinon');
const MongoClientInterface =
    require('../../../../../lib/storage/metadata/mongoclient/MongoClientInterface');
const utils = require('../../../../../lib/storage/metadata/mongoclient/utils');

describe('MongoClientInterface:getObjects', () => {
    let client;

    beforeAll(done => {
        client = new MongoClientInterface({});
        return done();
    });

    afterEach(done => {
        sinon.restore();
        return done();
    });

    it('should fail if not an array', done => {
        const collection = {
            findOne: Promise.resolve({}),
        };
        sinon.stub(client, 'getCollection').callsFake(() => collection);
        client.getObjects('example-bucket', {}, logger, err => {
            assert.deepStrictEqual(err, errors.InternalError);
            return done();
        });
    });

    it('should fail when getBucketVFormat fails', done => {
        const collection = {
            findOne: (filter, params, cb) => cb(null, {}),
        };
        sinon.stub(client, 'getCollection').callsFake(() => collection);
        const objects = [{ key: 'example-object', params: { versionId: '1' } }];
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(errors.InternalError));
        client.getObjects('example-bucket', objects, logger, err => {
            assert.deepStrictEqual(err, errors.InternalError);
            return done();
        });
    });

    it('should fail when find fails', done => {
        const objects = [{ key: 'example-object', params: { versionId: '1' } }];
        const collection = {
            find: () => ({
                toArray: (cb) => cb(errors.InternalError),
            }),
        };
        sinon.stub(client, 'getCollection').callsFake(() => collection);
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(null, 'v0'));
        client.getObjects('example-bucket', objects, logger, err => {
            assert.deepStrictEqual(err, errors.InternalError);
            return done();
        });
    });

    it('should fail when getLatestVersion fails', done => {
        const objects = [{ key: 'example-object', params: { versionId: '1' } }];
        const collection = {
            find: () => ({
                toArray: (cb) => cb(errors.InternalError, []),
            }),
        };
        sinon.stub(client, 'getCollection').callsFake(() => collection);
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(null, 'v0'));
        sinon.stub(client, 'getLatestVersion').callsFake((bucketName, data, log, cb) => cb(errors.InternalError));
        client.getObjects('example-bucket', objects, logger, err => {
            assert.deepStrictEqual(err, errors.InternalError);
            return done();
        });
    });

    it('should return empty document if version is set and not found', done => {
        const objects = [{ key: 'example-object', params: { versionId: '1' } }];
        const doc = {
            _id: 'example-key1',
            value: {
                isPHD: true,
                last: true,
            },
        };
        const collection = {
            find: () => ({
                toArray: (cb) => cb(null, [doc]),
            }),
        };
        const bucketVFormat = 'v0';
        sinon.stub(client, 'getCollection').callsFake(() => collection);
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(null, bucketVFormat));
        doc.value.last = true;
        sinon.stub(client, 'getLatestVersion').callsFake((c, objName, vFormat, log, cb) => cb(null, doc.value));
        client.getObjects('example-bucket', objects, logger, (err, res) => {
            assert.deepStrictEqual(err, null);
            assert.deepStrictEqual(res[0], {
                doc: null,
                key: utils.formatVersionKey(objects[0].key, objects[0].params.versionId, bucketVFormat),
                versionId: objects[0].params.versionId,
                err: errors.NoSuchKey,
            });
            return done();
        });
    });

    it('should return empty document if version is not set and not found', done => {
        const objects = [{ key: 'example-object', params: { } }];
        const doc = {
            _id: 'example-key1',
            value: {
                isPHD: false,
                last: true,
            },
        };
        const collection = {
            find: () => ({
                toArray: (cb) => cb(null, [doc]),
            }),
        };
        sinon.stub(client, 'getCollection').callsFake(() => collection);
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(null, 'v0'));
        doc.value.last = true;
        sinon.stub(client, 'getLatestVersion').callsFake((c, objName, vFormat, log, cb) => cb(null, doc.value));
        client.getObjects('example-bucket', objects, logger, (err, res) => {
            assert.deepStrictEqual(err, null);
            assert.deepStrictEqual(res[0], {
                doc: doc.value,
                key: objects[0].key,
                versionId: undefined,
                err: null,
            });
            return done();
        });
    });

    it('should return latest version if version is found and master is PHD', done => {
        const objects = [{ key: 'example-object', params: { } }];
        const doc = {
            _id: 'example-key1',
            value: {
                isPHD: true,
            },
        };
        const collection = {
            find: () => ({
                toArray: (cb) => cb(null, [doc]),
            }),
        };
        const bucketVFormat = 'v0';
        sinon.stub(client, 'getCollection').callsFake(() => collection);
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(null, bucketVFormat));
        sinon.stub(client, 'getLatestVersion').callsFake((c, objName, vFormat, log, cb) => cb(null, doc.value));

        client.getObjects('example-bucket', objects, logger, (err, res) => {
            assert.deepStrictEqual(err, null);
            assert.deepStrictEqual(res, [{
                doc: doc.value,
                key: objects[0].key,
                versionId: undefined,
                err: null,
            }]);
            return done();
        });
    });

    it('should return master', done => {
        const objects = [{ key: 'example-object', params: {} }];
        const doc = {
            _id: 'example-key1',
            value: {
                isPHD: false,
            },
        };
        const collection = {
            find: () => ({
                toArray: (cb) => cb(null, [doc]),
            }),
        };
        const bucketVFormat = 'v0';
        sinon.stub(client, 'getCollection').callsFake(() => collection);
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(null, bucketVFormat));
        doc.value.last = true;
        sinon.stub(client, 'getLatestVersion').callsFake((c, objName, vFormat, log, cb) => cb(null, doc.value));
        client.getObjects('example-bucket', objects, logger, (err, res) => {
            assert.deepStrictEqual(err, null);
            assert.deepStrictEqual(res[0], {
                doc: doc.value,
                key: objects[0].key,
                versionId: undefined,
                err: null,
            });
            return done();
        });
    });

    it('should return many objects', done => {
        const N = 5;
        const objects = [];
        const bucketVFormat = 'v0';
        for (let i = 1; i <= N; i++) {
            objects.push({ key: `example-object-${i}`, params: { versionId: `${i}` } });
        }

        const docTemplate = {
            _id: 'example-key',
            value: {
                isPHD: false,
            },
        };

        const collection = {
            find: () => ({
                toArray: (cb) => {
                    const docs = [];
                    for (let i = 1; i <= N; i++) {
                        const newDoc = JSON.parse(JSON.stringify(docTemplate));
                        newDoc._id = utils.formatVersionKey(`example-object-${i}`, `${i}`, bucketVFormat);
                        docs.push(newDoc);
                    }
                    cb(null, docs);
                },
            }),
        };
        sinon.stub(client, 'getCollection').callsFake(() => collection);
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(null, bucketVFormat));
        client.getObjects('example-bucket', objects, logger, (err, res) => {
            assert.deepStrictEqual(err, null);
            const expectedResults = [];
            for (let i = 0; i < N; i++) {
                expectedResults.push({
                    doc: docTemplate.value,
                    key: utils.formatVersionKey(objects[i].key, objects[i].params.versionId),
                    versionId: `${i + 1}`,
                    err: null,
                });
            }
            assert.deepStrictEqual(res, expectedResults);
            return done();
        });
    });

    it('should return multiple objects and null documents if one object is not found', done => {
        const N = 5;
        const objects = [];
        const bucketVFormat = 'v0';
        for (let i = 1; i <= N; i++) {
            objects.push({ key: `example-object-${i}`, params: { versionId: `${i}` } });
        }

        const docTemplate = {
            _id: 'example-key',
            value: {
                isPHD: false,
            },
        };

        const collection = {
            find: () => ({
                toArray: (cb) => {
                    const docs = [];
                    for (let i = 1; i < N; i++) {
                        const newDoc = JSON.parse(JSON.stringify(docTemplate));
                        newDoc._id = utils.formatVersionKey(`example-object-${i}`, `${i}`, bucketVFormat);
                        docs.push(newDoc);
                    }
                    cb(null, docs);
                },
            }),
        };
        sinon.stub(client, 'getCollection').callsFake(() => collection);
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(null, bucketVFormat));
        client.getObjects('example-bucket', objects, logger, (err, res) => {
            assert.deepStrictEqual(err, null);
            const expectedResults = [];
            for (let i = 0; i < N; i++) {
                expectedResults.push({
                    doc: i === N - 1 ? null : docTemplate.value,
                    key: utils.formatVersionKey(objects[i].key, objects[i].params.versionId),
                    versionId: `${i + 1}`,
                    err: i === N - 1 ? errors.NoSuchKey : null,
                });
            }
            assert.deepStrictEqual(res, expectedResults);
            return done();
        });
    });

    it('should return multiple objects and errors if one object latest version retrieval fails', done => {
        const N = 5;
        const objects = [];
        const bucketVFormat = 'v0';
        for (let i = 1; i <= N; i++) {
            objects.push({ key: `example-object-${i}`, params: { } });
        }

        const docTemplate = {
            _id: 'example-key',
            value: {
                isPHD: false,
            },
        };

        const collection = {
            find: () => ({
                toArray: (cb) => {
                    const docs = [];
                    for (let i = 1; i < N; i++) {
                        const newDoc = JSON.parse(JSON.stringify(docTemplate));
                        newDoc._id = `example-object-${i}`;
                        docs.push(newDoc);
                    }
                    cb(null, docs);
                },
            }),
        };
        sinon.stub(client, 'getCollection').callsFake(() => collection);
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(null, bucketVFormat));
        sinon.stub(client, 'getLatestVersion').callsFake((c, objName, vFormat, log, cb) => {
            if (objName === objects[N - 1].key) {
                return cb(errors.InternalError);
            }
            return cb(null, docTemplate.value);
        });
        client.getObjects('example-bucket', objects, logger, (err, res) => {
            assert.deepStrictEqual(err, null);
            const expectedResults = [];
            for (let i = 0; i < N; i++) {
                expectedResults.push({
                    doc: i === N - 1 ? null : docTemplate.value,
                    key: objects[i].key,
                    versionId: undefined,
                    err: i === N - 1 ? errors.InternalError : null,
                });
            }
            assert.deepStrictEqual(res, expectedResults);
            return done();
        });
    });
});
