'use strict'; // eslint-disable-line strict

const assert = require('assert');

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

    it('should correctly record a new request', () => {
        statsClient.reportNewRequest(id, (err, res) => {
            assert.ifError(err);
            assert(Array.isArray(res));
            assert.equal(res.length, 2);

            const expected = [[null, 1], [null, 1]];
            assert.deepEqual(res, expected);
        });

        statsClient.reportNewRequest(id, (err, res) => {
            assert.ifError(err);
            assert(Array.isArray(res));
            assert.equal(res.length, 2);

            const expected = [[null, 2], [null, 1]];
            assert.deepEqual(res, expected);
        });
    });

    it('should correctly record a 500 on the server', () => {
        statsClient.report500(id, (err, res) => {
            assert.ifError(err);
            assert(Array.isArray(res));
            assert.equal(res.length, 2);

            const expected = [[null, 1], [null, 1]];
            assert.deepEqual(res, expected);
        });
    });

    it('should respond back with total requests', () => {
        statsClient.reportNewRequest(id, err => {
            assert.ifError(err);
        });
        statsClient.report500(id, err => {
            assert.ifError(err);
        });
        statsClient.getStats(fakeLogger, id, (err, res) => {
            assert.ifError(err);
            assert.equal(typeof res, 'object');
            assert.equal(Object.keys(res).length, 3);
            assert.equal(res.sampleDuration, STATS_EXPIRY);

            const expected = { 'requests': 1, '500s': 1, 'sampleDuration': 30 };
            assert.deepEqual(res, expected);
        });
    });
});
