'use strict'; // eslint-disable-line strict

const assert = require('assert');
const DelimiterVersions =
    require('../../../../lib/algos/list/delimiterVersions').DelimiterVersions;
const {
    FILTER_ACCEPT,
    FILTER_SKIP,
    SKIP_NONE,
    inc,
} = require('../../../../lib/algos/list/tools');
const Werelogs = require('werelogs').Logger;
const logger = new Werelogs('listTest');
const performListing = require('../../../utils/performListing');
const zpad = require('../../helpers').zpad;
const VSConst = require('../../../../lib/versioning/constants').VersioningConstants;
const Version = require('../../../../lib/versioning/Version').Version;
const { generateVersionId } = require('../../../../lib/versioning/VersionID');
const { DbPrefixes } = VSConst;
const VID_SEP = VSConst.VersionId.Separator;
const EmptyResult = {
    Versions: [],
    CommonPrefixes: [],
    IsTruncated: false,
    NextKeyMarker: undefined,
    NextVersionIdMarker: undefined,
    Delimiter: undefined,
};

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
const foo = '{"versionId":"foo"}';
const bar = '{"versionId":"bar"}';
const qux = '{"versionId":"qux"}';
const valuePHD = '{"isPHD":"true","versionId":"1234567890abcdefg"}';
const valueDeleteMarker = '{"hello":"world","isDeleteMarker":"true"}';
const dataVersioned = {
    v0: [
        { key: 'Pâtisserie=中文-español-English', value: bar },
        { key: `Pâtisserie=中文-español-English${VID_SEP}bar`, value: bar },
        { key: `Pâtisserie=中文-español-English${VID_SEP}foo`, value: foo },
        { key: 'notes/spring/1.txt', value: bar },
        { key: `notes/spring/1.txt${VID_SEP}bar`, value: bar },
        { key: `notes/spring/1.txt${VID_SEP}foo`, value: foo },
        { key: `notes/spring/1.txt${VID_SEP}qux`, value: qux },
        { key: 'notes/spring/2.txt', value: valuePHD },
        { key: `notes/spring/2.txt${VID_SEP}bar`, value: valueDeleteMarker },
        { key: `notes/spring/2.txt${VID_SEP}foo`, value: foo },
        { key: 'notes/spring/march/1.txt',
          value: '{"versionId":"null","isNull":true}' },
        { key: `notes/spring/march/1.txt${VID_SEP}bar`, value: bar },
        { key: `notes/spring/march/1.txt${VID_SEP}foo`, value: foo },
        { key: 'notes/summer/1.txt', value: bar },
        { key: `notes/summer/1.txt${VID_SEP}bar`, value: bar },
        { key: `notes/summer/1.txt${VID_SEP}foo`, value: foo },
        { key: 'notes/summer/2.txt', value: bar },
        { key: `notes/summer/2.txt${VID_SEP}bar`, value: bar },
        { key: 'notes/summer/4.txt', value: valuePHD },
        { key: `notes/summer/4.txt${VID_SEP}bar`, value: valueDeleteMarker },
        { key: `notes/summer/4.txt${VID_SEP}foo`, value: valueDeleteMarker },
        { key: `notes/summer/4.txt${VID_SEP}qux`, value: valueDeleteMarker },
        { key: 'notes/summer/44.txt', value: valuePHD },
        { key: 'notes/summer/444.txt', value: valueDeleteMarker },
        { key: 'notes/summer/4444.txt', value: valuePHD },
        { key: 'notes/summer/44444.txt', value: valueDeleteMarker },
        { key: 'notes/summer/444444.txt', value: valuePHD },
        { key: 'notes/summer/august/1.txt', value },
        { key: 'notes/year.txt', value },
        { key: 'notes/yore.rs', value },
        { key: 'notes/zaphod/Beeblebrox.txt', value },
    ],
    v1: [ // we add M and V prefixes in getTestListing() due to the
          // test cases needing the original key to filter
        { key: 'Pâtisserie=中文-español-English', value: bar },
        { key: `Pâtisserie=中文-español-English${VID_SEP}bar`, value: bar },
        { key: `Pâtisserie=中文-español-English${VID_SEP}foo`, value: foo },
        { key: 'notes/spring/1.txt', value: bar },
        { key: `notes/spring/1.txt${VID_SEP}bar`, value: bar },
        { key: `notes/spring/1.txt${VID_SEP}foo`, value: foo },
        { key: `notes/spring/1.txt${VID_SEP}qux`, value: qux },
        { key: `notes/spring/2.txt${VID_SEP}bar`, value: valueDeleteMarker },
        { key: `notes/spring/2.txt${VID_SEP}foo`, value: foo },
        { key: 'notes/spring/march/1.txt',
          value: '{"versionId":"null","isNull":true}' },
        { key: `notes/spring/march/1.txt${VID_SEP}bar`, value: bar },
        { key: `notes/spring/march/1.txt${VID_SEP}foo`, value: foo },
        { key: 'notes/summer/1.txt', value: bar },
        { key: `notes/summer/1.txt${VID_SEP}bar`, value: bar },
        { key: `notes/summer/1.txt${VID_SEP}foo`, value: foo },
        { key: 'notes/summer/2.txt', value: bar },
        { key: `notes/summer/2.txt${VID_SEP}bar`, value: bar },
        { key: `notes/summer/4.txt${VID_SEP}bar`, value: valueDeleteMarker },
        { key: `notes/summer/4.txt${VID_SEP}foo`, value: valueDeleteMarker },
        { key: `notes/summer/4.txt${VID_SEP}qux`, value: valueDeleteMarker },
        // Compared to v0, the two following keys are version keys
        // that we give a version ID, because delete markers do not
        // have a master key in v1.
        { key: `notes/summer/444.txt${VID_SEP}null`, value: valueDeleteMarker },
        { key: `notes/summer/44444.txt${VID_SEP}null`, value: valueDeleteMarker },
        { key: 'notes/summer/august/1.txt', value },
        { key: 'notes/year.txt', value },
        { key: 'notes/yore.rs', value },
        { key: 'notes/zaphod/Beeblebrox.txt', value },
    ],
};
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
        v0: {},
        v1: [{ gte: DbPrefixes.Master, lt: inc(DbPrefixes.Master) },
             { gte: DbPrefixes.Version, lt: inc(DbPrefixes.Version) }],
    }, {
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
        v0: {
            gt: `${receivedData[3].key}\u0001`,
        },
        v1: [{
            gt: `${DbPrefixes.Master}${receivedData[3].key}${inc(VID_SEP)}`,
            lt: inc(DbPrefixes.Master),
        }, {
            gt: `${DbPrefixes.Version}${receivedData[3].key}${inc(VID_SEP)}`,
            lt: inc(DbPrefixes.Version),
        }],
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
        v0: {
            gt: `zzzz${inc(VID_SEP)}`,
        },
        v1: [{
            gt: `${DbPrefixes.Master}zzzz${inc(VID_SEP)}`,
            lt: inc(DbPrefixes.Master),
        }, {
            gt: `${DbPrefixes.Version}zzzz${inc(VID_SEP)}`,
            lt: inc(DbPrefixes.Version),
        }],
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
        v0: {},
        v1: [{
            gte: DbPrefixes.Master,
            lt: inc(DbPrefixes.Master),
        }, {
            gte: DbPrefixes.Version,
            lt: inc(DbPrefixes.Version),
        }],
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
        v0: {},
        v1: [{
            gte: DbPrefixes.Master,
            lt: inc(DbPrefixes.Master),
        }, {
            gte: DbPrefixes.Version,
            lt: inc(DbPrefixes.Version),
        }],
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
        v0: {},
        v1: [{
            gte: DbPrefixes.Master,
            lt: inc(DbPrefixes.Master),
        }, {
            gte: DbPrefixes.Version,
            lt: inc(DbPrefixes.Version),
        }],
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
        v0: {},
        v1: [{
            gte: DbPrefixes.Master,
            lt: inc(DbPrefixes.Master),
        }, {
            gte: DbPrefixes.Version,
            lt: inc(DbPrefixes.Version),
        }],
    }, {
        Versions: receivedData.filter(entry =>
                          entry.key.indexOf('notes/summer') < 0),
        CommonPrefixes: ['notes/summer'],
        Delimiter: 'notes/summer',
        IsTruncated: false,
        NextKeyMarker: undefined,
        NextVersionIdMarker: undefined,
    }),
    new Test('with bad key marker and good prefix', {
        delimiter: '/',
        prefix: 'notes/summer/',
        keyMarker: 'notes/summer0',
    }, {
        v0: {
            gt: `notes/summer0${inc(VID_SEP)}`,
            lt: `notes/summer${inc('/')}`,
        },
        v1: [{
            gt: `${DbPrefixes.Master}notes/summer0${inc(VID_SEP)}`,
            lt: `${DbPrefixes.Master}notes/summer${inc('/')}`,
        }, {
            gt: `${DbPrefixes.Version}notes/summer0${inc(VID_SEP)}`,
            lt: `${DbPrefixes.Version}notes/summer${inc('/')}`,
        }],
    }, {
        Versions: [],
        CommonPrefixes: [],
        Delimiter: '/',
        IsTruncated: false,
        NextKeyMarker: undefined,
        NextVersionIdMarker: undefined,
    }, (e, input) => e.key > input.keyMarker),
    new Test('with delimiter and prefix (related to #147)', {
        delimiter: '/',
        prefix: 'notes/',
    }, {
        v0: {
            gte: 'notes/',
            lt: `notes${inc('/')}`,
        },
        v1: [{
            gte: `${DbPrefixes.Master}notes/`,
            lt: `${DbPrefixes.Master}notes${inc('/')}`,
        }, {
            gte: `${DbPrefixes.Version}notes/`,
            lt: `${DbPrefixes.Version}notes${inc('/')}`,
        }],
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
    new Test('with delimiter, prefix and marker (related to #147)', {
        delimiter: '/',
        prefix: 'notes/',
        keyMarker: 'notes/year.txt',
    }, {
        v0: {
            gt: `notes/year.txt${inc(VID_SEP)}`,
            lt: `notes${inc('/')}`,
        },
        v1: [{
            gt: `${DbPrefixes.Master}notes/year.txt${inc(VID_SEP)}`,
            lt: `${DbPrefixes.Master}notes${inc('/')}`,
        }, {
            gt: `${DbPrefixes.Version}notes/year.txt${inc(VID_SEP)}`,
            lt: `${DbPrefixes.Version}notes${inc('/')}`,
        }],
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
    new Test('with all parameters 1/3', {
        delimiter: '/',
        prefix: 'notes/',
        keyMarker: 'notes/',
        maxKeys: 1,
    }, {
        v0: {
            gt: `notes/${inc(VID_SEP)}`,
            lt: `notes${inc('/')}`,
        },
        v1: [{
            gt: `${DbPrefixes.Master}notes/${inc(VID_SEP)}`,
            lt: `${DbPrefixes.Master}notes${inc('/')}`,
        }, {
            gt: `${DbPrefixes.Version}notes/${inc(VID_SEP)}`,
            lt: `${DbPrefixes.Version}notes${inc('/')}`,
        }],
    }, {
        Versions: [],
        CommonPrefixes: ['notes/spring/'],
        Delimiter: '/',
        IsTruncated: true,
        NextKeyMarker: 'notes/spring/',
        NextVersionIdMarker: undefined,
    }, (e, input) => e.key > input.keyMarker),

    new Test('with all parameters 2/3', {
        delimiter: '/',
        prefix: 'notes/', // prefix
        keyMarker: 'notes/spring/',
        maxKeys: 1,
    }, {
        v0: {
            gt: `notes/spring/${inc(VID_SEP)}`,
            lt: `notes${inc('/')}`,
        },
        v1: [{
            gt: `${DbPrefixes.Master}notes/spring/${inc(VID_SEP)}`,
            lt: `${DbPrefixes.Master}notes${inc('/')}`,
        }, {
            gt: `${DbPrefixes.Version}notes/spring/${inc(VID_SEP)}`,
            lt: `${DbPrefixes.Version}notes${inc('/')}`,
        }],
    }, {
        Versions: [],
        CommonPrefixes: ['notes/summer/'],
        Delimiter: '/',
        IsTruncated: true,
        NextKeyMarker: 'notes/summer/',
        NextVersionIdMarker: undefined,
    }, (e, input) => e.key > input.keyMarker),

    new Test('with all parameters 3/3', {
        delimiter: '/',
        prefix: 'notes/', // prefix
        keyMarker: 'notes/summer/',
        maxKeys: 1,
    }, {
        v0: {
            gt: `notes/summer/${inc(VID_SEP)}`,
            lt: `notes${inc('/')}`,
        },
        v1: [{
            gt: `${DbPrefixes.Master}notes/summer/${inc(VID_SEP)}`,
            lt: `${DbPrefixes.Master}notes${inc('/')}`,
        }, {
            gt: `${DbPrefixes.Version}notes/summer/${inc(VID_SEP)}`,
            lt: `${DbPrefixes.Version}notes${inc('/')}`,
        }],
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

    new Test('with all parameters 4/3', {
        delimiter: '/',
        prefix: 'notes/', // prefix
        keyMarker: 'notes/year.txt',
        maxKeys: 1,
    }, {
        v0: {
            gt: `notes/year.txt${inc(VID_SEP)}`,
            lt: `notes${inc('/')}`,
        },
        v1: [{
            gt: `${DbPrefixes.Master}notes/year.txt${inc(VID_SEP)}`,
            lt: `${DbPrefixes.Master}notes${inc('/')}`,
        }, {
            gt: `${DbPrefixes.Version}notes/year.txt${inc(VID_SEP)}`,
            lt: `${DbPrefixes.Version}notes${inc('/')}`,
        }],
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

    new Test('with all parameters 5/3', {
        delimiter: '/',
        prefix: 'notes/',
        keyMarker: 'notes/yore.rs',
        maxKeys: 1,
    }, {
        v0: {
            gt: `notes/yore.rs${inc(VID_SEP)}`,
            lt: `notes${inc('/')}`,
        },
        v1: [{
            gt: `${DbPrefixes.Master}notes/yore.rs${inc(VID_SEP)}`,
            lt: `${DbPrefixes.Master}notes${inc('/')}`,
        }, {
            gt: `${DbPrefixes.Version}notes/yore.rs${inc(VID_SEP)}`,
            lt: `${DbPrefixes.Version}notes${inc('/')}`,
        }],
    }, {
        Versions: [],
        CommonPrefixes: ['notes/zaphod/'],
        Delimiter: '/',
        IsTruncated: false,
        NextKeyMarker: undefined,
        NextVersionIdMarker: undefined,
    }, (e, input) => e.key > input.keyMarker),
];

function getListingKey(key, vFormat) {
    if (vFormat === 'v0') {
        return key;
    }
    if (vFormat === 'v1') {
        const keyPrefix = key.includes(VID_SEP) ?
              DbPrefixes.Version : DbPrefixes.Master;
        return `${keyPrefix}${key}`;
    }
    return assert.fail(`bad format ${vFormat}`);
}

function getTestListing(test, data, vFormat) {
    return data
        .filter(e => test.filter(e, test.input))
        .map(e => ({
            key: getListingKey(e.key, vFormat),
            value: e.value,
        }));
}

['v0', 'v1'].forEach(vFormat => {
    describe(`Delimiter All Versions listing algorithm vFormat=${vFormat}`, () => {
        it('Should return good skipping value for DelimiterVersions', () => {
            const delimiter = new DelimiterVersions({ delimiter: '/' }, logger, vFormat);
            for (let i = 0; i < 100; i++) {
                delimiter.filter({
                    key: `${vFormat === 'v1' ? DbPrefixes.Master : ''}foo/${zpad(i)}`,
                    value: '{}',
                });
            }
            if (vFormat === 'v1') {
                assert.deepStrictEqual(delimiter.skipping(), [
                    `${DbPrefixes.Master}foo/`,
                    `${DbPrefixes.Version}foo/`,
                ]);
            } else {
                assert.strictEqual(delimiter.skipping(), 'foo/');
            }
        });

        if (vFormat === 'v0') {
            it('Should return good skipping value for DelimiterVersions on replay keys', () => {
                const delimiter = new DelimiterVersions({ delimiter: '/' }, logger, vFormat);
                for (let i = 0; i < 10; i++) {
                    delimiter.filter({
                        key: `foo/${zpad(i)}`,
                        value: '{}',
                    });
                }
                // simulate a listing that goes through a replay key, ...
                assert.strictEqual(
                    delimiter.filter({
                        key: `${DbPrefixes.Replay}xyz`,
                        value: 'abcdef',
                    }),
                    FILTER_SKIP);
                // ...it should skip the whole replay prefix
                assert.strictEqual(delimiter.skipping(), DbPrefixes.Replay);

                // simulate a listing that reaches regular object keys
                // beyond the replay prefix, ...
                assert.strictEqual(
                    delimiter.filter({
                        key: `${inc(DbPrefixes.Replay)}foo/bar`,
                        value: '{}',
                    }),
                    FILTER_ACCEPT);
                // ...it should return to skipping by prefix as usual
                assert.strictEqual(delimiter.skipping(), `${inc(DbPrefixes.Replay)}foo/`);
            });
        }

        tests.forEach(test => {
            it(`Should return metadata listing params to list ${test.name}`, () => {
                const listing = new DelimiterVersions(test.input, logger, vFormat);
                const params = listing.genMDParams();
                assert.deepStrictEqual(params, test.genMDParams[vFormat]);
            });
            it(`Should list ${test.name}`, () => {
                // Simulate skip scan done by LevelDB
                const d = getTestListing(test, dataVersioned[vFormat], vFormat);
                const res = performListing(d, DelimiterVersions, test.input, logger, vFormat);
                assert.deepStrictEqual(res, test.output);
            });
        });

        it('skipping() should return SKIP_NONE when NextMarker is undefined', () => {
            const delimiter = new DelimiterVersions({ delimiter: '/' }, logger, vFormat);

            assert.strictEqual(delimiter.NextMarker, undefined);
            assert.strictEqual(delimiter.skipping(), SKIP_NONE);
        });

        it('skipping() should return SKIP_NONE when marker is set and ' +
        'does not contain the delimiter', () => {
            const key = 'foo';
            const delimiter = new DelimiterVersions({ delimiter: '/', marker: key },
                                                    logger, vFormat);

            /* Filter a master version to set NextMarker. */
            const listingKey = getListingKey(key, vFormat);
            delimiter.filter({ key: listingKey, value: '' });
            assert.strictEqual(delimiter.NextMarker, 'foo');
            assert.strictEqual(delimiter.skipping(), SKIP_NONE);
        });

        it('skipping() should return prefix to skip when marker is set and ' +
        'contains the delimiter', () => {
            const key = 'foo/bar';
            const delimiter = new DelimiterVersions({ delimiter: '/', marker: key },
                                                    logger, vFormat);

            /* Filter a master version to set NextMarker. */
            const listingKey = getListingKey(key, vFormat);
            delimiter.filter({ key: listingKey, value: '' });
            assert.strictEqual(delimiter.NextMarker, 'foo/');

            if (vFormat === 'v0') {
                assert.strictEqual(delimiter.skipping(), 'foo/');
            } else {
                assert.deepStrictEqual(delimiter.skipping(), [
                    `${DbPrefixes.Master}foo/`,
                    `${DbPrefixes.Version}foo/`,
                ]);
            }
        });

        it('skipping() should return prefix when marker is set and ' +
        'ends with the delimiter', () => {
            const key = 'foo/';
            const delimiter = new DelimiterVersions({ delimiter: '/', marker: key },
                                                    logger, vFormat);

            /* Filter a master version to set NextMarker. */
            const listingKey = getListingKey(key, vFormat);
            delimiter.filter({ key: listingKey, value: '' });
            assert.strictEqual(delimiter.NextMarker, 'foo/');

            if (vFormat === 'v0') {
                assert.strictEqual(delimiter.skipping(), 'foo/');
            } else {
                assert.deepStrictEqual(delimiter.skipping(), [
                    `${DbPrefixes.Master}foo/`,
                    `${DbPrefixes.Version}foo/`,
                ]);
            }
        });

        it('should skip entries not starting with prefix', () => {
            const delimiter = new DelimiterVersions({ prefix: 'prefix' }, logger, vFormat);

            const listingKey = getListingKey('wrong', vFormat);
            assert.strictEqual(delimiter.filter({ key: listingKey, value: '' }), FILTER_SKIP);
            assert.strictEqual(delimiter.NextMarker, undefined);
            assert.strictEqual(delimiter.prvKey, undefined);
            assert.deepStrictEqual(delimiter.result(), EmptyResult);
        });

        it('should accept a master version', () => {
            const delimiter = new DelimiterVersions({}, logger, vFormat);
            const key = 'key';
            const value = '';

            const listingKey = getListingKey(key, vFormat);
            assert.strictEqual(delimiter.filter({ key: listingKey, value }), FILTER_ACCEPT);
            assert.strictEqual(delimiter.NextMarker, key);
            assert.deepStrictEqual(delimiter.result(), {
                CommonPrefixes: [],
                Versions: [{
                    key: 'key',
                    value: '',
                    versionId: 'null',
                }],
                Delimiter: undefined,
                IsTruncated: false,
                NextKeyMarker: undefined,
                NextVersionIdMarker: undefined,
            });
        });

        it('should return good values for entries with different common prefixes', () => {
            const delimiter = new DelimiterVersions({ delimiter: '/' },
                                                    logger, vFormat);

            /* Filter the first entry with a common prefix. It should be
             * accepted and added to the result. */
            assert.strictEqual(delimiter.filter({
                key: getListingKey('commonPrefix1/key1', vFormat),
                value: '',
            }),
                               FILTER_ACCEPT);
            assert.deepStrictEqual(delimiter.result(), {
                CommonPrefixes: ['commonPrefix1/'],
                Versions: [],
                Delimiter: '/',
                IsTruncated: false,
                NextKeyMarker: undefined,
                NextVersionIdMarker: undefined,
            });

            /* Filter the second entry with the same common prefix than the
             * first entry. It should be skipped and not added to the result. */
            assert.strictEqual(delimiter.filter({
                key: getListingKey('commonPrefix1/key2', vFormat),
                value: '',
            }),
                               FILTER_SKIP);
            assert.deepStrictEqual(delimiter.result(), {
                CommonPrefixes: ['commonPrefix1/'],
                Versions: [],
                Delimiter: '/',
                IsTruncated: false,
                NextKeyMarker: undefined,
                NextVersionIdMarker: undefined,
            });

            /* Filter an entry with a new common prefix. It should be accepted
             * and not added to the result. */
            assert.strictEqual(delimiter.filter({
                key: getListingKey('commonPrefix2/key1', vFormat),
                value: '',
            }),
                               FILTER_ACCEPT);
            assert.deepStrictEqual(delimiter.result(), {
                CommonPrefixes: ['commonPrefix1/', 'commonPrefix2/'],
                Versions: [],
                Delimiter: '/',
                IsTruncated: false,
                NextKeyMarker: undefined,
                NextVersionIdMarker: undefined,
            });
        });

        it('should accept a delete marker version', () => {
            const delimiter = new DelimiterVersions({}, logger, vFormat);
            const version = new Version({ isDeleteMarker: true });
            const key = 'key';
            const obj = {
                key: getListingKey(`${key}${VID_SEP}version`, vFormat),
                value: version.toString(),
            };

            /* When filtered, it should return FILTER_ACCEPT and
             * should be added to the result content. */
            assert.strictEqual(delimiter.filter(obj), FILTER_ACCEPT);
            assert.strictEqual(delimiter.NextMarker, key);
            assert.deepStrictEqual(delimiter.result(), {
                CommonPrefixes: [],
                Versions: [{
                    key: 'key',
                    value: version.toString(),
                    versionId: 'version',
                }],
                Delimiter: undefined,
                IsTruncated: false,
                NextKeyMarker: undefined,
                NextVersionIdMarker: undefined,
            });
        });

        it('should accept a version after a delete marker master', () => {
            const delimiter = new DelimiterVersions({}, logger, vFormat);
            const version = new Version({ isDeleteMarker: true });
            const key = 'key';
            const versionKey = `${key}${VID_SEP}version`;

            delimiter.filter({ key: getListingKey(key, vFormat), value: version.toString() });
            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey, vFormat),
                value: 'value',
            }), FILTER_ACCEPT);
            assert.strictEqual(delimiter.NextMarker, key);
            assert.deepStrictEqual(delimiter.result(), {
                CommonPrefixes: [],
                Versions: [{
                    key: 'key',
                    value: version.toString(),
                    versionId: 'null',
                }, {
                    key: 'key',
                    value: 'value',
                    versionId: 'version',
                }],
                Delimiter: undefined,
                IsTruncated: false,
                NextKeyMarker: undefined,
                NextVersionIdMarker: undefined,
            });
        });

        it('should accept a new master key w/ version after a delete marker master', () => {
            const delimiter = new DelimiterVersions({}, logger, vFormat);
            const version = new Version({ isDeleteMarker: true });
            const key1 = 'key1';
            const key2 = 'key2';
            const value2 = '{"versionId":"version"}';

            assert.strictEqual(delimiter.filter({
                key: getListingKey(key1, vFormat),
                value: version.toString(),
            }), FILTER_ACCEPT);
            assert.strictEqual(delimiter.filter({
                key: getListingKey(key2, vFormat),
                value: value2,
            }), FILTER_ACCEPT);
            assert.strictEqual(delimiter.NextMarker, key2);
            assert.deepStrictEqual(delimiter.result(), {
                CommonPrefixes: [],
                Delimiter: undefined,
                IsTruncated: false,
                NextKeyMarker: undefined,
                NextVersionIdMarker: undefined,
                Versions: [{
                    key: 'key1',
                    value: '{"isDeleteMarker":true}',
                    versionId: 'null',
                }, {
                    key: 'key2',
                    value: '{"versionId":"version"}',
                    versionId: 'version',
                }],
            });
        });

        it('should accept a version after skipping an object because of its commonPrefix', () => {
            const commonPrefix1 = 'commonPrefix1/';
            const commonPrefix2 = 'commonPrefix2/';
            const prefix1Key1 = 'commonPrefix1/key1';
            const prefix1Key2 = 'commonPrefix1/key2';
            const prefix2VersionKey1 = `commonPrefix2/key1${VID_SEP}version`;
            const value = '{"versionId":"version"}';

            const delimiter = new DelimiterVersions({ delimiter: '/' },
                                                    logger, vFormat);

            /* Filter the two first entries with the same common prefix to add
             * it to the result and reach the state where an entry is skipped
             * because of an already present common prefix in the result. */
            delimiter.filter({ key: getListingKey(prefix1Key1, vFormat), value });
            delimiter.filter({ key: getListingKey(prefix1Key2, vFormat), value });

            /* Filter an object with a key containing a version part and a new
             * common prefix. It should be accepted and the new common prefix
             * added to the result. */
            assert.strictEqual(delimiter.filter({
                key: getListingKey(prefix2VersionKey1, vFormat),
                value,
            }), FILTER_ACCEPT);
            assert.deepStrictEqual(delimiter.result(), {
                CommonPrefixes: [commonPrefix1, commonPrefix2],
                Versions: [],
                Delimiter: '/',
                IsTruncated: false,
                NextKeyMarker: undefined,
                NextVersionIdMarker: undefined,
            });
        });

        it('should skip first version key if equal to master', () => {
            const delimiter = new DelimiterVersions({}, logger, vFormat);
            const masterKey = 'key';
            const versionKey1 = `${masterKey}${VID_SEP}version1`;
            const versionKey2 = `${masterKey}${VID_SEP}version2`;
            const value2 = 'value2';

            /* Filter the master version for version1 */
            assert.strictEqual(delimiter.filter({
                key: getListingKey(masterKey, vFormat),
                value: '{"versionId":"version1"}',
            }), FILTER_ACCEPT);

            /* Filter the version key for version1 */
            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey1, vFormat),
                value: '{"versionId":"version1"}',
            }), FILTER_SKIP);

            /* Filter the version key for version2 */
            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey2, vFormat),
                value: value2,
            }), FILTER_ACCEPT);

            assert.deepStrictEqual(delimiter.result(), {
                CommonPrefixes: [],
                Versions: [{
                    key: 'key',
                    value: '{"versionId":"version1"}',
                    versionId: 'version1',
                }, {
                    key: 'key',
                    value: 'value2',
                    versionId: 'version2',
                }],
                Delimiter: undefined,
                IsTruncated: false,
                NextKeyMarker: undefined,
                NextVersionIdMarker: undefined,
            });
        });

        it('should skip master and version key if under a known prefix', () => {
            const commonPrefix1 = 'commonPrefix/';
            const prefixKey1 = 'commonPrefix/key1';
            const prefixKey2 = 'commonPrefix/key2';
            const prefixVersionKey1 = `commonPrefix/key2${VID_SEP}version`;
            const value = '{"versionId":"version"}';

            const delimiter = new DelimiterVersions({ delimiter: '/' },
                                                    logger, vFormat);

            assert.strictEqual(delimiter.filter({
                key: getListingKey(prefixKey1, vFormat),
                value,
            }), FILTER_ACCEPT);
            /* The second master key of the same common prefix should be skipped */
            assert.strictEqual(delimiter.filter({
                key: getListingKey(prefixKey2, vFormat),
                value,
            }), FILTER_SKIP);

            /* The version key of the same common prefix should also be skipped */
            assert.strictEqual(delimiter.filter({
                key: getListingKey(prefixVersionKey1, vFormat),
                value,
            }), FILTER_SKIP);
            assert.deepStrictEqual(delimiter.result(), {
                CommonPrefixes: [commonPrefix1],
                Versions: [],
                Delimiter: '/',
                IsTruncated: false,
                NextKeyMarker: undefined,
                NextVersionIdMarker: undefined,
            });
        });

        if (vFormat === 'v0') {
            it('should accept a PHD version as first input', () => {
                const delimiter = new DelimiterVersions({}, logger, vFormat);
                const keyPHD = 'keyPHD';
                const objPHD = {
                    key: keyPHD,
                    value: Version.generatePHDVersion(generateVersionId('', '')),
                };

                /* When filtered, it should return FILTER_ACCEPT and set the prvKey
                 * to undefined. It should not be added to the result content or common
                 * prefixes. */
                assert.strictEqual(delimiter.filter(objPHD), FILTER_ACCEPT);
                assert.strictEqual(delimiter.prvKey, undefined);
                assert.strictEqual(delimiter.NextMarker, undefined);
                assert.deepStrictEqual(delimiter.result(), EmptyResult);
            });

            it('should accept a PHD version', () => {
                const delimiter = new DelimiterVersions({}, logger, vFormat);
                const key = 'keyA';
                const value = '';
                const keyPHD = 'keyBPHD';
                const objPHD = {
                    key: keyPHD,
                    value: Version.generatePHDVersion(generateVersionId('', '')),
                };

                /* Filter a master version to set the NextMarker and add
                 * and element in result content. */
                delimiter.filter({ key, value });

                /* When filtered, it should return FILTER_ACCEPT. It
                 * should not be added to the result content or common
                 * prefixes. */
                assert.strictEqual(delimiter.filter(objPHD), FILTER_ACCEPT);
                assert.strictEqual(delimiter.prvKey, undefined);
                assert.strictEqual(delimiter.NextMarker, key);
                assert.deepStrictEqual(delimiter.result(), {
                    CommonPrefixes: [],
                    Versions: [{
                        key: 'keyA',
                        value: '',
                        versionId: 'null',
                    }],
                    Delimiter: undefined,
                    IsTruncated: false,
                    NextKeyMarker: undefined,
                    NextVersionIdMarker: undefined,
                });
            });

            it('should accept a version after a PHD', () => {
                const delimiter = new DelimiterVersions({}, logger, vFormat);
                const masterKey = 'key';
                const keyVersion = `${masterKey}${VID_SEP}version`;
                const value = '';
                const objPHD = {
                    key: masterKey,
                    value: Version.generatePHDVersion(generateVersionId('', '')),
                };

                /* Filter the PHD object. */
                delimiter.filter(objPHD);

                /* The filtering of the PHD object has no impact, the version is
                 * accepted and added to the result. */
                assert.strictEqual(delimiter.filter({
                    key: keyVersion,
                    value,
                }), FILTER_ACCEPT);
                assert.strictEqual(delimiter.NextMarker, masterKey);
                assert.deepStrictEqual(delimiter.result(), {
                    CommonPrefixes: [],
                    Versions: [{
                        key: 'key',
                        value: '',
                        versionId: 'version',
                    }],
                    Delimiter: undefined,
                    IsTruncated: false,
                    NextKeyMarker: undefined,
                    NextVersionIdMarker: undefined,
                });
            });
        }
    });
});
