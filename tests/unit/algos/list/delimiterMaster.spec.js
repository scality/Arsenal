'use strict'; // eslint-disable-line strict

const assert = require('assert');

const DelimiterMaster =
    require('../../../../lib/algos/list/delimiterMaster').DelimiterMaster;
const {
    FILTER_ACCEPT,
    FILTER_SKIP,
    FILTER_END,
    SKIP_NONE,
    inc,
} = require('../../../../lib/algos/list/tools');
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
            it('should return <key><VersionIdSeparator> for DelimiterMaster when ' +
            'NextMarker is set and there is a delimiter', () => {
                const key = 'key';
                const delimiter = new DelimiterMaster(
                    { delimiter: '/', marker: key },
                    fakeLogger, vFormat);

                /* Filter a master version to set NextMarker. */
                const listingKey = getListingKey(key, vFormat);
                delimiter.filter({ key: listingKey, value: '' });
                assert.strictEqual(delimiter.nextMarker, key);

                /* With a delimiter skipping should return previous key + VID_SEP
                 * (except when a delimiter is set and the NextMarker ends with the
                 * delimiter) . */
                assert.strictEqual(delimiter.skipping(), listingKey + VID_SEP);
            });

            it('should return <key><VersionIdSeparator> for DelimiterMaster when ' +
            'NextContinuationToken is set and there is a delimiter', () => {
                const key = 'key';
                const delimiter = new DelimiterMaster(
                    { delimiter: '/', startAfter: key, v2: true },
                    fakeLogger, vFormat);

                // Filter a master version to set NextContinuationToken
                const listingKey = getListingKey(key, vFormat);
                delimiter.filter({ key: listingKey, value: '' });
                assert.strictEqual(delimiter.nextMarker, key);

                assert.strictEqual(delimiter.skipping(), listingKey + VID_SEP);
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
                    assert.strictEqual(delimiter.skipping(), DbPrefixes.Replay);

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
                            `${inc(DbPrefixes.Replay)}foo/` :
                            `${inc(DbPrefixes.Replay)}foo/bar${VID_SEP}`);
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
                    skipping: `foo/deleted${VID_SEP}`,
                },
                {
                    key: `foo/deleted${VID_SEP}v2`,
                    res: FILTER_SKIP,
                    skipping: `foo/deleted${VID_SEP}`,
                },
                {
                    key: 'foo/notdeleted',
                    res: FILTER_ACCEPT,
                },
                {
                    key: `foo/notdeleted${VID_SEP}v1`,
                    res: FILTER_SKIP,
                    skipping: `foo/notdeleted${VID_SEP}`,
                },
                {
                    key: 'foo/subprefix/key-1',
                    res: FILTER_ACCEPT,
                },
                {
                    key: `foo/subprefix/key-1${VID_SEP}v1`,
                    res: FILTER_SKIP,
                    skipping: `foo/subprefix/key-1${VID_SEP}`,
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
                    skipping: `foo/01${VID_SEP}`,
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
                    skipping: `foo/02${VID_SEP}`,
                },
                {
                    key: 'foo/03',
                    res: FILTER_ACCEPT,
                },
                {
                    key: `foo/03${VID_SEP}v1`,
                    res: FILTER_SKIP,
                    skipping: `foo/03${VID_SEP}`,
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
                    skipping: `foo/bar/01${VID_SEP}`,
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
                    skipping: `foo/bar/02${VID_SEP}`,
                },
                {
                    key: `foo/bar/02${VID_SEP}v2`,
                    res: FILTER_SKIP,
                    skipping: `foo/bar/02${VID_SEP}`,
                },
                {
                    key: 'foo/bar/03',
                    res: FILTER_ACCEPT,
                },
                {
                    key: `foo/bar/03${VID_SEP}v1`,
                    res: FILTER_SKIP,
                    // from now on, skip the 'foo/bar/' prefix because we have already seen it
                    skipping: 'foo/bar/',
                },
                {
                    key: 'foo/bar/04',
                    isDeleteMarker: true,
                    res: FILTER_SKIP,
                    skipping: 'foo/bar/',
                },
                {
                    key: `foo/bar/04${VID_SEP}v1`,
                    isDeleteMarker: true,
                    res: FILTER_SKIP,
                    skipping: 'foo/bar/',
                },
                {
                    key: 'foo/baz/01',
                    res: FILTER_ACCEPT,
                },
                {
                    key: `foo/baz/01${VID_SEP}v1`,
                    res: FILTER_SKIP,
                    // skip the 'foo/baz/' prefix because we have already seen it
                    skipping: 'foo/baz/',
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
                    skipping: `foo/${VID_SEP}`,
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
                    skipping: `foo/deleted${VID_SEP}`,
                },
                {
                    key: `foo/deleted${VID_SEP}v2`,
                    res: FILTER_SKIP,
                    skipping: `foo/deleted${VID_SEP}`,
                },
                {
                    key: 'foo/notdeleted',
                    res: FILTER_ACCEPT,
                },
                {
                    key: `foo/notdeleted${VID_SEP}v1`,
                    res: FILTER_SKIP,
                    skipping: `foo/notdeleted${VID_SEP}`,
                },
                {
                    key: 'foo/subprefix/key-1',
                    res: FILTER_ACCEPT,
                },
                {
                    key: `foo/subprefix/key-1${VID_SEP}v1`,
                    res: FILTER_SKIP,
                    skipping: 'foo/subprefix/',
                },
                {
                    key: 'foo/subprefix/key-2',
                    res: FILTER_SKIP,
                    skipping: 'foo/subprefix/',
                },
                {
                    key: `foo/subprefix/key-2${VID_SEP}v1`,
                    res: FILTER_SKIP,
                    skipping: 'foo/subprefix/',
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
                    skipping: `foo${VID_SEP}`,
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
                    skipping: `foo/deleted${VID_SEP}`,
                },
                {
                    key: `foo/deleted${VID_SEP}v2`,
                    res: FILTER_SKIP,
                    skipping: `foo/deleted${VID_SEP}`,
                },
                {
                    key: 'foo/notdeleted',
                    res: FILTER_ACCEPT,
                },
                {
                    key: `foo/notdeleted${VID_SEP}v1`,
                    res: FILTER_SKIP,
                    skipping: 'foo/',
                },
                {
                    key: 'foo/subprefix/key-1',
                    res: FILTER_SKIP,
                    skipping: 'foo/',
                },
                {
                    key: `foo/subprefix/key-1${VID_SEP}v1`,
                    res: FILTER_SKIP,
                    skipping: 'foo/',
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
                    skipping: `foo/${VID_SEP}`,
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
                    skipping: 'foo/subprefix/', // already added to common prefix
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
                    skipping: `foo/01${VID_SEP}`,
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
                    skipping: `foo/02${VID_SEP}`,
                },
                {
                    key: `foo/02${VID_SEP}v2`,
                    res: FILTER_SKIP,
                    skipping: `foo/02${VID_SEP}`,
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
                    skipping: `${DbPrefixes.Master}foo/subprefix/`,
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
                    skipping: `${DbPrefixes.Master}foo/`,
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
                const entry = {
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
