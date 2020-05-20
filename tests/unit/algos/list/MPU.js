'use strict'; // eslint-disable-line strict

const assert = require('assert');
const MultipartUploads =
    require('../../../../lib/algos/list/MPU').MultipartUploads;
const werelogs = require('werelogs').Logger;
// eslint-disable-next-line new-cap
const logger = new werelogs('listMpuTest');
const performListing = require('../../../utils/performListing');
const VSConst = require('../../../../lib/versioning/constants').VersioningConstants;
const { DbPrefixes } = VSConst;

describe('Multipart Uploads listing algorithm', () => {
    const splitter = '**';
    const overviewPrefix = `overview${splitter}`;
    const storageClass = 'STANDARD';
    const initiator1 = { ID: '1', DisplayName: 'initiator1' };
    const initiator2 = { ID: '2', DisplayName: 'initiator2' };
    const keys = {
        v0: [`${overviewPrefix}test/1${splitter}uploadId1`,
             `${overviewPrefix}test/2${splitter}uploadId2`,
             `${overviewPrefix}test/3${splitter}uploadId3`,
             `${overviewPrefix}testMore/4${splitter}uploadId4`,
             `${overviewPrefix}testMore/5${splitter}uploadId5`,
             `${overviewPrefix}prefixTest/5${splitter}uploadId5`,
            ],
        v1: [`${DbPrefixes.Master}${overviewPrefix}test/1${splitter}uploadId1`,
             `${DbPrefixes.Master}${overviewPrefix}test/2${splitter}uploadId2`,
             `${DbPrefixes.Master}${overviewPrefix}test/3${splitter}uploadId3`,
             `${DbPrefixes.Master}${overviewPrefix}testMore/4${splitter}uploadId4`,
             `${DbPrefixes.Master}${overviewPrefix}testMore/5${splitter}uploadId5`,
             `${DbPrefixes.Master}${overviewPrefix}prefixTest/5${splitter}uploadId5`,
            ],
    };
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

    ['v0', 'v1'].forEach(vFormat => {
        const dbListing = keys[vFormat].map((key, i) => ({
            key,
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
});
