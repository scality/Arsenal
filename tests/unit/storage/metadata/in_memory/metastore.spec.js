const assert = require('assert');
const async = require('async');

const metastore = require('../../../../../lib/storage/metadata/in_memory/metastore');
const { metadata } = require('../../../../../lib/storage/metadata/in_memory/metadata');
const DummyRequestLogger = require('../../../helpers').DummyRequestLogger;

const log = new DummyRequestLogger();

const md5A = '9b2cf535f27731c974343645a3985328';
const md5B = '3c6e0b8a9c15224a8228b9a98ca1531d';

let bucketCounter = 0;

describe('in-memory metastore conditional put', () => {
    let bucketName;

    function put(key, value, params, cb) {
        metastore.putObject(bucketName, key, value, params, log, cb);
    }

    function master(key) {
        return metadata.keyMaps.get(bucketName).get(key);
    }

    function versionCount(key) {
        return [...metadata.keyMaps.get(bucketName).keys()].filter(k => k.startsWith(`${key}\0`)).length;
    }

    beforeEach(done => {
        bucketName = `condput-${bucketCounter++}`;
        metastore.createBucket(bucketName, {}, log, done);
    });

    afterEach(() => {
        metadata.buckets.delete(bucketName);
        metadata.keyMaps.delete(bucketName);
    });

    it('should advertise supportsConditionalPut', () => {
        assert.strictEqual(metastore.supportsConditionalPut, true);
    });

    it('ifNoneMatch should write when the key is absent', done => {
        put('key', { 'content-md5': md5A }, { ifNoneMatch: '*' }, err => {
            assert.ifError(err);
            assert.strictEqual(master('key')['content-md5'], md5A);
            done();
        });
    });

    it('ifNoneMatch should fail with PreconditionFailed and keep the object when the key exists', done => {
        put('key', { 'content-md5': md5A }, {}, err => {
            assert.ifError(err);
            put('key', { 'content-md5': md5B }, { ifNoneMatch: '*' }, err => {
                assert(err && err.is.PreconditionFailed);
                assert.strictEqual(master('key')['content-md5'], md5A);
                done();
            });
        });
    });

    it('ifNoneMatch should write over a delete marker master', done => {
        put('key', { isDeleteMarker: true }, { versioning: true }, err => {
            assert.ifError(err);
            put('key', { 'content-md5': md5B }, { ifNoneMatch: '*', versioning: true }, err => {
                assert.ifError(err);
                assert.strictEqual(master('key')['content-md5'], md5B);
                assert.strictEqual(versionCount('key'), 2);
                done();
            });
        });
    });

    it('ifMatch should write when content-md5 is equal', done => {
        put('key', { 'content-md5': md5A }, {}, err => {
            assert.ifError(err);
            put('key', { 'content-md5': md5B }, { ifMatch: md5A }, err => {
                assert.ifError(err);
                assert.strictEqual(master('key')['content-md5'], md5B);
                done();
            });
        });
    });

    it('ifMatch should fail with PreconditionFailed when content-md5 differs', done => {
        put('key', { 'content-md5': md5A }, {}, err => {
            assert.ifError(err);
            put('key', { 'content-md5': md5B }, { ifMatch: md5B }, err => {
                assert(err && err.is.PreconditionFailed);
                assert.strictEqual(master('key')['content-md5'], md5A);
                put('key', { 'content-md5': md5B }, { ifMatch: '' }, err => {
                    assert(err && err.is.PreconditionFailed);
                    assert.strictEqual(master('key')['content-md5'], md5A);
                    done();
                });
            });
        });
    });

    it('ifMatch should fail with NoSuchKey when the key is absent or a delete marker', done => {
        put('absent', { 'content-md5': md5B }, { ifMatch: md5A }, err => {
            assert(err && err.is.NoSuchKey);
            assert.strictEqual(master('absent'), undefined);
            put('marker', { 'isDeleteMarker': true, 'content-md5': md5A }, { versioning: true }, err => {
                assert.ifError(err);
                put('marker', { 'content-md5': md5B }, { ifMatch: md5A, versioning: true }, err => {
                    assert(err && err.is.NoSuchKey);
                    assert.strictEqual(master('marker').isDeleteMarker, true);
                    assert.strictEqual(versionCount('marker'), 1);
                    done();
                });
            });
        });
    });

    it('conditions should apply with versioning true and with versionId empty', done => {
        async.eachSeries(
            [{ versioning: true }, { versionId: '' }],
            (mode, next) => {
                const key = `key-${Object.keys(mode)[0]}`;
                async.series(
                    [
                        cb => put(key, { 'content-md5': md5A }, { ...mode, ifNoneMatch: '*' }, cb),
                        cb =>
                            put(key, { 'content-md5': md5B }, { ...mode, ifNoneMatch: '*' }, err => {
                                assert(err && err.is.PreconditionFailed);
                                cb();
                            }),
                        cb =>
                            put(key, { 'content-md5': md5B }, { ...mode, ifMatch: md5B }, err => {
                                assert(err && err.is.PreconditionFailed);
                                cb();
                            }),
                        cb => put(key, { 'content-md5': md5B }, { ...mode, ifMatch: md5A }, cb),
                    ],
                    err => {
                        assert.ifError(err);
                        assert.strictEqual(master(key)['content-md5'], md5B);
                        next();
                    },
                );
            },
            done,
        );
    });

    it('a condition with a non-empty versionId should return NotImplemented', done => {
        put('key', { 'content-md5': md5A }, { versionId: 'abc', ifNoneMatch: '*' }, err => {
            assert(err && err.is.NotImplemented);
            assert.strictEqual(master('key'), undefined);
            done();
        });
    });

    it('two ifNoneMatch puts started together should give one success and one PreconditionFailed', done => {
        const results = [];
        const finish = () => {
            if (results.length < 2) {
                return;
            }
            assert.strictEqual(results.filter(err => !err).length, 1);
            assert.strictEqual(results.filter(err => err && err.is.PreconditionFailed).length, 1);
            done();
        };
        put('key', { 'content-md5': md5A }, { ifNoneMatch: '*', versioning: true }, err => {
            results.push(err);
            finish();
        });
        put('key', { 'content-md5': md5B }, { ifNoneMatch: '*', versioning: true }, err => {
            results.push(err);
            finish();
        });
    });

    it('a put without condition should overwrite as before', done => {
        put('key', { 'content-md5': md5A }, {}, err => {
            assert.ifError(err);
            put('key', { 'content-md5': md5B }, {}, err => {
                assert.ifError(err);
                assert.strictEqual(master('key')['content-md5'], md5B);
                done();
            });
        });
    });
});
