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
                expectedParams = { gte: `${keyMarker}${VID_SEP}`, lt: 'prf' };
            } else {
                expectedParams = [
                    {
                        gte: `${DbPrefixes.Master}${keyMarker}${VID_SEP}`,
                        lt: `${DbPrefixes.Master}prf`,
                    },
                    {
                        gte: `${DbPrefixes.Version}${keyMarker}${VID_SEP}`,
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

        it('should return noncurrent versions starting from a marker', () => {
            const delimiter = new DelimiterNonCurrent({
                keyMarker: 'key',
                versionIdMarker: 'version1',
            }, fakeLogger, v);

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
                        value: `{"versionId":"${versionId2}","last-modified":"${date2}","staleDate":"${date1}"}`,
                    },
                    {
                        key: masterKey,
                        value: `{"versionId":"${versionId3}","last-modified":"${date3}","staleDate":"${date2}"}`,
                    },
                ],
                IsTruncated: false,
            };

            assert.deepStrictEqual(delimiter.result(), expectedResult);
        });
    });
});

describe('DelimiterNonCurrent over PHD master keys', () => {
    const valuePHD = '{"isPHD":true,"versionId":"phd-vid"}';

    ['v0', 'v1'].forEach(v => {
        describe(`with ${v} bucket format`, () => {
            it('should set NextKeyMarker to the PHD key when truncation happens inside a run of ' +
            'dangling PHD masters', () => {
                const maxScannedLifecycleListingEntries = 5;
                const delimiter = new DelimiterNonCurrent(
                    { maxScannedLifecycleListingEntries }, fakeLogger, v);

                for (let i = 1; i <= 5; i++) {
                    assert.strictEqual(delimiter.filter({
                        key: getListingKey(`img-00${i}`, v),
                        value: valuePHD,
                    }), FILTER_ACCEPT);
                }
                assert.strictEqual(delimiter.filter({
                    key: getListingKey('img-006', v),
                    value: valuePHD,
                }), FILTER_END);

                const result = delimiter.result();
                assert.strictEqual(result.IsTruncated, true);
                // Before the fix, NextKeyMarker was undefined. The next listing
                // restarted from scratch on any desert longer than the scan limit.
                // The marker now stays one PHD key behind the last one scanned,
                // img-005. The next page re-scans img-005. That costs one entry,
                // and it keeps the versions of a PHD master that still has some.
                assert.strictEqual(result.NextKeyMarker, 'img-004');
                assert.strictEqual(result.NextVersionIdMarker, undefined);
                assert.deepStrictEqual(result.Contents, []);
            });

            it('should keep protecting the newest surviving version under a PHD master', () => {
                const delimiter = new DelimiterNonCurrent({}, fakeLogger, v);

                const key = 'apple';
                const survivorVersionId = 'version1';
                const survivorDate = '1970-01-01T00:00:00.002Z';
                const survivorValue = `{"versionId":"${survivorVersionId}","last-modified":"${survivorDate}"}`;
                const olderVersionId = 'version2';
                const olderDate = '1970-01-01T00:00:00.001Z';
                const olderValue = `{"versionId":"${olderVersionId}","last-modified":"${olderDate}"}`;

                // the PHD master's generated versionId matches none of the
                // surviving version keys, so no master/version deduplication
                // applies to them
                assert.strictEqual(delimiter.filter({
                    key: getListingKey(key, v),
                    value: valuePHD,
                }), FILTER_ACCEPT);
                assert.strictEqual(delimiter.filter({
                    key: getListingKey(`${key}${VID_SEP}${survivorVersionId}`, v),
                    value: survivorValue,
                }), FILTER_ACCEPT);
                assert.strictEqual(delimiter.filter({
                    key: getListingKey(`${key}${VID_SEP}${olderVersionId}`, v),
                    value: olderValue,
                }), FILTER_ACCEPT);

                const result = delimiter.result();
                assert.strictEqual(result.IsTruncated, false);
                // the newest surviving version is the first version key scanned
                // for this object: it must be classified current (it is what the
                // PHD repair promotes back into the master) and never listed as
                // an expirable noncurrent version. Only the older version is
                // noncurrent, with its stale date taken from the survivor.
                assert.strictEqual(result.Contents.length, 1);
                assert.strictEqual(result.Contents[0].key, key);
                const parsed = JSON.parse(result.Contents[0].value);
                assert.strictEqual(parsed.versionId, olderVersionId);
                assert.strictEqual(parsed.staleDate, survivorDate);
            });
        });
    });

    describe('crawling a v0 keyspace with marker feedback', () => {
        function crawlNonCurrentListing(keyspace, maxScannedLifecycleListingEntries, maxPages) {
            const pages = [];
            let keyMarker;
            let versionIdMarker;
            for (let i = 0; i < maxPages; i++) {
                const delimiter = new DelimiterNonCurrent(
                    { keyMarker, versionIdMarker, maxScannedLifecycleListingEntries }, fakeLogger, 'v0');
                const params = delimiter.genMDParams();
                for (const entry of keyspace) {
                    if (params.gt !== undefined && entry.key <= params.gt) {
                        continue;
                    }
                    if (params.gte !== undefined && entry.key < params.gte) {
                        continue;
                    }
                    if (delimiter.filter(entry) === FILTER_END) {
                        break;
                    }
                }
                const result = delimiter.result();
                pages.push(result);
                if (!result.IsTruncated) {
                    return pages;
                }
                assert(result.NextKeyMarker,
                    `truncated page ${pages.length} returned no NextKeyMarker: ` +
                    'the next listing would restart from scratch');
                if (keyMarker !== undefined) {
                    const prevTuple = `${keyMarker}${VID_SEP}${versionIdMarker || ''}`;
                    const newTuple = `${result.NextKeyMarker}${VID_SEP}${result.NextVersionIdMarker || ''}`;
                    assert.notStrictEqual(newTuple, prevTuple,
                        `marker did not advance on truncated page ${pages.length}`);
                }
                keyMarker = result.NextKeyMarker;
                versionIdMarker = result.NextVersionIdMarker;
            }
            throw new Error(`listing did not terminate within ${maxPages} pages: ` +
                'markerless truncation restarts it from scratch');
        }

        it('should cross a PHD desert and list only the noncurrent versions on both sides', () => {
            const appleDate = '1970-01-01T00:00:00.004Z';
            const appleOldDate = '1970-01-01T00:00:00.003Z';
            const zebraDate = '1970-01-01T00:00:00.002Z';
            const zebraOldDate = '1970-01-01T00:00:00.001Z';
            const appleValue = `{"versionId":"apple-v1","last-modified":"${appleDate}"}`;
            const appleOldValue = `{"versionId":"apple-v2","last-modified":"${appleOldDate}"}`;
            const zebraValue = `{"versionId":"zebra-v1","last-modified":"${zebraDate}"}`;
            const zebraOldValue = `{"versionId":"zebra-v2","last-modified":"${zebraOldDate}"}`;

            const keyspace = [
                { key: 'apple', value: appleValue },
                { key: `apple${VID_SEP}apple-v1`, value: appleValue },
                { key: `apple${VID_SEP}apple-v2`, value: appleOldValue },
            ];
            for (let i = 1; i <= 8; i++) {
                keyspace.push({ key: `img-00${i}`, value: valuePHD });
            }
            keyspace.push({ key: 'zebra', value: zebraValue });
            keyspace.push({ key: `zebra${VID_SEP}zebra-v1`, value: zebraValue });
            keyspace.push({ key: `zebra${VID_SEP}zebra-v2`, value: zebraOldValue });

            const pages = crawlNonCurrentListing(keyspace, 5, 10);

            // 4 pages, not 3. The marker stays one PHD key behind, so each
            // truncated page re-scans one entry. The desert advances by
            // scanLimit - 1 keys per page.
            assert.strictEqual(pages.length, 4);
            const listed = pages
                .reduce((acc, page) => acc.concat(page.Contents), [])
                .map(entry => {
                    const parsed = JSON.parse(entry.value);
                    return { key: entry.key, versionId: parsed.versionId, staleDate: parsed.staleDate };
                });
            assert.deepStrictEqual(listed, [
                { key: 'apple', versionId: 'apple-v2', staleDate: appleDate },
                { key: 'zebra', versionId: 'zebra-v2', staleDate: zebraDate },
            ]);
        });

        // The scan limit can end on a PHD master that still has version keys. A
        // bookmark on that key gives a bare keyMarker. A bare keyMarker resumes
        // after all versions of the key (genMDParamsV0: gt = keyMarker +
        // inc(VID_SEP)), so the listing skips that key's noncurrent work.
        // handlePHDMaster keeps the marker one PHD key behind instead. This needs
        // no versionIdMarker sentinel, because the next page re-scans the key.
        it('should not skip the versions of a PHD master when the scan limit lands exactly ' +
        'on the master', () => {
            const keyspace = [
                { key: 'k1', value: '{"versionId":"k1-v1","last-modified":"1970-01-01T00:00:00.001Z"}' },
                { key: 'k2', value: '{"versionId":"k2-v1","last-modified":"1970-01-01T00:00:00.001Z"}' },
                { key: 'k3', value: '{"versionId":"k3-v1","last-modified":"1970-01-01T00:00:00.001Z"}' },
                { key: 'k4', value: '{"versionId":"k4-v1","last-modified":"1970-01-01T00:00:00.001Z"}' },
                { key: 'kilo', value: valuePHD },
                { key: `kilo${VID_SEP}kilo-v1`,
                    value: '{"versionId":"kilo-v1","last-modified":"1970-01-01T00:00:00.002Z"}' },
                { key: `kilo${VID_SEP}kilo-v2`,
                    value: '{"versionId":"kilo-v2","last-modified":"1970-01-01T00:00:00.001Z"}' },
                { key: 'mango', value: '{"versionId":"mango-v1","last-modified":"1970-01-01T00:00:00.001Z"}' },
            ];

            const pages = crawlNonCurrentListing(keyspace, 5, 10);

            const listedVersionIds = pages
                .reduce((acc, page) => acc.concat(page.Contents), [])
                .map(entry => JSON.parse(entry.value).versionId);
            // kilo-v2 is noncurrent (kilo-v1 is the de-facto current version)
            // and must be listed even though the scan limit landed exactly on
            // the PHD master right above it
            assert(listedVersionIds.includes('kilo-v2'));
        });
    });
});
