'use strict'; // eslint-disable-line strict

const assert = require('assert');

const DelimiterCurrent =
    require('../../../../lib/algos/list/delimiterCurrent').DelimiterCurrent;
const {
    FILTER_ACCEPT,
    FILTER_SKIP,
    FILTER_END,
} = require('../../../../lib/algos/list/tools');
const VSConst =
    require('../../../../lib/versioning/constants').VersioningConstants;
const { DbPrefixes } = VSConst;

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

describe('DelimiterCurrent', () => {
    it('should accept entry starting with prefix', () => {
        const delimiter = new DelimiterCurrent({ prefix: 'prefix' }, fakeLogger, 'v1');

        const masterKey = 'prefix1';
        const date1 = '1970-01-01T00:00:00.001Z';
        const value1 = `{"last-modified": "${date1}"}`;
        assert.strictEqual(delimiter.filter({ key: makeV1Key(masterKey), value: value1 }), FILTER_ACCEPT);

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

    it('should skip entry not starting with prefix', () => {
        const delimiter = new DelimiterCurrent({ prefix: 'prefix' }, fakeLogger, 'v1');

        const listingKey = makeV1Key('noprefix');
        const creationDate = '1970-01-01T00:00:00.001Z';
        const value = `{"last-modified": "${creationDate}"}`;
        assert.strictEqual(delimiter.filter({ key: listingKey, value }), FILTER_SKIP);

        assert.deepStrictEqual(delimiter.result(), EmptyResult);
    });

    it('should accept a master and return it', () => {
        const delimiter = new DelimiterCurrent({ }, fakeLogger, 'v1');

        const masterKey = 'key';

        const date1 = '1970-01-01T00:00:00.001Z';
        const value1 = `{"last-modified": "${date1}"}`;

        assert.strictEqual(delimiter.filter({
            key: makeV1Key(masterKey),
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

    it('should accept the first master and return the truncated content', () => {
        const delimiter = new DelimiterCurrent({ maxKeys: 1 }, fakeLogger, 'v1');

        const masterKey1 = 'key1';
        const date1 = '1970-01-01T00:00:00.001Z';
        const value1 = `{"last-modified": "${date1}"}`;

        assert.strictEqual(delimiter.filter({
            key: makeV1Key(masterKey1),
            value: value1,
        }), FILTER_ACCEPT);

        const masterKey2 = 'key2';
        const date2 = '1970-01-01T00:00:00.000Z';
        const value2 = `{"last-modified": "${date2}"}`;

        assert.strictEqual(delimiter.filter({
            key: makeV1Key(masterKey2),
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

    it('should return the object created before beforeDate', () => {
        const beforeDate = '1970-01-01T00:00:00.003Z';
        const delimiter = new DelimiterCurrent({ beforeDate }, fakeLogger, 'v1');

        const masterKey1 = 'key1';
        const date1 = '1970-01-01T00:00:00.004Z';
        const value1 = `{"last-modified": "${date1}"}`;

        assert.strictEqual(delimiter.filter({
            key: makeV1Key(masterKey1),
            value: value1,
        }), FILTER_ACCEPT);

        const masterKey2 = 'key2';
        const date2 = '1970-01-01T00:00:00.000Z';
        const value2 = `{"last-modified": "${date2}"}`;

        assert.strictEqual(delimiter.filter({
            key: makeV1Key(masterKey2),
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

    it('should return the objects pushed before timeout', () => {
        const beforeDate = '1970-01-01T00:00:00.003Z';
        const delimiter = new DelimiterCurrent({ beforeDate }, fakeLogger, 'v1');

        const masterKey1 = 'key1';
        const date1 = '1970-01-01T00:00:00.000Z';
        const value1 = `{"last-modified": "${date1}"}`;

        assert.strictEqual(delimiter.filter({
            key: makeV1Key(masterKey1),
            value: value1,
        }), FILTER_ACCEPT);

        const masterKey2 = 'key2';
        const date2 = '1970-01-01T00:00:00.001Z';
        const value2 = `{"last-modified": "${date2}"}`;

        assert.strictEqual(delimiter.filter({
            key: makeV1Key(masterKey2),
            value: value2,
        }), FILTER_ACCEPT);

        delimiter.start = Date.now() - (DELIMITER_TIMEOUT_MS + 1);

        const masterKey3 = 'key3';
        const date3 = '1970-01-01T00:00:00.002Z';
        const value3 = `{"last-modified": "${date3}"}`;

        assert.strictEqual(delimiter.filter({
            key: makeV1Key(masterKey3),
            value: value3,
        }), FILTER_END);

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
            NextMarker: masterKey2,
            IsTruncated: true,
        };

        assert.deepStrictEqual(delimiter.result(), expectedResult);
    });

    it('should return empty content after timeout', () => {
        const beforeDate = '1970-01-01T00:00:00.003Z';
        const delimiter = new DelimiterCurrent({ beforeDate }, fakeLogger, 'v1');

        const masterKey1 = 'key1';
        const date1 = '1970-01-01T00:00:00.004Z';
        const value1 = `{"last-modified": "${date1}"}`;

        assert.strictEqual(delimiter.filter({
            key: makeV1Key(masterKey1),
            value: value1,
        }), FILTER_ACCEPT);

        const masterKey2 = 'key2';
        const date2 = '1970-01-01T00:00:00.005Z';
        const value2 = `{"last-modified": "${date2}"}`;

        assert.strictEqual(delimiter.filter({
            key: makeV1Key(masterKey2),
            value: value2,
        }), FILTER_ACCEPT);

        delimiter.start = Date.now() - (DELIMITER_TIMEOUT_MS + 1);

        const masterKey3 = 'key3';
        const date3 = '1970-01-01T00:00:00.006Z';
        const value3 = `{"last-modified": "${date3}"}`;

        assert.strictEqual(delimiter.filter({
            key: makeV1Key(masterKey3),
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
