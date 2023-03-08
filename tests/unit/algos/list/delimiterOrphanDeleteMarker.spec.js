'use strict'; // eslint-disable-line strict

const assert = require('assert');

const DelimiterOrphanDeleteMarker =
    require('../../../../lib/algos/list/delimiterOrphanDeleteMarker').DelimiterOrphanDeleteMarker;
const {
    FILTER_ACCEPT,
    FILTER_SKIP,
    FILTER_END,
} = require('../../../../lib/algos/list/tools');
const VSConst =
    require('../../../../lib/versioning/constants').VersioningConstants;
const { DbPrefixes } = VSConst;

// TODO: find an acceptable timeout value.
const DELIMITER_TIMEOUT_MS = 10 * 1000; // 10s


const VID_SEP = VSConst.VersionId.Separator;
const EmptyResult = {
    Contents: [],
    IsTruncated: false,
};

const fakeLogger = {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {},
};

function makeV1Key(key) {
    const keyPrefix = key.includes(VID_SEP) ?
        DbPrefixes.Version : DbPrefixes.Master;
    return `${keyPrefix}${key}`;
}

describe('DelimiterOrphanDeleteMarker', () => {
    it('should accept entry starting with prefix', () => {
        const delimiter = new DelimiterOrphanDeleteMarker({ prefix: 'prefix' }, fakeLogger, 'v1');

        const listingKey = makeV1Key('prefix1');
        assert.strictEqual(delimiter.filter({ key: listingKey, value: '' }), FILTER_ACCEPT);

        assert.deepStrictEqual(delimiter.result(), EmptyResult);
    });

    it('should skip entry not starting with prefix', () => {
        const delimiter = new DelimiterOrphanDeleteMarker({ prefix: 'prefix' }, fakeLogger, 'v1');

        const listingKey = makeV1Key('noprefix');
        assert.strictEqual(delimiter.filter({ key: listingKey, value: '' }), FILTER_SKIP);

        assert.deepStrictEqual(delimiter.result(), EmptyResult);
    });

    it('should accept a version and return an empty content', () => {
        const delimiter = new DelimiterOrphanDeleteMarker({ }, fakeLogger, 'v1');

        const masterKey = 'key';

        const versionId1 = 'version1';
        const versionKey1 = `${masterKey}${VID_SEP}${versionId1}`;
        const date1 = '1970-01-01T00:00:00.001Z';
        const value1 = `{"versionId":"${versionId1}","last-modified":"${date1}"}`;

        assert.strictEqual(delimiter.filter({
            key: makeV1Key(versionKey1),
            value: value1,
        }), FILTER_ACCEPT);

        assert.deepStrictEqual(delimiter.result(), EmptyResult);
    });

    it('should accept an orphan delete marker and return it from the content', () => {
        const delimiter = new DelimiterOrphanDeleteMarker({ }, fakeLogger, 'v1');

        const masterKey = 'key';

        const versionId1 = 'version1';
        const versionKey1 = `${masterKey}${VID_SEP}${versionId1}`;
        const date1 = '1970-01-01T00:00:00.001Z';
        const value1 = `{"versionId":"${versionId1}","last-modified":"${date1}","isDeleteMarker":true}`;

        assert.strictEqual(delimiter.filter({
            key: makeV1Key(versionKey1),
            value: value1,
        }), FILTER_ACCEPT);

        const expectedResult = {
            Contents: [
                {
                    key: masterKey,
                    value: value1,
                },
            ],
            IsTruncated: false,
        };

        assert.deepStrictEqual(delimiter.result(), expectedResult);
    });

    it('should accept two orphan delete markers and return them from the content', () => {
        const delimiter = new DelimiterOrphanDeleteMarker({ }, fakeLogger, 'v1');

        // filter the first orphan delete marker
        const masterKey1 = 'key1';
        const versionId1 = 'version1';
        const versionKey1 = `${masterKey1}${VID_SEP}${versionId1}`;
        const date1 = '1970-01-01T00:00:00.002Z';
        const value1 = `{"versionId":"${versionId1}","last-modified":"${date1}","isDeleteMarker":true}`;

        assert.strictEqual(delimiter.filter({
            key: makeV1Key(versionKey1),
            value: value1,
        }), FILTER_ACCEPT);

        // filter the second orphan delete marker
        const masterKey2 = 'key2';
        const versionId2 = 'version2';
        const versionKey2 = `${masterKey2}${VID_SEP}${versionId2}`;
        const date2 = '1970-01-01T00:00:00.001Z';
        const value2 = `{"versionId":"${versionId2}","last-modified":"${date2}","isDeleteMarker":true}`;

        assert.strictEqual(delimiter.filter({
            key: makeV1Key(versionKey2),
            value: value2,
        }), FILTER_ACCEPT);

        const expectedResult = {
            Contents: [
                {
                    key: masterKey1,
                    value: value1,
                },
                {
                    key: masterKey2,
                    value: value2,
                },
            ],
            IsTruncated: false,
        };

        assert.deepStrictEqual(delimiter.result(), expectedResult);
    });

    it('should accept two orphan delete markers and return truncated content with one', () => {
        const delimiter = new DelimiterOrphanDeleteMarker({ maxKeys: 1 }, fakeLogger, 'v1');

        // filter the first orphan delete marker
        const masterKey1 = 'key1';
        const versionId1 = 'version1';
        const versionKey1 = `${masterKey1}${VID_SEP}${versionId1}`;
        const date1 = '1970-01-01T00:00:00.002Z';
        const value1 = `{"versionId":"${versionId1}","last-modified":"${date1}","isDeleteMarker":true}`;

        assert.strictEqual(delimiter.filter({
            key: makeV1Key(versionKey1),
            value: value1,
        }), FILTER_ACCEPT);

        // filter the second orphan delete marker
        const masterKey2 = 'key2';
        const versionId2 = 'version2';
        const versionKey2 = `${masterKey2}${VID_SEP}${versionId2}`;
        const date2 = '1970-01-01T00:00:00.001Z';
        const value2 = `{"versionId":"${versionId2}","last-modified":"${date2}","isDeleteMarker":true}`;

        assert.strictEqual(delimiter.filter({
            key: makeV1Key(versionKey2),
            value: value2,
        }), FILTER_ACCEPT);

        const expectedResult = {
            Contents: [
                {
                    key: masterKey1,
                    value: value1,
                },
            ],
            NextMarker: masterKey1,
            IsTruncated: true,
        };

        assert.deepStrictEqual(delimiter.result(), expectedResult);
    });

    it('should accept two orphan delete markers and return the one created before the beforeDate', () => {
        const date1 = '1970-01-01T00:00:00.002Z';
        const delimiter = new DelimiterOrphanDeleteMarker({ beforeDate: date1 }, fakeLogger, 'v1');

        // filter the first orphan delete marker
        const masterKey1 = 'key1';
        const versionId1 = 'version1';
        const versionKey1 = `${masterKey1}${VID_SEP}${versionId1}`;
        const value1 = `{"versionId":"${versionId1}","last-modified":"${date1}","isDeleteMarker":true}`;

        assert.strictEqual(delimiter.filter({
            key: makeV1Key(versionKey1),
            value: value1,
        }), FILTER_ACCEPT);

        // filter the second orphan delete marker
        const masterKey2 = 'key2';
        const versionId2 = 'version2';
        const versionKey2 = `${masterKey2}${VID_SEP}${versionId2}`;
        const date2 = '1970-01-01T00:00:00.001Z';
        const value2 = `{"versionId":"${versionId2}","last-modified":"${date2}","isDeleteMarker":true}`;

        assert.strictEqual(delimiter.filter({
            key: makeV1Key(versionKey2),
            value: value2,
        }), FILTER_ACCEPT);

        const expectedResult = {
            Contents: [
                {
                    key: masterKey2,
                    value: value2,
                },
            ],
            IsTruncated: false,
        };

        assert.deepStrictEqual(delimiter.result(), expectedResult);
    });

    it('should end filtering if max keys reached', () => {
        const delimiter = new DelimiterOrphanDeleteMarker({ maxKeys: 1 }, fakeLogger, 'v1');

        // filter the first orphan delete marker
        const masterKey1 = 'key1';
        const versionId1 = 'version1';
        const versionKey1 = `${masterKey1}${VID_SEP}${versionId1}`;
        const date1 = '1970-01-01T00:00:00.002Z';
        const value1 = `{"versionId":"${versionId1}","last-modified":"${date1}","isDeleteMarker":true}`;

        assert.strictEqual(delimiter.filter({
            key: makeV1Key(versionKey1),
            value: value1,
        }), FILTER_ACCEPT);

        // filter the second orphan delete marker
        const masterKey2 = 'key2';
        const versionId2 = 'version2';
        const versionKey2 = `${masterKey2}${VID_SEP}${versionId2}`;
        const date2 = '1970-01-01T00:00:00.001Z';
        const value2 = `{"versionId":"${versionId2}","last-modified":"${date2}","isDeleteMarker":true}`;

        assert.strictEqual(delimiter.filter({
            key: makeV1Key(versionKey2),
            value: value2,
        }), FILTER_ACCEPT);

        // filter the third orphan delete marker
        const masterKey3 = 'key3';
        const versionId3 = 'version3';
        const versionKey3 = `${masterKey3}${VID_SEP}${versionId3}`;
        const date3 = '1970-01-01T00:00:00.000Z';
        const value3 = `{"versionId":"${versionId3}","last-modified":"${date3}","isDeleteMarker":true}`;

        assert.strictEqual(delimiter.filter({
            key: makeV1Key(versionKey3),
            value: value3,
        }), FILTER_END);

        const expectedResult = {
            Contents: [
                {
                    key: masterKey1,
                    value: value1,
                },
            ],
            NextMarker: masterKey1,
            IsTruncated: true,
        };

        assert.deepStrictEqual(delimiter.result(), expectedResult);
    });

    it('should end filtering if delimiter timeout', () => {
        const delimiter = new DelimiterOrphanDeleteMarker({ }, fakeLogger, 'v1');

        // filter the first orphan delete marker
        const masterKey1 = 'key1';
        const versionId1 = 'version1';
        const versionKey1 = `${masterKey1}${VID_SEP}${versionId1}`;
        const date1 = '1970-01-01T00:00:00.002Z';
        const value1 = `{"versionId":"${versionId1}","last-modified":"${date1}","isDeleteMarker":true}`;

        assert.strictEqual(delimiter.filter({
            key: makeV1Key(versionKey1),
            value: value1,
        }), FILTER_ACCEPT);

        // force delimiter to timeout.
        delimiter.start = Date.now() - (DELIMITER_TIMEOUT_MS + 1);

        // filter the second orphan delete marker
        const masterKey2 = 'key2';
        const versionId2 = 'version2';
        const versionKey2 = `${masterKey2}${VID_SEP}${versionId2}`;
        const date2 = '1970-01-01T00:00:00.001Z';
        const value2 = `{"versionId":"${versionId2}","last-modified":"${date2}","isDeleteMarker":true}`;

        assert.strictEqual(delimiter.filter({
            key: makeV1Key(versionKey2),
            value: value2,
        }), FILTER_END);

        const expectedResult = {
            Contents: [
                {
                    key: masterKey1,
                    value: value1,
                },
            ],
            NextMarker: masterKey1,
            IsTruncated: true,
        };

        assert.deepStrictEqual(delimiter.result(), expectedResult);
    });

    it('should end filtering if delimiter timeout with empty content', () => {
        const delimiter = new DelimiterOrphanDeleteMarker({ }, fakeLogger, 'v1');

        // filter the first orphan delete marker
        const masterKey1 = 'key1';
        const versionId1 = 'version1';
        const versionKey1 = `${masterKey1}${VID_SEP}${versionId1}`;
        const date1 = '1970-01-01T00:00:00.002Z';
        const value1 = `{"versionId":"${versionId1}","last-modified":"${date1}"}`;

        assert.strictEqual(delimiter.filter({
            key: makeV1Key(versionKey1),
            value: value1,
        }), FILTER_ACCEPT);

        // filter the second orphan delete marker
        const masterKey2 = 'key2';
        const versionId2 = 'version2';
        const versionKey2 = `${masterKey2}${VID_SEP}${versionId2}`;
        const date2 = '1970-01-01T00:00:00.001Z';
        const value2 = `{"versionId":"${versionId2}","last-modified":"${date2}"}`;

        assert.strictEqual(delimiter.filter({
            key: makeV1Key(versionKey2),
            value: value2,
        }), FILTER_ACCEPT);

        // force delimiter to timeout.
        delimiter.start = Date.now() - (DELIMITER_TIMEOUT_MS + 1);

        // filter the third orphan delete marker
        const masterKey3 = 'key3';
        const versionId3 = 'version3';
        const versionKey3 = `${masterKey3}${VID_SEP}${versionId3}`;
        const date3 = '1970-01-01T00:00:00.000Z';
        const value3 = `{"versionId":"${versionId3}","last-modified":"${date3}","isDeleteMarker":true}`;

        assert.strictEqual(delimiter.filter({
            key: makeV1Key(versionKey3),
            value: value3,
        }), FILTER_END);

        const expectedResult = {
            Contents: [],
            NextMarker: masterKey2,
            IsTruncated: true,
        };

        assert.deepStrictEqual(delimiter.result(), expectedResult);
    });
});
