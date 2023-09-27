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

function getListingKey(key, vFormat) {
    if (vFormat === 'v0') {
        return key;
    }
    if (vFormat === 'v1') {
        return `${DbPrefixes.Master}${key}`;
    }
    return assert.fail(`bad vFormat ${vFormat}`);
}

['v0', 'v1'].forEach(v => {
    describe(`DelimiterCurrent with ${v} bucket format`, () => {
        it('should return expected metadata parameters', () => {
            const prefix = 'pre';
            const marker = 'premark';
            const beforeDate = '1970-01-01T00:00:00.005Z';
            const excludedDataStoreName = 'location1';
            const maxScannedLifecycleListingEntries = 2;
            const delimiter = new DelimiterCurrent({
                prefix,
                marker,
                beforeDate,
                excludedDataStoreName,
                maxScannedLifecycleListingEntries,
            }, fakeLogger, v);

            const expectedParams = {
                dataStoreName: {
                    ne: excludedDataStoreName,
                },
                lastModified: {
                    lt: beforeDate,
                },
                gt: getListingKey('premark', v),
                lt: getListingKey('prf', v),
            };
            assert.deepStrictEqual(delimiter.genMDParams(), expectedParams);
            assert.strictEqual(delimiter.maxScannedLifecycleListingEntries, 2);
        });

        it('should accept entry starting with prefix', () => {
            const delimiter = new DelimiterCurrent({ prefix: 'prefix' }, fakeLogger, v);

            const masterKey = 'prefix1';
            const date1 = '1970-01-01T00:00:00.001Z';
            const value1 = `{"last-modified": "${date1}"}`;
            assert.strictEqual(delimiter.filter({ key: getListingKey(masterKey, v), value: value1 }), FILTER_ACCEPT);

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
            const delimiter = new DelimiterCurrent({ prefix: 'prefix' }, fakeLogger, v);

            const listingKey = getListingKey('noprefix', v);
            const creationDate = '1970-01-01T00:00:00.001Z';
            const value = `{"last-modified": "${creationDate}"}`;
            assert.strictEqual(delimiter.filter({ key: listingKey, value }), FILTER_SKIP);

            assert.deepStrictEqual(delimiter.result(), EmptyResult);
        });

        it('should accept a master and return it', () => {
            const delimiter = new DelimiterCurrent({ }, fakeLogger, v);

            const masterKey = 'key';

            const date1 = '1970-01-01T00:00:00.001Z';
            const value1 = `{"last-modified": "${date1}"}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(masterKey, v),
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
            const delimiter = new DelimiterCurrent({ maxKeys: 1 }, fakeLogger, v);

            const masterKey1 = 'key1';
            const date1 = '1970-01-01T00:00:00.001Z';
            const value1 = `{"last-modified": "${date1}"}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(masterKey1, v),
                value: value1,
            }), FILTER_ACCEPT);

            const masterKey2 = 'key2';
            const date2 = '1970-01-01T00:00:00.000Z';
            const value2 = `{"last-modified": "${date2}"}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(masterKey2, v),
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
            const delimiter = new DelimiterCurrent({ beforeDate }, fakeLogger, v);

            const masterKey1 = 'key1';
            const date1 = '1970-01-01T00:00:00.004Z';
            const value1 = `{"last-modified": "${date1}"}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(masterKey1, v),
                value: value1,
            }), FILTER_ACCEPT);

            const masterKey2 = 'key2';
            const date2 = '1970-01-01T00:00:00.000Z';
            const value2 = `{"last-modified": "${date2}"}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(masterKey2, v),
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

        it('should return an empty list if last-modified is an empty string', () => {
            const beforeDate = '1970-01-01T00:00:00.003Z';
            const delimiter = new DelimiterCurrent({ beforeDate }, fakeLogger, v);

            const masterKey0 = 'key0';
            const value0 = '{"last-modified": ""}';

            assert.strictEqual(delimiter.filter({
                key: getListingKey(masterKey0, v),
                value: value0,
            }), FILTER_ACCEPT);

            const expectedResult = {
                Contents: [],
                IsTruncated: false,
            };

            assert.deepStrictEqual(delimiter.result(), expectedResult);
        });

        it('should return an empty list if last-modified is undefined', () => {
            const beforeDate = '1970-01-01T00:00:00.003Z';
            const delimiter = new DelimiterCurrent({ beforeDate }, fakeLogger, v);

            const masterKey0 = 'key0';
            const value0 = '{}';

            assert.strictEqual(delimiter.filter({
                key: getListingKey(masterKey0, v),
                value: value0,
            }), FILTER_ACCEPT);

            const expectedResult = {
                Contents: [],
                IsTruncated: false,
            };

            assert.deepStrictEqual(delimiter.result(), expectedResult);
        });

        it('should return the object with dataStore name that does not match', () => {
            const beforeDate = '1970-01-01T00:00:00.005Z';
            const excludedDataStoreName = 'location-excluded';
            const delimiter = new DelimiterCurrent({ beforeDate, excludedDataStoreName }, fakeLogger, v);

            const masterKey1 = 'key1';
            const date1 = '1970-01-01T00:00:00.004Z';
            const value1 = `{"last-modified": "${date1}", "dataStoreName": "valid"}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(masterKey1, v),
                value: value1,
            }), FILTER_ACCEPT);

            const masterKey2 = 'key2';
            const date2 = '1970-01-01T00:00:00.000Z';
            const value2 = `{"last-modified": "${date2}", "dataStoreName": "${excludedDataStoreName}"}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(masterKey2, v),
                value: value2,
            }), FILTER_ACCEPT);

            const expectedResult = {
                Contents: [
                    {
                        key: masterKey1,
                        value: value1,
                    },
                ],
                IsTruncated: false,
            };

            assert.deepStrictEqual(delimiter.result(), expectedResult);
        });

        it('should stop fetching entries if the max keys are reached and return the accurate next marker', () => {
            const beforeDate = '1970-01-01T00:00:00.005Z';
            const excludedDataStoreName = 'location-excluded';
            const delimiter = new DelimiterCurrent({ beforeDate, excludedDataStoreName, maxKeys: 1 }, fakeLogger, v);

            const masterKey1 = 'key1';
            const date1 = '1970-01-01T00:00:00.004Z';
            const value1 = `{"last-modified": "${date1}", "dataStoreName": "valid"}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(masterKey1, v),
                value: value1,
            }), FILTER_ACCEPT);

            const masterKey2 = 'key2';
            const date2 = '1970-01-01T00:00:00.000Z';
            const value2 = `{"last-modified": "${date2}", "dataStoreName": "${excludedDataStoreName}"}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(masterKey2, v),
                value: value2,
            }), FILTER_END);

            const expectedResult = {
                Contents: [
                    {
                        key: masterKey1,
                        value: value1,
                    },
                ],
                IsTruncated: true,
                NextMarker: masterKey1,
            };

            assert.deepStrictEqual(delimiter.result(), expectedResult);
        });

        it('should return the object created before beforeDate and with dataStore name that does not match', () => {
            const beforeDate = '1970-01-01T00:00:00.003Z';
            const excludedDataStoreName = 'location-excluded';
            const delimiter = new DelimiterCurrent({ beforeDate, excludedDataStoreName }, fakeLogger, v);

            const masterKey1 = 'key1';
            const date1 = '1970-01-01T00:00:00.004Z';
            const value1 = `{"last-modified": "${date1}", "dataStoreName": "valid"}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(masterKey1, v),
                value: value1,
            }), FILTER_ACCEPT);

            const masterKey2 = 'key2';
            const date2 = '1970-01-01T00:00:00.001Z';
            const value2 = `{"last-modified": "${date2}", "dataStoreName": "valid"}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(masterKey2, v),
                value: value2,
            }), FILTER_ACCEPT);

            const masterKey3 = 'key3';
            const date3 = '1970-01-01T00:00:00.000Z';
            const value3 = `{"last-modified": "${date3}", "dataStoreName": "${excludedDataStoreName}"}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(masterKey3, v),
                value: value3,
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

        it('should return the objects pushed before max scanned entries value is reached', () => {
            const beforeDate = '1970-01-01T00:00:00.003Z';
            const maxScannedLifecycleListingEntries = 2;
            const delimiter = new DelimiterCurrent({ beforeDate, maxScannedLifecycleListingEntries }, fakeLogger, v);

            const masterKey1 = 'key1';
            const date1 = '1970-01-01T00:00:00.000Z';
            const value1 = `{"last-modified": "${date1}"}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(masterKey1, v),
                value: value1,
            }), FILTER_ACCEPT);

            const masterKey2 = 'key2';
            const date2 = '1970-01-01T00:00:00.001Z';
            const value2 = `{"last-modified": "${date2}"}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(masterKey2, v),
                value: value2,
            }), FILTER_ACCEPT);

            const masterKey3 = 'key3';
            const date3 = '1970-01-01T00:00:00.002Z';
            const value3 = `{"last-modified": "${date3}"}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(masterKey3, v),
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

        it('should return empty content after max scanned entries value is reached', () => {
            const beforeDate = '1970-01-01T00:00:00.003Z';
            const maxScannedLifecycleListingEntries = 2;
            const delimiter = new DelimiterCurrent({ beforeDate, maxScannedLifecycleListingEntries }, fakeLogger, v);

            const masterKey1 = 'key1';
            const date1 = '1970-01-01T00:00:00.004Z';
            const value1 = `{"last-modified": "${date1}"}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(masterKey1, v),
                value: value1,
            }), FILTER_ACCEPT);

            const masterKey2 = 'key2';
            const date2 = '1970-01-01T00:00:00.005Z';
            const value2 = `{"last-modified": "${date2}"}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(masterKey2, v),
                value: value2,
            }), FILTER_ACCEPT);

            const masterKey3 = 'key3';
            const date3 = '1970-01-01T00:00:00.006Z';
            const value3 = `{"last-modified": "${date3}"}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(masterKey3, v),
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
});
