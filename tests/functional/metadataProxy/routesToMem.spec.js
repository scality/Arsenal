'use strict'; // eslint-disable-line strict

const werelogs = require('werelogs');
const assert = require('assert');
const async = require('async');

const logger = new werelogs.Logger('MetadataProxyServer', 'debug', 'debug');
const MetadataWrapper =
      require('../../../lib/storage/metadata/MetadataWrapper');
const BucketRoutes =
      require('../../../lib/storage/metadata/proxy/BucketdRoutes');
const metadataWrapper = new MetadataWrapper('mem', {}, null, logger);
const { RequestDispatcher } = require('../../utils/mdProxyUtils');

const routes = new BucketRoutes(metadataWrapper, logger);
const dispatcher = new RequestDispatcher(routes);

const Bucket = 'test';
const bucketInfo = {
    acl: {
        Canned: 'private',
        FULL_CONTROL: [],
        WRITE: [],
        WRITE_ACP: [],
        READ: [],
        READ_ACP: [],
    },
    name: Bucket,
    owner: '9d8fe19a78974c56dceb2ea4a8f01ed0f5fecb9d29f80e9e3b84104e4a3ea520',
    ownerDisplayName: 'anonymousCoward',
    creationDate: '2018-06-04T17:45:42.592Z',
    mdBucketModelVersion: 8,
    transient: false,
    deleted: false,
    serverSideEncryption: null,
    versioningConfiguration: null,
    locationConstraint: 'us-east-1',
    readLocationConstraint: 'us-east-1',
    cors: null,
    replicationConfiguration: null,
    lifecycleConfiguration: null,
    uid: 'fea97818-6a9a-11e8-9777-e311618cc5d4',
    isNFS: null,
};

const objects = [
    'aaa',
    'bbb/xaa',
    'bbb/xbb',
    'bbb/xcc',
    'ccc',
    'ddd',
];

function _getExpectedListing(prefix, objects) {
    const filtered = objects.map(key => {
        const deprefixed = key.slice(prefix.length);
        return deprefixed.replace(/[/].*/, '/');
    });
    const keySet = {};
    return filtered.filter(key => {
        if (keySet[key]) {
            return false;
        }
        if (key === '') {
            return false;
        }
        keySet[key] = true;
        return true;
    });
}

function _listingURL(prefix, marker) {
    const reSlash = /[/]/g;
    const escapedPrefix = prefix.replace(reSlash, '%2F');
    const escapedMarker = marker.replace(reSlash, '%2F');
    return `/default/bucket/${Bucket}?delimiter=%2F&prefix=` +
        `${escapedPrefix}&maxKeys=1&marker=${escapedMarker}`;
}

function _listObjects(prefix, objects, cb) {
    const keys = _getExpectedListing(prefix, objects);
    const markers = keys.slice(0);
    markers.unshift(undefined);
    const lastKey = keys[keys.length - 1];
    const listing = keys.map(key => ({
        key,
        IsTruncated: key !== lastKey,
        isPrefix: key.endsWith('/'),
    }));
    let nextMarker = '';
    async.mapSeries(listing, (obj, next) => {
        dispatcher.get(_listingURL(prefix, nextMarker),
            (err, response, body) => {
                if (err) {
                    return next(err);
                }
                if (obj.isPrefix) {
                    assert.strictEqual(body.Contents.length, 0);
                    assert.strictEqual(body.CommonPrefixes.length,
                        1);
                    assert.strictEqual(body.CommonPrefixes[0],
                        prefix + obj.key);
                } else {
                    assert.strictEqual(body.Contents.length, 1);
                    assert.strictEqual(body.CommonPrefixes.length,
                        0);
                    assert.strictEqual(body.Contents[0].key,
                        prefix + obj.key);
                }
                assert.strictEqual(body.IsTruncated,
                    obj.IsTruncated);
                if (body.IsTruncated) {
                    nextMarker = body.NextMarker;
                }
                return next();
            });
    }, err => cb(err));
}

function _createObjects(objects, cb) {
    async.mapLimit(objects, 5, (key, next) => {
        dispatcher.post(`/default/bucket/${Bucket}/${key}`,
            { key }, next);
    }, err => {
        cb(err);
    });
}

function _readObjects(objects, cb) {
    async.mapLimit(objects, 5, (key, next) => {
        dispatcher.get(`/default/bucket/${Bucket}/${key}`,
            (err, response, body) => {
                assert.deepStrictEqual(body.key, key);
                next(err);
            });
    }, err => {
        cb(err);
    });
}

function _deleteObjects(objects, cb) {
    async.mapLimit(objects, 5, (key, next) => {
        dispatcher.delete(`/default/bucket/${Bucket}/${key}`,
            err => next(err));
    }, err => {
        cb(err);
    });
}

describe('Basic Metadata Proxy Server test',
    () => {
        jest.setTimeout(10000);
        it('Shoud get the metadataInformation', done => {
            dispatcher.get('/default/metadataInformation',
                (err, response, body) => {
                    if (err) {
                        return done(err);
                    }
                    assert.deepStrictEqual(
                        body, { metadataVersion: 2 });
                    return done();
                });
        });
    });

describe('Basic Metadata Proxy Server CRUD test', () => {
    jest.setTimeout(10000);

    beforeEach(done => {
        dispatcher.post(`/default/bucket/${Bucket}`, bucketInfo,
            done);
    });

    afterEach(done => {
        dispatcher.delete(`/default/bucket/${Bucket}`, done);
    });

    it('Should get the bucket attributes', done => {
        dispatcher.get(`/default/attributes/${Bucket}`,
            (err, response, body) => {
                if (err) {
                    return done(err);
                }
                assert.deepStrictEqual(body.name,
                    bucketInfo.name);
                return done();
            });
    });

    it('Should crud an object', done => {
        async.waterfall([
            next => dispatcher.post(`/default/bucket/${Bucket}/test1`,
                { foo: 'gabu' }, err => next(err)),
            next => dispatcher.get(`/default/bucket/${Bucket}/test1`,
                (err, response, body) => {
                    if (!err) {
                        assert.deepStrictEqual(body.foo,
                            'gabu');
                        next(err);
                    }
                }),
            next => dispatcher.post(`/default/bucket/${Bucket}/test1`,
                { foo: 'zome' }, err => next(err)),
            next => dispatcher.get(`/default/bucket/${Bucket}/test1`,
                (err, response, body) => {
                    if (!err) {
                        assert.deepStrictEqual(body.foo,
                            'zome');
                        next(err);
                    }
                }),
            next => dispatcher.delete(`/default/bucket/${Bucket}/test1`,
                err => next(err)),
        ], err => done(err));
    });

    it('Should list objects', done => {
        async.waterfall([
            next => _createObjects(objects, next),
            next => _readObjects(objects, next),
            next => _listObjects('', objects, next),
            next => _listObjects('bbb/', objects, next),
            next => _deleteObjects(objects, next),
        ], err => {
            done(err);
        });
    });

    it('Should update bucket properties', done => {
        dispatcher.get(
            `/default/attributes/${Bucket}`, (err, response, body) => {
                assert.strictEqual(err, null);
                const bucketInfo = body;
                const newOwnerDisplayName = 'divertedfrom';
                bucketInfo.ownerDisplayName = newOwnerDisplayName;
                dispatcher.post(
                    `/default/attributes/${Bucket}`, bucketInfo, err => {
                        assert.strictEqual(err, null);
                        dispatcher.get(
                            `/default/attributes/${Bucket}`,
                            (err, response, body) => {
                                assert.strictEqual(err, null);
                                const newBucketInfo = body;
                                assert.strictEqual(
                                    newBucketInfo.ownerDisplayName,
                                    newOwnerDisplayName);
                                done(null);
                            });
                    });
            });
    });

    it('Should fail to list a non existing bucket', done => {
        dispatcher.get('/default/bucket/nonexisting',
            (err, response) => {
                assert.strictEqual(
                    response.responseHead.statusCode,
                    404);
                done(err);
            });
    });

    it('Should fail to get attributes from a non existing bucket', done => {
        dispatcher.get('/default/attributes/nonexisting',
            (err, response) => {
                assert.strictEqual(
                    response.responseHead.statusCode,
                    404);
                done(err);
            });
    });

    it('should succeed a health check', done => {
        dispatcher.get('/_/healthcheck', (err, response, body) => {
            if (err) {
                return done(err);
            }
            const expectedResponse = {
                memorybucket: {
                    code: 200,
                    message: 'OK',
                },
            };
            assert.strictEqual(response.responseHead.statusCode, 200);
            assert.deepStrictEqual(body, expectedResponse);
            return done(err);
        });
    });

    it('should work with parallel route', done => {
        const objectName = 'theObj';
        async.waterfall([
            next => _createObjects([objectName], next),
            next => {
                dispatcher.get(
                    `/default/parallel/${Bucket}/${objectName}`,
                    (err, response, body) => {
                        if (err) {
                            return next(err);
                        }
                        assert.strictEqual(response.responseHead.statusCode,
                            200);
                        const bucketMD = JSON.parse(body.bucket);
                        const objectMD = JSON.parse(body.obj);
                        const expectedObjectMD = { key: objectName };
                        assert.deepStrictEqual(bucketMD.name,
                            bucketInfo.name);
                        assert.deepStrictEqual(objectMD, expectedObjectMD);
                        return next(err);
                    });
            },
            next => _deleteObjects([objectName], next),
        ], done);
    });
});
