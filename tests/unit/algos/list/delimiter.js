'use strict'; // eslint-disable-line strict

const assert = require('assert');
const Delimiter =
    require('../../../../lib/algos/list/delimiter').Delimiter;
const DelimiterMaster =
    require('../../../../lib/algos/list/delimiterMaster').DelimiterMaster;
const Werelogs = require('werelogs').Logger;
const logger = new Werelogs('listTest');
const performListing = require('../../../utils/performListing');
const zpad = require('../../helpers').zpad;
const { inc } = require('../../../../lib/algos/list/tools');
const VSConst = require('../../../../lib/versioning/constants').VersioningConstants;
const { DbPrefixes } = VSConst;

class Test {
    constructor(name, input, genMDParams, output, filter) {
        this.name = name;
        this.input = input;
        this.genMDParams = genMDParams;
        this.output = output;
        this.filter = filter || this._defaultFilter;
    }

    _defaultFilter() {
        return true;
    }
}

const value = '{"hello":"world"}';
const valuePHD = '{"isPHD":"true","versionId":"1234567890abcdefg"}';
const valueDeleteMarker = '{"hello":"world","isDeleteMarker":"true"}';
const data = [
    { key: 'Pâtisserie=中文-español-English', value },
    { key: 'notes/spring/1.txt', value },
    { key: 'notes/spring/2.txt', value },
    { key: 'notes/spring/march/1.txt', value },
    { key: 'notes/summer/1.txt', value },
    { key: 'notes/summer/2.txt', value },
    { key: 'notes/summer/august/1.txt', value },
    { key: 'notes/year.txt', value },
    { key: 'notes/yore.rs', value },
    { key: 'notes/zaphod/Beeblebrox.txt', value },
];

const dataVersioned = [
    { key: 'Pâtisserie=中文-español-English', value },
    { key: 'Pâtisserie=中文-español-English\0bar', value },
    { key: 'Pâtisserie=中文-español-English\0foo', value },
    { key: 'notes/spring/1.txt', value },
    { key: 'notes/spring/1.txt\0bar', value },
    { key: 'notes/spring/1.txt\0foo', value },
    { key: 'notes/spring/1.txt\0qux', value },
    { key: 'notes/spring/2.txt', value: valuePHD },
    { key: 'notes/spring/2.txt\0bar', value: valueDeleteMarker },
    { key: 'notes/spring/2.txt\0foo', value },
    { key: 'notes/spring/3.txt', value: valueDeleteMarker },
    { key: 'notes/spring/3.txt\0foo', value },
    { key: 'notes/spring/march/1.txt', value },
    { key: 'notes/spring/march/1.txt\0bar', value },
    { key: 'notes/spring/march/1.txt\0foo', value },
    { key: 'notes/summer/1.txt', value },
    { key: 'notes/summer/1.txt\0foo', value },
    { key: 'notes/summer/1.txt\0foo', value },
    { key: 'notes/summer/2.txt', value },
    { key: 'notes/summer/2.txt\0bar', value },
    { key: 'notes/summer/4.txt', value: valuePHD },
    { key: 'notes/summer/4.txt\0bar', value: valueDeleteMarker },
    { key: 'notes/summer/4.txt\0foo', value: valueDeleteMarker },
    { key: 'notes/summer/4.txt\0qux', value: valueDeleteMarker },
    { key: 'notes/summer/44.txt', value: valuePHD },
    { key: 'notes/summer/444.txt', value: valueDeleteMarker },
    { key: 'notes/summer/4444.txt', value: valuePHD },
    { key: 'notes/summer/44444.txt', value: valueDeleteMarker },
    { key: 'notes/summer/444444.txt', value: valuePHD },
    { key: 'notes/summer/august/1.txt', value },
    { key: 'notes/year.txt', value },
    { key: 'notes/yore.rs', value },
    { key: 'notes/zaphod/Beeblebrox.txt', value },
];
const nonAlphabeticalData = [
    { key: 'zzz', value },
    { key: 'aaa', value },
];

const receivedData = data.map(item => ({ key: item.key, value: item.value }));
const receivedNonAlphaData = nonAlphabeticalData.map(
    item => ({ key: item.key, value: item.value })
);

const tests = [
    new Test('all elements', {}, {
        v0: {},
        v1: {
            gte: DbPrefixes.Master,
            lt: inc(DbPrefixes.Master),
        },
    }, {
        Contents: receivedData,
        CommonPrefixes: [],
        Delimiter: undefined,
        IsTruncated: false,
        NextMarker: undefined,
    }),
    new Test('with valid marker', {
        marker: receivedData[4].key,
    }, {
        v0: {
            gt: receivedData[4].key,
        },
        v1: {
            gt: `${DbPrefixes.Master}${receivedData[4].key}`,
            lt: inc(DbPrefixes.Master),
        },
    }, {
        Contents: [
            receivedData[5],
            receivedData[6],
            receivedData[7],
            receivedData[8],
            receivedData[9],
        ],
        CommonPrefixes: [],
        Delimiter: undefined,
        IsTruncated: false,
        NextMarker: undefined,
    }, (e, input) => e.key > input.marker),
    new Test('with bad marker', {
        marker: 'zzzz',
        delimiter: '/',
    }, {
        v0: {
            gt: 'zzzz',
        },
        v1: {
            gt: `${DbPrefixes.Master}zzzz`,
            lt: inc(DbPrefixes.Master),
        },
    }, {
        Contents: [],
        CommonPrefixes: [],
        Delimiter: '/',
        IsTruncated: false,
        NextMarker: undefined,
    }, (e, input) => e.key > input.marker),
    new Test('with makKeys', {
        maxKeys: 3,
    }, {
        v0: {},
        v1: {
            gte: DbPrefixes.Master,
            lt: inc(DbPrefixes.Master),
        },
    }, {
        Contents: receivedData.slice(0, 3),
        CommonPrefixes: [],
        Delimiter: undefined,
        IsTruncated: true,
        NextMarker: undefined,
    }),
    new Test('with big makKeys', {
        maxKeys: 15000,
    }, {
        v0: {},
        v1: {
            gte: DbPrefixes.Master,
            lt: inc(DbPrefixes.Master),
        },
    }, {
        Contents: receivedData,
        CommonPrefixes: [],
        Delimiter: undefined,
        IsTruncated: false,
        NextMarker: undefined,
    }),
    new Test('with delimiter', {
        delimiter: '/',
    }, {
        v0: {},
        v1: {
            gte: DbPrefixes.Master,
            lt: inc(DbPrefixes.Master),
        },
    }, {
        Contents: [
            receivedData[0],
        ],
        CommonPrefixes: ['notes/'],
        Delimiter: '/',
        IsTruncated: false,
        NextMarker: undefined,
    }),
    new Test('with long delimiter', {
        delimiter: 'notes/summer',
    }, {
        v0: {},
        v1: {
            gte: DbPrefixes.Master,
            lt: inc(DbPrefixes.Master),
        },
    }, {
        Contents: [
            receivedData[0],
            receivedData[1],
            receivedData[2],
            receivedData[3],
            receivedData[7],
            receivedData[8],
            receivedData[9],
        ],
        CommonPrefixes: ['notes/summer'],
        Delimiter: 'notes/summer',
        IsTruncated: false,
        NextMarker: undefined,
    }),
    new Test('bad marker and good prefix', {
        delimiter: '/',
        prefix: 'notes/summer/',
        marker: 'notes/summer0',
    }, {
        v0: {
            gt: `notes/summer${inc('/')}`,
            lt: `notes/summer${inc('/')}`,
        },
        v1: {
            gt: `${DbPrefixes.Master}notes/summer${inc('/')}`,
            lt: `${DbPrefixes.Master}notes/summer${inc('/')}`,
        },
    }, {
        Contents: [],
        CommonPrefixes: [],
        Delimiter: '/',
        IsTruncated: false,
        NextMarker: undefined,
    }, (e, input) => e.key > input.marker),
    new Test('delimiter and prefix (related to #147)', {
        delimiter: '/',
        prefix: 'notes/',
    }, {
        v0: {
            gte: 'notes/',
            lt: `notes${inc('/')}`,
        },
        v1: {
            gte: `${DbPrefixes.Master}notes/`,
            lt: `${DbPrefixes.Master}notes${inc('/')}`,
        },
    }, {
        Contents: [
            receivedData[7],
            receivedData[8],
        ],
        CommonPrefixes: [
            'notes/spring/',
            'notes/summer/',
            'notes/zaphod/',
        ],
        Delimiter: '/',
        IsTruncated: false,
        NextMarker: undefined,
    }),
    new Test('delimiter, prefix and marker (related to #147)', {
        delimiter: '/',
        prefix: 'notes/',
        marker: 'notes/year.txt',
    }, {
        v0: {
            gt: 'notes/year.txt',
            lt: `notes${inc('/')}`,
        },
        v1: {
            gt: `${DbPrefixes.Master}notes/year.txt`,
            lt: `${DbPrefixes.Master}notes${inc('/')}`,
        },
    }, {
        Contents: [
            receivedData[8],
        ],
        CommonPrefixes: [
            'notes/zaphod/',
        ],
        Delimiter: '/',
        IsTruncated: false,
        NextMarker: undefined,
    }, (e, input) => e.key > input.marker),
    new Test('all parameters 1/3', {
        delimiter: '/',
        prefix: 'notes/',
        marker: 'notes/',
        maxKeys: 1,
    }, {
        v0: {
            gt: 'notes/',
            lt: `notes${inc('/')}`,
        },
        v1: {
            gt: `${DbPrefixes.Master}notes/`,
            lt: `${DbPrefixes.Master}notes${inc('/')}`,
        },
    }, {
        Contents: [],
        CommonPrefixes: ['notes/spring/'],
        Delimiter: '/',
        IsTruncated: true,
        NextMarker: 'notes/spring/',
    }, (e, input) => e.key > input.marker),

    new Test('all parameters 2/3', {
        delimiter: '/',
        prefix: 'notes/', // prefix
        marker: 'notes/spring/',
        maxKeys: 1,
    }, {
        v0: {
            gt: 'notes/spring/',
            lt: `notes${inc('/')}`,
        },
        v1: {
            gt: `${DbPrefixes.Master}notes/spring/`,
            lt: `${DbPrefixes.Master}notes${inc('/')}`,
        },
    }, {
        Contents: [],
        CommonPrefixes: ['notes/summer/'],
        Delimiter: '/',
        IsTruncated: true,
        NextMarker: 'notes/summer/',
    }, (e, input) => e.key > input.marker),

    new Test('all parameters 3/3', {
        delimiter: '/',
        prefix: 'notes/', // prefix
        marker: 'notes/summer/',
        maxKeys: 1,
    }, {
        v0: {
            gt: 'notes/summer/',
            lt: `notes${inc('/')}`,
        },
        v1: {
            gt: `${DbPrefixes.Master}notes/summer/`,
            lt: `${DbPrefixes.Master}notes${inc('/')}`,
        },
    }, {
        Contents: [
            receivedData[7],
        ],
        CommonPrefixes: [],
        Delimiter: '/',
        IsTruncated: true,
        NextMarker: 'notes/year.txt',
    }, (e, input) => e.key > input.marker),

    new Test('all parameters 4/3', {
        delimiter: '/',
        prefix: 'notes/', // prefix
        marker: 'notes/year.txt',
        maxKeys: 1,
    }, {
        v0: {
            gt: 'notes/year.txt',
            lt: `notes${inc('/')}`,
        },
        v1: {
            gt: `${DbPrefixes.Master}notes/year.txt`,
            lt: `${DbPrefixes.Master}notes${inc('/')}`,
        },
    }, {
        Contents: [
            receivedData[8],
        ],
        CommonPrefixes: [],
        Delimiter: '/',
        IsTruncated: true,
        NextMarker: 'notes/yore.rs',
    }, (e, input) => e.key > input.marker),

    new Test('all parameters 5/3', {
        delimiter: '/',
        prefix: 'notes/',
        marker: 'notes/yore.rs',
        maxKeys: 1,
    }, {
        v0: {
            gt: 'notes/yore.rs',
            lt: `notes${inc('/')}`,
        },
        v1: {
            gt: `${DbPrefixes.Master}notes/yore.rs`,
            lt: `${DbPrefixes.Master}notes${inc('/')}`,
        },
    }, {
        Contents: [],
        CommonPrefixes: ['notes/zaphod/'],
        Delimiter: '/',
        IsTruncated: false,
        NextMarker: undefined,
    }, (e, input) => e.key > input.marker),

    new Test('all elements v2', {
        v2: true,
    }, {
        v0: {},
        v1: {
            gte: DbPrefixes.Master,
            lt: inc(DbPrefixes.Master),
        },
    }, {
        Contents: receivedData,
        CommonPrefixes: [],
        Delimiter: undefined,
        IsTruncated: false,
        NextContinuationToken: undefined,
    }),
    new Test('with valid startAfter', {
        startAfter: receivedData[4].key,
        v2: true,
    }, {
        v0: {
            gt: receivedData[4].key,
        },
        v1: {
            gt: `${DbPrefixes.Master}${receivedData[4].key}`,
            lt: inc(DbPrefixes.Master),
        },
    }, {
        Contents: [
            receivedData[5],
            receivedData[6],
            receivedData[7],
            receivedData[8],
            receivedData[9],
        ],
        CommonPrefixes: [],
        Delimiter: undefined,
        IsTruncated: false,
        NextContinuationToken: undefined,
    }, (e, input) => e.key > input.startAfter),
    new Test('with bad startAfter', {
        startAfter: 'zzzz',
        delimiter: '/',
        v2: true,
    }, {
        v0: {
            gt: 'zzzz',
        },
        v1: {
            gt: `${DbPrefixes.Master}zzzz`,
            lt: inc(DbPrefixes.Master),
        },
    }, {
        Contents: [],
        CommonPrefixes: [],
        Delimiter: '/',
        IsTruncated: false,
        NextContinuationToken: undefined,
    }, (e, input) => e.key > input.startAfter),
    new Test('with valid continuationToken', {
        continuationToken: receivedData[4].key,
        v2: true,
    }, {
        v0: {
            gt: receivedData[4].key,
        },
        v1: {
            gt: `${DbPrefixes.Master}${receivedData[4].key}`,
            lt: inc(DbPrefixes.Master),
        },
    }, {
        Contents: [
            receivedData[5],
            receivedData[6],
            receivedData[7],
            receivedData[8],
            receivedData[9],
        ],
        CommonPrefixes: [],
        Delimiter: undefined,
        IsTruncated: false,
        NextContinuationToken: undefined,
    }, (e, input) => e.key > input.continuationToken),
    new Test('with bad continuationToken', {
        continuationToken: 'zzzz',
        delimiter: '/',
        v2: true,
    }, {
        v0: {
            gt: 'zzzz',
        },
        v1: {
            gt: `${DbPrefixes.Master}zzzz`,
            lt: inc(DbPrefixes.Master),
        },
    }, {
        Contents: [],
        CommonPrefixes: [],
        Delimiter: '/',
        IsTruncated: false,
        NextContinuationToken: undefined,
    }, (e, input) => e.key > input.continuationToken),
    new Test('bad startAfter and good prefix', {
        delimiter: '/',
        prefix: 'notes/summer/',
        startAfter: 'notes/summer0',
    }, {
        v0: {
            gte: 'notes/summer/',
            lt: `notes/summer${inc('/')}`,
        },
        v1: {
            gte: `${DbPrefixes.Master}notes/summer/`,
            lt: `${DbPrefixes.Master}notes/summer${inc('/')}`,
        },
    }, {
        Contents: [],
        CommonPrefixes: [],
        Delimiter: '/',
        IsTruncated: false,
        NextMarker: undefined,
    }, (e, input) => e.key > input.startAfter),
    new Test('bad continuation token and good prefix', {
        delimiter: '/',
        prefix: 'notes/summer/',
        continuationToken: 'notes/summer0',
    }, {
        v0: {
            gte: 'notes/summer/',
            lt: `notes/summer${inc('/')}`,
        },
        v1: {
            gte: `${DbPrefixes.Master}notes/summer/`,
            lt: `${DbPrefixes.Master}notes/summer${inc('/')}`,
        },
    }, {
        Contents: [],
        CommonPrefixes: [],
        Delimiter: '/',
        IsTruncated: false,
        NextMarker: undefined,
    }, (e, input) => e.key > input.continuationToken),

    new Test('no delimiter v2', {
        startAfter: 'notes/year.txt',
        maxKeys: 1,
        v2: true,
    }, {
        v0: {
            gt: 'notes/year.txt',
        },
        v1: {
            gt: `${DbPrefixes.Master}notes/year.txt`,
            lt: inc(DbPrefixes.Master),
        },
    }, {
        Contents: [
            receivedData[8],
        ],
        CommonPrefixes: [],
        Delimiter: undefined,
        IsTruncated: true,
        NextContinuationToken: 'notes/yore.rs',
    }, (e, input) => e.key > input.startAfter),

    new Test('all parameters v2 1/6', {
        delimiter: '/',
        prefix: 'notes/',
        startAfter: 'notes/',
        maxKeys: 1,
        v2: true,
    }, {
        v0: {
            gt: 'notes/',
            lt: `notes${inc('/')}`,
        },
        v1: {
            gt: `${DbPrefixes.Master}notes/`,
            lt: `${DbPrefixes.Master}notes${inc('/')}`,
        },
    }, {
        Contents: [],
        CommonPrefixes: ['notes/spring/'],
        Delimiter: '/',
        IsTruncated: true,
        NextContinuationToken: 'notes/spring/',
    }, (e, input) => e.key > input.startAfter),

    new Test('all parameters v2 2/6', {
        delimiter: '/',
        prefix: 'notes/',
        continuationToken: 'notes/spring/',
        maxKeys: 1,
        v2: true,
    }, {
        v0: {
            gt: 'notes/spring/',
            lt: `notes${inc('/')}`,
        },
        v1: {
            gt: `${DbPrefixes.Master}notes/spring/`,
            lt: `${DbPrefixes.Master}notes${inc('/')}`,
        },
    }, {
        Contents: [],
        CommonPrefixes: ['notes/summer/'],
        Delimiter: '/',
        IsTruncated: true,
        NextContinuationToken: 'notes/summer/',
    }, (e, input) => e.key > input.continuationToken),

    new Test('all parameters v2 3/5', {
        delimiter: '/',
        prefix: 'notes/',
        continuationToken: 'notes/summer/',
        maxKeys: 1,
        v2: true,
    }, {
        v0: {
            gt: 'notes/summer/',
            lt: `notes${inc('/')}`,
        },
        v1: {
            gt: `${DbPrefixes.Master}notes/summer/`,
            lt: `${DbPrefixes.Master}notes${inc('/')}`,
        },
    }, {
        Contents: [
            receivedData[7],
        ],
        CommonPrefixes: [],
        Delimiter: '/',
        IsTruncated: true,
        NextContinuationToken: 'notes/year.txt',
    }, (e, input) => e.key > input.continuationToken),

    new Test('all parameters v2 4/5', {
        delimiter: '/',
        prefix: 'notes/',
        startAfter: 'notes/year.txt',
        maxKeys: 1,
        v2: true,
    }, {
        v0: {
            gt: 'notes/year.txt',
            lt: `notes${inc('/')}`,
        },
        v1: {
            gt: `${DbPrefixes.Master}notes/year.txt`,
            lt: `${DbPrefixes.Master}notes${inc('/')}`,
        },
    }, {
        Contents: [
            receivedData[8],
        ],
        CommonPrefixes: [],
        Delimiter: '/',
        IsTruncated: true,
        NextContinuationToken: 'notes/yore.rs',
    }, (e, input) => e.key > input.startAfter),

    new Test('all parameters v2 5/5', {
        delimiter: '/',
        prefix: 'notes/',
        startAfter: 'notes/yore.rs',
        maxKeys: 1,
        v2: true,
    }, {
        v0: {
            gt: 'notes/yore.rs',
            lt: `notes${inc('/')}`,
        },
        v1: {
            gt: `${DbPrefixes.Master}notes/yore.rs`,
            lt: `${DbPrefixes.Master}notes${inc('/')}`,
        },
    }, {
        Contents: [],
        CommonPrefixes: ['notes/zaphod/'],
        Delimiter: '/',
        IsTruncated: false,
        NextContinuationToken: undefined,
    }, (e, input) => e.key > input.startAfter),

];

const alphabeticalOrderTests = [
    {
        params: {},
        expectedValue: true,
    }, {
        params: {
            alphabeticalOrder: undefined,
        },
        expectedValue: true,
    }, {
        params: {
            alphabeticalOrder: true,
        },
        expectedValue: true,
    }, {
        params: {
            alphabeticalOrder: false,
        },
        expectedValue: false,
    },
];

function getTestListing(test, data, vFormat) {
    return data
        .filter(e => test.filter(e, test.input))
        .map(obj => {
            if (vFormat === 'v0') {
                return obj;
            }
            if (vFormat === 'v1') {
                return {
                    key: `${DbPrefixes.Master}${obj.key}`,
                    value: obj.value,
                };
            }
            return assert.fail(`bad format ${vFormat}`);
        });
}

['v0', 'v1'].forEach(vFormat => {
    describe(`vFormat=${vFormat} Delimiter listing algorithm`, () => {
        it('Should return good skipping value for DelimiterMaster', () => {
            const delimiter = new DelimiterMaster({ delimiter: '/' });
            for (let i = 0; i < 100; i++) {
                delimiter.filter({
                    key: `${vFormat === 'v1' ? DbPrefixes.Master : ''}foo/${zpad(i)}`,
                    value: '{}',
                });
            }
            assert.strictEqual(delimiter.skipping(),
                               `${vFormat === 'v1' ? DbPrefixes.Master : ''}foo/`);
        });

        it('Should set Delimiter alphabeticalOrder field to the expected value', () => {
            alphabeticalOrderTests.forEach(test => {
                const delimiter = new Delimiter(test.params);
                assert.strictEqual(delimiter.alphabeticalOrder,
                                   test.expectedValue,
                                   `${JSON.stringify(test.params)}`);
            });
        });

        tests.forEach(test => {
            it(`Should return metadata listing params to list ${test.name}`, () => {
                const listing = new Delimiter(test.input, logger, vFormat);
                const params = listing.genMDParams();
                assert.deepStrictEqual(params, test.genMDParams[vFormat]);
            });
            it(`Should list ${test.name}`, () => {
                // Simulate skip scan done by LevelDB
                const d = getTestListing(test, data, vFormat);
                const res = performListing(d, Delimiter, test.input, logger, vFormat);
                assert.deepStrictEqual(res, test.output);
            });
        });

        // Only v0 gets a listing of master and version keys together.
        if (vFormat === 'v0') {
            tests.forEach(test => {
                it(`Should list master versions ${test.name}`, () => {
                    // Simulate skip scan done by LevelDB
                    const d = dataVersioned.filter(e => test.filter(e, test.input));
                    const res = performListing(d, DelimiterMaster, test.input, logger, vFormat);
                    assert.deepStrictEqual(res, test.output);
                });
            });
        }

        it('Should filter values according to alphabeticalOrder parameter', () => {
            let test = new Test('alphabeticalOrder parameter set', {
                delimiter: '/',
                alphabeticalOrder: true,
            }, {
            }, {
                Contents: [
                    receivedNonAlphaData[0],
                ],
                Delimiter: '/',
                CommonPrefixes: [],
                IsTruncated: false,
                NextMarker: undefined,
            });
            let d = getTestListing(test, nonAlphabeticalData, vFormat);
            let res = performListing(d, Delimiter, test.input, logger, vFormat);
            assert.deepStrictEqual(res, test.output);

            test = new Test('alphabeticalOrder parameter set', {
                delimiter: '/',
                alphabeticalOrder: false,
            }, {
            }, {
                Contents: [
                    receivedNonAlphaData[0],
                    receivedNonAlphaData[1],
                ],
                Delimiter: '/',
                CommonPrefixes: [],
                IsTruncated: false,
                NextMarker: undefined,
            });
            d = getTestListing(test, nonAlphabeticalData, vFormat);
            res = performListing(d, Delimiter, test.input, logger, vFormat);
            assert.deepStrictEqual(res, test.output);
        });
    });
});
