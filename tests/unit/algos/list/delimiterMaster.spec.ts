'use strict'; // eslint-disable-line strict

const assert = require('assert');

import {
    DelimiterMaster,
    DelimiterMasterFilterStateId,
    GapCachingState,
    GapBuildingState,
} from '../../../../lib/algos/list/delimiterMaster';
const {
    FILTER_ACCEPT,
    FILTER_SKIP,
    FILTER_END,
    SKIP_NONE,
    inc,
} = require('../../../../lib/algos/list/tools');
import { default as GapSet, GapSetEntry } from '../../../../lib/algos/cache/GapSet';
import { GapCacheInterface } from '../../../../lib/algos/cache/GapCache';
const VSConst =
    require('../../../../lib/versioning/constants').VersioningConstants;
const Version = require('../../../../lib/versioning/Version').Version;
const { generateVersionId } = require('../../../../lib/versioning/VersionID');
const { DbPrefixes } = VSConst;
const zpad = require('../../helpers').zpad;
const VID_SEP = VSConst.VersionId.Separator;
const EmptyResult = {
    CommonPrefixes: [],
    Contents: [],
    IsTruncated: false,
    NextMarker: undefined,
    Delimiter: undefined,
};

const fakeLogger = {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {},
};

function getListingKey(key, vFormat) {
    if (vFormat === 'v0') {
        return key;
    }
    if (vFormat === 'v1') {
        return `${DbPrefixes.Master}${key}`;
    }
    return assert.fail(`bad vFormat ${vFormat}`);
}

['v0', 'v1'].forEach(vFormat => {
    describe(`DelimiterMaster listing algorithm vFormat=${vFormat}`, () => {
        it('should return SKIP_NONE for DelimiterMaster when both NextMarker ' +
        'and NextContinuationToken are undefined', () => {
            const delimiter = new DelimiterMaster({ delimiter: '/' }, fakeLogger, vFormat);

            assert.strictEqual(delimiter.nextMarker, undefined);

            // When there is no NextMarker or NextContinuationToken, it should
            // return SKIP_NONE
            assert.strictEqual(delimiter.skipping(), SKIP_NONE);
        });

        it('should accept a master version', () => {
            const delimiter = new DelimiterMaster({}, fakeLogger, vFormat);
            const key = 'key';
            const value = '';

            const listingKey = getListingKey(key, vFormat);
            assert.strictEqual(delimiter.filter({ key: listingKey, value }), FILTER_ACCEPT);
            assert.strictEqual(delimiter.nextMarker, key);
            assert.deepStrictEqual(delimiter.result(), {
                CommonPrefixes: [],
                Contents: [{ key, value }],
                IsTruncated: false,
                NextMarker: undefined,
                Delimiter: undefined,
            });
        });

        it('should return good values for entries with different common prefixes', () => {
            const delimiterChar = '/';
            const commonPrefix1 = `commonPrefix1${delimiterChar}`;
            const commonPrefix2 = `commonPrefix2${delimiterChar}`;
            const prefix1Key1 = `${commonPrefix1}key1`;
            const prefix1Key2 = `${commonPrefix1}key2`;
            const prefix2Key1 = `${commonPrefix2}key1`;
            const value = 'value';

            const delimiter = new DelimiterMaster({ delimiter: delimiterChar },
                fakeLogger, vFormat);

            /* Filter the first entry with a common prefix. It should be
             * accepted and added to the result. */
            assert.strictEqual(delimiter.filter({
                key: getListingKey(prefix1Key1, vFormat),
                value,
            }),
            FILTER_ACCEPT);
            assert.deepStrictEqual(delimiter.result(), {
                CommonPrefixes: [commonPrefix1],
                Contents: [],
                IsTruncated: false,
                NextMarker: undefined,
                Delimiter: delimiterChar,
            });

            /* Filter the second entry with the same common prefix than the
             * first entry. It should be skipped and not added to the result. */
            assert.strictEqual(delimiter.filter({
                key: getListingKey(prefix1Key2, vFormat),
                value,
            }),
            FILTER_SKIP);
            assert.deepStrictEqual(delimiter.result(), {
                CommonPrefixes: [commonPrefix1],
                Contents: [],
                IsTruncated: false,
                NextMarker: undefined,
                Delimiter: delimiterChar,
            });

            /* Filter an entry with a new common prefix. It should be accepted
             * and its new prefix added to the common prefixes. */
            assert.strictEqual(delimiter.filter({
                key: getListingKey(prefix2Key1, vFormat),
                value,
            }),
            FILTER_ACCEPT);
            assert.deepStrictEqual(delimiter.result(), {
                CommonPrefixes: [commonPrefix1, commonPrefix2],
                Contents: [],
                IsTruncated: false,
                NextMarker: undefined,
                Delimiter: delimiterChar,
            });
        });

        it('should update NextMarker to the first key belonging to the last common '
        + 'prefix listed when reaching max keys and the last entry is a common prefix', () => {
            const delimiter = new DelimiterMaster(
                { delimiter: '/', maxKeys: 2 }, fakeLogger, vFormat);

            assert.strictEqual(
                delimiter.filter({ key: getListingKey('prefix1/key1', vFormat), value: '' }),
                FILTER_ACCEPT,
            );
            assert.strictEqual(
                delimiter.filter({ key: getListingKey('prefix2/key1', vFormat), value: '' }),
                FILTER_ACCEPT,
            );
            assert.strictEqual(
                delimiter.filter({ key: getListingKey('prefix2/key2', vFormat), value: '' }),
                FILTER_SKIP,
            );
            assert.strictEqual(
                delimiter.filter({ key: getListingKey('prefix3/key1', vFormat), value: '' }),
                FILTER_END,
            );
            assert.deepStrictEqual(delimiter.result(), {
                CommonPrefixes: [
                    'prefix1/',
                    'prefix2/',
                ],
                Contents: [],
                Delimiter: '/',
                IsTruncated: true,
                NextMarker: 'prefix2/',
            });
        });

        if (vFormat === 'v0') {
            it('skipping() should return <key>inc(<VersionIdSeparator>) for DelimiterMaster when ' +
            'NextMarker is set and there is a delimiter', () => {
                const key = 'key';
                const delimiter = new DelimiterMaster(
                    { delimiter: '/', marker: key },
                    fakeLogger, vFormat);

                /* Filter a master version to set NextMarker. */
                const listingKey = getListingKey(key, vFormat);
                delimiter.filter({ key: listingKey, value: '' });
                assert.strictEqual(delimiter.nextMarker, key);
                assert.strictEqual(delimiter.skipping(), `${listingKey}${inc(VID_SEP)}`);
            });

            it('skipping() should return <key>inc(<VersionIdSeparator>) for DelimiterMaster when ' +
            'NextContinuationToken is set and there is a delimiter', () => {
                const key = 'key';
                const delimiter = new DelimiterMaster(
                    { delimiter: '/', startAfter: key, v2: true },
                    fakeLogger, vFormat);

                // Filter a master version to set NextContinuationToken
                const listingKey = getListingKey(key, vFormat);
                delimiter.filter({ key: listingKey, value: '' });
                assert.strictEqual(delimiter.nextMarker, key);

                assert.strictEqual(delimiter.skipping(), `${listingKey}${inc(VID_SEP)}`);
            });

            it('should accept a PHD version as first input', () => {
                const delimiter = new DelimiterMaster({}, fakeLogger, vFormat);
                const keyPHD = 'keyPHD';
                const objPHD = {
                    key: keyPHD,
                    value: Version.generatePHDVersion(generateVersionId('', '')),
                };

                /* When filtered, it should return FILTER_ACCEPT. It
                 * should not be added to the result content or common
                 * prefixes. */
                assert.strictEqual(delimiter.filter(objPHD), FILTER_ACCEPT);
                assert.strictEqual(delimiter.nextMarker, undefined);
                assert.deepStrictEqual(delimiter.result(), EmptyResult);
            });

            it('should accept a PHD version', () => {
                const delimiter = new DelimiterMaster({}, fakeLogger, vFormat);
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
                assert.strictEqual(delimiter.nextMarker, key);
                assert.deepStrictEqual(delimiter.result(), {
                    CommonPrefixes: [],
                    Contents: [{ key, value }],
                    IsTruncated: false,
                    NextMarker: undefined,
                    Delimiter: undefined,
                });
            });

            it('should accept a version after a PHD', () => {
                const delimiter = new DelimiterMaster({}, fakeLogger, vFormat);
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
                assert.strictEqual(delimiter.nextMarker, masterKey);
                assert.deepStrictEqual(delimiter.result(), {
                    CommonPrefixes: [],
                    Contents: [{ key: masterKey, value }],
                    IsTruncated: false,
                    NextMarker: undefined,
                    Delimiter: undefined,
                });
            });

            it('should skip a delete marker version', () => {
                const version = new Version({ isDeleteMarker: true });
                const key = 'key';
                const obj = {
                    key: `${key}${VID_SEP}version`,
                    value: version.toString(),
                };
                const delimiter = new DelimiterMaster({
                    marker: key,
                }, fakeLogger, vFormat);

                /* When filtered, it should return FILTER_SKIP. It
                 * should not be added to the result content or common prefixes. */
                assert.strictEqual(delimiter.filter(obj), FILTER_SKIP);
                assert.strictEqual(delimiter.nextMarker, key);
                assert.deepStrictEqual(delimiter.result(), EmptyResult);
            });

            it('should skip version after a delete marker master', () => {
                const delimiter = new DelimiterMaster({}, fakeLogger, vFormat);
                const version = new Version({ isDeleteMarker: true });
                const key = 'key';
                const versionKey = `${key}${VID_SEP}version`;

                delimiter.filter({ key, value: version.toString() });
                assert.strictEqual(delimiter.filter({
                    key: versionKey,
                    value: 'value',
                }), FILTER_SKIP);
                assert.strictEqual(delimiter.nextMarker, undefined);
                assert.deepStrictEqual(delimiter.result(), EmptyResult);
            });

            it('should accept a new master key after a delete marker master', () => {
                const delimiter = new DelimiterMaster({}, fakeLogger, vFormat);
                const version = new Version({ isDeleteMarker: true });
                const key1 = 'key1';
                const key2 = 'key2';
                const value = 'value';

                delimiter.filter({ key: key1, value: version.toString() });
                assert.strictEqual(delimiter.filter({
                    key: key2,
                    value: 'value',
                }), FILTER_ACCEPT);
                assert.strictEqual(delimiter.nextMarker, key2);
                assert.deepStrictEqual(delimiter.result(), {
                    CommonPrefixes: [],
                    Contents: [{ key: key2, value }],
                    IsTruncated: false,
                    NextMarker: undefined,
                    Delimiter: undefined,
                });
            });

            it('should accept the master version and skip the other ones', () => {
                const delimiter = new DelimiterMaster({}, fakeLogger, vFormat);
                const masterKey = 'key';
                const masterValue = 'value';
                const versionKey = `${masterKey}${VID_SEP}version`;
                const versionValue = 'versionvalue';

                /* Filter the master version. */
                delimiter.filter({ key: masterKey, value: masterValue });

                /* Version is skipped, not added to the result. The delimiter
                 * NextMarker is unmodified and set to the masterKey. */
                assert.strictEqual(delimiter.filter({
                    key: versionKey,
                    value: versionValue,
                }), FILTER_SKIP);
                assert.strictEqual(delimiter.nextMarker, masterKey);
                assert.deepStrictEqual(delimiter.result(), {
                    CommonPrefixes: [],
                    Contents: [{ key: masterKey, value: masterValue }],
                    IsTruncated: false,
                    NextMarker: undefined,
                    Delimiter: undefined,
                });
            });

            it('should assume vFormat=v0 when not passed explicitly', () => {
                // this test is identical to the above one "should
                // accept the master version and skip the other ones",
                // which checks that the listing algo effectively
                // behaves as if it is a v0 format
                const delimiter = new DelimiterMaster({}, fakeLogger);
                const masterKey = 'key';
                const masterValue = 'value';
                const versionKey = `${masterKey}${VID_SEP}version`;
                const versionValue = 'versionvalue';

                /* Filter the master version. */
                delimiter.filter({ key: masterKey, value: masterValue });

                /* Version is skipped, not added to the result. The delimiter
                 * NextMarker is unmodified and set to the masterKey. */
                assert.strictEqual(delimiter.filter({
                    key: versionKey,
                    value: versionValue,
                }), FILTER_SKIP);
                assert.strictEqual(delimiter.nextMarker, masterKey);
                assert.deepStrictEqual(delimiter.result(), {
                    CommonPrefixes: [],
                    Contents: [{ key: masterKey, value: masterValue }],
                    IsTruncated: false,
                    NextMarker: undefined,
                    Delimiter: undefined,
                });
            });

            it('should return good listing result for version', () => {
                const delimiter = new DelimiterMaster({}, fakeLogger, vFormat);
                const masterKey = 'key';
                const versionKey1 = `${masterKey}${VID_SEP}version1`;
                const value1 = 'value1';

                /* Filter the PHD version. */
                assert.strictEqual(delimiter.filter({
                    key: masterKey,
                    value: '{ "isPHD": true, "value": "version" }',
                }), FILTER_ACCEPT);

                /* Filter a version with a specific value. */
                assert.strictEqual(delimiter.filter({
                    key: versionKey1,
                    value: value1,
                }), FILTER_ACCEPT);

                assert.deepStrictEqual(delimiter.result(), {
                    CommonPrefixes: [],
                    Contents: [{ key: masterKey, value: value1 }],
                    IsTruncated: false,
                    NextMarker: undefined,
                    Delimiter: undefined,
                });
            });

            it('should skip a versioned entry when there is a delimiter and the key ' +
            'starts with the NextMarker value', () => {
                const key = 'prefix/key';
                const versionKey = `${key}${VID_SEP}version`;
                const value = 'value';

                const delimiter = new DelimiterMaster({
                    delimiter: '/',
                    marker: key,
                }, fakeLogger, vFormat);

                assert.strictEqual(delimiter.filter({ key: versionKey, value }), FILTER_SKIP);
            });

            [undefined, '/'].forEach(delimiterChar => {
                it('should return good skipping value for DelimiterMaster on replay keys ' +
                `with ${delimiterChar ? 'a' : 'no'} delimiter`, () => {
                    const delimiter = new DelimiterMaster(
                        { delimiter: delimiterChar, v2: true },
                        fakeLogger, vFormat);

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
                    assert.strictEqual(delimiter.skipping(), inc(DbPrefixes.Replay));

                    // simulate a listing that reaches regular object keys
                    // beyond the replay prefix, ...
                    assert.strictEqual(
                        delimiter.filter({
                            key: `${inc(DbPrefixes.Replay)}foo/bar`,
                            value: '{}',
                        }),
                        FILTER_ACCEPT);
                    // ...it should return to skipping by prefix with
                    // a delimiter or by versions without delimiter,
                    // as usual
                    assert.strictEqual(delimiter.skipping(),
                        delimiterChar ?
                            `${inc(DbPrefixes.Replay)}foo0` :
                            `${inc(DbPrefixes.Replay)}foo/bar${inc(VID_SEP)}`);
                });
            });

            it('should not crash if key contains "undefined" with no delimiter', () => {
                const delimiter = new DelimiterMaster({}, fakeLogger, vFormat);
                const listingKey = getListingKey('undefinedfoo', vFormat);
                assert.strictEqual(
                    delimiter.filter({
                        key: listingKey,
                        value: '{}',
                    }),
                    FILTER_ACCEPT);

                assert.deepStrictEqual(delimiter.result(), {
                    CommonPrefixes: [],
                    Contents: [{ key: 'undefinedfoo', value: '{}' }],
                    IsTruncated: false,
                    NextMarker: undefined,
                    Delimiter: undefined,
                });
            });
        }
    });
});

describe('DelimiterMaster listing algorithm: sequence of filter() scenarii', () => {
    const FILTER_TEST_CASES = [
        // v0 tests
        {
            desc: 'should list master versions in prefix and skip delete markers with no delimiter',
            vFormat: 'v0',
            params: {
                prefix: 'foo/',
            },
            entries: [
                {
                    key: 'foo/deleted',
                    isDeleteMarker: true,
                    res: FILTER_ACCEPT,
                },
                {
                    key: `foo/deleted${VID_SEP}v1`,
                    isDeleteMarker: true,
                    res: FILTER_SKIP,
                    skipping: `foo/deleted${inc(VID_SEP)}`,
                },
                {
                    key: `foo/deleted${VID_SEP}v2`,
                    res: FILTER_SKIP,
                    skipping: `foo/deleted${inc(VID_SEP)}`,
                },
                {
                    key: 'foo/notdeleted',
                    res: FILTER_ACCEPT,
                },
                {
                    key: `foo/notdeleted${VID_SEP}v1`,
                    res: FILTER_SKIP,
                    skipping: `foo/notdeleted${inc(VID_SEP)}`,
                },
                {
                    key: 'foo/subprefix/key-1',
                    res: FILTER_ACCEPT,
                },
                {
                    key: `foo/subprefix/key-1${VID_SEP}v1`,
                    res: FILTER_SKIP,
                    skipping: `foo/subprefix/key-1${inc(VID_SEP)}`,
                },
            ],
            result: {
                CommonPrefixes: [],
                Contents: [
                    { key: 'foo/notdeleted', value: '{}' },
                    { key: 'foo/subprefix/key-1', value: '{}' },
                ],
                Delimiter: undefined,
                IsTruncated: false,
                NextMarker: undefined,
            },
        },
        {
            desc: 'should not skip delete markers when listing prefix',
            vFormat: 'v0',
            params: {
                prefix: 'foo/',
                delimiter: '/',
            },
            entries: [
                {
                    key: 'foo/01',
                    isDeleteMarker: true,
                    res: FILTER_ACCEPT,
                },
                {
                    key: `foo/01${VID_SEP}v1`,
                    isDeleteMarker: true,
                    res: FILTER_SKIP, // versions get skipped after master
                    skipping: `foo/01${inc(VID_SEP)}`,
                },
                {
                    key: 'foo/02',
                    isDeleteMarker: true,
                    res: FILTER_ACCEPT,
                },
                {
                    key: `foo/02${VID_SEP}v1`,
                    isDeleteMarker: true,
                    res: FILTER_SKIP,
                    skipping: `foo/02${inc(VID_SEP)}`,
                },
                {
                    key: 'foo/03',
                    res: FILTER_ACCEPT,
                },
                {
                    key: `foo/03${VID_SEP}v1`,
                    res: FILTER_SKIP,
                    skipping: `foo/03${inc(VID_SEP)}`,
                },
            ],
            result: {
                CommonPrefixes: [],
                Contents: [
                    { key: 'foo/03', value: '{}' },
                ],
                IsTruncated: false,
                Delimiter: '/',
                NextMarker: undefined,
            },
        },
        {
            desc: 'should not skip whole prefix while prefix only contains delete markers as latest versions',
            vFormat: 'v0',
            params: {
                prefix: 'foo/',
                delimiter: '/',
            },
            entries: [
                {
                    key: 'foo/bar/01',
                    isDeleteMarker: true,
                    res: FILTER_ACCEPT,
                },
                {
                    key: `foo/bar/01${VID_SEP}v1`,
                    isDeleteMarker: true,
                    res: FILTER_SKIP, // versions get skipped after master
                    skipping: `foo/bar/01${inc(VID_SEP)}`,
                },
                {
                    key: 'foo/bar/02',
                    isDeleteMarker: true,
                    res: FILTER_ACCEPT,
                },
                {
                    key: `foo/bar/02${VID_SEP}v1`,
                    isDeleteMarker: true,
                    res: FILTER_SKIP,
                    skipping: `foo/bar/02${inc(VID_SEP)}`,
                },
                {
                    key: `foo/bar/02${VID_SEP}v2`,
                    res: FILTER_SKIP,
                    skipping: `foo/bar/02${inc(VID_SEP)}`,
                },
                {
                    key: 'foo/bar/03',
                    res: FILTER_ACCEPT,
                },
                {
                    key: `foo/bar/03${VID_SEP}v1`,
                    res: FILTER_SKIP,
                    // from now on, skip the 'foo/bar/' prefix because we have already seen it
                    skipping: 'foo/bar0',
                },
                {
                    key: 'foo/bar/04',
                    isDeleteMarker: true,
                    res: FILTER_SKIP,
                    skipping: 'foo/bar0',
                },
                {
                    key: `foo/bar/04${VID_SEP}v1`,
                    isDeleteMarker: true,
                    res: FILTER_SKIP,
                    skipping: 'foo/bar0',
                },
                {
                    key: 'foo/baz/01',
                    res: FILTER_ACCEPT,
                },
                {
                    key: `foo/baz/01${VID_SEP}v1`,
                    res: FILTER_SKIP,
                    // skip the 'foo/baz/' prefix because we have already seen it
                    skipping: 'foo/baz0',
                },
            ],
            result: {
                CommonPrefixes: [
                    'foo/bar/',
                    'foo/baz/',
                ],
                Contents: [],
                IsTruncated: false,
                Delimiter: '/',
                NextMarker: undefined,
            },
        },
        {
            desc: 'should not skip prefix entirely if a key equals the prefix',
            vFormat: 'v0',
            params: {
                prefix: 'foo/',
                delimiter: '/',
            },
            entries: [
                {
                    key: 'foo/',
                    res: FILTER_ACCEPT,
                },
                {
                    key: `foo/${VID_SEP}v1`,
                    res: FILTER_SKIP,
                    skipping: `foo/${inc(VID_SEP)}`,
                },
                {
                    key: 'foo/deleted',
                    isDeleteMarker: true,
                    res: FILTER_ACCEPT,
                },
                {
                    key: `foo/deleted${VID_SEP}v1`,
                    isDeleteMarker: true,
                    res: FILTER_SKIP,
                    skipping: `foo/deleted${inc(VID_SEP)}`,
                },
                {
                    key: `foo/deleted${VID_SEP}v2`,
                    res: FILTER_SKIP,
                    skipping: `foo/deleted${inc(VID_SEP)}`,
                },
                {
                    key: 'foo/notdeleted',
                    res: FILTER_ACCEPT,
                },
                {
                    key: `foo/notdeleted${VID_SEP}v1`,
                    res: FILTER_SKIP,
                    skipping: `foo/notdeleted${inc(VID_SEP)}`,
                },
                {
                    key: 'foo/subprefix/key-1',
                    res: FILTER_ACCEPT,
                },
                {
                    key: `foo/subprefix/key-1${VID_SEP}v1`,
                    res: FILTER_SKIP,
                    skipping: 'foo/subprefix0',
                },
                {
                    key: 'foo/subprefix/key-2',
                    res: FILTER_SKIP,
                    skipping: 'foo/subprefix0',
                },
                {
                    key: `foo/subprefix/key-2${VID_SEP}v1`,
                    res: FILTER_SKIP,
                    skipping: 'foo/subprefix0',
                },
            ],
            result: {
                CommonPrefixes: [
                    'foo/subprefix/',
                ],
                Contents: [
                    { key: 'foo/', value: '{}' },
                    { key: 'foo/notdeleted', value: '{}' },
                ],
                Delimiter: '/',
                IsTruncated: false,
                NextMarker: undefined,
            },
        },
        {
            desc: 'should skip prefix if a key equals the prefix that does not end with delimiter',
            vFormat: 'v0',
            params: {
                prefix: 'foo',
                delimiter: '/',
            },
            entries: [
                {
                    key: 'foo',
                    res: FILTER_ACCEPT,
                },
                {
                    key: `foo${VID_SEP}v1`,
                    res: FILTER_SKIP,
                    skipping: `foo${inc(VID_SEP)}`,
                },
                {
                    key: 'foo/deleted',
                    isDeleteMarker: true,
                    res: FILTER_ACCEPT,
                },
                {
                    key: `foo/deleted${VID_SEP}v1`,
                    isDeleteMarker: true,
                    res: FILTER_SKIP,
                    skipping: `foo/deleted${inc(VID_SEP)}`,
                },
                {
                    key: `foo/deleted${VID_SEP}v2`,
                    res: FILTER_SKIP,
                    skipping: `foo/deleted${inc(VID_SEP)}`,
                },
                {
                    key: 'foo/notdeleted',
                    res: FILTER_ACCEPT,
                },
                {
                    key: `foo/notdeleted${VID_SEP}v1`,
                    res: FILTER_SKIP,
                    skipping: 'foo0',
                },
                {
                    key: 'foo/subprefix/key-1',
                    res: FILTER_SKIP,
                    skipping: 'foo0',
                },
                {
                    key: `foo/subprefix/key-1${VID_SEP}v1`,
                    res: FILTER_SKIP,
                    skipping: 'foo0',
                },
            ],
            result: {
                CommonPrefixes: [
                    'foo/',
                ],
                Contents: [
                    { key: 'foo', value: '{}' },
                ],
                Delimiter: '/',
                IsTruncated: false,
                NextMarker: undefined,
            },
        },
        {
            desc: 'should not skip over prefix when key equals the prefix and prefix key has delete marker',
            vFormat: 'v0',
            params: {
                prefix: 'foo/',
                delimiter: '/',
            },
            entries: [
                {
                    key: 'foo/',
                    isDeleteMarker: true,
                    res: FILTER_ACCEPT,
                },
                {
                    key: `foo/${VID_SEP}v1`,
                    isDeleteMarker: true,
                    res: FILTER_SKIP,
                    skipping: `foo/${inc(VID_SEP)}`,
                },
                {
                    key: 'foo/subprefix',
                    res: FILTER_ACCEPT,
                },
                {
                    key: 'foo/subprefix/01',
                    res: FILTER_ACCEPT,
                },
                {
                    key: 'foo/subprefix/02',
                    res: FILTER_SKIP,
                    skipping: 'foo/subprefix0', // already added to common prefix
                },
            ],
            result: {
                CommonPrefixes: [
                    'foo/subprefix/',
                ],
                Contents: [
                    { key: 'foo/subprefix', value: '{}' },
                ],
                Delimiter: '/',
                IsTruncated: false,
                NextMarker: undefined,
            },
        },
        {
            desc: 'should accept version following PHD key',
            vFormat: 'v0',
            params: {
                prefix: 'foo/',
                delimiter: '/',
            },
            entries: [
                {
                    key: 'foo/01',
                    isPHD: true,
                    res: FILTER_ACCEPT,
                },
                {
                    key: `foo/01${VID_SEP}v1`,
                    res: FILTER_ACCEPT,
                },
                {
                    key: `foo/01${VID_SEP}v2`,
                    res: FILTER_SKIP,
                    skipping: `foo/01${inc(VID_SEP)}`,
                },
                {
                    key: 'foo/02',
                    isDeleteMarker: true,
                    res: FILTER_ACCEPT,
                },
                {
                    key: `foo/02${VID_SEP}v1`,
                    isDeleteMarker: true,
                    res: FILTER_SKIP,
                    skipping: `foo/02${inc(VID_SEP)}`,
                },
                {
                    key: `foo/02${VID_SEP}v2`,
                    res: FILTER_SKIP,
                    skipping: `foo/02${inc(VID_SEP)}`,
                },
            ],
            result: {
                CommonPrefixes: [],
                Contents: [
                    { key: 'foo/01', value: '{}' },
                ],
                Delimiter: '/',
                IsTruncated: false,
                NextMarker: undefined,
            },
        },

        // v1 tests
        {
            desc: 'should accept all master keys with no delimiter',
            vFormat: 'v1',
            params: {
                prefix: 'foo/',
            },
            entries: [
                {
                    key: `${DbPrefixes.Master}foo/`,
                    res: FILTER_ACCEPT,
                },
                {
                    key: `${DbPrefixes.Master}foo/01`,
                    res: FILTER_ACCEPT,
                },
                {
                    key: `${DbPrefixes.Master}foo/subprefix/key-1`,
                    res: FILTER_ACCEPT,
                },
                {
                    key: `${DbPrefixes.Master}foo/subprefix/key-2`,
                    res: FILTER_ACCEPT,
                },
            ],
            result: {
                CommonPrefixes: [],
                Contents: [
                    { key: 'foo/', value: '{}' },
                    { key: 'foo/01', value: '{}' },
                    { key: 'foo/subprefix/key-1', value: '{}' },
                    { key: 'foo/subprefix/key-2', value: '{}' },
                ],
                Delimiter: undefined,
                IsTruncated: false,
                NextMarker: undefined,
            },
        },
        {
            desc: 'should not skip prefix entirely if a key equals the prefix',
            vFormat: 'v1',
            params: {
                prefix: 'foo/',
                delimiter: '/',
            },
            entries: [
                {
                    key: `${DbPrefixes.Master}foo/`,
                    res: FILTER_ACCEPT,
                },
                {
                    key: `${DbPrefixes.Master}foo/01`,
                    res: FILTER_ACCEPT,
                },
                {
                    key: `${DbPrefixes.Master}foo/subprefix/key-1`,
                    res: FILTER_ACCEPT,
                },
                {
                    key: `${DbPrefixes.Master}foo/subprefix/key-2`,
                    res: FILTER_SKIP,
                    skipping: `${DbPrefixes.Master}foo/subprefix0`,
                },
            ],
            result: {
                CommonPrefixes: [
                    'foo/subprefix/',
                ],
                Contents: [
                    { key: 'foo/', value: '{}' },
                    { key: 'foo/01', value: '{}' },
                ],
                Delimiter: '/',
                IsTruncated: false,
                NextMarker: undefined,
            },
        },
        {
            desc: 'should skip prefix if a key equals the prefix that does not end with delimiter',
            vFormat: 'v1',
            params: {
                prefix: 'foo',
                delimiter: '/',
            },
            entries: [
                {
                    key: `${DbPrefixes.Master}foo`,
                    res: FILTER_ACCEPT,
                },
                {
                    key: `${DbPrefixes.Master}foo/01`,
                    res: FILTER_ACCEPT,
                },
                {
                    key: `${DbPrefixes.Master}foo/subprefix/key-1`,
                    res: FILTER_SKIP,
                    skipping: `${DbPrefixes.Master}foo0`,
                },
            ],
            result: {
                CommonPrefixes: [
                    'foo/',
                ],
                Contents: [
                    { key: 'foo', value: '{}' },
                ],
                Delimiter: '/',
                IsTruncated: false,
                NextMarker: undefined,
            },
        },
    ];
    FILTER_TEST_CASES.forEach(testCase => {
        it(`vFormat=${testCase.vFormat}: ${testCase.desc}`, () => {
            const delimiter = new DelimiterMaster(testCase.params, fakeLogger, testCase.vFormat);
            const resultEntries = testCase.entries.map(testEntry => {
                const entry: any = {
                    key: testEntry.key,
                };
                if (testEntry.isDeleteMarker) {
                    entry.value = '{"isDeleteMarker":true}';
                } else if (testEntry.isPHD) {
                    entry.value = '{"isPHD":true}';
                } else {
                    entry.value = '{}';
                }
                const res = delimiter.filter(entry);
                const resultEntry = Object.assign({}, testEntry, { res });
                if (res === FILTER_SKIP) {
                    resultEntry.skipping = delimiter.skipping();
                } else {
                    delete resultEntry.skipping;
                }
                return resultEntry;
            });
            assert.deepStrictEqual(resultEntries, testCase.entries);
            assert.deepStrictEqual(delimiter.result(), testCase.result);
        });
    });
});

/**
 * Test class that provides a GapCache-compatible interface via a
 * GapSet implementation, i.e. without introducing a delay to expose
 * gaps like the GapCache class does, so tests can check more easily
 * which gaps have been updated.
 */
class GapCacheAsSet extends GapSet implements GapCacheInterface {
    exposureDelayMs: number;

    constructor(maxGapWeight: number) {
        super(maxGapWeight);
        this.exposureDelayMs = 1000;
    }

    static createFromArray(gaps: GapSetEntry[], maxWeight: number): GapCacheAsSet {
        const gs = new GapCacheAsSet(maxWeight);
        for (const gap of gaps) {
            gs._gaps.insert(gap);
        }
        return gs;
    }

    get maxGapWeight(): number {
        return super.maxWeight;
    }
}

type FilterEntriesResumeState = {
    i: number,
    version: number,
};

/**
 * Convenience test helper to build listing entries and pass them to
 * the DelimiterMaster.filter() function in order, and checks the
 * return code. It is also useful to check the state of the gap cache
 * afterwards.
 *
 * The first object key is "pre/0001" and is incremented on each master key.
 *
 * The current object version is "v100" and the version is then incremented
 * for each noncurrent version ("v101" etc.).
 *
 * @param {DelimiterMaster} listing - listing algorithm instance
 * @param {string} pattern - pattern of keys to create:
 *   - an upper-case letter is a master key
 *   - a lower-case letter is a version key
 *   - a 'd' (or 'D') letter is a delete marker
 *   - any other letter (e.g. 'v' or 'V') is a regular version
 *   - space characters ' ' are allowed and must be matched by
 *     a space character at the same position in 'expectedCodes'

 * @param {string} expectedCodes - string of expected codes from filter()
 * matching each entry from 'pattern':
 *   - 'a' stands for FILTER_ACCEPT
 *   - 's' stands for FILTER_SKIP
 *   - 'e' stands for FILTER_END
 *   - ' ' must be matched by a space character in 'pattern'
 * @return {FilterEntriesResumeState} - a state that can be passed in
 * the next call as 'resumeFromState' to resume filtering the next
 * keys
 */
function filterEntries(
    listing: DelimiterMaster,
    pattern: string,
    expectedCodes: string,
    resumeFromState?: FilterEntriesResumeState,
): FilterEntriesResumeState {
    const ExpectedCodeMap: string[] = [];
    ExpectedCodeMap[FILTER_ACCEPT] = 'a';
    ExpectedCodeMap[FILTER_SKIP] = 's';
    ExpectedCodeMap[FILTER_END] = 'e';
    let { i, version } = resumeFromState || { i: 0, version: 100 };
    const obtainedCodes = pattern.split('').map(p => {
        if (p === ' ') {
            return ' ';
        }
        if (p.toUpperCase() === p) {
            // master key
            i += 1;
            version = 100;
        }
        const keyId = `0000${i}`.slice(-4);
        const key = `pre/${keyId}`;
        const md: any = ('Dd'.includes(p)) ? { isDeleteMarker: true } : {};
        md.versionId = `v${version}`;
        const value = JSON.stringify(md);
        const entry = (p.toUpperCase() === p) ? { key, value } : { key: `${key}\0v${version}`, value };
        const ret = listing.filter(entry);
        if (p.toLowerCase() === p) {
            // version key
            version += 1;
        }
        return ExpectedCodeMap[<number> <unknown> ret];
    }).join('');
    expect(obtainedCodes).toEqual(expectedCodes);

    return { i, version };
}

describe('DelimiterMaster listing algorithm: gap caching and lookup', () => {
    it('should not cache a gap of weight smaller than minGapWeight', () => {
        const listing = new DelimiterMaster({}, fakeLogger, 'v0');
        const gapCache = new GapCacheAsSet(100);
        listing.refreshGapCache(gapCache, 7); // minGapWeight=7

        filterEntries(listing, 'Vv Ddv Ddv Vv Ddv', 'as ass ass as ass');
        expect(gapCache.toArray()).toEqual([]);
    });

    it('should cache a gap of weight equal to minGapWeight', () => {
        const listing = new DelimiterMaster({}, fakeLogger, 'v0');
        const gapCache = new GapCacheAsSet(100);
        listing.refreshGapCache(gapCache, 9); // minGapWeight=9

        filterEntries(listing, 'Vv Ddv Ddv Ddv Vv Ddv', 'as ass ass ass as ass');
        expect(gapCache.toArray()).toEqual([
            { firstKey: 'pre/0002', lastKey: `pre/0004${VID_SEP}v101`, weight: 9 },
        ]);
    });

    it('should cache a gap of weight equal to maxWeight in a single gap', () => {
        const listing = new DelimiterMaster({}, fakeLogger, 'v0');
        const gapCache = new GapCacheAsSet(13); // maxWeight=13
        listing.refreshGapCache(gapCache, 5); // minGapWeight=5

        filterEntries(listing, 'Vv Ddv Ddvv Ddv Ddv Vv Ddv', 'as ass asss ass ass as ass');
        expect(gapCache.toArray()).toEqual([
            { firstKey: 'pre/0002', lastKey: `pre/0005${VID_SEP}v101`, weight: 13 },
        ]);
    });

    it('should not cache a gap if listing has been running for more than exposureDelayMs',
    async () => {
        const listing = new DelimiterMaster({}, fakeLogger, 'v0');
        const gapsArray = [
            { firstKey: 'pre/0006', lastKey: `pre/0007${VID_SEP}v100`, weight: 6 },
        ];
        const gapCache = GapCacheAsSet.createFromArray(JSON.parse(
            JSON.stringify(gapsArray)
        ), 100);
        listing.refreshGapCache(gapCache, 1, 1);

        let resumeFromState = filterEntries(listing, 'Vv', 'as');
        let validityPeriod = listing.getGapBuildingValidityPeriodMs();
        expect(validityPeriod).toBeGreaterThan(gapCache.exposureDelayMs - 10);
        expect(validityPeriod).toBeLessThan(gapCache.exposureDelayMs + 10);

        await new Promise(resolve => setTimeout(resolve, gapCache.exposureDelayMs + 10));
        validityPeriod = listing.getGapBuildingValidityPeriodMs();
        expect(validityPeriod).toEqual(0);
        resumeFromState = filterEntries(listing, 'Ddv Ddv Ddv Vvv', 'ass ass ass ass',
                                        resumeFromState);
        expect(gapCache.toArray()).toEqual(gapsArray);
        // gap building should be in expired state
        expect(listing._gapBuilding.state).toEqual(GapBuildingState.Expired);
        // remaining validity period should still be 0 because gap building has expired
        validityPeriod = listing.getGapBuildingValidityPeriodMs();
        expect(validityPeriod).toEqual(0);

        // we should still be able to skip over the existing cached gaps
        expect(listing._gapCaching.state).toEqual(GapCachingState.GapLookupInProgress);
        await new Promise(resolve => setTimeout(resolve, 1));
        expect(listing._gapCaching.state).toEqual(GapCachingState.GapCached);
        filterEntries(listing, 'Ddv Ddv Ddv', 'sss sss ass', resumeFromState);
    });

    [1, 3, 5, 10].forEach(triggerSaveGapWeight => {
        it('should cache a gap of weight maxWeight + 1 in two chained gaps ' +
        `(triggerSaveGapWeight=${triggerSaveGapWeight})`, () => {
            const listing = new DelimiterMaster({}, fakeLogger, 'v0');
            const gapCache = new GapCacheAsSet(12); // maxWeight=12
            listing.refreshGapCache(gapCache, 5, triggerSaveGapWeight);

            filterEntries(listing, 'Vv Ddv Ddvv Ddv Ddv Vv Ddv', 'as ass asss ass ass as ass');
            if (triggerSaveGapWeight === 1) {
                // trigger=1 guarantees that the weight of split gaps is maximized
                expect(gapCache.toArray()).toEqual([
                    { firstKey: 'pre/0002', lastKey: `pre/0005${VID_SEP}v100`, weight: 12 },
                    { firstKey: `pre/0005${VID_SEP}v100`, lastKey: `pre/0005${VID_SEP}v101`, weight: 1 },
                ]);
            } else if (triggerSaveGapWeight === 3) {
                // - the first trigger happens after 'minGapWeight' listing entries, so 5
                // - the second and third triggers happen after 'triggerSaveGapWeight' listing
                //   entries, so 3 then 3 - same gap because 5+3+3=11 and 11 <= 12 (maxWeight)
                // - finally, 2 more entries to complete the gap, at which point the
                //   entry is split, hence we get two entries weights 11 and 2 respectively.
                expect(gapCache.toArray()).toEqual([
                    { firstKey: 'pre/0002', lastKey: 'pre/0005', weight: 11 },
                    { firstKey: 'pre/0005', lastKey: `pre/0005${VID_SEP}v101`, weight: 2 },
                ]);
            } else {
                // trigger=5|10
                expect(gapCache.toArray()).toEqual([
                    { firstKey: 'pre/0002', lastKey: `pre/0004${VID_SEP}v101`, weight: 10 },
                    { firstKey: `pre/0004${VID_SEP}v101`, lastKey: `pre/0005${VID_SEP}v101`, weight: 3 },
                ]);
            }
        });
    });

    [1, 2, 3].forEach(triggerSaveGapWeight => {
        it('should cache a gap of weight more than twice maxWeight in as many chained gaps ' +
        `as needed (triggerSaveGapWeight=${triggerSaveGapWeight})`, () => {
            const listing = new DelimiterMaster({}, fakeLogger, 'v0');
            const gapCache = new GapCacheAsSet(5); // maxWeight=5
            // minGapWeight=4 prevents the last gap starting at "0008" from being cached
            listing.refreshGapCache(gapCache, 4, triggerSaveGapWeight);

            filterEntries(listing, 'Vv Ddv Ddvv Ddv Ddv Ddv Vv Ddv', 'as ass asss ass ass ass as ass');
            // the slight differences in weight between different values of
            // 'triggerSaveGapWeight' are due to the combination of the trigger
            // frequency and the 'minGapWeight' value (3), but in all cases a
            // reasonable splitting job should be obtained.
            //
            // NOTE: in practice, the default trigger is half the maximum weight, any value
            // equal or lower should yield gap weights close enough to the maximum allowed.
            if (triggerSaveGapWeight === 1) {
                // a trigger at every key guarantees gaps to maximize their weight
                expect(gapCache.toArray()).toEqual([
                    { firstKey: 'pre/0002', lastKey: `pre/0003${VID_SEP}v100`, weight: 5 },
                    { firstKey: `pre/0003${VID_SEP}v100`, lastKey: `pre/0004${VID_SEP}v101`, weight: 5 },
                    { firstKey: `pre/0004${VID_SEP}v101`, lastKey: `pre/0006${VID_SEP}v100`, weight: 5 },
                    { firstKey: `pre/0006${VID_SEP}v100`, lastKey: `pre/0006${VID_SEP}v101`, weight: 1 },
                ]);
            } else if (triggerSaveGapWeight === 2) {
                expect(gapCache.toArray()).toEqual([
                    { firstKey: 'pre/0002', lastKey: 'pre/0003', weight: 4 },
                    { firstKey: 'pre/0003', lastKey: 'pre/0004', weight: 4 },
                    { firstKey: 'pre/0004', lastKey: `pre/0005${VID_SEP}v100`, weight: 4 },
                    { firstKey: `pre/0005${VID_SEP}v100`, lastKey: `pre/0006${VID_SEP}v101`, weight: 4 },
                ]);
            } else {
                // trigger=3
                expect(gapCache.toArray()).toEqual([
                    { firstKey: 'pre/0002', lastKey: 'pre/0003', weight: 4 },
                    { firstKey: 'pre/0003', lastKey: `pre/0003${VID_SEP}v102`, weight: 3 },
                    { firstKey: `pre/0003${VID_SEP}v102`, lastKey: `pre/0004${VID_SEP}v101`, weight: 3 },
                    { firstKey: `pre/0004${VID_SEP}v101`, lastKey: `pre/0005${VID_SEP}v101`, weight: 3 },
                    { firstKey: `pre/0005${VID_SEP}v101`, lastKey: `pre/0006${VID_SEP}v101`, weight: 3 },
                ]);
            }
        });
    });

    it('should cut the current gap when seeing a non-deleted object, and start a new ' +
    'gap on the next deleted object', () => {
        const listing = new DelimiterMaster({}, fakeLogger, 'v0');
        const gapCache = new GapCacheAsSet(100);
        listing.refreshGapCache(gapCache, 2); // minGapWeight=2

        filterEntries(listing, 'Vv Ddv Vv Ddv Vv', 'as ass as ass as');
        expect(gapCache.toArray()).toEqual([
            { firstKey: 'pre/0002', lastKey: `pre/0002${VID_SEP}v101`, weight: 3 },
            { firstKey: 'pre/0004', lastKey: `pre/0004${VID_SEP}v101`, weight: 3 },
        ]);
    });

    it('should complete the current gap when returning a result', () => {
        const listing = new DelimiterMaster({}, fakeLogger, 'v0');
        const gapCache = new GapCacheAsSet(100);
        listing.refreshGapCache(gapCache, 2); // ensure the gap above minGapWeight=2 gets saved

        filterEntries(listing, 'Vv Ddv Ddv', 'as ass ass');
        const result = listing.result();
        expect(result).toEqual({
            CommonPrefixes: [],
            Contents: [
                { key: 'pre/0001', value: '{"versionId":"v100"}' },
            ],
            Delimiter: undefined,
            IsTruncated: false,
            NextMarker: undefined,
        });
        expect(gapCache.toArray()).toEqual([
            { firstKey: 'pre/0002', lastKey: `pre/0003${VID_SEP}v101`, weight: 6 },
        ]);
    });

    it('should refresh the building params when refreshGapCache() is called in NonBuilding state',
    () => {
        const listing = new DelimiterMaster({}, fakeLogger, 'v0');
        const gapCache = new GapCacheAsSet(100);
        // ensure the first gap with weight=9 gets saved
        listing.refreshGapCache(gapCache, 9);
        let resumeFromState = filterEntries(listing, 'Vv', 'as');
        // refresh with a different value for minGapWeight (12)
        listing.refreshGapCache(gapCache, 12);

        resumeFromState = filterEntries(listing, 'Ddv Ddv Ddv Vv', 'ass ass ass as',
                                        resumeFromState);
        // for the building gap, minGapWeight should have been updated to 12, hence the
        // gap should not have been created
        expect(gapCache.toArray()).toEqual([]);
        filterEntries(listing, 'Ddv Ddv Ddv Ddv Vv', 'ass ass ass ass as', resumeFromState);
        // there should now be a new gap with weight=12
        expect(gapCache.toArray()).toEqual([
            { firstKey: 'pre/0006', lastKey: `pre/0009${VID_SEP}v101`, weight: 12 },
        ]);
    });

    it('should save the refreshed building params when refreshGapCache() is called in Building state',
    () => {
        const listing = new DelimiterMaster({}, fakeLogger, 'v0');
        const gapCache = new GapCacheAsSet(100);
        // ensure the first gap with weight=9 gets saved
        listing.refreshGapCache(gapCache, 9);

        let resumeFromState = filterEntries(listing, 'Vv Ddv Ddv', 'as ass ass');
        // refresh with a different value for minGapWeight (12)
        listing.refreshGapCache(gapCache, 12);
        resumeFromState = filterEntries(listing, 'Ddv Vv', 'ass as', resumeFromState);
        // for the building gap, minGapWeight should still be 9, hence the gap should
        // have been created
        expect(gapCache.toArray()).toEqual([
            { firstKey: 'pre/0002', lastKey: `pre/0004${VID_SEP}v101`, weight: 9 },
        ]);
        filterEntries(listing, 'Ddv Ddv Ddv Vv', 'ass ass ass as', resumeFromState);
        // there should still be only one gap because the next gap's weight is 9 and 9 < 12
        expect(gapCache.toArray()).toEqual([
            { firstKey: 'pre/0002', lastKey: `pre/0004${VID_SEP}v101`, weight: 9 },
        ]);
    });

    it('should not build a new gap when skipping a prefix', () => {
        const listing = new DelimiterMaster({
            delimiter: '/',
        }, fakeLogger, 'v0');
        const gapCache = new GapCacheAsSet(100);
        // force immediate creation of gaps with 1, 1
        listing.refreshGapCache(gapCache, 1, 1);

        // prefix should be skipped, but no new gap should be created
        filterEntries(listing, 'Vv Ddv Ddv Ddv', 'as sss sss sss');
        expect(gapCache.toArray()).toEqual([]);
    });

    it('should trigger gap lookup and continue filtering without skipping when encountering ' +
    'a delete marker', () => {
        const listing = new DelimiterMaster({}, fakeLogger, 'v0');
        const gapsArray = [
            { firstKey: 'pre/0002', lastKey: `pre/0003${VID_SEP}v100`, weight: 6 },
        ];
        const gapCache = GapCacheAsSet.createFromArray(JSON.parse(
            JSON.stringify(gapsArray)
        ), 100);
        listing.refreshGapCache(gapCache);

        let resumeState = filterEntries(listing, 'Vv', 'as');
        // state should still be UnknownGap since no delete marker has been seen yet
        expect(listing._gapCaching.state).toEqual(GapCachingState.UnknownGap);

        resumeState = filterEntries(listing, 'D', 'a', resumeState);
        // since the lookup is asynchronous (Promise-based), it should now be in progress
        expect(listing._gapCaching.state).toEqual(GapCachingState.GapLookupInProgress);

        filterEntries(listing, 'dv Ddv Vv Ddv', 'ss ass as ass', resumeState);
        // the lookup should still be in progress
        expect(listing._gapCaching.state).toEqual(GapCachingState.GapLookupInProgress);

        // the gap cache shouldn't have been updated
        expect(gapCache.toArray()).toEqual(gapsArray);
    });

    it('should cache a gap after lookup completes, and use it to skip over keys ' +
    'within the gap range', async () => {
        const listing = new DelimiterMaster({}, fakeLogger, 'v0');
        const gapsArray = [
            { firstKey: 'pre/0002', lastKey: `pre/0006${VID_SEP}v101`, weight: 14 },
        ];
        const gapCache = GapCacheAsSet.createFromArray(JSON.parse(
            JSON.stringify(gapsArray)
        ), 100);
        listing.refreshGapCache(gapCache);

        let resumeState = filterEntries(listing, 'Vv D', 'as a');
        // since the lookup is asynchronous (Promise-based), it should now be in progress
        expect(listing._gapCaching.state).toEqual(GapCachingState.GapLookupInProgress);
        expect(listing.state.id).toEqual(DelimiterMasterFilterStateId.SkippingVersionsV0);
        // wait until the lookup completes (should happen in the next
        // event loop iteration so always quicker than a non-immediate timer)
        await new Promise(resolve => setTimeout(resolve, 1));

        // the lookup should have completed now and the next gap should be cached
        expect(listing._gapCaching.state).toEqual(GapCachingState.GapCached);
        expect(listing.state.id).toEqual(DelimiterMasterFilterStateId.SkippingVersionsV0);

        // the state should stay in SkippingVersionsV0 until filter() is called with
        // a new master delete marker
        resumeState = filterEntries(listing, 'dvvv', 'ssss', resumeState);
        expect(listing.state.id).toEqual(DelimiterMasterFilterStateId.SkippingVersionsV0);

        // here comes the next master delete marker, it should be skipped as it is still within
        // the cached gap's range (its key is "0003" and version "v100")
        resumeState = filterEntries(listing, 'D', 's', resumeState);
        // the listing algorithm should now be actively skipping the gap
        expect(listing.state.id).toEqual(DelimiterMasterFilterStateId.SkippingGapV0);

        // the skipping() function should return the gap's last key.
        // NOTE: returning a key to jump to that is the actual gap's last key
        // (instead of a key just after) allows the listing algorithm to build
        // a chained gap when the database listing is restarted from that point
        // and there are more delete markers to skip.
        expect(listing.skipping()).toEqual(`pre/0006${VID_SEP}v101`);

        // - The next master delete markers with key "0004" and "0005" are still within the
        //   gap's range, so filter() should return FILTER_SKIP ('s')
        //
        // - Master key "0006" is NOT a delete marker, although this means that the update
        //   happened after the gap was looked up and the listing is allowed to skip it as
        //   well (it actually doesn't even check so doesn't know what type of key it is).
        //
        // - The following master delete marker "0007" is past the gap so returns
        //   FILTER_ACCEPT ('a') and should have triggered a new cache lookup, and
        //   the listing state should have been switched back to SkippingVersionsV0.
        resumeState = filterEntries(listing, 'dv Ddv Ddv Vvvv Ddv', 'ss sss sss ssss ass',
                                    resumeState);
        expect(listing._gapCaching.state).toEqual(GapCachingState.GapLookupInProgress);
        expect(listing.state.id).toEqual(DelimiterMasterFilterStateId.SkippingVersionsV0);

        // the gap cache must not have been updated in the process
        expect(gapCache.toArray()).toEqual(gapsArray);
    });

    it('should extend a cached gap forward if current delete markers are listed beyond',
    async () => {
        const listing = new DelimiterMaster({}, fakeLogger, 'v0');
        const gapsArray = [
            { firstKey: 'pre/0002', lastKey: `pre/0005${VID_SEP}v100`, weight: 12 },
        ];
        const gapCache = GapCacheAsSet.createFromArray(JSON.parse(
            JSON.stringify(gapsArray)
        ), 100);
        listing.refreshGapCache(gapCache, 2);

        let resumeState = filterEntries(listing, 'Vv D', 'as a');
        // wait until the lookup completes (should happen in the next
        // event loop iteration so always quicker than a non-immediate timer)
        await new Promise(resolve => setTimeout(resolve, 1));

        // the lookup should have completed now and the next gap should be cached,
        // continue with filtering
        resumeState = filterEntries(listing, 'dv Ddv Ddv Ddv Ddv Ddvvv Vv Ddv Vv',
                                    'ss sss sss sss ass assss as ass as',
                                    resumeState);
        // the cached gap should be extended to the last key before the last regular
        // master version ('V')
        expect(gapCache.toArray()).toEqual([
            // this gap has been extended forward up to right before the first non-deleted
            // current version following the gap, and its weight updated with how many
            // extra keys are skippable
            { firstKey: 'pre/0002', lastKey: `pre/0007${VID_SEP}v103`, weight: 21 },
            // this gap has been created from the next deleted current version
            { firstKey: 'pre/0009', lastKey: `pre/0009${VID_SEP}v101`, weight: 3 },
        ]);
    });

    it('should extend a cached gap backwards if current delete markers are listed ahead, ' +
    'and forward if more skippable keys are seen', async () => {
        const listing = new DelimiterMaster({}, fakeLogger, 'v0');
        const gapsArray = [
            { firstKey: 'pre/0004', lastKey: `pre/0005${VID_SEP}v100`, weight: 4 },
        ];
        const gapCache = GapCacheAsSet.createFromArray(JSON.parse(
            JSON.stringify(gapsArray)
        ), 100);
        listing.refreshGapCache(gapCache, 2);

        let resumeState = filterEntries(listing, 'Vv D', 'as a');
        // wait until the lookup completes (should happen in the next
        // event loop iteration so always quicker than a non-immediate timer)
        await new Promise(resolve => setTimeout(resolve, 1));

        // the lookup should have completed now and the next gap should be cached,
        // continue with filtering
        expect(listing._gapCaching.state).toEqual(GapCachingState.GapCached);
        resumeState = filterEntries(listing, 'dv Ddv Ddv Ddv Vv Ddv Vv',
                                    'ss ass sss sss as ass as', resumeState);
        // the cached gap should be extended to the last key before the last regular
        // master version ('V')
        expect(gapCache.toArray()).toEqual([
            // this gap has been extended:
            // - backwards up to the first listed delete marker
            // - forward up to the last skippable key
            // and its weight updated with how many extra keys are skippable
            { firstKey: 'pre/0002', lastKey: `pre/0005${VID_SEP}v101`, weight: 11 },
            // this gap has been created from the next deleted current version
            { firstKey: 'pre/0007', lastKey: `pre/0007${VID_SEP}v101`, weight: 3 },
        ]);
    });

    it('should not extend a cached gap forward if extension weight is 0',
    async () => {
        const listing = new DelimiterMaster({}, fakeLogger, 'v0');
        const gapsArray = [
            { firstKey: 'pre/0002', lastKey: `pre/0005${VID_SEP}v101`, weight: 13 },
        ];
        const gapCache = GapCacheAsSet.createFromArray(JSON.parse(
            JSON.stringify(gapsArray)
        ), 100);
        listing.refreshGapCache(gapCache, 2);

        let resumeState = filterEntries(listing, 'Vv D', 'as a');
        // wait until the lookup completes (should happen in the next
        // event loop iteration so always quicker than a non-immediate timer)
        await new Promise(resolve => setTimeout(resolve, 1));

        // the lookup should have completed now and the next gap should
        // be cached, simulate a concurrent invalidation by removing the
        // existing gap immediately, then continue with filtering
        resumeState = filterEntries(listing, 'dv Ddv Ddv Ddv',
                                    'ss sss sss sss', resumeState);
        gapCache.removeOverlappingGaps(['pre/0002']);
        resumeState = filterEntries(listing, 'Vv', 'as', resumeState);
        // no new gap should have been added
        expect(gapCache.toArray()).toEqual([]);
    });

    it('should ignore gap with 0 listed key in it (e.g. due to skipping a prefix)', async () => {
        const listing = new DelimiterMaster({}, fakeLogger, 'v0');
        const gapsArray = [
            { firstKey: 'pre/0004/a', lastKey: 'pre/0004/b', weight: 10 },
        ];
        const gapCache = GapCacheAsSet.createFromArray(JSON.parse(
            JSON.stringify(gapsArray)
        ), 100);
        listing.refreshGapCache(gapCache);

        let resumeState = filterEntries(listing, 'Dd Vv Vv', 'as as as');
        // wait until the lookup completes (should happen in the next
        // event loop iteration so always quicker than a non-immediate timer)
        await new Promise(resolve => setTimeout(resolve, 1));

        expect(listing._gapCaching.state).toEqual(GapCachingState.GapCached);
        expect(gapCache.toArray()).toEqual([
            { firstKey: 'pre/0004/a', lastKey: 'pre/0004/b', weight: 10 },
        ]);
        // "0004" keys are still prior to the gap's first key
        resumeState = filterEntries(listing, 'Ddv', 'ass', resumeState);
        expect(listing._gapCaching.state).toEqual(GapCachingState.GapCached);

        // the next delete marker "0005" should trigger a new lookup...
        resumeState = filterEntries(listing, 'D', 'a', resumeState);
        expect(listing._gapCaching.state).toEqual(GapCachingState.GapLookupInProgress);
        await new Promise(resolve => setTimeout(resolve, 1));

        // ...which returns 'null' and sets the state to NoMoreGap
        expect(listing._gapCaching.state).toEqual(GapCachingState.NoMoreGap);
        filterEntries(listing, 'dv Vv', 'ss as', resumeState);
    });

    it('should disable gap fetching and building if using V1 format', async () => {
        const listing = new DelimiterMaster({}, fakeLogger, 'v1');
        const gapCache = new GapCacheAsSet(100);
        listing.refreshGapCache(gapCache);

        expect(listing.getGapBuildingValidityPeriodMs()).toBeNull();
        expect(listing._gapCaching.state).toEqual(GapCachingState.NoGapCache);
        // mimic V1 listing of master prefix
        filterEntries(listing, 'V V', 'a a');
        expect(listing._gapBuilding.state).toEqual(GapBuildingState.Disabled);
    });
});
