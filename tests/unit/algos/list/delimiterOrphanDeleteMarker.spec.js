'use strict'; // eslint-disable-line strict

const assert = require('assert');

const DelimiterOrphanDeleteMarker =
    require('../../../../lib/algos/list/delimiterOrphanDeleteMarker').DelimiterOrphanDeleteMarker;
const {
    FILTER_ACCEPT,
    FILTER_END,
    inc,
} = require('../../../../lib/algos/list/tools');
const VSConst =
    require('../../../../lib/versioning/constants').VersioningConstants;
const { DbPrefixes } = VSConst;

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

function getListingKey(key, vFormat) {
    if (vFormat === 'v0') {
        return key;
    }
    if (vFormat === 'v1') {
        const keyPrefix = key.includes(VID_SEP) ?
            DbPrefixes.Version : DbPrefixes.Master;
        return `${keyPrefix}${key}`;
    }
    return assert.fail(`bad format ${vFormat}`);
}

['v0', 'v1'].forEach(v => {
    describe(`DelimiterOrphanDeleteMarker with ${v} bucket format`, () => {
        it('should return expected metadata parameters', () => {
            const prefix = 'pre';
            const marker = 'premark';
            const maxScannedLifecycleListingEntries = 2;
            const delimiter = new DelimiterOrphanDeleteMarker({
                prefix,
                marker,
                maxScannedLifecycleListingEntries,
            }, fakeLogger, v);

            let expectedParams;
            if (v === 'v0') {
                expectedParams = { gt: `premark${inc(VID_SEP)}`, lt: 'prf' };
            } else {
                expectedParams = [
                    {
                        gt: `${DbPrefixes.Master}premark${inc(VID_SEP)}`,
                        lt: `${DbPrefixes.Master}prf`,
                    },
                    {
                        gt: `${DbPrefixes.Version}premark${inc(VID_SEP)}`,
                        lt: `${DbPrefixes.Version}prf`,
                    },
                ];
            }
            assert.deepStrictEqual(delimiter.genMDParams(), expectedParams);
            assert.strictEqual(delimiter.maxScannedLifecycleListingEntries, 2);
        });
        it('should accept entry starting with prefix', () => {
            const delimiter = new DelimiterOrphanDeleteMarker({ prefix: 'prefix' }, fakeLogger, v);

            const listingKey = getListingKey('prefix1', v);
            assert.strictEqual(delimiter.filter({ key: listingKey, value: '' }), FILTER_ACCEPT);

            assert.deepStrictEqual(delimiter.result(), EmptyResult);
        });

        it('should accept a version and return an empty content', () => {
            const delimiter = new DelimiterOrphanDeleteMarker({ }, fakeLogger, v);

            const masterKey = 'key';

            const versionId1 = 'version1';
            const versionKey1 = `${masterKey}${VID_SEP}${versionId1}`;
            const date1 = '1970-01-01T00:00:00.001Z';
            const value1 = `{"versionId":"${versionId1}","last-modified":"${date1}"}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey1, v),
                value: value1,
            }), FILTER_ACCEPT);

            assert.deepStrictEqual(delimiter.result(), EmptyResult);
        });

        it('should accept an orphan delete marker and return it from the content', () => {
            const delimiter = new DelimiterOrphanDeleteMarker({ }, fakeLogger, v);

            const masterKey = 'key';

            const versionId1 = 'version1';
            const versionKey1 = `${masterKey}${VID_SEP}${versionId1}`;
            const date1 = '1970-01-01T00:00:00.001Z';
            const value1 = `{"versionId":"${versionId1}","last-modified":"${date1}","isDeleteMarker":true}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey1, v),
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
            const delimiter = new DelimiterOrphanDeleteMarker({ }, fakeLogger, v);

            // filter the first orphan delete marker
            const masterKey1 = 'key1';
            const versionId1 = 'version1';
            const versionKey1 = `${masterKey1}${VID_SEP}${versionId1}`;
            const date1 = '1970-01-01T00:00:00.002Z';
            const value1 = `{"versionId":"${versionId1}","last-modified":"${date1}","isDeleteMarker":true}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey1, v),
                value: value1,
            }), FILTER_ACCEPT);

            // filter the second orphan delete marker
            const masterKey2 = 'key2';
            const versionId2 = 'version2';
            const versionKey2 = `${masterKey2}${VID_SEP}${versionId2}`;
            const date2 = '1970-01-01T00:00:00.001Z';
            const value2 = `{"versionId":"${versionId2}","last-modified":"${date2}","isDeleteMarker":true}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey2, v),
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
            const delimiter = new DelimiterOrphanDeleteMarker({ maxKeys: 1 }, fakeLogger, v);

            // filter the first orphan delete marker
            const masterKey1 = 'key1';
            const versionId1 = 'version1';
            const versionKey1 = `${masterKey1}${VID_SEP}${versionId1}`;
            const date1 = '1970-01-01T00:00:00.002Z';
            const value1 = `{"versionId":"${versionId1}","last-modified":"${date1}","isDeleteMarker":true}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey1, v),
                value: value1,
            }), FILTER_ACCEPT);

            // filter the second orphan delete marker
            const masterKey2 = 'key2';
            const versionId2 = 'version2';
            const versionKey2 = `${masterKey2}${VID_SEP}${versionId2}`;
            const date2 = '1970-01-01T00:00:00.001Z';
            const value2 = `{"versionId":"${versionId2}","last-modified":"${date2}","isDeleteMarker":true}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey2, v),
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
            const delimiter = new DelimiterOrphanDeleteMarker({ beforeDate: date1 }, fakeLogger, v);

            // filter the first orphan delete marker
            const masterKey1 = 'key1';
            const versionId1 = 'version1';
            const versionKey1 = `${masterKey1}${VID_SEP}${versionId1}`;
            const value1 = `{"versionId":"${versionId1}","last-modified":"${date1}","isDeleteMarker":true}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey1, v),
                value: value1,
            }), FILTER_ACCEPT);

            // filter the second orphan delete marker
            const masterKey2 = 'key2';
            const versionId2 = 'version2';
            const versionKey2 = `${masterKey2}${VID_SEP}${versionId2}`;
            const date2 = '1970-01-01T00:00:00.001Z';
            const value2 = `{"versionId":"${versionId2}","last-modified":"${date2}","isDeleteMarker":true}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey2, v),
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
            const delimiter = new DelimiterOrphanDeleteMarker({ maxKeys: 1 }, fakeLogger, v);

            // filter the first orphan delete marker
            const masterKey1 = 'key1';
            const versionId1 = 'version1';
            const versionKey1 = `${masterKey1}${VID_SEP}${versionId1}`;
            const date1 = '1970-01-01T00:00:00.002Z';
            const value1 = `{"versionId":"${versionId1}","last-modified":"${date1}","isDeleteMarker":true}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey1, v),
                value: value1,
            }), FILTER_ACCEPT);

            // filter the second orphan delete marker
            const masterKey2 = 'key2';
            const versionId2 = 'version2';
            const versionKey2 = `${masterKey2}${VID_SEP}${versionId2}`;
            const date2 = '1970-01-01T00:00:00.001Z';
            const value2 = `{"versionId":"${versionId2}","last-modified":"${date2}","isDeleteMarker":true}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey2, v),
                value: value2,
            }), FILTER_ACCEPT);

            // filter the third orphan delete marker
            const masterKey3 = 'key3';
            const versionId3 = 'version3';
            const versionKey3 = `${masterKey3}${VID_SEP}${versionId3}`;
            const date3 = '1970-01-01T00:00:00.000Z';
            const value3 = `{"versionId":"${versionId3}","last-modified":"${date3}","isDeleteMarker":true}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey3, v),
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

        it('should end filtering if max scanned entries value is reached', () => {
            const maxScannedLifecycleListingEntries = 2;
            const delimiter = new DelimiterOrphanDeleteMarker({ maxScannedLifecycleListingEntries }, fakeLogger, v);

            // filter the first orphan delete marker
            const masterKey1 = 'key1';
            const versionId1 = 'version1';
            const versionKey1 = `${masterKey1}${VID_SEP}${versionId1}`;
            const date1 = '1970-01-01T00:00:00.002Z';
            const value1 = `{"versionId":"${versionId1}","last-modified":"${date1}","isDeleteMarker":true}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey1, v),
                value: value1,
            }), FILTER_ACCEPT);

            // filter the second orphan delete marker
            const masterKey2 = 'key2';
            const versionId2 = 'version2';
            const versionKey2 = `${masterKey2}${VID_SEP}${versionId2}`;
            const date2 = '1970-01-01T00:00:00.001Z';
            const value2 = `{"versionId":"${versionId2}","last-modified":"${date2}","isDeleteMarker":true}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey2, v),
                value: value2,
            }), FILTER_ACCEPT);

            // filter the third orphan delete marker
            const masterKey3 = 'key3';
            const versionId3 = 'version3';
            const versionKey3 = `${masterKey3}${VID_SEP}${versionId3}`;
            const date3 = '1970-01-01T00:00:00.001Z';
            const value3 = `{"versionId":"${versionId3}","last-modified":"${date3}","isDeleteMarker":true}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey3, v),
                value: value3,
            }), FILTER_END);

            const expectedResult = {
                Contents: [
                    {
                        key: masterKey1,
                        value: value1,
                    },
                ],
                NextMarker: masterKey2,
                IsTruncated: true,
            };

            assert.deepStrictEqual(delimiter.result(), expectedResult);
        });

        it('should not consider the last delete marker scanned as an orphan if listing interrupted', () => {
            const maxScannedLifecycleListingEntries = 1;
            const delimiter = new DelimiterOrphanDeleteMarker({ maxScannedLifecycleListingEntries }, fakeLogger, v);

            // filter the delete marker (not orphan)
            const masterKey1 = 'key1';
            const versionId1 = 'version1';
            const versionKey1 = `${masterKey1}${VID_SEP}${versionId1}`;
            const date1 = '1970-01-01T00:00:00.001Z';
            const value1 = `{"versionId":"${versionId1}","last-modified":"${date1}","isDeleteMarker":true}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey1, v),
                value: value1,
            }), FILTER_ACCEPT);

            const versionId2 = 'version2';
            const versionKey2 = `${masterKey1}${VID_SEP}${versionId2}`;
            const date2 = '1970-01-01T00:00:00.002Z';
            const value2 = `{"versionId":"${versionId2}","last-modified":"${date2}","isDeleteMarker":true}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey2, v),
                value: value2,
            }), FILTER_END);

            const expectedResult = {
                Contents: [],
                NextMarker: masterKey1,
                IsTruncated: true,
            };

            assert.deepStrictEqual(delimiter.result(), expectedResult);
        });

        it('should end filtering with empty content if max scanned entries value is reached', () => {
            const maxScannedLifecycleListingEntries = 2;
            const delimiter = new DelimiterOrphanDeleteMarker({ maxScannedLifecycleListingEntries }, fakeLogger, v);

            // not a delete marker
            const masterKey1 = 'key1';
            const versionId1 = 'version1';
            const versionKey1 = `${masterKey1}${VID_SEP}${versionId1}`;
            const date1 = '1970-01-01T00:00:00.002Z';
            const value1 = `{"versionId":"${versionId1}","last-modified":"${date1}"}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey1, v),
                value: value1,
            }), FILTER_ACCEPT);

            // not a delete marker
            const masterKey2 = 'key2';
            const versionId2 = 'version2';
            const versionKey2 = `${masterKey2}${VID_SEP}${versionId2}`;
            const date2 = '1970-01-01T00:00:00.001Z';
            const value2 = `{"versionId":"${versionId2}","last-modified":"${date2}"}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey2, v),
                value: value2,
            }), FILTER_ACCEPT);

            // orphan delete marker
            const masterKey3 = 'key3';
            const versionId3 = 'version3';
            const versionKey3 = `${masterKey3}${VID_SEP}${versionId3}`;
            const date3 = '1970-01-01T00:00:00.000Z';
            const value3 = `{"versionId":"${versionId3}","last-modified":"${date3}","isDeleteMarker":true}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey3, v),
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
