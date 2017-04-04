'use strict'; // eslint-disable-line strict

const assert = require('assert');
const DelimiterVersions =
    require('../../../../lib/algos/list/delimiterVersions').DelimiterVersions;
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
const foo = '{"versionId":"foo"}';
const bar = '{"versionId":"bar"}';
const qux = '{"versionId":"qux"}';
const valuePHD = '{"isPHD":"true","versionId":"1234567890abcdefg"}';
const valueDeleteMarker = '{"hello":"world","isDeleteMarker":"true"}';
const dataVersioned = [
    { key: 'Pâtisserie=中文-español-English', value: bar },
    { key: 'Pâtisserie=中文-español-English\0bar', value: bar },
    { key: 'Pâtisserie=中文-español-English\0foo', value: foo },
    { key: 'notes/spring/1.txt', value: bar },
    { key: 'notes/spring/1.txt\0bar', value: bar },
    { key: 'notes/spring/1.txt\0foo', value: foo },
    { key: 'notes/spring/1.txt\0qux', value: qux },
    { key: 'notes/spring/2.txt', value: valuePHD },
    { key: 'notes/spring/2.txt\0bar', value: valueDeleteMarker },
    { key: 'notes/spring/2.txt\0foo', value: foo },
    { key: 'notes/spring/march/1.txt',
        value: '{"versionId":"null","isNull":true}' },
    { key: 'notes/spring/march/1.txt\0bar', value: bar },
    { key: 'notes/spring/march/1.txt\0foo', value: foo },
    { key: 'notes/summer/1.txt', value: bar },
    { key: 'notes/summer/1.txt\0bar', value: bar },
    { key: 'notes/summer/1.txt\0foo', value: foo },
    { key: 'notes/summer/2.txt', value: bar },
    { key: 'notes/summer/2.txt\0bar', value: bar },
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
const receivedData = [
    { key: 'Pâtisserie=中文-español-English', value: bar, versionId: 'bar' },
    { key: 'Pâtisserie=中文-español-English', value: foo, versionId: 'foo' },
    { key: 'notes/spring/1.txt', value: bar, versionId: 'bar' },
    { key: 'notes/spring/1.txt', value: foo, versionId: 'foo' },
    { key: 'notes/spring/1.txt', value: qux, versionId: 'qux' },
    { key: 'notes/spring/2.txt', value: valueDeleteMarker, versionId: 'bar' },
    { key: 'notes/spring/2.txt', value: foo, versionId: 'foo' },
    { key: 'notes/spring/march/1.txt',
        value: '{"versionId":"null","isNull":true}', versionId: 'null' },
    { key: 'notes/spring/march/1.txt', value: bar, versionId: 'bar' },
    { key: 'notes/spring/march/1.txt', value: foo, versionId: 'foo' },
    { key: 'notes/summer/1.txt', value: bar, versionId: 'bar' },
    { key: 'notes/summer/1.txt', value: foo, versionId: 'foo' },
    { key: 'notes/summer/2.txt', value: bar, versionId: 'bar' },
    { key: 'notes/summer/4.txt', value: valueDeleteMarker, versionId: 'bar' },
    { key: 'notes/summer/4.txt', value: valueDeleteMarker, versionId: 'foo' },
    { key: 'notes/summer/4.txt', value: valueDeleteMarker, versionId: 'qux' },
    { key: 'notes/summer/444.txt',
        value: valueDeleteMarker, versionId: 'null' },
    { key: 'notes/summer/44444.txt',
        value: valueDeleteMarker, versionId: 'null' },
    { key: 'notes/summer/august/1.txt', value, versionId: 'null' },
    { key: 'notes/year.txt', value, versionId: 'null' },
    { key: 'notes/yore.rs', value, versionId: 'null' },
    { key: 'notes/zaphod/Beeblebrox.txt', value, versionId: 'null' },
];
const tests = [
    new Test('all versions', {}, {
        Versions: receivedData,
        CommonPrefixes: [],
        Delimiter: undefined,
        IsTruncated: false,
        NextKeyMarker: undefined,
        NextVersionIdMarker: undefined,
    }),
    new Test('with valid key marker', {
        keyMarker: receivedData[3].key,
    }, {
        Versions: receivedData.slice(5),
        CommonPrefixes: [],
        Delimiter: undefined,
        IsTruncated: false,
        NextKeyMarker: undefined,
        NextVersionIdMarker: undefined,
    }, (e, input) => e.key > (input.keyMarker + String.fromCharCode(1))),
    new Test('with bad key marker', {
        keyMarker: 'zzzz',
        delimiter: '/',
    }, {
        Versions: [],
        CommonPrefixes: [],
        Delimiter: '/',
        IsTruncated: false,
        NextKeyMarker: undefined,
        NextVersionIdMarker: undefined,
    }, (e, input) => e.key > input.keyMarker),
    new Test('with maxKeys', {
        maxKeys: 3,
    }, {
        Versions: receivedData.slice(0, 3),
        CommonPrefixes: [],
        Delimiter: undefined,
        IsTruncated: true,
        NextKeyMarker: 'notes/spring/1.txt',
        NextVersionIdMarker: 'bar',
    }),
    new Test('with big maxKeys', {
        maxKeys: 15000,
    }, {
        Versions: receivedData,
        CommonPrefixes: [],
        Delimiter: undefined,
        IsTruncated: false,
        NextKeyMarker: undefined,
        NextVersionIdMarker: undefined,
    }),
    new Test('with delimiter', {
        delimiter: '/',
    }, {
        Versions: [
            receivedData[0],
            receivedData[1],
        ],
        CommonPrefixes: ['notes/'],
        Delimiter: '/',
        IsTruncated: false,
        NextKeyMarker: undefined,
        NextVersionIdMarker: undefined,
    }),
    new Test('with long delimiter', {
        delimiter: 'notes/summer',
    }, {
        Versions: receivedData.filter(entry =>
                          entry.key.indexOf('notes/summer') < 0),
        CommonPrefixes: ['notes/summer'],
        Delimiter: 'notes/summer',
        IsTruncated: false,
        NextKeyMarker: undefined,
        NextVersionIdMarker: undefined,
    }),
    new Test('bad key marker and good prefix', {
        delimiter: '/',
        prefix: 'notes/summer/',
        keyMarker: 'notes/summer0',
    }, {
        Versions: [],
        CommonPrefixes: [],
        Delimiter: '/',
        IsTruncated: false,
        NextKeyMarker: undefined,
        NextVersionIdMarker: undefined,
    }, (e, input) => e.key > input.keyMarker),
    new Test('delimiter and prefix (related to #147)', {
        delimiter: '/',
        prefix: 'notes/',
    }, {
        Versions: [
            receivedData[19],
            receivedData[20],
        ],
        CommonPrefixes: [
            'notes/spring/',
            'notes/summer/',
            'notes/zaphod/',
        ],
        Delimiter: '/',
        IsTruncated: false,
        NextKeyMarker: undefined,
        NextVersionIdMarker: undefined,
    }),
    new Test('delimiter, prefix and marker (related to #147)', {
        delimiter: '/',
        prefix: 'notes/',
        keyMarker: 'notes/year.txt',
    }, {
        Versions: [
            receivedData[20],
        ],
        CommonPrefixes: [
            'notes/zaphod/',
        ],
        Delimiter: '/',
        IsTruncated: false,
        NextKeyMarker: undefined,
        NextVersionIdMarker: undefined,
    }, (e, input) => e.key > input.keyMarker),
    new Test('all parameters 1/3', {
        delimiter: '/',
        prefix: 'notes/',
        keyMarker: 'notes/',
        maxKeys: 1,
    }, {
        Versions: [],
        CommonPrefixes: ['notes/spring/'],
        Delimiter: '/',
        IsTruncated: true,
        NextKeyMarker: 'notes/spring/',
        NextVersionIdMarker: undefined,
    }, (e, input) => e.key > input.keyMarker),

    new Test('all parameters 2/3', {
        delimiter: '/',
        prefix: 'notes/', // prefix
        keyMarker: 'notes/spring/',
        maxKeys: 1,
    }, {
        Versions: [],
        CommonPrefixes: ['notes/summer/'],
        Delimiter: '/',
        IsTruncated: true,
        NextKeyMarker: 'notes/summer/',
        NextVersionIdMarker: undefined,
    }, (e, input) => e.key > input.keyMarker),

    new Test('all parameters 3/3', {
        delimiter: '/',
        prefix: 'notes/', // prefix
        keyMarker: 'notes/summer/',
        maxKeys: 1,
    }, {
        Versions: [
            receivedData[19],
        ],
        CommonPrefixes: [],
        Delimiter: '/',
        IsTruncated: true,
        NextKeyMarker: 'notes/year.txt',
        NextVersionIdMarker: receivedData[19].versionId,
    }, (e, input) => e.key > input.keyMarker),

    new Test('all parameters 4/3', {
        delimiter: '/',
        prefix: 'notes/', // prefix
        keyMarker: 'notes/year.txt',
        maxKeys: 1,
    }, {
        Versions: [
            receivedData[20],
        ],
        CommonPrefixes: [],
        Delimiter: '/',
        IsTruncated: true,
        NextKeyMarker: 'notes/yore.rs',
        NextVersionIdMarker: receivedData[20].versionId,
    }, (e, input) => e.key > input.keyMarker),

    new Test('all parameters 5/3', {
        delimiter: '/',
        prefix: 'notes/',
        keyMarker: 'notes/yore.rs',
        maxKeys: 1,
    }, {
        Versions: [],
        CommonPrefixes: ['notes/zaphod/'],
        Delimiter: '/',
        IsTruncated: false,
        NextKeyMarker: undefined,
        NextVersionIdMarker: undefined,
    }, (e, input) => e.key > input.keyMarker),
];

describe('Delimiter All Versions listing algorithm', () => {
    it('Should return good skipping value for DelimiterVersions', done => {
        const delimiter = new DelimiterVersions({ delimiter: '/' });
        for (let i = 0; i < 100; i++) {
            delimiter.filter({ key: `foo/${zpad(i)}`, value: '{}' });
        }
        assert.strictEqual(delimiter.skipping(), 'foo/');
        done();
    });

    tests.forEach(test => {
        it(`Should list ${test.name}`, done => {
            // Simulate skip scan done by LevelDB
            const d = dataVersioned.filter(e => test.filter(e, test.input));
            const res =
                performListing(d, DelimiterVersions, test.input, logger);
            assert.deepStrictEqual(res, test.output);
            done();
        });
    });
});
