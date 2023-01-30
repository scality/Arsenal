'use strict'; // eslint-disable-line strict

const assert = require('assert');
const Delimiter =
    require('../../../../lib/algos/list/delimiter').Delimiter;
const DelimiterMaster =
    require('../../../../lib/algos/list/delimiterMaster').DelimiterMaster;
const Werelogs = require('werelogs').Logger;
const logger = new Werelogs('listTest');
const zpad = require('../../helpers').zpad;
const { inc } = require('../../../../lib/algos/list/tools');
const VSConst = require('../../../../lib/versioning/constants').VersioningConstants;
const { DbPrefixes } = VSConst;

class Test {
    constructor(name, input, genMDParams, output) {
        this.name = name;
        this.input = input;
        this.genMDParams = genMDParams;
        this.output = output;
    }
}

const value = '{"hello":"world"}';
const valuePHD = '{"isPHD":"true","versionId":"1234567890abcdefg"}';
const valueDeleteMarker = '{"hello":"world","isDeleteMarker":"true"}';
const data = [
    { key: 'Pâtisserie=中文-español-English', value },
    { key: 'notes/spring/1.txt', value },
    { key: 'notes/spring/4.txt', value },
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
    { key: 'notes/spring/4.txt', value: valuePHD },
    { key: 'notes/spring/4.txt\0bar', value },
    { key: 'notes/spring/4.txt\0foo', value },
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

const receivedData = data.map(item => ({ key: item.key, value: item.value }));

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
    }),
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
    }),
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
            gt: 'notes/summer0',
            lt: 'notes/summer0',
        },
        v1: {
            gt: `${DbPrefixes.Master}notes/summer0`,
            lt: `${DbPrefixes.Master}notes/summer0`,
        },
    }, {
        Contents: [],
        CommonPrefixes: [],
        Delimiter: '/',
        IsTruncated: false,
        NextMarker: undefined,
    }),
    new Test('delimiter and prefix (related to #147)', {
        delimiter: '/',
        prefix: 'notes/',
    }, {
        v0: {
            gte: 'notes/',
            lt: 'notes0',
        },
        v1: {
            gte: `${DbPrefixes.Master}notes/`,
            lt: `${DbPrefixes.Master}notes0`,
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
            lt: 'notes0',
        },
        v1: {
            gt: `${DbPrefixes.Master}notes/year.txt`,
            lt: `${DbPrefixes.Master}notes0`,
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
    }),
    new Test('all parameters 1/5', {
        delimiter: '/',
        prefix: 'notes/',
        marker: 'notes/',
        maxKeys: 1,
    }, {
        v0: {
            gt: 'notes/',
            lt: 'notes0',
        },
        v1: {
            gt: `${DbPrefixes.Master}notes/`,
            lt: `${DbPrefixes.Master}notes0`,
        },
    }, {
        Contents: [],
        CommonPrefixes: ['notes/spring/'],
        Delimiter: '/',
        IsTruncated: true,
        NextMarker: 'notes/spring/1.txt',
    }),

    new Test('all parameters 2/5', {
        delimiter: '/',
        prefix: 'notes/',
        marker: 'notes/spring/1.txt',
        maxKeys: 1,
    }, {
        v0: {
            gte: 'notes/spring0',
            lt: 'notes0',
        },
        v1: {
            gte: `${DbPrefixes.Master}notes/spring0`,
            lt: `${DbPrefixes.Master}notes0`,
        },
    }, {
        Contents: [],
        CommonPrefixes: ['notes/summer/'],
        Delimiter: '/',
        IsTruncated: true,
        NextMarker: 'notes/summer/1.txt',
    }),

    new Test('all parameters 3/5', {
        delimiter: '/',
        prefix: 'notes/',
        marker: 'notes/summer/1.txt',
        maxKeys: 1,
    }, {
        v0: {
            gte: 'notes/summer0',
            lt: 'notes0',
        },
        v1: {
            gte: `${DbPrefixes.Master}notes/summer0`,
            lt: `${DbPrefixes.Master}notes0`,
        },
    }, {
        Contents: [
            receivedData[7],
        ],
        CommonPrefixes: [],
        Delimiter: '/',
        IsTruncated: true,
        NextMarker: 'notes/year.txt',
    }),

    new Test('all parameters 4/5', {
        delimiter: '/',
        prefix: 'notes/',
        marker: 'notes/year.txt',
        maxKeys: 1,
    }, {
        v0: {
            gt: 'notes/year.txt',
            lt: 'notes0',
        },
        v1: {
            gt: `${DbPrefixes.Master}notes/year.txt`,
            lt: `${DbPrefixes.Master}notes0`,
        },
    }, {
        Contents: [
            receivedData[8],
        ],
        CommonPrefixes: [],
        Delimiter: '/',
        IsTruncated: true,
        NextMarker: 'notes/yore.rs',
    }),

    new Test('all parameters 5/5', {
        delimiter: '/',
        prefix: 'notes/',
        marker: 'notes/yore.rs',
        maxKeys: 1,
    }, {
        v0: {
            gt: 'notes/yore.rs',
            lt: 'notes0',
        },
        v1: {
            gt: `${DbPrefixes.Master}notes/yore.rs`,
            lt: `${DbPrefixes.Master}notes0`,
        },
    }, {
        Contents: [],
        CommonPrefixes: ['notes/zaphod/'],
        Delimiter: '/',
        IsTruncated: false,
        NextMarker: undefined,
    }),

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
    }),
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
    }),
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
    }),
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
    }),
    new Test('bad startAfter and good prefix', {
        delimiter: '/',
        prefix: 'notes/summer/',
        startAfter: 'notes/summer0',
        v2: true,
    }, {
        v0: {
            gt: 'notes/summer0',
            lt: 'notes/summer0',
        },
        v1: {
            gt: `${DbPrefixes.Master}notes/summer0`,
            lt: `${DbPrefixes.Master}notes/summer0`,
        },
    }, {
        Contents: [],
        CommonPrefixes: [],
        Delimiter: '/',
        IsTruncated: false,
        NextContinuationToken: undefined,
    }),
    new Test('bad continuation token and good prefix', {
        delimiter: '/',
        prefix: 'notes/summer/',
        continuationToken: 'notes/summer0',
        v2: true,
    }, {
        v0: {
            gt: 'notes/summer0',
            lt: 'notes/summer0',
        },
        v1: {
            gt: `${DbPrefixes.Master}notes/summer0`,
            lt: `${DbPrefixes.Master}notes/summer0`,
        },
    }, {
        Contents: [],
        CommonPrefixes: [],
        Delimiter: '/',
        IsTruncated: false,
        NextContinuationToken: undefined,
    }),

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
    }),

    new Test('all parameters v2 1/5', {
        delimiter: '/',
        prefix: 'notes/',
        startAfter: 'notes/',
        maxKeys: 1,
        v2: true,
    }, {
        v0: {
            gt: 'notes/',
            lt: 'notes0',
        },
        v1: {
            gt: `${DbPrefixes.Master}notes/`,
            lt: `${DbPrefixes.Master}notes0`,
        },
    }, {
        Contents: [],
        CommonPrefixes: ['notes/spring/'],
        Delimiter: '/',
        IsTruncated: true,
        NextContinuationToken: 'notes/spring/1.txt',
    }),

    new Test('all parameters v2 2/5', {
        delimiter: '/',
        prefix: 'notes/',
        continuationToken: 'notes/spring/1.txt',
        maxKeys: 1,
        v2: true,
    }, {
        v0: {
            gte: 'notes/spring0',
            lt: 'notes0',
        },
        v1: {
            gte: `${DbPrefixes.Master}notes/spring0`,
            lt: `${DbPrefixes.Master}notes0`,
        },
    }, {
        Contents: [],
        CommonPrefixes: ['notes/summer/'],
        Delimiter: '/',
        IsTruncated: true,
        NextContinuationToken: 'notes/summer/1.txt',
    }),

    new Test('all parameters v2 3/5', {
        delimiter: '/',
        prefix: 'notes/',
        continuationToken: 'notes/summer/1.txt',
        maxKeys: 1,
        v2: true,
    }, {
        v0: {
            gte: 'notes/summer0',
            lt: 'notes0',
        },
        v1: {
            gte: `${DbPrefixes.Master}notes/summer0`,
            lt: `${DbPrefixes.Master}notes0`,
        },
    }, {
        Contents: [
            receivedData[7],
        ],
        CommonPrefixes: [],
        Delimiter: '/',
        IsTruncated: true,
        NextContinuationToken: 'notes/year.txt',
    }),

    new Test('all parameters v2 4/5', {
        delimiter: '/',
        prefix: 'notes/',
        startAfter: 'notes/year.txt',
        maxKeys: 1,
        v2: true,
    }, {
        v0: {
            gt: 'notes/year.txt',
            lt: 'notes0',
        },
        v1: {
            gt: `${DbPrefixes.Master}notes/year.txt`,
            lt: `${DbPrefixes.Master}notes0`,
        },
    }, {
        Contents: [
            receivedData[8],
        ],
        CommonPrefixes: [],
        Delimiter: '/',
        IsTruncated: true,
        NextContinuationToken: 'notes/yore.rs',
    }),

    new Test('all parameters v2 5/5', {
        delimiter: '/',
        prefix: 'notes/',
        startAfter: 'notes/yore.rs',
        maxKeys: 1,
        v2: true,
    }, {
        v0: {
            gt: 'notes/yore.rs',
            lt: 'notes0',
        },
        v1: {
            gt: `${DbPrefixes.Master}notes/yore.rs`,
            lt: `${DbPrefixes.Master}notes0`,
        },
    }, {
        Contents: [],
        CommonPrefixes: ['notes/zaphod/'],
        Delimiter: '/',
        IsTruncated: false,
        NextContinuationToken: undefined,
    }),
];

function getTestListing(mdParams, data, vFormat) {
    return data
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
        })
        .filter(e =>
            (!mdParams.gt || e.key > mdParams.gt) &&
            (!mdParams.gte || e.key >= mdParams.gte) &&
            (!mdParams.lt || e.key < mdParams.lt),
        );
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

        tests.forEach(test => {
            it(`Should return metadata listing params to list ${test.name}`, () => {
                const listing = new Delimiter(test.input, logger, vFormat);
                const params = listing.genMDParams();
                assert.deepStrictEqual(params, test.genMDParams[vFormat]);
            });
            it(`Should list ${test.name}`, () => {
                const listing = new Delimiter(test.input, logger, vFormat);
                const mdParams = listing.genMDParams();
                const rawEntries = getTestListing(mdParams, data, vFormat);
                for (const entry of rawEntries) {
                    listing.filter(entry);
                }
                const res = listing.result();
                assert.deepStrictEqual(res, test.output);
            });
        });

        // Only v0 gets a listing of master and version keys together.
        if (vFormat === 'v0') {
            tests.forEach(test => {
                it(`Should list master versions ${test.name}`, () => {
                    const listing = new DelimiterMaster(test.input, logger, vFormat);
                    const mdParams = listing.genMDParams();
                    const rawEntries = getTestListing(mdParams, dataVersioned, vFormat);
                    for (const entry of rawEntries) {
                        listing.filter(entry);
                    }
                    const res = listing.result();
                    assert.deepStrictEqual(res, test.output);
                });
            });
        }
    });
});
