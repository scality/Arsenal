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


describe('Delimiter All masters listing algorithm', () => {
    it('should return SKIP_NONE for DelimiterMaster when NextMarker is ' +
       'undefined', done => {
        const delimiter = new DelimiterMaster({ delimiter: '/' });

        assert.strictEqual(delimiter.NextMarker, undefined);

        /* When there is no NextMarker, it should return SKIP_NONE. */
        assert.strictEqual(delimiter.skipping(), SKIP_NONE);

        done();
    });

    it('should return <key><VersionIdSeparator> for DelimiterMaster when ' +
       'NextMarker is set and there is a delimiter', done => {
        const key = 'key';
        const delimiter = new DelimiterMaster({ delimiter: '/', marker: key });

        /* Filter a master version to set NextMarker. */
        // TODO: useless once S3C-1628 is fixed.
        delimiter.filter({ key, value: '' });
        assert.strictEqual(delimiter.NextMarker, key);

        /* With a delimiter skipping should return previous key + VID_SEP
         * (except when a delimiter is set and the NextMarker ends with the
         * delimiter) . */
        assert.strictEqual(delimiter.skipping(), key + VID_SEP);

        done();
    });

    it('should return NextMarker for DelimiterMaster when NextMarker is set' +
       ', there is a delimiter and the key ends with the delimiter', () => {
        const delimiterChar = '/';
        const keyWithEndingDelimiter = `key${delimiterChar}`;
        const delimiter = new DelimiterMaster({
            delimiter: delimiterChar,
            marker: keyWithEndingDelimiter,
        });

        /* When a delimiter is set and the NextMarker ends with the
         * delimiter it should return the next marker value. */
        assert.strictEqual(delimiter.NextMarker, keyWithEndingDelimiter);
        assert.strictEqual(delimiter.skipping(), keyWithEndingDelimiter);
        done();
    });

    it('should skip entries not starting with prefix', done => {
        const delimiter = new DelimiterMaster({ prefix: 'prefix' });

        assert.strictEqual(delimiter.filter({ key: 'wrong' }), FILTER_SKIP);
        assert.strictEqual(delimiter.NextMarker, undefined);
        assert.strictEqual(delimiter.prvKey, undefined);
        assert.deepStrictEqual(delimiter.result(), EmptyResult);

        done();
    });

    it('should skip entries superior to next marker', done => {
        const delimiter = new DelimiterMaster({ marker: 'b' });

        assert.strictEqual(delimiter.filter({ key: 'a' }), FILTER_SKIP);
        assert.strictEqual(delimiter.NextMarker, 'b');
        assert.strictEqual(delimiter.prvKey, undefined);
        assert.deepStrictEqual(delimiter.result(), EmptyResult);

        done();
    });

    it('should accept a master version', done => {
        const delimiter = new DelimiterMaster({});
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

        done();
    });

    it('should accept a PHD version as first input', done => {
        const delimiter = new DelimiterMaster({});
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

        done();
    });

    it('should accept a PHD version', done => {
        const delimiter = new DelimiterMaster({});
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

        done();
    });

    it('should accept a version after a PHD', done => {
        const delimiter = new DelimiterMaster({});
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

        done();
    });

    it('should accept a delete marker', done => {
        const delimiter = new DelimiterMaster({});
        const version = new Version({ isDeleteMarker: true });
        const obj = {
            key: `Key${VID_SEP}version`,
            value: version.toString(),
        };

        /* When filtered, it should return FILTER_ACCEPT and don't set the
         * prvKey (not tested here, the default value is undefined). It
         * should not be added to the result content or common prefixes. */
        assert.strictEqual(delimiter.filter(obj), FILTER_ACCEPT);
        assert.strictEqual(delimiter.NextMarker, undefined);
        assert.strictEqual(delimiter.prvKey, undefined);
        assert.deepStrictEqual(delimiter.result(), EmptyResult);

        done();
    });

    it('should accept the master version and skip the other ones', done => {
        const delimiter = new DelimiterMaster({});
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

        done();
    });

    it('should return good listing result for version', done => {
        const delimiter = new DelimiterMaster({});
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

        done();
    });
});
