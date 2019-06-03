'use strict'; // eslint-disable-line strict

const assert = require('assert');

const DelimiterMaster =
    require('../../../../lib/algos/list/delimiterMaster').DelimiterMaster;
const {
    FILTER_ACCEPT,
    FILTER_SKIP,
    SKIP_NONE,
} = require('../../../../lib/algos/list/tools');
const VSConst =
    require('../../../../lib/versioning/constants').VersioningConstants;
const Version = require('../../../../lib/versioning/Version').Version;
const { generateVersionId } = require('../../../../lib/versioning/VersionID');


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

describe('Delimiter All masters listing algorithm', () => {
    it('should return SKIP_NONE for DelimiterMaster when both NextMarker ' +
       'and NextContinuationToken are undefined', () => {
        const delimiter = new DelimiterMaster({ delimiter: '/' }, fakeLogger);

        assert.strictEqual(delimiter.NextMarker, undefined);

        // When there is no NextMarker or NextContinuationToken, it should
        // return SKIP_NONE
        assert.strictEqual(delimiter.skipping(), SKIP_NONE);
    });

    it('should return <key><VersionIdSeparator> for DelimiterMaster when ' +
       'NextMarker is set and there is a delimiter', () => {
        const key = 'key';
        const delimiter = new DelimiterMaster({ delimiter: '/', marker: key },
                                             fakeLogger);

        /* Filter a master version to set NextMarker. */
        // TODO: useless once S3C-1628 is fixed.
        delimiter.filter({ key, value: '' });
        assert.strictEqual(delimiter.NextMarker, key);

        /* With a delimiter skipping should return previous key + VID_SEP
         * (except when a delimiter is set and the NextMarker ends with the
         * delimiter) . */
        assert.strictEqual(delimiter.skipping(), key + VID_SEP);
    });

    it('should return <key><VersionIdSeparator> for DelimiterMaster when ' +
       'NextContinuationToken is set and there is a delimiter', () => {
        const key = 'key';
        const delimiter = new DelimiterMaster(
            { delimiter: '/', startAfter: key, v2: true },
            fakeLogger);

        // Filter a master version to set NextContinuationToken
        delimiter.filter({ key, value: '' });
        assert.strictEqual(delimiter.NextContinuationToken, key);

        assert.strictEqual(delimiter.skipping(), key + VID_SEP);
    });

    it('should return NextMarker for DelimiterMaster when NextMarker is set' +
       ', there is a delimiter and the key ends with the delimiter', () => {
        const delimiterChar = '/';
        const keyWithEndingDelimiter = `key${delimiterChar}`;
        const delimiter = new DelimiterMaster({
            delimiter: delimiterChar,
            marker: keyWithEndingDelimiter,
        }, fakeLogger);

        /* When a delimiter is set and the NextMarker ends with the
         * delimiter it should return the next marker value. */
        assert.strictEqual(delimiter.NextMarker, keyWithEndingDelimiter);
        assert.strictEqual(delimiter.skipping(), keyWithEndingDelimiter);
    });

    it('should skip entries not starting with prefix', () => {
        const delimiter = new DelimiterMaster({ prefix: 'prefix' }, fakeLogger);

        assert.strictEqual(delimiter.filter({ key: 'wrong' }), FILTER_SKIP);
        assert.strictEqual(delimiter.NextMarker, undefined);
        assert.strictEqual(delimiter.prvKey, undefined);
        assert.deepStrictEqual(delimiter.result(), EmptyResult);
    });

    it('should skip entries superior to next marker', () => {
        const delimiter = new DelimiterMaster({ marker: 'b' }, fakeLogger);

        assert.strictEqual(delimiter.filter({ key: 'a' }), FILTER_SKIP);
        assert.strictEqual(delimiter.NextMarker, 'b');
        assert.strictEqual(delimiter.prvKey, undefined);
        assert.deepStrictEqual(delimiter.result(), EmptyResult);
    });

    it('should accept a master version', () => {
        const delimiter = new DelimiterMaster({}, fakeLogger);
        const key = 'key';
        const value = '';

        assert.strictEqual(delimiter.filter({ key, value }), FILTER_ACCEPT);
        assert.strictEqual(delimiter.prvKey, key);
        assert.strictEqual(delimiter.NextMarker, key);
        assert.deepStrictEqual(delimiter.result(), {
            CommonPrefixes: [],
            Contents: [{ key, value }],
            IsTruncated: false,
            NextMarker: undefined,
            Delimiter: undefined,
        });
    });

    it('should accept a PHD version as first input', () => {
        const delimiter = new DelimiterMaster({}, fakeLogger);
        const keyPHD = 'keyPHD';
        const objPHD = {
            key: keyPHD,
            value: Version.generatePHDVersion(generateVersionId('', '')),
        };

        /* When filtered, it should return FILTER_ACCEPT and set the prvKey.
         * to undefined. It should not be added to result the content or common
         * prefixes. */
        assert.strictEqual(delimiter.filter(objPHD), FILTER_ACCEPT);
        assert.strictEqual(delimiter.prvKey, undefined);
        assert.strictEqual(delimiter.NextMarker, undefined);
        assert.deepStrictEqual(delimiter.result(), EmptyResult);
    });

    it('should accept a PHD version', () => {
        const delimiter = new DelimiterMaster({}, fakeLogger);
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

        /* When filtered, it should return FILTER_ACCEPT and set the prvKey.
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
        const delimiter = new DelimiterMaster({}, fakeLogger);
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

    it('should accept a delete marker', () => {
        const delimiter = new DelimiterMaster({}, fakeLogger);
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

    it('should skip version after a delete marker', () => {
        const delimiter = new DelimiterMaster({}, fakeLogger);
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

    it('should accept a new key after a delete marker', () => {
        const delimiter = new DelimiterMaster({}, fakeLogger);
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
        const delimiter = new DelimiterMaster({}, fakeLogger);
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
        const delimiter = new DelimiterMaster({}, fakeLogger);
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

    it('should not return key in listing if delete marker is master', () => {
        const delimiter = new DelimiterMaster({}, fakeLogger);
        const masterKey = 'key';
        const versionKey1 = `${masterKey}${VID_SEP}version1`;
        const versionKey2 = `${masterKey}${VID_SEP}version2`;
        const value1 = 'value1'
        const value2 = 'value2';

        delimiter.filter({
            key: masterKey,
            value: '{ "isPHD": true, "value": "version" }',
        });

        /* Filter a delete marker version. */
        delimiter.filter({
            key: versionKey1,
            value: '{ "isDeleteMarker": true }',
        });

        /* Filter a last version with a specific value. */
        delimiter.filter({
            key: versionKey2,
            value: value2,
        });

        console.log(delimiter.result())

        assert.strictEqual(delimiter.result().Contents.length, 0);

        // assert.deepStrictEqual(delimiter.result(), {
        //     CommonPrefixes: [],
        //     Contents: [{ key: masterKey, value: value2 }],
        //     IsTruncated: false,
        //     NextMarker: undefined,
        //     Delimiter: undefined,
        // });
    });

    it('should return key in listing if version is master', () => {
        const delimiter = new DelimiterMaster({}, fakeLogger);
        const masterKey = 'key';
        const versionKey1 = `${masterKey}${VID_SEP}version1`;
        const versionKey2 = `${masterKey}${VID_SEP}version2`;
        const value1 = 'value1'
        const value2 = 'value2';

        /* Filter the PHD version. */
        delimiter.filter({
            key: masterKey,
            value: '{ "isPHD": true, "value": "version" }',
        });

        /* Filter a last version with a specific value. */
        delimiter.filter({
            key: versionKey1,
            value: value2,
        });

        /* Filter a delete marker version. */
        delimiter.filter({
            key: versionKey2,
            value: '{ "isDeleteMarker": true }',
        });

        console.log(delimiter.result())

        assert.strictEqual(delimiter.result().Contents.length, 1);

        // assert.deepStrictEqual(delimiter.result(), {
        //     CommonPrefixes: [],
        //     Contents: [{ key: masterKey, value: value2 }],
        //     IsTruncated: false,
        //     NextMarker: undefined,
        //     Delimiter: undefined,
        // });
    });

    it('should test based on comments', () => {
        /*
        * - or a deleteMarker following a PHD (setting prvKey to undefined
        *   when an entry is a PHD avoids the skip on version for the
        *   next entry). In that case we expect the master version to
        *   follow.
        */

        const delimiter = new DelimiterMaster({}, fakeLogger);
        const masterKey = 'key1';
        const masterKey2 = 'key2';
        const masterKey3 = 'key3';
        const versionKey1 = `${masterKey}${VID_SEP}version1`;
        const versionKey2 = `${masterKey}${VID_SEP}version2`;
        const value1 = 'value1';
        const value2 = 'value2';

        delimiter.filter({
            key: masterKey,
            value: '{ "isPHD": true, "value": "version" }',
        });

        delimiter.filter({
            key: versionKey1,
            value: value2,
        });

        delimiter.filter({
            key: versionKey2,
            value: '{ "isDeleteMarker": true }',
        });

        delimiter.filter({
            key: `${masterKey}${VID_SEP}version3`,
            value: value2,
        });

        assert.strictEqual(delimiter.result().Contents.length, 1);

        // another master..

        delimiter.filter({
            key: masterKey2,
            value: '{ "isPHD": true, "value": "version" }',
        });

        delimiter.filter({
            key: `${masterKey2}${VID_SEP}version1`,
            value: '{ "isDeleteMarker": true }',
        });

        delimiter.filter({
            key: `${masterKey2}${VID_SEP}version2`,
            value: '{ "isDeleteMarker": true }',
        });

        assert.strictEqual(delimiter.result().Contents.length, 1);

        // since master isn't PHD, it is it's own master
        delimiter.filter({
            key: masterKey3,
            value: value1,
        })

        delimiter.filter({
            key: `${masterKey3}${VID_SEP}version1`,
            value: '{ "isDeleteMarker": true }',
        });

        assert.strictEqual(delimiter.result().Contents.length, 2);
        // assert.strictEqual(delimiter.result().Contents.length, 2);

        delimiter.filter({
            key: 'key4',
            value: '{ "isPHD": true, "value": "version" }',
        });

        delimiter.filter({
            key: `key4${VID_SEP}version1`,
            value: '{ "isDeleteMarker": true }',
        });

        assert.strictEqual(delimiter.result().Contents.length, 2);

        delimiter.filter({
            key: `key4${VID_SEP}version2`,
            value: value1,
        });

        console.log(`Final test?: ${delimiter.result().Contents.length === 2}`)
        assert.strictEqual(delimiter.result().Contents.length, 2);

        // Also

        // assert.deepStrictEqual(delimiter.result(), {
        //     CommonPrefixes: [],
        //     Contents: [{ key: masterKey, value: value2 }],
        //     IsTruncated: false,
        //     NextMarker: undefined,
        //     Delimiter: undefined,
        // });
    });

    it('should return good values for entries with different common prefixes',
       () => {
           const delimiterChar = '/';
           const commonPrefix1 = `commonPrefix1${delimiterChar}`;
           const commonPrefix2 = `commonPrefix2${delimiterChar}`;
           const prefix1Key1 = `${commonPrefix1}key1`;
           const prefix1Key2 = `${commonPrefix1}key2`;
           const prefix2Key1 = `${commonPrefix2}key1`;
           const value = 'value';

           const delimiter = new DelimiterMaster({ delimiter: delimiterChar },
                                                 fakeLogger);

           /* Filter the first entry with a common prefix. It should be
            * accepted and added to the result. */
           assert.strictEqual(delimiter.filter({ key: prefix1Key1, value }),
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
           assert.strictEqual(delimiter.filter({ key: prefix1Key2, value }),
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
           assert.strictEqual(delimiter.filter({ key: prefix2Key1, value }),
                              FILTER_ACCEPT);
           assert.deepStrictEqual(delimiter.result(), {
               CommonPrefixes: [commonPrefix1, commonPrefix2],
               Contents: [],
               IsTruncated: false,
               NextMarker: undefined,
               Delimiter: delimiterChar,
           });
       });

    /* We test here the internal management of the prvKey field of the
     * DelimiterMaster class, in particular once it has been set to an entry
     * key before to finally skip this entry because of an already present
     * common prefix. */
    it('should accept a version after skipping an object because of its ' +
       'commonPrefix', () => {
        const delimiterChar = '/';
        const commonPrefix1 = `commonPrefix1${delimiterChar}`;
        const commonPrefix2 = `commonPrefix2${delimiterChar}`;
        const prefix1Key1 = `${commonPrefix1}key1`;
        const prefix1Key2 = `${commonPrefix1}key2`;
        const prefix2VersionKey1 = `${commonPrefix2}key1${VID_SEP}version`;
        const value = 'value';

        const delimiter = new DelimiterMaster({ delimiter: delimiterChar },
                                              fakeLogger);

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
                                              fakeLogger);
        /* TODO: should be set to a whole key instead of just a common prefix
         * once ZENKO-1048 is fixed. */
        delimiter.NextMarker = commonPrefix;

        assert.strictEqual(delimiter.filter({ key, value }), FILTER_SKIP);
    });
});
