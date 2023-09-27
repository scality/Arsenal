'use strict'; // eslint-disable-line strict

const assert = require('assert');

const DelimiterNonCurrent =
    require('../../../../lib/algos/list/delimiterNonCurrent').DelimiterNonCurrent;
const {
    FILTER_ACCEPT,
    FILTER_END,
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
    describe(`DelimiterNonCurrent with ${v} bucket format`, () => {
        it('should return expected metadata parameters', () => {
            const prefix = 'pre';
            const keyMarker = 'premark';
            const versionIdMarker = 'vid1';
            const maxScannedLifecycleListingEntries = 2;
            const delimiter = new DelimiterNonCurrent({
                prefix,
                keyMarker,
                versionIdMarker,
                maxScannedLifecycleListingEntries,
            }, fakeLogger, v);

            let expectedParams;
            if (v === 'v0') {
                expectedParams = { gte: `premark${VID_SEP}`, lt: 'prf' };
            } else {
                expectedParams = [
                    {
                        gte: `${DbPrefixes.Master}premark${VID_SEP}`,
                        lt: `${DbPrefixes.Master}prf`,
                    },
                    {
                        gte: `${DbPrefixes.Version}premark${VID_SEP}`,
                        lt: `${DbPrefixes.Version}prf`,
                    },
                ];
            }
            assert.deepStrictEqual(delimiter.genMDParams(), expectedParams);
            assert.strictEqual(delimiter.maxScannedLifecycleListingEntries, 2);
        });
        it('should accept entry starting with prefix', () => {
            const delimiter = new DelimiterNonCurrent({ prefix: 'prefix' }, fakeLogger, v);

            const listingKey = getListingKey('prefix1', v);
            assert.strictEqual(delimiter.filter({ key: listingKey, value: '' }), FILTER_ACCEPT);

            assert.deepStrictEqual(delimiter.result(), EmptyResult);
        });

        it('should accept a version and return an empty content', () => {
            const delimiter = new DelimiterNonCurrent({ }, fakeLogger, v);

            const masterKey = 'key';

            const versionId1 = 'version1';
            const versionKey1 = `${masterKey}${VID_SEP}${versionId1}`;
            const date1 = '1970-01-01T00:00:00.001Z';
            const value1 = `{"versionId":"${versionId1}", "last-modified": "${date1}"}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey1, v),
                value: value1,
            }), FILTER_ACCEPT);

            assert.deepStrictEqual(delimiter.result(), EmptyResult);
        });

        it('should accept two versions and return the noncurrent version', () => {
            const delimiter = new DelimiterNonCurrent({ }, fakeLogger, v);

            const masterKey = 'key';

            // filter first version
            const versionId1 = 'version1';
            const versionKey1 = `${masterKey}${VID_SEP}${versionId1}`;
            const date1 = '1970-01-01T00:00:00.002Z';
            const value1 = `{"versionId":"${versionId1}", "last-modified": "${date1}"}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey1, v),
                value: value1,
            }), FILTER_ACCEPT);

            // filter second version
            const versionId2 = 'version2';
            const versionKey2 = `${masterKey}${VID_SEP}${versionId2}`;
            const date2 = '1970-01-01T00:00:00.001Z';
            const value2 = `{"versionId":"${versionId2}", "last-modified": "${date2}"}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey2, v),
                value: value2,
            }), FILTER_ACCEPT);

            const expectedResult = {
                Contents: [
                    {
                        key: masterKey,
                        value: `{"versionId":"${versionId2}","last-modified":"${date2}","staleDate":"${date1}"}`,
                    },
                ],
                IsTruncated: false,
            };

            assert.deepStrictEqual(delimiter.result(), expectedResult);
        });

        it('should accept three versions and return the noncurrent version which stale date before beforeDate', () => {
            const beforeDate = '1970-01-01T00:00:00.002Z';
            const delimiter = new DelimiterNonCurrent({ beforeDate }, fakeLogger, v);

            const masterKey = 'key';

            // filter first version
            const versionId1 = 'version1';
            const versionKey1 = `${masterKey}${VID_SEP}${versionId1}`;
            const date1 = beforeDate;
            const value1 = `{"versionId":"${versionId1}", "last-modified": "${date1}"}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey1, v),
                value: value1,
            }), FILTER_ACCEPT);

            // filter second version
            const versionId2 = 'version2';
            const versionKey2 = `${masterKey}${VID_SEP}${versionId2}`;
            const date2 = '1970-01-01T00:00:00.001Z';
            const value2 = `{"versionId":"${versionId2}", "last-modified": "${date2}"}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey2, v),
                value: value2,
            }), FILTER_ACCEPT);

            // filter third version
            const versionId3 = 'version3';
            const versionKey3 = `${masterKey}${VID_SEP}${versionId3}`;
            const date3 = '1970-01-01T00:00:00.000Z';
            const value3 = `{"versionId":"${versionId3}", "last-modified": "${date3}"}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey3, v),
                value: value3,
            }), FILTER_ACCEPT);

            const expectedResult = {
                Contents: [
                    {
                        key: masterKey,
                        value: `{"versionId":"${versionId3}","last-modified":"${date3}","staleDate":"${date2}"}`,
                    },
                ],
                IsTruncated: false,
            };

            assert.deepStrictEqual(delimiter.result(), expectedResult);
        });

        it('should accept one delete marker and one version and return the noncurrent version', () => {
            const delimiter = new DelimiterNonCurrent({ }, fakeLogger, v);

            // const version = new Version({ isDeleteMarker: true });
            const masterKey = 'key';

            // filter delete marker
            const versionId1 = 'version1';
            const versionKey1 = `${masterKey}${VID_SEP}${versionId1}`;
            const date1 = '1970-01-01T00:00:00.002Z';
            const value1 = `{"versionId":"${versionId1}", "last-modified": "${date1}", "isDeleteMarker": true}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey1, v),
                value: value1,
            }), FILTER_ACCEPT);

            // filter second version
            const versionId2 = 'version2';
            const versionKey2 = `${masterKey}${VID_SEP}${versionId2}`;
            const date2 = '1970-01-01T00:00:00.001Z';
            const value2 = `{"versionId":"${versionId2}", "last-modified": "${date2}"}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey2, v),
                value: value2,
            }), FILTER_ACCEPT);

            const expectedResult = {
                Contents: [
                    {
                        key: masterKey,
                        value: `{"versionId":"${versionId2}","last-modified":"${date2}","staleDate":"${date1}"}`,
                    },
                ],
                IsTruncated: false,
            };

            assert.deepStrictEqual(delimiter.result(), expectedResult);
        });

        it('should end filtering if max keys reached', () => {
            const delimiter = new DelimiterNonCurrent({ maxKeys: 1 }, fakeLogger, v);

            const masterKey = 'key';

            // filter delete marker
            const versionId1 = 'version1';
            const versionKey1 = `${masterKey}${VID_SEP}${versionId1}`;
            const date1 = '1970-01-01T00:00:00.002Z';
            const value1 = `{"versionId":"${versionId1}", "last-modified": "${date1}", "isDeleteMarker": true}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey1, v),
                value: value1,
            }), FILTER_ACCEPT);

            // filter second version
            const versionId2 = 'version2';
            const versionKey2 = `${masterKey}${VID_SEP}${versionId2}`;
            const date2 = '1970-01-01T00:00:00.001Z';
            const value2 = `{"versionId":"${versionId2}", "last-modified": "${date2}"}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey2, v),
                value: value2,
            }), FILTER_ACCEPT);

            // filter third version
            const versionId3 = 'version3';
            const versionKey3 = `${masterKey}${VID_SEP}${versionId3}`;
            const date3 = '1970-01-01T00:00:00.000Z';
            const value3 = `{"versionId":"${versionId3}", "last-modified": "${date3}"}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey3, v),
                value: value3,
            }), FILTER_END);


            const expectedResult = {
                Contents: [
                    {
                        key: masterKey,
                        value: `{"versionId":"${versionId2}","last-modified":"${date2}","staleDate":"${date1}"}`,
                    },
                ],
                IsTruncated: true,
                NextKeyMarker: masterKey,
                NextVersionIdMarker: versionId2,
            };

            assert.deepStrictEqual(delimiter.result(), expectedResult);
        });

        it('should return the non-current versions pushed before max scanned entries value is reached', () => {
            const maxScannedLifecycleListingEntries = 2;
            const delimiter = new DelimiterNonCurrent({ maxScannedLifecycleListingEntries }, fakeLogger, v);

            const masterKey = 'key';

            // filter delete marker
            const versionId1 = 'version1';
            const versionKey1 = `${masterKey}${VID_SEP}${versionId1}`;
            const date1 = '1970-01-01T00:00:00.002Z';
            const value1 = `{"versionId":"${versionId1}", "last-modified": "${date1}", "isDeleteMarker": true}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey1, v),
                value: value1,
            }), FILTER_ACCEPT);

            // filter second version
            const versionId2 = 'version2';
            const versionKey2 = `${masterKey}${VID_SEP}${versionId2}`;
            const date2 = '1970-01-01T00:00:00.001Z';
            const value2 = `{"versionId":"${versionId2}", "last-modified": "${date2}"}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey2, v),
                value: value2,
            }), FILTER_ACCEPT);

            // filter third version
            const versionId3 = 'version3';
            const versionKey3 = `${masterKey}${VID_SEP}${versionId3}`;
            const date3 = '1970-01-01T00:00:00.000Z';
            const value3 = `{"versionId":"${versionId3}", "last-modified": "${date3}"}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey3, v),
                value: value3,
            }), FILTER_END);


            const expectedResult = {
                Contents: [
                    {
                        key: masterKey,
                        value: `{"versionId":"${versionId2}","last-modified":"${date2}","staleDate":"${date1}"}`,
                    },
                ],
                IsTruncated: true,
                NextKeyMarker: masterKey,
                NextVersionIdMarker: versionId2,
            };

            assert.deepStrictEqual(delimiter.result(), expectedResult);
        });

        it('should return empty content after max scanned entries value is reached', () => {
            const maxScannedLifecycleListingEntries = 2;
            const delimiter = new DelimiterNonCurrent({ maxScannedLifecycleListingEntries }, fakeLogger, v);

            // filter current version
            const masterKey1 = 'key1';
            const versionId1 = 'version1';
            const versionKey1 = `${masterKey1}${VID_SEP}${versionId1}`;
            const date1 = '1970-01-01T00:00:00.002Z';
            const value1 = `{"versionId":"${versionId1}", "last-modified": "${date1}"`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey1, v),
                value: value1,
            }), FILTER_ACCEPT);

            // filter current version
            const masterKey2 = 'key2';
            const versionId2 = 'version2';
            const versionKey2 = `${masterKey2}${VID_SEP}${versionId2}`;
            const date2 = '1970-01-01T00:00:00.001Z';
            const value2 = `{"versionId":"${versionId2}", "last-modified": "${date2}"}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey2, v),
                value: value2,
            }), FILTER_ACCEPT);

            // filter current version
            const masterKey3 = 'key3';
            const versionId3 = 'version3';
            const versionKey3 = `${masterKey3}${VID_SEP}${versionId3}`;
            const date3 = '1970-01-01T00:00:00.000Z';
            const value3 = `{"versionId":"${versionId3}", "last-modified": "${date3}"}`;

            assert.strictEqual(delimiter.filter({
                key: getListingKey(versionKey3, v),
                value: value3,
            }), FILTER_END);

            const expectedResult = {
                Contents: [],
                IsTruncated: true,
                NextKeyMarker: masterKey2,
                NextVersionIdMarker: versionId2,
            };

            assert.deepStrictEqual(delimiter.result(), expectedResult);
        });
    });
});
