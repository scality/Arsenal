'use strict'; // eslint-disable-line strict

const assert = require('assert');
const async = require('async');

const RedisClient = require('../../../lib/metrics/RedisClient');
const StatsModel = require('../../../lib/metrics/StatsModel');

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
const STATS_INTERVAL = 300; // 5 minutes
const STATS_EXPIRY = 900; // 15 minutes
const statsModel = new StatsModel(redisClient, STATS_INTERVAL, STATS_EXPIRY);

// Since many methods were overwritten, these tests should validate the changes
// made to the original methods
describe('StatsModel class', () => {
    const id = 'arsenal-test';
    const id2 = 'test-2';
    const id3 = 'test-3';

    afterEach(() => redisClient.clear(() => {}));

    it('should convert a 2d array columns into rows and vice versa using _zip',
    () => {
        const arrays = [
            [1, 2, 3],
            [4, 5, 6],
            [7, 8, 9],
        ];

        const res = statsModel._zip(arrays);
        const expected = [
            [1, 4, 7],
            [2, 5, 8],
            [3, 6, 9],
        ];

        assert.deepStrictEqual(res, expected);
    });

    it('_zip should return an empty array if given an invalid array', () => {
        const arrays = [];

        const res = statsModel._zip(arrays);

        assert.deepStrictEqual(res, []);
    });

    it('_getCount should return a an array of all valid integer values',
    () => {
        const res = statsModel._getCount([
            [null, '1'],
            [null, '2'],
            [null, null],
        ]);
        assert.deepStrictEqual(res, [1, 2, 0]);
    });

    it('should correctly record a new request by default one increment',
    done => {
        async.series([
            next => {
                statsModel.reportNewRequest(id, (err, res) => {
                    assert.ifError(err);

                    const expected = [[null, 1], [null, 1]];
                    assert.deepStrictEqual(res, expected);
                    next();
                });
            },
            next => {
                statsModel.reportNewRequest(id, (err, res) => {
                    assert.ifError(err);

                    const expected = [[null, 2], [null, 1]];
                    assert.deepStrictEqual(res, expected);
                    next();
                });
            },
        ], done);
    });

    it('should record new requests by defined amount increments', done => {
        function noop() {}

        async.series([
            next => {
                statsModel.reportNewRequest(id, 9);
                statsModel.getStats(fakeLogger, id, (err, res) => {
                    assert.ifError(err);

                    assert.deepStrictEqual(res.requests, [9, 0, 0]);
                    next();
                });
            },
            next => {
                statsModel.reportNewRequest(id);
                statsModel.getStats(fakeLogger, id, (err, res) => {
                    assert.ifError(err);

                    assert.deepStrictEqual(res.requests, [10, 0, 0]);
                    next();
                });
            },
            next => {
                statsModel.reportNewRequest(id, noop);
                statsModel.getStats(fakeLogger, id, (err, res) => {
                    assert.ifError(err);

                    assert.deepStrictEqual(res.requests, [11, 0, 0]);
                    next();
                });
            },
        ], done);
    });

    it('should correctly record a 500 on the server', done => {
        statsModel.report500(id, (err, res) => {
            assert.ifError(err);

            const expected = [[null, 1], [null, 1]];
            assert.deepStrictEqual(res, expected);
            done();
        });
    });

    it('should respond back with total requests as an array', done => {
        async.series([
            next => {
                statsModel.reportNewRequest(id, err => {
                    assert.ifError(err);
                    next();
                });
            },
            next => {
                statsModel.report500(id, err => {
                    assert.ifError(err);
                    next();
                });
            },
            next => {
                statsModel.getStats(fakeLogger, id, (err, res) => {
                    assert.ifError(err);

                    const expected = {
                        'requests': [1, 0, 0],
                        '500s': [1, 0, 0],
                        'sampleDuration': STATS_EXPIRY,
                    };
                    assert.deepStrictEqual(res, expected);
                    next();
                });
            },
        ], done);
    });

    it('should not crash on empty results', done => {
        async.series([
            next => {
                statsModel.getStats(fakeLogger, id, (err, res) => {
                    assert.ifError(err);
                    const expected = {
                        'requests': [0, 0, 0],
                        '500s': [0, 0, 0],
                        'sampleDuration': STATS_EXPIRY,
                    };
                    assert.deepStrictEqual(res, expected);
                    next();
                });
            },
            next => {
                statsModel.getAllStats(fakeLogger, id, (err, res) => {
                    assert.ifError(err);
                    const expected = {
                        'requests': [0, 0, 0],
                        '500s': [0, 0, 0],
                        'sampleDuration': STATS_EXPIRY,
                    };
                    assert.deepStrictEqual(res, expected);
                    next();
                });
            },
        ], done);
    });

    it('should return a zero-filled array if no ids are passed to getAllStats',
    done => {
        statsModel.getAllStats(fakeLogger, [], (err, res) => {
            assert.ifError(err);

            const expected = Array(STATS_EXPIRY / STATS_INTERVAL).fill(0);

            assert.deepStrictEqual(res.requests, expected);
            assert.deepStrictEqual(res['500s'], expected);
            done();
        });
    });

    it('should get accurately reported data for given id from getAllStats',
    done => {
        statsModel.reportNewRequest(id, 9);
        statsModel.reportNewRequest(id2, 2);
        statsModel.reportNewRequest(id3, 3);
        statsModel.report500(id);

        async.series([
            next => {
                statsModel.getAllStats(fakeLogger, [id], (err, res) => {
                    assert.ifError(err);

                    assert.equal(res.requests[0], 9);
                    assert.equal(res['500s'][0], 1);
                    next();
                });
            },
            next => {
                statsModel.getAllStats(fakeLogger, [id, id2, id3],
                (err, res) => {
                    assert.ifError(err);

                    assert.equal(res.requests[0], 14);
                    assert.deepStrictEqual(res.requests, [14, 0, 0]);
                    next();
                });
            },
        ], done);
    });
});
