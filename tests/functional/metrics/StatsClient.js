'use strict'; // eslint-disable-line strict

const assert = require('assert');
const async = require('async');

const RedisClient = require('../../../lib/metrics/RedisClient');
const StatsClient = require('../../../lib/metrics/StatsClient');

// setup redis client
const config = {
    host: '127.0.0.1',
    port: 6379,
    enableOfflineQueue: false,
};
const fakeLogger = {
    trace: () => {},
    error: () => {},
};
const redisClient = new RedisClient(config, fakeLogger);

// setup stats client
const STATS_INTERVAL = 5; // 5 seconds
const STATS_EXPIRY = 30; // 30 seconds
const statsClient = new StatsClient(redisClient, STATS_INTERVAL, STATS_EXPIRY);

describe('StatsClient class', () => {
    const id = 'arsenal-test';

    afterEach(() => redisClient.clear(() => {}));

    after(() => redisClient.disconnect());

    it('should correctly record a new request by default one increment',
        done => {
            async.series([
                next => {
                    statsClient.reportNewRequest(id, (err, res) => {
                        assert.ifError(err);

                        const expected = [[null, 1], [null, 1]];
                        assert.deepEqual(res, expected);
                        next();
                    });
                },
                next => {
                    statsClient.reportNewRequest(id, (err, res) => {
                        assert.ifError(err);

                        const expected = [[null, 2], [null, 1]];
                        assert.deepEqual(res, expected);
                        next();
                    });
                },
            ], done);
        });

    it('should record new requests by defined amount increments', done => {
        function noop() {}

        async.series([
            next => {
                statsClient.reportNewRequest(id, 9);
                statsClient.getStats(fakeLogger, id, (err, res) => {
                    assert.ifError(err);

                    assert.equal(res.requests, 9);
                    next();
                });
            },
            next => {
                statsClient.reportNewRequest(id);
                statsClient.getStats(fakeLogger, id, (err, res) => {
                    assert.ifError(err);

                    assert.equal(res.requests, 10);
                    next();
                });
            },
            next => {
                statsClient.reportNewRequest(id, noop);
                statsClient.getStats(fakeLogger, id, (err, res) => {
                    assert.ifError(err);

                    assert.equal(res.requests, 11);
                    next();
                });
            },
        ], done);
    });

    it('should correctly record a 500 on the server', done => {
        statsClient.report500(id, (err, res) => {
            assert.ifError(err);

            const expected = [[null, 1], [null, 1]];
            assert.deepEqual(res, expected);
            done();
        });
    });

    it('should respond back with total requests', done => {
        async.series([
            next => {
                statsClient.reportNewRequest(id, err => {
                    assert.ifError(err);
                    next();
                });
            },
            next => {
                statsClient.report500(id, err => {
                    assert.ifError(err);
                    next();
                });
            },
            next => {
                statsClient.getStats(fakeLogger, id, (err, res) => {
                    assert.ifError(err);

                    const expected = {
                        'requests': 1,
                        '500s': 1,
                        'sampleDuration': STATS_EXPIRY,
                    };
                    assert.deepStrictEqual(res, expected);
                    next();
                });
            },
        ], done);
    });
});
