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

['v0'].forEach(vFormat => {
    describe(`Delimiter All masters listing algorithm vFormat=${vFormat}`, () => {
        it('should return SKIP_NONE for DelimiterMaster when both NextMarker ' +
        'and NextContinuationToken are undefined', () => {
            const delimiter = new DelimiterMaster({ delimiter: '/' }, fakeLogger, vFormat);

            assert.strictEqual(delimiter.NextMarker, undefined);

            // When there is no NextMarker or NextContinuationToken, it should
            // return SKIP_NONE
            assert.strictEqual(delimiter.skipping(), SKIP_NONE);
        });

        it.only('should not hide versioned keys when a common prefix master is filtered first', () => {
            // See S3C-4682 for details.
            // Delimiter will call .filter multiple times with different keys.
            // It should list them all except those with delete markers despite large size.
            const delimiter = new DelimiterMaster({
                prefix: '_EFICAAS-ConnectExpress-ProxyIN/',
                delimiter: '/',
                startAfter: '',
                continuationToken: '',
                v2: true,
                fetchOwner: false }, fakeLogger, vFormat);
            const masterKey = '_EFICAAS-ConnectExpress-ProxyIN';
            const delimiterChar = '/';
            const commonPrefix = `${masterKey}${delimiterChar}`;
            const key = `${commonPrefix}`;

            // this shows correct behavior in cloudserver:
            // list params in v2 {
            //     listParams: {
            //       listingType: 'DelimiterMaster',
            //       maxKeys: 1000,
            //       delimiter: '/',
            //       prefix: '_EFICAAS-ConnectExpress-ProxyIN/',
            //       v2: true,
            //       startAfter: undefined,
            //       continuationToken: undefined,
            //       fetchOwner: false
            //     }
            //   }

            const version = new Version({ isDeleteMarker: false });
            const obj = {
                key,
                value: version.toString(),
            };
            // do not skip master with lexicographically smallest key
            assert.strictEqual(delimiter.filter(obj), FILTER_ACCEPT);

            // Skip these with delete markers
            // in S3C-4682 there are 514 ids with delete markers and a common prefix.
            // Note: This step doesn't matter currently but leaving as is to ensure correct
            // behavior when  bug is fixed.
            // for (let idx = 0; idx < 514; idx++) {
            //     // delete markers and versioned
            //     const keyVersion = `${masterKey}${VID_SEP}${idx}`;
            //     const version = new Version({ versionId: idx, isDeleteMarker: true });
            //     const obj = {
            //         key: keyVersion,
            //         value: version.toString(),
            //     };
            //     assert.strictEqual(delimiter.filter(obj), FILTER_SKIP);
            // }

            // Do not skip these as there's no delete markers.
            const versionedSuffixes = [
                {'name': 'TRANSTOM.HEFSLX01.CDNZOSHM.RDS.2107050200-01.ZIP.RECU.ENCRYPTED', 'vid': '98341720870177999994RG001  1.20780.271547'},
                {'name': 'TRANSTOM.HEFSLX01.KMADT01T.Q18TI10.D030721.RECU.ENCRYPTED', 'vid': '98341720870177999996RG001  1.20780.271545'},
                {'name': 'TRANSTOM.HEFSLX01.KMADT01T.Q18TI10.D050721.RECU.ENCRYPTED', 'vid': '98341720870094999999RG001  1.20785.271606'}, 
                {'name': 'TRANSTOM.HEFSLX01.URK77185.VACJ01.D050721.RECU.ENCRYPTED', 'vid': '98341720869970999996RG001  1.20790.271681'},
                {'name': 'TRANSTOM.HEFSLX01.URK77185.VACJ02.D050721.RECU.ENCRYPTED', 'vid': '98341720870063999999RG001  1.20787.271622'},
                {'name': 'TRANSTOM.HEFSLX01.URK77185.VACJ03.D050721.RECU.ENCRYPTED', 'vid': '98341720870040999997RG001  1.20789.271637'},
                {'name': 'TRANSTOM.HEFSLX01.URK77186.VACI02.D050721.RECU.ENCRYPTED', 'vid': '98341720869889999999RG001  1.20793.271747'},
                {'name': 'TRANSTOM.HEFSLX01.URK77186.VACI02.D060721.RECU', 'vid': '98341720869889999998RG001  1.20793.271748'},
                {'name': 'test.truc.truc', 'vid': '98341720869886999997RG001  1.20793.271755'},
                {'name': 'test.truc', 'vid': '98341720869888999999RG001  1.20793.271751'}, 
                {'name': 'test.trucc', 'vid': '98341720869827999999RG001  1.20794.271788'}];
            // const name = 'a';
            // const versionedSuffixes = [
            //     {name, vid: 'e  5'},
            //     {name, vid: 'd  4'},
            //     {name, vid: 'c  3'},
            //     {name, vid: 'b  2'},
            //     {name, vid: 'a  1'}
            // ];
            // const og = Array.from(versionedSuffixes);
            // versionedSuffixes.sort((a, b) => a.name.localeCompare(b.name));
            // assert.deepEqual(og, versionedSuffixes);
            const accepted = [];
            const skipped = [];

            for (const ob of versionedSuffixes) {
                const { name, vid } = ob;
                // Does not contain delete markers but contains versions to simulate turning on versioning.
                const keyVersion = `${commonPrefix}${name}${VID_SEP}${vid}`;
                const version = new Version({ versionId: vid });
                const obj = {
                    key: keyVersion,
                    value: version.toString(),
                };
                // TODO: this currently returns FILTER_SKIP. The state machine logic needs to handle this case.
                const recieved = delimiter.filter(obj);
                // assert.strictEqual(expected, FILTER_ACCEPT);
                if (recieved === FILTER_ACCEPT) {
                    accepted.push(ob);
                } else {
                    skipped.push(ob);
                }
            }
            console.log({ accepted, skipped });
            assert.equal(accepted.length, 11);
            assert.equal(skipped.length, 0);
        });

        it('should return <key><VersionIdSeparator> for DelimiterMaster when ' +
        'NextMarker is set and there is a delimiter', () => {
            const key = 'key';
            const delimiter = new DelimiterMaster({ delimiter: '/', marker: key },
                fakeLogger, vFormat);

            /* Filter a master version to set NextMarker. */
            const listingKey = getListingKey(key, vFormat);
            delimiter.filter({ key: listingKey, value: '' });
            assert.strictEqual(delimiter.NextMarker, key);

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
            assert.strictEqual(delimiter.NextContinuationToken, key);

            assert.strictEqual(delimiter.skipping(), listingKey + VID_SEP);
        });

        it('should return NextMarker for DelimiterMaster when NextMarker is set' +
        ', there is a delimiter and the key ends with the delimiter', () => {
            const delimiterChar = '/';
            const keyWithEndingDelimiter = `key${delimiterChar}`;
            const delimiter = new DelimiterMaster({
                delimiter: delimiterChar,
                marker: keyWithEndingDelimiter,
            }, fakeLogger, vFormat);

            /* When a delimiter is set and the NextMarker ends with the
             * delimiter it should return the next marker value. */
            assert.strictEqual(delimiter.NextMarker, keyWithEndingDelimiter);
            const skipKey = vFormat === 'v1' ?
                `${DbPrefixes.Master}${keyWithEndingDelimiter}` :
                keyWithEndingDelimiter;
            assert.strictEqual(delimiter.skipping(), skipKey);
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

            it('should skip a versioned entry when there is a delimiter and the key ' +
            'starts with the NextMarker value', () => {
                const delimiterChar = '/';
                const commonPrefix = `commonPrefix${delimiterChar}`;
                const key = `${commonPrefix}key${VID_SEP}version`;
                const value = 'value';

                const delimiter = new DelimiterMaster({ delimiter: delimiterChar },
                    fakeLogger, vFormat);
                /* TODO: should be set to a whole key instead of just a common prefix
                 * once ZENKO-1048 is fixed. */
                delimiter.NextMarker = commonPrefix;

                assert.strictEqual(delimiter.filter({ key, value }), FILTER_SKIP);
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
        }
    });
});
