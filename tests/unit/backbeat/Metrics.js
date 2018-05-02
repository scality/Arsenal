'use strict'; // eslint-disable-line strict

const assert = require('assert');

const RedisClient = require('../../../lib/metrics/RedisClient');
const { backbeat } = require('../../../');

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

// setup stats model
const sites = ['site1', 'site2'];
const metrics = new backbeat.Metrics({
    redisConfig: config,
    validSites: ['site1', 'site2', 'all'],
    internalStart: Date.now() - 900000, // 15 minutes ago.
}, fakeLogger);

// Since many methods were overwritten, these tests should validate the changes
// made to the original methods
describe('Metrics class', () => {
    afterEach(() => redisClient.clear(() => {}));

    it('should not crash on empty results', done => {
        const redisKeys = {
            ops: 'bb:crr:ops',
            bytes: 'bb:crr:bytes',
            opsDone: 'bb:crr:opsdone',
            bytesDone: 'bb:crr:bytesdone',
            failedCRR: 'bb:crr:failed',
        };
        const routes = backbeat.routes(redisKeys, sites);
        const details = routes.find(route =>
            route.category === 'metrics' && route.type === 'all');
        details.site = 'all';
        metrics.getAllMetrics(details, (err, res) => {
            assert.ifError(err);
            const expected = {
                backlog: {
                    description: 'Number of incomplete replication operations' +
                        ' (count) and number of incomplete MB transferred' +
                        ' (size)',
                    results: {
                        count: 0,
                        size: '0.00',
                    },
                },
                completions: {
                    description: 'Number of completed replication operations' +
                        ' (count) and number of MB transferred (size) in the ' +
                        'last 900 seconds',
                    results: {
                        count: 0,
                        size: '0.00',
                    },
                },
                throughput: {
                    description: 'Current throughput for replication' +
                        ' operations in ops/sec (count) and MB/sec (size)',
                    results: {
                        count: '0.00',
                        size: '0.00',
                    },
                },
            };
            assert.deepStrictEqual(res, expected);
            done();
        });
    });
});
