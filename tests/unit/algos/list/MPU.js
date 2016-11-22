'use strict'; // eslint-disable-line strict

const assert = require('assert');
const MultipartUploads =
    require('../../../../lib/algos/list/MPU').MultipartUploads;
const werelogs = require('werelogs').Logger;
// eslint-disable-next-line new-cap
const logger = new werelogs('listMpuTest');
const performListing = require('../../../utils/performListing');
describe('Multipart Uploads listing algorithm', () => {
    const splitter = '**';
    const overviewPrefix = `overview${splitter}`;
    const storageClass = 'STANDARD';
    const initiator1 = { ID: '1', DisplayName: 'initiator1' };
    const initiator2 = { ID: '2', DisplayName: 'initiator2' };
    const keys = [
        {
            key: `${overviewPrefix}test/1${splitter}uploadId1`,
            value: JSON.stringify({
                'key': 'test/1',
                'uploadId': 'uploadId1',
                'initiator': initiator1,
                'owner-id': '1',
                'owner-display-name': 'owner1',
                'x-amz-storage-class': storageClass,
                'initiated': '',
            }),
        }, {
            key: `${overviewPrefix}test/2${splitter}uploadId2`,
            value: JSON.stringify({
                'key': 'test/2',
                'uploadId': 'uploadId2',
                'initiator': initiator2,
                'owner-id': '1',
                'owner-display-name': 'owner2',
                'x-amz-storage-class': storageClass,
                'initiated': '',
            }),
        }, {
            key: `${overviewPrefix}test/3${splitter}uploadId3`,
            value: JSON.stringify({
                'key': 'test/3',
                'uploadId': 'uploadId3',
                'initiator': initiator1,
                'owner-id': '1',
                'owner-display-name': 'owner1',
                'x-amz-storage-class': storageClass,
                'initiated': '',
            }),
        }, {
            key: `${overviewPrefix}testMore/4${splitter}uploadId4`,
            value: JSON.stringify({
                'key': 'testMore/4',
                'uploadId': 'uploadId4',
                'initiator': initiator2,
                'owner-id': '1',
                'owner-display-name': 'owner2',
                'x-amz-storage-class': storageClass,
                'initiated': '',
            }),
        }, {
            key: `${overviewPrefix}testMore/5${splitter}uploadId5`,
            value: JSON.stringify({
                'key': 'testMore/5',
                'uploadId': 'uploadId5',
                'initiator': initiator1,
                'owner-id': '1',
                'owner-display-name': 'owner1',
                'x-amz-storage-class': storageClass,
                'initiated': '',
            }),
        }, {
            key: `${overviewPrefix}prefixTest/5${splitter}uploadId5`,
            value: JSON.stringify({
                'key': 'prefixTest/5',
                'uploadId': 'uploadId5',
                'initiator': initiator1,
                'owner-id': '1',
                'owner-display-name': 'owner1',
                'x-amz-storage-class': storageClass,
                'initiated': '',
            }),
        },
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

        expectedResult.Uploads = keys.map(obj => {
            const tmp = JSON.parse(obj.value);
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

    it('should perform a listing of all keys', done => {
        const listingResult = performListing(keys, MultipartUploads,
            listingParams, logger);
        assert.deepStrictEqual(listingResult, expectedResult);
        done();
    });

    it('should perform a listing with delimiter', done => {
        const delimiter = '/';
        listingParams.delimiter = delimiter;
        // format result
        expectedResult.Uploads = [];
        expectedResult.CommonPrefixes = ['test/', 'testMore/', 'prefixTest/'];
        expectedResult.Delimiter = delimiter;
        expectedResult.MaxKeys = 1000;
        expectedResult.NextKeyMarker = 'prefixTest/';
        expectedResult.NextUploadIdMarker = '';

        const listingResult = performListing(keys, MultipartUploads,
            listingParams, logger);
        assert.deepStrictEqual(listingResult, expectedResult);
        done();
    });

    it('should perform a listing with max keys', done => {
        listingParams.maxKeys = 3;
        // format result
        expectedResult.Uploads.pop();
        expectedResult.Uploads.pop();
        expectedResult.Uploads.pop();
        expectedResult.NextKeyMarker = 'test/3';
        expectedResult.NextUploadIdMarker = 'uploadId3';
        expectedResult.IsTruncated = true;
        expectedResult.MaxKeys = 3;

        const listingResult = performListing(keys, MultipartUploads,
            listingParams, logger);
        assert.deepStrictEqual(listingResult, expectedResult);
        done();
    });
});
