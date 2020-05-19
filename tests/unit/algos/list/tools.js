'use strict';// eslint-disable-line strict

const assert = require('assert');

const { checkLimit, inc, listingParamsMasterKeysV0ToV1 } =
      require('../../../../lib/algos/list/tools');
const VSConst = require('../../../../lib/versioning/constants').VersioningConstants;
const { DbPrefixes } = VSConst;

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

describe('listingParamsMasterKeysV0ToV1', () => {
    const testCases = [
        {
            v0params: {},
            v1params: {
                gte: DbPrefixes.Master,
                lt: inc(DbPrefixes.Master),
            },
        },
        {
            v0params: {
                gt: 'foo/bar',
            },
            v1params: {
                gt: `${DbPrefixes.Master}foo/bar`,
                lt: inc(DbPrefixes.Master),
            },
        },
        {
            v0params: {
                gte: 'foo/bar',
            },
            v1params: {
                gte: `${DbPrefixes.Master}foo/bar`,
                lt: inc(DbPrefixes.Master),
            },
        },
        {
            v0params: {
                lt: 'foo/bar',
            },
            v1params: {
                gte: DbPrefixes.Master,
                lt: `${DbPrefixes.Master}foo/bar`,
            },
        },
        {
            v0params: {
                lte: 'foo/bar',
            },
            v1params: {
                gte: DbPrefixes.Master,
                lte: `${DbPrefixes.Master}foo/bar`,
            },
        },
        {
            v0params: {
                gt: 'baz/qux',
                lt: 'foo/bar',
            },
            v1params: {
                gt: `${DbPrefixes.Master}baz/qux`,
                lt: `${DbPrefixes.Master}foo/bar`,
            },
        },
        {
            v0params: {
                gte: 'baz/qux',
                lte: 'foo/bar',
                limit: 5,
            },
            v1params: {
                gte: `${DbPrefixes.Master}baz/qux`,
                lte: `${DbPrefixes.Master}foo/bar`,
                limit: 5,
            },
        },
    ];
    testCases.forEach(({ v0params, v1params }) => {
        it(`${JSON.stringify(v0params)} => ${JSON.stringify(v1params)}`, () => {
            const converted = listingParamsMasterKeysV0ToV1(v0params);
            assert.deepStrictEqual(converted, v1params);
        });
    });
});
