'use strict'; // eslint-disable-line strict

const assert = require('assert');
const Delimiter =
    require('../../../../lib/algos/list/delimiter').Delimiter;
const DelimiterMaster =
    require('../../../../lib/algos/list/delimiterMaster').DelimiterMaster;
const { utf8Compare } = require('../../../../lib/algos/list/tools');
const Werelogs = require('werelogs').Logger;
const logger = new Werelogs('listTest');
const performListing = require('../../../utils/performListing');
const zpad = require('../../helpers').zpad;

class Test {
    constructor(name, input, output, filter) {
        this.name = name;
        this.input = input;
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
    { key: 'utf8order/a', value },
    { key: 'utf8order/\uD7FB', value },
    { key: 'utf8order/\uFB80', value },
    { key: 'utf8order/\uD83D\uDC4F', value },
    { key: 'utf8order/\uD83D\uDC50', value },
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
    { key: 'utf8order/a', value },
    { key: 'utf8order/\uD7FB', value },
    { key: 'utf8order/\uFB80', value },
    { key: 'utf8order/\uD83D\uDC4F', value },
    { key: 'utf8order/\uD83D\uDC50', value },
];
const nonAlphabeticalData = [
    { key: 'zzz', value },
    { key: 'aaa', value },
];

const receivedData = data.map(item => ({ key: item.key, value: item.value }));
const receivedNonAlphaData = nonAlphabeticalData.map(
    item => ({ key: item.key, value: item.value })
);

function createUtf8GreaterThanFilter(startAfter) {
    return e => utf8Compare(e.key, startAfter) > 0;
}

const tests = [
    new Test('all elements', {}, {
        Contents: receivedData,
        CommonPrefixes: [],
        Delimiter: undefined,
        IsTruncated: false,
        NextMarker: undefined,
    }),
    new Test('with valid marker', {
        marker: receivedData[4].key,
    }, {
        Contents: [
            receivedData[5],
            receivedData[6],
            receivedData[7],
            receivedData[8],
            receivedData[9],
            receivedData[10],
            receivedData[11],
            receivedData[12],
            receivedData[13],
            receivedData[14],
        ],
        CommonPrefixes: [],
        Delimiter: undefined,
        IsTruncated: false,
        NextMarker: undefined,
    }, createUtf8GreaterThanFilter(receivedData[4].key)),
    new Test('with bad marker', {
        marker: 'zzzz',
        delimiter: '/',
    }, {
        Contents: [],
        CommonPrefixes: [],
        Delimiter: '/',
        IsTruncated: false,
        NextMarker: undefined,
    }, createUtf8GreaterThanFilter('zzzz')),
    new Test('with makKeys', {
        maxKeys: 3,
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
        Contents: receivedData,
        CommonPrefixes: [],
        Delimiter: undefined,
        IsTruncated: false,
        NextMarker: undefined,
    }),
    new Test('with delimiter', {
        delimiter: '/',
    }, {
        Contents: [
            receivedData[0],
        ],
        CommonPrefixes: ['notes/', 'utf8order/'],
        Delimiter: '/',
        IsTruncated: false,
        NextMarker: undefined,
    }),
    new Test('with long delimiter', {
        delimiter: 'notes/summer',
    }, {
        Contents: [
            receivedData[0],
            receivedData[1],
            receivedData[2],
            receivedData[3],
            receivedData[7],
            receivedData[8],
            receivedData[9],
            receivedData[10],
            receivedData[11],
            receivedData[12],
            receivedData[13],
            receivedData[14],
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
        Contents: [],
        CommonPrefixes: [],
        Delimiter: '/',
        IsTruncated: false,
        NextMarker: undefined,
    }, createUtf8GreaterThanFilter('notes/summer0')),
    new Test('delimiter and prefix (related to #147)', {
        delimiter: '/',
        prefix: 'notes/',
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
        Contents: [
            receivedData[8],
        ],
        CommonPrefixes: [
            'notes/zaphod/',
        ],
        Delimiter: '/',
        IsTruncated: false,
        NextMarker: undefined,
    }, createUtf8GreaterThanFilter('notes/year.txt')),
    new Test('all parameters 1/3', {
        delimiter: '/',
        prefix: 'notes/',
        marker: 'notes/',
        maxKeys: 1,
    }, {
        Contents: [],
        CommonPrefixes: ['notes/spring/'],
        Delimiter: '/',
        IsTruncated: true,
        NextMarker: 'notes/spring/',
    }, createUtf8GreaterThanFilter('notes/')),

    new Test('all parameters 2/3', {
        delimiter: '/',
        prefix: 'notes/', // prefix
        marker: 'notes/spring/',
        maxKeys: 1,
    }, {
        Contents: [],
        CommonPrefixes: ['notes/summer/'],
        Delimiter: '/',
        IsTruncated: true,
        NextMarker: 'notes/summer/',
    }, createUtf8GreaterThanFilter('notes/spring/')),

    new Test('all parameters 3/3', {
        delimiter: '/',
        prefix: 'notes/', // prefix
        marker: 'notes/summer/',
        maxKeys: 1,
    }, {
        Contents: [
            receivedData[7],
        ],
        CommonPrefixes: [],
        Delimiter: '/',
        IsTruncated: true,
        NextMarker: 'notes/year.txt',
    }, createUtf8GreaterThanFilter('notes/summer/')),

    new Test('all parameters 4/3', {
        delimiter: '/',
        prefix: 'notes/', // prefix
        marker: 'notes/year.txt',
        maxKeys: 1,
    }, {
        Contents: [
            receivedData[8],
        ],
        CommonPrefixes: [],
        Delimiter: '/',
        IsTruncated: true,
        NextMarker: 'notes/yore.rs',
    }, createUtf8GreaterThanFilter('notes/year.txt')),

    new Test('all parameters 5/3', {
        delimiter: '/',
        prefix: 'notes/',
        marker: 'notes/yore.rs',
        maxKeys: 1,
    }, {
        Contents: [],
        CommonPrefixes: ['notes/zaphod/'],
        Delimiter: '/',
        IsTruncated: false,
        NextMarker: undefined,
    }, createUtf8GreaterThanFilter('notes/yore.rs')),

    new Test('all elements v2', {
        v2: true,
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
        Contents: [
            receivedData[5],
            receivedData[6],
            receivedData[7],
            receivedData[8],
            receivedData[9],
            receivedData[10],
            receivedData[11],
            receivedData[12],
            receivedData[13],
            receivedData[14],
        ],
        CommonPrefixes: [],
        Delimiter: undefined,
        IsTruncated: false,
        NextContinuationToken: undefined,
    }, createUtf8GreaterThanFilter(receivedData[4].key)),
    new Test('with bad startAfter', {
        startAfter: 'zzzz',
        delimiter: '/',
        v2: true,
    }, {
        Contents: [],
        CommonPrefixes: [],
        Delimiter: '/',
        IsTruncated: false,
        NextContinuationToken: undefined,
    }, createUtf8GreaterThanFilter('zzzz')),
    new Test('with valid continuationToken', {
        continuationToken: receivedData[4].key,
        v2: true,
    }, {
        Contents: [
            receivedData[5],
            receivedData[6],
            receivedData[7],
            receivedData[8],
            receivedData[9],
            receivedData[10],
            receivedData[11],
            receivedData[12],
            receivedData[13],
            receivedData[14],
        ],
        CommonPrefixes: [],
        Delimiter: undefined,
        IsTruncated: false,
        NextContinuationToken: undefined,
    }, createUtf8GreaterThanFilter(receivedData[4].key)),
    new Test('with bad continuationToken', {
        continuationToken: 'zzzz',
        delimiter: '/',
        v2: true,
    }, {
        Contents: [],
        CommonPrefixes: [],
        Delimiter: '/',
        IsTruncated: false,
        NextContinuationToken: undefined,
    }, createUtf8GreaterThanFilter('zzzz')),
    new Test('bad startAfter and good prefix', {
        delimiter: '/',
        prefix: 'notes/summer/',
        startAfter: 'notes/summer0',
    }, {
        Contents: [],
        CommonPrefixes: [],
        Delimiter: '/',
        IsTruncated: false,
        NextMarker: undefined,
    }, createUtf8GreaterThanFilter('notes/summer0')),
    new Test('bad continuation token and good prefix', {
        delimiter: '/',
        prefix: 'notes/summer/',
        continuationToken: 'notes/summer0',
    }, {
        Contents: [],
        CommonPrefixes: [],
        Delimiter: '/',
        IsTruncated: false,
        NextMarker: undefined,
    }, createUtf8GreaterThanFilter('notes/summer0')),

    new Test('no delimiter v2', {
        startAfter: 'notes/year.txt',
        maxKeys: 1,
        v2: true,
    }, {
        Contents: [
            receivedData[8],
        ],
        CommonPrefixes: [],
        Delimiter: undefined,
        IsTruncated: true,
        NextContinuationToken: 'notes/yore.rs',
    }, createUtf8GreaterThanFilter('notes/year.txt')),

    new Test('all parameters v2 1/6', {
        delimiter: '/',
        prefix: 'notes/',
        startAfter: 'notes/',
        maxKeys: 1,
        v2: true,
    }, {
        Contents: [],
        CommonPrefixes: ['notes/spring/'],
        Delimiter: '/',
        IsTruncated: true,
        NextContinuationToken: 'notes/spring/',
    }, createUtf8GreaterThanFilter('notes/')),

    new Test('all parameters v2 2/6', {
        delimiter: '/',
        prefix: 'notes/',
        continuationToken: 'notes/spring/',
        maxKeys: 1,
        v2: true,
    }, {
        Contents: [],
        CommonPrefixes: ['notes/summer/'],
        Delimiter: '/',
        IsTruncated: true,
        NextContinuationToken: 'notes/summer/',
    }, createUtf8GreaterThanFilter('notes/spring/')),

    new Test('all parameters v2 3/5', {
        delimiter: '/',
        prefix: 'notes/',
        continuationToken: 'notes/summer/',
        maxKeys: 1,
        v2: true,
    }, {
        Contents: [
            receivedData[7],
        ],
        CommonPrefixes: [],
        Delimiter: '/',
        IsTruncated: true,
        NextContinuationToken: 'notes/year.txt',
    }, createUtf8GreaterThanFilter('notes/summer/')),

    new Test('all parameters v2 4/5', {
        delimiter: '/',
        prefix: 'notes/',
        startAfter: 'notes/year.txt',
        maxKeys: 1,
        v2: true,
    }, {
        Contents: [
            receivedData[8],
        ],
        CommonPrefixes: [],
        Delimiter: '/',
        IsTruncated: true,
        NextContinuationToken: 'notes/yore.rs',
    }, createUtf8GreaterThanFilter('notes/year.txt')),

    new Test('all parameters v2 5/5', {
        delimiter: '/',
        prefix: 'notes/',
        startAfter: 'notes/yore.rs',
        maxKeys: 1,
        v2: true,
    }, {
        Contents: [],
        CommonPrefixes: ['notes/zaphod/'],
        Delimiter: '/',
        IsTruncated: false,
        NextContinuationToken: undefined,
    }, createUtf8GreaterThanFilter('notes/yore.rs')),

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


describe('Delimiter listing algorithm', () => {
    it('Should return good skipping value for DelimiterMaster', done => {
        const delimiter = new DelimiterMaster({ delimiter: '/' });
        for (let i = 0; i < 100; i++) {
            delimiter.filter({ key: `foo/${zpad(i)}`, value: '{}' });
        }
        assert.strictEqual(delimiter.skipping(), 'foo/');
        done();
    });

    it('Should set Delimiter alphabeticalOrder field to the expected value',
       () => {
           alphabeticalOrderTests.forEach(test => {
               const delimiter = new Delimiter(test.params);
               assert.strictEqual(delimiter.alphabeticalOrder,
                                  test.expectedValue,
                                  `${JSON.stringify(test.params)}`);
           });
       });

    tests.forEach(test => {
        it(`Should list ${test.name}`, done => {
            // Simulate skip scan done by LevelDB
            const d = data.filter(e => test.filter(e));
            const res = performListing(d, Delimiter, test.input, logger);
            assert.deepStrictEqual(res, test.output);
            done();
        });
    });

    tests.forEach(test => {
        it(`Should list master versions ${test.name}`, done => {
            // Simulate skip scan done by LevelDB
            const d = dataVersioned.filter(e => test.filter(e));
            const res = performListing(d, DelimiterMaster, test.input, logger);
            assert.deepStrictEqual(res, test.output);
            done();
        });
    });

    it('Should filter values according to alphabeticalOrder parameter',
       () => {
           let test = new Test('alphabeticalOrder parameter set', {
               delimiter: '/',
               alphabeticalOrder: true,
           }, {
               Contents: [
                   receivedNonAlphaData[0],
               ],
               Delimiter: '/',
               CommonPrefixes: [],
               IsTruncated: false,
               NextMarker: undefined,
           });
           let d = nonAlphabeticalData.filter(e => test.filter(e));
           let res = performListing(d, Delimiter, test.input, logger);
           assert.deepStrictEqual(res, test.output);

           test = new Test('alphabeticalOrder parameter set', {
               delimiter: '/',
               alphabeticalOrder: false,
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
           d = nonAlphabeticalData.filter(e => test.filter(e));
           res = performListing(d, Delimiter, test.input, logger);
           assert.deepStrictEqual(res, test.output);
       });
});
