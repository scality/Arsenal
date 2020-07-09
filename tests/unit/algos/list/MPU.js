'use strict'; // eslint-disable-line strict

const assert = require('assert');
const MultipartUploads = require('../../../../lib/algos/list/MPU').MultipartUploads;
const { inc } = require('../../../../lib/algos/list/tools');
const werelogs = require('werelogs').Logger;
// eslint-disable-next-line new-cap
const logger = new werelogs('listMpuTest');
const performListing = require('../../../utils/performListing');
const VSConst = require('../../../../lib/versioning/constants').VersioningConstants;
const { DbPrefixes, BucketVersioningKeyFormat } = VSConst;

function getListingKey(key, vFormat) {
    if ([BucketVersioningKeyFormat.v0,
         BucketVersioningKeyFormat.v0mig].includes(vFormat)) {
        return key;
    }
    if ([BucketVersioningKeyFormat.v0v1,
         BucketVersioningKeyFormat.v1mig,
         BucketVersioningKeyFormat.v1].includes(vFormat)) {
        return `${DbPrefixes.Master}${key}`;
    }
    assert.fail(`bad vFormat ${vFormat}`);
    return undefined;
}

describe('Multipart Uploads listing algorithm', () => {
    const splitter = '**';
    const overviewPrefix = `overview${splitter}`;
    const storageClass = 'STANDARD';
    const initiator1 = { ID: '1', DisplayName: 'initiator1' };
    const initiator2 = { ID: '2', DisplayName: 'initiator2' };
    const v0keys = [
        `${overviewPrefix}test/1${splitter}uploadId1`,
        `${overviewPrefix}test/2${splitter}uploadId2`,
        `${overviewPrefix}test/3${splitter}uploadId3`,
        `${overviewPrefix}testMore/4${splitter}uploadId4`,
        `${overviewPrefix}testMore/5${splitter}uploadId5`,
        `${overviewPrefix}prefixTest/5${splitter}uploadId5`,
    ];
    const values = [
        JSON.stringify({
            'key': 'test/1',
            'uploadId': 'uploadId1',
            'initiator': initiator1,
            'owner-id': '1',
            'owner-display-name': 'owner1',
            'x-amz-storage-class': storageClass,
            'initiated': '',
        }),
        JSON.stringify({
            'key': 'test/2',
            'uploadId': 'uploadId2',
            'initiator': initiator2,
            'owner-id': '1',
            'owner-display-name': 'owner2',
            'x-amz-storage-class': storageClass,
            'initiated': '',
        }),
        JSON.stringify({
            'key': 'test/3',
            'uploadId': 'uploadId3',
            'initiator': initiator1,
            'owner-id': '1',
            'owner-display-name': 'owner1',
            'x-amz-storage-class': storageClass,
            'initiated': '',
        }),
        JSON.stringify({
            'key': 'testMore/4',
            'uploadId': 'uploadId4',
            'initiator': initiator2,
            'owner-id': '1',
            'owner-display-name': 'owner2',
            'x-amz-storage-class': storageClass,
            'initiated': '',
        }),
        JSON.stringify({
            'key': 'testMore/5',
            'uploadId': 'uploadId5',
            'initiator': initiator1,
            'owner-id': '1',
            'owner-display-name': 'owner1',
            'x-amz-storage-class': storageClass,
            'initiated': '',
        }),
        JSON.stringify({
            'key': 'prefixTest/5',
            'uploadId': 'uploadId5',
            'initiator': initiator1,
            'owner-id': '1',
            'owner-display-name': 'owner1',
            'x-amz-storage-class': storageClass,
            'initiated': '',
        }),
    ];
    let listingParams;
    let expectedResult;

    beforeEach(done => {
        listingParams = {
            delimiter: '',
            splitter,
            maxKeys: undefined,
            queryPrefixLength: 0,
        };

        expectedResult = {
            CommonPrefixes: [],
            Delimiter: '',
            Uploads: [],
            IsTruncated: false,
            NextKeyMarker: 'prefixTest/5',
            MaxKeys: 1000,
            NextUploadIdMarker: 'uploadId5',
        };

        expectedResult.Uploads = values.map(value => {
            const tmp = JSON.parse(value);
            return {
                key: tmp.key,
                value: {
                    UploadId: tmp.uploadId,
                    Initiator: tmp.initiator,
                    Owner: {
                        ID: tmp['owner-id'],
                        DisplayName: tmp['owner-display-name'],
                    },
                    StorageClass: tmp['x-amz-storage-class'],
                    Initiated: tmp.initiated,
                },
            };
        });
        done();
    });

    [
        BucketVersioningKeyFormat.v0,
        BucketVersioningKeyFormat.v0mig,
        BucketVersioningKeyFormat.v0v1,
        BucketVersioningKeyFormat.v1mig,
        BucketVersioningKeyFormat.v1,
    ].forEach(vFormat => {
        const dbListing = v0keys.map((key, i) => ({
            key: getListingKey(key, vFormat),
            value: values[i],
        }));
        it(`should perform a vFormat=${vFormat} listing of all keys`, () => {
            const listingResult = performListing(dbListing, MultipartUploads,
                                                 listingParams, logger, vFormat);
            assert.deepStrictEqual(listingResult, expectedResult);
        });

        it(`should perform a vFormat=${vFormat} listing with delimiter`, () => {
            const delimiter = '/';
            listingParams.delimiter = delimiter;
            // format result
            expectedResult.Uploads = [];
            expectedResult.CommonPrefixes = ['test/', 'testMore/', 'prefixTest/'];
            expectedResult.Delimiter = delimiter;
            expectedResult.MaxKeys = 1000;
            expectedResult.NextKeyMarker = 'prefixTest/';
            expectedResult.NextUploadIdMarker = '';

            const listingResult = performListing(dbListing, MultipartUploads,
                                                 listingParams, logger, vFormat);
            assert.deepStrictEqual(listingResult, expectedResult);
        });

        it(`should perform a vFormat=${vFormat} listing with max keys`, () => {
            listingParams.maxKeys = 3;
            // format result
            expectedResult.Uploads.pop();
            expectedResult.Uploads.pop();
            expectedResult.Uploads.pop();
            expectedResult.NextKeyMarker = 'test/3';
            expectedResult.NextUploadIdMarker = 'uploadId3';
            expectedResult.IsTruncated = true;
            expectedResult.MaxKeys = 3;

            const listingResult = performListing(dbListing, MultipartUploads,
                                                 listingParams, logger, vFormat);
            assert.deepStrictEqual(listingResult, expectedResult);
        });
    });

    describe('MultipartUploads.genMDParams()', () => {
        [{
            listingParams: {
                splitter,
            },
            mdParams: {
                [BucketVersioningKeyFormat.v0]: {},
                [BucketVersioningKeyFormat.v0mig]: [{
                    lt: DbPrefixes.V1,
                }, {
                    gte: inc(DbPrefixes.V1),
                    serial: true,
                }],
                [BucketVersioningKeyFormat.v1]: {
                    gte: DbPrefixes.Master,
                    lt: inc(DbPrefixes.Master),
                },
            },
        }, {
            listingParams: {
                splitter,
                prefix: 'foo/bar',
            },
            mdParams: {
                [BucketVersioningKeyFormat.v0]: {
                    gte: 'foo/bar',
                    lt: 'foo/bas',
                },
                [BucketVersioningKeyFormat.v0mig]: {
                    gte: 'foo/bar',
                    lt: 'foo/bas',
                },
                [BucketVersioningKeyFormat.v1]: {
                    gte: `${DbPrefixes.Master}foo/bar`,
                    lt: `${DbPrefixes.Master}foo/bas`,
                },
            },
        }, {
            listingParams: {
                splitter,
                keyMarker: 'marker',
            },
            mdParams: {
                [BucketVersioningKeyFormat.v0]: {
                    gt: `${overviewPrefix}marker${inc(splitter)}`,
                },
                [BucketVersioningKeyFormat.v0mig]: [{
                    gt: `${overviewPrefix}marker${inc(splitter)}`,
                    lt: DbPrefixes.V1,
                }, {
                    gte: inc(DbPrefixes.V1),
                    serial: true,
                }],
                [BucketVersioningKeyFormat.v1]: {
                    gt: `${DbPrefixes.Master}${overviewPrefix}marker${inc(splitter)}`,
                    lt: inc(DbPrefixes.Master),
                },
            },
        }].forEach(testCase => {
            [
                BucketVersioningKeyFormat.v0,
                BucketVersioningKeyFormat.v0mig,
                BucketVersioningKeyFormat.v0v1,
                BucketVersioningKeyFormat.v1mig,
                BucketVersioningKeyFormat.v1,
            ].forEach(vFormat => {
                it(`with vFormat=${vFormat}, listing params ${JSON.stringify(testCase.listingParams)}`, () => {
                    const delimiter = new MultipartUploads(
                        testCase.listingParams, logger, vFormat);
                    const mdParams = delimiter.genMDParams();
                    let paramsVFormat;
                    if ([BucketVersioningKeyFormat.v0v1,
                         BucketVersioningKeyFormat.v1mig,
                         BucketVersioningKeyFormat.v1].includes(vFormat)) {
                        // all above vformats are equivalent to v1 when it
                        // comes to generating md params
                        paramsVFormat = BucketVersioningKeyFormat.v1;
                    } else {
                        paramsVFormat = vFormat;
                    }
                    assert.deepStrictEqual(mdParams, testCase.mdParams[paramsVFormat]);
                });
            });
        });
    });
});
