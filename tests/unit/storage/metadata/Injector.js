const async = require('async');
const assert = require('assert');
const Prando = require('prando');
const werelogs = require('werelogs');
const MetadataWrapper = require('../../../../lib/storage/metadata/MetadataWrapper');
const fakeBucketInfo = require('./FakeBucketInfo.json');

werelogs.configure({
    level: 'info',
    dump: 'error',
});

class Injector {

    /**
     * @constructor
     *
     * @param {Object} backend - Metadata backend to use for injection
     * @param {Object} logger - Logger to use
     */
    constructor(backend, logger) {
        this.backend = backend;
        this.rnd = new Prando(0);
        this.logger = logger;
    }

    get opPut() {
        return 1;
    }

    get opDelete() {
        return 0;
    }

    genKey(len) {
        const characters =
              'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        return this.rnd.nextString(len, characters);
    }

    genBase16(len) {
        const characters = 'abcdef0123456789';
        return this.rnd.nextString(len, characters);
    }

    _zeroPad(s, n, width) {
        return s + n.toString().padStart(width, '0');
    }

    /**
     * Deterministic injection of puts or deletes according to parameters
     *
     * @param {String} bucketName - bucket name to inject to
     * @param {Object} params - parameters for injection
     * @param {Array} inputKeys - optional keys to use as input
     * @param {Array} outputKeys - optional generated keys as output
     * @param {Array} outputValues - optional generated values as output
     * @param {function} cb - callback when done
     *
     * @return {undefined}
     */
    inject(bucketName, params, inputKeys, outputKeys, outputValues, cb) {
        let maxKeyLen = 1024;
        if (params.maxKeyLen !== undefined) {
            maxKeyLen = params.maxKeyLen;
        }
        async.timesLimit(
            params.numKeys,
            10,
            (n, next) => {
                let key;
                if (inputKeys) {
                    const idx = this.rnd.nextInt(0, inputKeys.length - 1);
                    key = inputKeys[idx];
                    inputKeys.splice(idx, 1);
                } else {
                    if (params.randomKey) {
                        const len = this.rnd.nextInt(1, maxKeyLen);
                        key = this.genKey(len);
                    } else {
                        let x;
                        if (params.randomSeq) {
                            x = this.rnd.nextInt(0, params.maxSeq - 1);
                        } else {
                            x = n;
                        }
                        key = this._zeroPad(params.prefix, x, 10) +
                            params.suffix;
                    }
                }
                if (outputKeys) {
                    outputKeys.push(key);
                }
                // eslint-disable-next-line
                const value = {
                    versionId: this.genBase16(32),
                    'content-length': this.rnd.nextInt(0, 5000000),
                    'content-md5': this.genBase16(32),
                };
                if (outputValues) {
                    outputValues.push(value);
                }
                if (params.op === this.opPut) {
                    this.backend.putObjectMD(
                        bucketName,
                        key,
                        value,
                        {},
                        this.logger,
                        next);
                    return undefined;
                } else if (params.op === this.opDelete) {
                    this.backend.deleteObjectMD(
                        bucketName,
                        key,
                        {},
                        this.logger,
                        err => {
                            if (err) {
                                if (err.code !== 404) {
                                    return next(err);
                                }
                            }
                            return next();
                        });
                    return undefined;
                }
                return next(new Error('unknow op'));
            },
            err => {
                if (err) {
                    // eslint-disable-next-line
                    console.error('inject error', err);
                    process.exit(1);
                }
                if (cb) {
                    return cb();
                }
                return undefined;
            });
    }
}

module.exports = Injector;

describe('Injector', () => {
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

    it('zeropad', () => {
        const injector = new Injector(memBackend, logger);
        assert(injector._zeroPad('foo', 42, 10) === 'foo0000000042');
    });

    it('inject inputKeys', done => {
        const injector = new Injector(memBackend, logger);
        const inputKeys = ['foo1', 'foo2', 'foo3'];
        const outputKeys = [];
        injector.inject(
            fakeBucket,
            {
                op: injector.opPut,
                numKeys: 3,
            },
            inputKeys,
            outputKeys,
            null,
            err => {
                if (err) {
                    return done(err);
                }
                assert.deepEqual(outputKeys, ['foo2', 'foo1', 'foo3']);
                return done();
            });
    });

    it('inject sequence', done => {
        const injector = new Injector(memBackend, logger);
        const outputKeys = [];
        injector.inject(
            fakeBucket,
            {
                prefix: 'foo',
                suffix: 'x',
                randomSeq: true,
                maxSeq: 10,
                op: injector.opPut,
                numKeys: 3,
            },
            null,
            outputKeys,
            null,
            err => {
                if (err) {
                    return done(err);
                }
                assert.deepEqual(
                    outputKeys,
                    [
                        'foo0000000005x',
                        'foo0000000001x',
                        'foo0000000000x',
                    ]);
                return done();
            });
    });

    it('inject random', done => {
        const injector = new Injector(memBackend, logger);
        const outputKeys = [];
        const outputValues = [];
        injector.inject(
            fakeBucket,
            {
                prefix: 'foo',
                suffix: 'x',
                randomKey: true,
                maxKeyLen: 10,
                op: injector.opPut,
                numKeys: 3,
            },
            null,
            outputKeys,
            outputValues,
            err => {
                if (err) {
                    return done(err);
                }
                assert.deepEqual(
                    outputKeys,
                    [
                        'f5TJ6X',
                        '7T',
                        'LStNJxHS8',
                    ]);
                assert.deepEqual(
                    outputValues,
                    [
                        {
                            'content-length': 3009012,
                            'content-md5': '60f7abfdc5855e00a6e6dc2918bda7a8',
                            'versionId': 'f13938435117885f7f88d7636a3b238e',
                        },
                        {
                            'content-length': 3984521,
                            'content-md5': '7cfc7e8b82826b83e302d18fa0e24b12',
                            'versionId': 'f7f5c4973bc353ad8a9d5084fc1f0dc3',
                        },
                        {
                            'content-length': 4112702,
                            'content-md5': '6d4fe78b11cfa4ff7b2efaba5c5965fe',
                            'versionId': '5540954e05a7910abeb72b8393c93afe',
                        },
                    ]);
                return done();
            });
    });
});
