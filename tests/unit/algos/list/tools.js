'use strict';// eslint-disable-line strict

const assert = require('assert');

const checkLimit = require('../../../../lib/algos/list/tools').checkLimit;

describe('checkLimit function', () => {
    const tests = [
        { input: [1000, 2500], output: 1000 },
        { input: [5000, 2500], output: 2500 },
        { input: ['lala', 2500], output: 2500 },
        { input: [15000, 0], output: 15000 },
        { input: ['lala', 0], output: 0 },
        { input: [2000, undefined], output: 2000 },
        { input: ['lala', undefined], output: undefined },
        { input: [0, 0], output: 0 },
    ];
    tests.forEach((test, index) => {
        it(`test${index}`, done => {
            const res = checkLimit(test.input[0], test.input[1]);
            assert.deepStrictEqual(res, test.output);
            done();
        });
    });
});
