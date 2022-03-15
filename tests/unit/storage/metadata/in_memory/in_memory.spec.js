const async = require('async');
const assert = require('assert');
const werelogs = require('werelogs');
const MetadataWrapper = require('../../../../../lib/storage/metadata/MetadataWrapper');
const fakeBucketInfo = require('./FakeBucketInfo.json');

describe('InMemory', () => {
    const fakeBucket = 'fake';
    const logger = new werelogs.Logger('Injector');
    const memBackend = new MetadataWrapper(
        'mem', {}, null, logger);

    before(done => {
        memBackend.createBucket(fakeBucket, fakeBucketInfo, logger, done);
    });

    after(done => {
        memBackend.deleteBucket(fakeBucket, logger, done);
    });

    it('basic', done => {
        async.waterfall([
            next => {
                memBackend.putObjectMD(fakeBucket, 'foo', 'bar', {}, logger, err => {
                    if (err) {
                        return next(err);
                    }
                    return next();
                });
            },
            next => {
                memBackend.getObjectMD(fakeBucket, 'foo', {}, logger, (err, data) => {
                    if (err) {
                        return next(err);
                    }
                    assert.deepEqual(data, 'bar');
                    return next();
                });
            },
            next => {
                memBackend.deleteObjectMD(fakeBucket, 'foo', {}, logger, err => {
                    if (err) {
                        return next(err);
                    }
                    return next();
                });
            },
            next => {
                memBackend.getObjectMD(fakeBucket, 'foo', {}, logger, err => {
                    if (err) {
                        assert.deepEqual(err.message, 'NoSuchKey');
                        return next();
                    }
                    return next(new Error('unexpected success'));
                });
            },
        ], done);
    });
});
