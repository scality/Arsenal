'use strict'; // eslint-disable-line strict

const assert = require('assert');
const DelimiterVersions =
    require('../../../../lib/algos/list/delimiterVersions').DelimiterVersions;
const Werelogs = require('werelogs').Logger;
const logger = new Werelogs('listTest');
const performListing = require('../../../utils/performListing');
const VSConst =
    require('../../../../lib/versioning/constants').VersioningConstants;
const VER = VSConst.VERSIONING_AFFIXES.OTHER_VERSION_PREFIX;
const SEP = VSConst.VERSIONING_AFFIXES.SEPARATOR;

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

describe.skip('DelimiterVersions listing algorithm', () => {
    const VersionIdMarker = '1234567890';
    const value = '{}';
    const data = [
        { key: 'V|/notes/spring/1.txt|1234567890', value: '{}' },
        { key: 'V|/notes/spring/2.txt|1234567890', value: '{}' },
        { key: 'V|/notes/spring/march/1.txt|1234567890', value: '{}' },
        { key: 'V|/notes/summer/1.txt|1234567890', value: '{}' },
        { key: 'V|/notes/summer/2.txt|1234567890', value: '{}' },
        { key: 'V|/notes/summer/august/1.txt|1234567890', value: '{}' },
        { key: 'V|/notes/year.txt|1234567890', value: '{}' },
        { key: 'V|/Pâtisserie=中文-español-English|1234567890', value: '{}' },
    ];
    const receivedData = [
        { key: '/notes/spring/1.txt', value },
        { key: '/notes/spring/2.txt', value },
        { key: '/notes/spring/march/1.txt', value },
        { key: '/notes/summer/1.txt', value },
        { key: '/notes/summer/2.txt', value },
        { key: '/notes/summer/august/1.txt', value },
        { key: '/notes/year.txt', value },
        { key: '/Pâtisserie=中文-español-English', value },
    ];
    const tests = [
        new Test('all elements', {}, {
            Contents: receivedData,
            CommonPrefixes: [],
            Delimiter: undefined,
            IsTruncated: false,
            LatestVersions: undefined,
            NextMarker: undefined,
            NextVersionMarker: undefined,
        }),
        new Test('with valid marker', {
            gt: '/notes/summer/1.txt',
            delimiter: '/',
        }, {
            Contents: [
                receivedData[4],
                receivedData[6],
            ],
            CommonPrefixes: ['/notes/summer/august/'],
            Delimiter: '/',
            IsTruncated: false,
            LatestVersions: undefined,
            NextMarker: undefined,
            NextVersionMarker: undefined,
        }, (e, input) => e.key > VER + input.gt + SEP + VersionIdMarker),
        new Test('with bad marker', {
            gt: 'zzzz',
            delimiter: '/',
        }, {
            Contents: [],
            CommonPrefixes: [],
            Delimiter: '/',
            IsTruncated: false,
            LatestVersions: undefined,
            NextMarker: undefined,
            NextVersionMarker: undefined,
        }, (e, input) => e.key > VER + input.gt + SEP + VersionIdMarker),
        new Test('with prefix', {
            start: '/notes/summer/',
            lt: '/notes/summer0',
            delimiter: '/',
        }, {
            Contents: receivedData.slice(3, 5),
            CommonPrefixes: ['/notes/summer/august/'],
            Delimiter: '/',
            IsTruncated: false,
            LatestVersions: undefined,
            NextMarker: undefined,
            NextVersionMarker: undefined,
        }, (e, input) => e.key > VER + input.start && e.key < VER + input.lt),
        new Test('with bad prefix', {
            start: 'zzzy',
            lt: 'zzzz',
            delimiter: '/',
        }, {
            Contents: [],
            CommonPrefixes: [],
            Delimiter: '/',
            IsTruncated: false,
            LatestVersions: undefined,
            NextMarker: undefined,
            NextVersionMarker: undefined,
        }, (e, input) => e.key > VER + input.start && e.key < VER + input.lt),
        new Test('with makKeys', {
            maxKeys: 3,
        }, {
            Contents: receivedData.slice(0, 3),
            CommonPrefixes: [],
            Delimiter: undefined,
            IsTruncated: true,
            LatestVersions: undefined,
            NextMarker: '/notes/spring/march/1.txt',
            NextVersionMarker: '1234567890',
        }),
        new Test('with big makKeys', {
            maxKeys: 15000,
        }, {
            Contents: receivedData,
            CommonPrefixes: [],
            Delimiter: undefined,
            IsTruncated: false,
            LatestVersions: undefined,
            NextMarker: undefined,
            NextVersionMarker: undefined,
        }),
        new Test('with delimiter', {
            delimiter: '/',
        }, {
            Contents: [],
            CommonPrefixes: ['/'],
            Delimiter: '/',
            IsTruncated: false,
            LatestVersions: undefined,
            NextMarker: undefined,
            NextVersionMarker: undefined,
        }),
        new Test('with long delimiter', {
            delimiter: '/notes/summer',
        }, {
            Contents: [
                receivedData[0],
                receivedData[1],
                receivedData[2],
                receivedData[6],
                receivedData[7],
            ],
            CommonPrefixes: ['/notes/summer'],
            Delimiter: '/notes/summer',
            IsTruncated: false,
            LatestVersions: undefined,
            NextMarker: undefined,
            NextVersionMarker: undefined,
        }),
        new Test('with delimiter and prefix', {
            delimiter: '/',
            start: '/notes/',
            lt: '/notes0',
        }, {
            Contents: [receivedData[6]],
            CommonPrefixes: ['/notes/spring/', '/notes/summer/'],
            Delimiter: '/',
            IsTruncated: false,
            LatestVersions: undefined,
            NextMarker: undefined,
            NextVersionMarker: undefined,
        }, (e, input) => e.key > VER + input.start && e.key < VER + input.lt),
    ];
    tests.forEach(test => {
        it(`Should list ${test.name}`, done => {
            // Simulate skip scan done by LevelDB
            const d = data.filter(e => test.filter(e, test.input));
            const res = performListing(d, DelimiterVersions, test.input,
                logger);
            assert.deepStrictEqual(res, test.output);
            done();
        });
    });
});
