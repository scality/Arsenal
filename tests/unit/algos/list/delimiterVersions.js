'use strict'; // eslint-disable-line strict

const assert = require('assert');
const DelimiterVersions =
    require('../../../../lib/algos/list/delimiterVersions').DelimiterVersions;
const Werelogs = require('werelogs').Logger;
const logger = new Werelogs('listTest');
const performListing = require('../../../utils/performListing');
const zpad = require('../../helpers').zpad;
const { inc } = require('../../../../lib/algos/list/tools');
const VSConst = require('../../../../lib/versioning/constants').VersioningConstants;
const { DbPrefixes } = VSConst;
const VID_SEP = VSConst.VersionId.Separator;

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
    new Test('bad key marker and good prefix', {
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
    new Test('delimiter and prefix (related to #147)', {
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
    new Test('delimiter, prefix and marker (related to #147)', {
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
    new Test('all parameters 1/3', {
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

    new Test('all parameters 2/3', {
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

    new Test('all parameters 3/3', {
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

    new Test('all parameters 4/3', {
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

    new Test('all parameters 5/3', {
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

function getTestListing(test, data, vFormat) {
    return data
        .filter(e => test.filter(e, test.input))
        .map(e => {
            if (vFormat === 'v0') {
                return e;
            }
            if (vFormat === 'v1') {
                const keyPrefix = e.key.includes(VID_SEP) ?
                      DbPrefixes.Version : DbPrefixes.Master;
                return {
                    key: `${keyPrefix}${e.key}`,
                    value: e.value,
                };
            }
            return assert.fail(`bad format ${vFormat}`);
        });
}

['v0', 'v1'].forEach(vFormat => {
    describe(`Delimiter All Versions listing algorithm vFormat=${vFormat}`, () => {
        it('Should return good skipping value for DelimiterVersions', () => {
            const delimiter = new DelimiterVersions({ delimiter: '/' });
            for (let i = 0; i < 100; i++) {
                delimiter.filter({
                    key: `${vFormat === 'v1' ? DbPrefixes.Master : ''}foo/${zpad(i)}`,
                    value: '{}',
                });
            }
            assert.strictEqual(delimiter.skipping(),
                               `${vFormat === 'v1' ? DbPrefixes.Master : ''}foo/`);
        });

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
    });
});
