'use strict'; // eslint-disable-line strict

const assert = require('assert');

const DelimiterMaster =
    require('../../../../lib/algos/list/delimiterMaster').DelimiterMaster;
const {
    FILTER_ACCEPT,
    FILTER_SKIP,
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
    describe(`Delimiter All masters listing algorithm vFormat=${vFormat}`, () => {
        it('should return SKIP_NONE for DelimiterMaster when both NextMarker ' +
        'and NextContinuationToken are undefined', () => {
            const delimiter = new DelimiterMaster({ delimiter: '/' }, fakeLogger, vFormat);

            assert.strictEqual(delimiter.NextMarker, undefined);

            // When there is no NextMarker or NextContinuationToken, it should
            // return SKIP_NONE
            assert.strictEqual(delimiter.skipping(), SKIP_NONE);
        });

        it('should return good skipping value for DelimiterMaster when ' +
        'NextMarker is set and there is a delimiter', () => {
            const key = 'key';
            const delimiter = new DelimiterMaster({ delimiter: '/', marker: key },
                fakeLogger, vFormat);

            /* Filter a master version to set NextMarker. */
            const listingKey = getListingKey(key, vFormat);
            delimiter.filter({ key: listingKey, value: '' });
            assert.strictEqual(delimiter.NextMarker, key);

            if (vFormat === 'v0') {
                // With a delimiter skipping should return previous key + VID_SEP in v0
                assert.strictEqual(delimiter.skipping(), listingKey + VID_SEP);
            } else {
                // in v1 there are no versions to skip
                assert.strictEqual(delimiter.skipping(), SKIP_NONE);
            }
        });

        it('should return good skipping value for DelimiterMaster when ' +
        'NextContinuationToken is set and there is a delimiter', () => {
            const key = 'key';
            const delimiter = new DelimiterMaster(
                { delimiter: '/', startAfter: key, v2: true },
                fakeLogger, vFormat);

            // Filter a master version to set NextContinuationToken
            const listingKey = getListingKey(key, vFormat);
            delimiter.filter({ key: listingKey, value: '' });
            assert.strictEqual(delimiter.NextContinuationToken, key);

            if (vFormat === 'v0') {
                // With a delimiter skipping should return previous key + VID_SEP in v0
                assert.strictEqual(delimiter.skipping(), listingKey + VID_SEP);
            } else {
                // in v1 there are no versions to skip
                assert.strictEqual(delimiter.skipping(), SKIP_NONE);
            }
        });

        it('should return SKIP_NONE for DelimiterMaster when NextMarker is set' +
        ', there is a delimiter and the filtered key ends with the delimiter', () => {
            const delimiterChar = '/';
            const keyWithEndingDelimiter = `key${delimiterChar}`;
            const delimiter = new DelimiterMaster({
                delimiter: delimiterChar,
                marker: keyWithEndingDelimiter,
            }, fakeLogger, vFormat);

            /* When a NextMarker is set to the key, we should get
             * SKIP_NONE because no key has been listed yet. */
            assert.strictEqual(delimiter.NextMarker, keyWithEndingDelimiter);
            assert.strictEqual(delimiter.skipping(), SKIP_NONE);
        });

        it('should skip entries not starting with prefix', () => {
            const delimiter = new DelimiterMaster({ prefix: 'prefix' }, fakeLogger, vFormat);

            const listingKey = getListingKey('wrong', vFormat);
            assert.strictEqual(delimiter.filter({ key: listingKey }), FILTER_SKIP);
            assert.strictEqual(delimiter.NextMarker, undefined);
            assert.strictEqual(delimiter.prvKey, undefined);
            assert.deepStrictEqual(delimiter.result(), EmptyResult);
        });

        it('should skip entries inferior to next marker', () => {
            const delimiter = new DelimiterMaster({ marker: 'b' }, fakeLogger, vFormat);

            const listingKey = getListingKey('a', vFormat);
            assert.strictEqual(delimiter.filter({ key: listingKey }), FILTER_SKIP);
            assert.strictEqual(delimiter.NextMarker, 'b');
            assert.strictEqual(delimiter.prvKey, undefined);
            assert.deepStrictEqual(delimiter.result(), EmptyResult);
        });

        it('should accept a master version', () => {
            const delimiter = new DelimiterMaster({}, fakeLogger, vFormat);
            const key = 'key';
            const value = '';

            const listingKey = getListingKey(key, vFormat);
            assert.strictEqual(delimiter.filter({ key: listingKey, value }), FILTER_ACCEPT);
            if (vFormat === 'v0') {
                assert.strictEqual(delimiter.prvKey, key);
            }
            assert.strictEqual(delimiter.NextMarker, key);
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
             * and not added to the result. */
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

        if (vFormat === 'v0') {
            it('should accept a PHD version as first input', () => {
                const delimiter = new DelimiterMaster({}, fakeLogger, vFormat);
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
                const delimiter = new DelimiterMaster({}, fakeLogger, vFormat);
                const key = 'keyA';
                const value = '';
                const keyPHD = 'keyBPHD';
                const objPHD = {
                    key: keyPHD,
                    value: Version.generatePHDVersion(generateVersionId('', '')),
                };

                /* Filter a master version to set the NextMarker, the prvKey and add
                 * and element in result content. */
                delimiter.filter({ key, value });

                /* When filtered, it should return FILTER_ACCEPT and set the prvKey
                 * to undefined. It should not be added to the result content or common
                 * prefixes. */
                assert.strictEqual(delimiter.filter(objPHD), FILTER_ACCEPT);
                assert.strictEqual(delimiter.prvKey, undefined);
                assert.strictEqual(delimiter.NextMarker, key);
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
                assert.strictEqual(delimiter.prvKey, masterKey);
                assert.strictEqual(delimiter.NextMarker, masterKey);
                assert.deepStrictEqual(delimiter.result(), {
                    CommonPrefixes: [],
                    Contents: [{ key: masterKey, value }],
                    IsTruncated: false,
                    NextMarker: undefined,
                    Delimiter: undefined,
                });
            });

            it('should skip a delete marker version', () => {
                const delimiter = new DelimiterMaster({}, fakeLogger, vFormat);
                const version = new Version({ isDeleteMarker: true });
                const key = 'key';
                const obj = {
                    key: `${key}${VID_SEP}version`,
                    value: version.toString(),
                };

                /* When filtered, it should return FILTER_SKIP and set the prvKey. It
                 * should not be added to the result content or common prefixes. */
                assert.strictEqual(delimiter.filter(obj), FILTER_SKIP);
                assert.strictEqual(delimiter.NextMarker, undefined);
                assert.strictEqual(delimiter.prvKey, key);
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
                assert.strictEqual(delimiter.NextMarker, undefined);
                assert.strictEqual(delimiter.prvKey, key);
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
                assert.strictEqual(delimiter.NextMarker, key2);
                assert.strictEqual(delimiter.prvKey, key2);
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
                 * NextMarker and prvKey value are unmodified and set to the
                 * masterKey. */
                assert.strictEqual(delimiter.filter({
                    key: versionKey,
                    value: versionValue,
                }), FILTER_SKIP);
                assert.strictEqual(delimiter.NextMarker, masterKey);
                assert.strictEqual(delimiter.prvKey, masterKey);
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
                const versionKey2 = `${masterKey}${VID_SEP}version2`;
                const value2 = 'value2';

                /* Filter the PHD version. */
                assert.strictEqual(delimiter.filter({
                    key: masterKey,
                    value: '{ "isPHD": true, "value": "version" }',
                }), FILTER_ACCEPT);

                /* Filter a delete marker version. */
                assert.strictEqual(delimiter.filter({
                    key: versionKey1,
                    value: '{ "isDeleteMarker": true }',
                }), FILTER_ACCEPT);

                /* Filter a last version with a specific value. */
                assert.strictEqual(delimiter.filter({
                    key: versionKey2,
                    value: value2,
                }), FILTER_ACCEPT);

                assert.deepStrictEqual(delimiter.result(), {
                    CommonPrefixes: [],
                    Contents: [{ key: masterKey, value: value2 }],
                    IsTruncated: false,
                    NextMarker: undefined,
                    Delimiter: undefined,
                });
            });

            /* We test here the internal management of the prvKey field of the
             * DelimiterMaster class, in particular once it has been set to an entry
             * key before to finally skip this entry because of an already present
             * common prefix. */
            it('should accept a version after skipping an object because of its commonPrefix', () => {
                const delimiterChar = '/';
                const commonPrefix1 = `commonPrefix1${delimiterChar}`;
                const commonPrefix2 = `commonPrefix2${delimiterChar}`;
                const prefix1Key1 = `${commonPrefix1}key1`;
                const prefix1Key2 = `${commonPrefix1}key2`;
                const prefix2VersionKey1 = `${commonPrefix2}key1${VID_SEP}version`;
                const value = 'value';

                const delimiter = new DelimiterMaster({ delimiter: delimiterChar },
                    fakeLogger, vFormat);

                /* Filter the two first entries with the same common prefix to add
                 * it to the result and reach the state where an entry is skipped
                 * because of an already present common prefix in the result. */
                delimiter.filter({ key: prefix1Key1, value });
                delimiter.filter({ key: prefix1Key2, value });

                /* Filter an object with a key containing a version part and a new
                 * common prefix. It should be accepted and the new common prefix
                 * added to the result. */
                assert.strictEqual(delimiter.filter({
                    key: prefix2VersionKey1,
                    value,
                }), FILTER_ACCEPT);
                assert.deepStrictEqual(delimiter.result(), {
                    CommonPrefixes: [commonPrefix1, commonPrefix2],
                    Contents: [],
                    IsTruncated: false,
                    NextMarker: undefined,
                    Delimiter: delimiterChar,
                });
            });

            it('should return good skipping value for DelimiterMaster on replay keys', () => {
                const delimiter = new DelimiterMaster(
                    { delimiter: '/', v2: true },
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
                // ...it should return to skipping by prefix as usual
                assert.strictEqual(delimiter.skipping(), `${inc(DbPrefixes.Replay)}foo/`);
            });

            it('should not skip over whole prefix when a key equals the prefix', () => {
                const FILTER_MAP = {
                    '0': 'FILTER_SKIP',
                    '1': 'FILTER_ACCEPT',
                    '-1': 'FILTER_END',
                };
                const delimiter = new DelimiterMaster({
                    prefix: 'prefix/',
                    delimiter: '/',
                }, fakeLogger, vFormat);
                for (const testEntry of [
                    {
                        key: 'prefix/',
                        expectedRes: FILTER_ACCEPT,
                        expectedSkipping: `prefix/${VID_SEP}`,
                    },
                    {
                        key: `prefix/${VID_SEP}v1`,
                        value: '{}',
                        expectedRes: FILTER_SKIP, // versions get skipped after master
                        expectedSkipping: `prefix/${VID_SEP}`,
                    },
                    {
                        key: 'prefix/deleted',
                        isDeleteMarker: true,
                        expectedRes: FILTER_SKIP, // delete markers get skipped
                        expectedSkipping: `prefix/deleted${VID_SEP}`,
                    },
                    {
                        key: `prefix/deleted${VID_SEP}v1`,
                        isDeleteMarker: true,
                        expectedRes: FILTER_SKIP,
                        expectedSkipping: `prefix/deleted${VID_SEP}`,
                    },
                    {
                        key: `prefix/deleted${VID_SEP}v2`,
                        expectedRes: FILTER_SKIP,
                        expectedSkipping: `prefix/deleted${VID_SEP}`,
                    },
                    {
                        key: 'prefix/subprefix1/key-1',
                        expectedRes: FILTER_ACCEPT,
                        expectedSkipping: 'prefix/subprefix1/',
                    },
                    {
                        key: `prefix/subprefix1/key-1${VID_SEP}v1`,
                        expectedRes: FILTER_SKIP,
                        expectedSkipping: 'prefix/subprefix1/',
                    },
                    {
                        key: 'prefix/subprefix1/key-2',
                        expectedRes: FILTER_SKIP,
                        expectedSkipping: 'prefix/subprefix1/',
                    },
                    {
                        key: `prefix/subprefix1/key-2${VID_SEP}v1`,
                        expectedRes: FILTER_SKIP,
                        expectedSkipping: 'prefix/subprefix1/',
                    },
                ]) {
                    const entry = {
                        key: testEntry.key,
                    };
                    if (testEntry.isDeleteMarker) {
                        entry.value = '{"isDeleteMarker":true}';
                    } else {
                        entry.value = '{}';
                    }
                    const res = delimiter.filter(entry);
                    const skipping = delimiter.skipping();
                    assert.strictEqual(res, testEntry.expectedRes);
                    assert.strictEqual(skipping, testEntry.expectedSkipping);
                }
            });
        }
    });
});
