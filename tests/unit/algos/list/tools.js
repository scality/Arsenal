'use strict';// eslint-disable-line strict

const assert = require('assert');

const { checkLimit, inc, listingParamsMasterKeysV0ToV1, listingParamsV0ToV0Mig } =
      require('../../../../lib/algos/list/tools');
const VSConst = require('../../../../lib/versioning/constants').VersioningConstants;
const { DbPrefixes } = VSConst;
const VID_SEP = VSConst.VersionId.Separator;

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

describe('listingParamsV0ToV0Mig', () => {
    const testCases = [
        {
            v0params: {},
            v0migparams: [{
                lt: DbPrefixes.V1,
            }, {
                gte: inc(DbPrefixes.V1),
                serial: true,
            }],
        }, {
            v0params: {
                gte: 'foo/bar',
                lt: 'foo/bas',
            },
            v0migparams: {
                gte: 'foo/bar',
                lt: 'foo/bas',
            },
        }, {
            v0params: {
                gt: `foo/bar${inc(VID_SEP)}`,
            },
            v0migparams: [{
                gt: `foo/bar${inc(VID_SEP)}`,
                lt: DbPrefixes.V1,
            }, {
                gte: inc(DbPrefixes.V1),
                serial: true,
            }],
        }, {
            v0params: {
                gt: `foo/bar${VID_SEP}versionId`,
            },
            v0migparams: [{
                gt: `foo/bar${VID_SEP}versionId`,
                lt: DbPrefixes.V1,
            }, {
                gte: inc(DbPrefixes.V1),
                serial: true,
            }],
        }, {
            v0params: {
                gt: `foo/bar/baz${VID_SEP}versionId`,
                lt: 'foo/bas',
            },
            v0migparams: {
                gt: `foo/bar/baz${VID_SEP}versionId`,
                lt: 'foo/bas',
            },
        }, {
            v0params: {
                gt: `éléphant rose${VID_SEP}versionId`,
            },
            v0migparams: {
                gt: `éléphant rose${VID_SEP}versionId`,
            },
        }, {
            v0params: {
                gte: 'éléphant rose',
                lt: 'éléphant rosf',
            },
            v0migparams: {
                gte: 'éléphant rose',
                lt: 'éléphant rosf',
            },
        }, {
            v0params: {
                gt: `${DbPrefixes.V1}foo`,
            },
            v0migparams: {
                gt: inc(DbPrefixes.V1),
            },
        }, {
            v0params: {
                gte: `${DbPrefixes.V1}foo/`,
                lt: `${DbPrefixes.V1}foo0`,
            },
            v0migparams: {
                lt: '',
            },
        }];
    testCases.forEach(({ v0params, v0migparams }) => {
        it(`${JSON.stringify(v0params)} => ${JSON.stringify(v0migparams)}`, () => {
            const converted = listingParamsV0ToV0Mig(v0params);
            assert.deepStrictEqual(converted, v0migparams);
        });
    });
});
