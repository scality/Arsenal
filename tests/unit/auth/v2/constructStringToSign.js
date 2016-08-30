'use strict'; // eslint-disable-line strict

const assert = require('assert');

const constructStringToSign =
    require('../../../../lib/auth/v2/constructStringToSign');
const DummyRequestLogger = require('../../helpers').DummyRequestLogger;

const log = new DummyRequestLogger();

describe('v2 constructStringToSign function', () => {
    it('should construct a stringToSign with query params treated ' +
        'like headers (e.g. x-amz-acl', () => {
        const request = {
            url: '/noderocks/cuteotter.jpeg?AWSAccessKeyId' +
            '=accessKey1&Content-Type=image%2Fjpeg&Expires=147266' +
            '9382&Signature=WAkITY3f1igNJf68weCmffkUzDM%3D&x-' +
            'amz-acl=public-read',
            method: 'PUT',
            headers: {
                'host': 'localhost:8000',
                'content-length': '5414',
            },
            query: {
                'AWSAccessKeyId': 'accessKey1',
                'Content-Type': 'image/jpeg',
                'Expires': '1472669382',
                'Signature': 'WAkITY3f1igNJf68weCmffkUzDM=',
                'x-amz-acl': 'public-read',
            },
        };
        const data = {
            'AWSAccessKeyId': 'accessKey1',
            'Content-Type': 'image/jpeg',
            'Expires': '1472669382',
            'Signature': 'WAkITY3f1igNJf68weCmffkUzDM=',
            'x-amz-acl': 'public-read',
        };
        const expectedOutput = 'PUT\n\n' +
            'image/jpeg\n' +
            '1472669382\n' +
            'x-amz-acl:public-read\n' +
            '/noderocks/cuteotter.jpeg';
        const actualOutput = constructStringToSign(request, data, log);
        assert.strictEqual(actualOutput, expectedOutput);
    });
});
