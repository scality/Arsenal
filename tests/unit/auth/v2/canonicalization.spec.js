'use strict'; // eslint-disable-line strict

const assert = require('assert');

const getCanonicalizedAmzHeaders =
    require('../../../../lib/auth/v2/getCanonicalizedAmzHeaders');
const getCanonicalizedResource =
    require('../../../../lib/auth/v2/getCanonicalizedResource');

const getCanonicalizedGcpHeaders = headers =>
    getCanonicalizedAmzHeaders(headers, 'GCP');
const gcpCanonicalizedResource = request =>
    getCanonicalizedResource(request, 'GCP');

describe('canonicalization', () => {
    it('should construct a canonicalized header in the correct order for AWS',
    () => {
        const headers = {
            'date': 'Mon, 21 Sep 2015 22:29:27 GMT',
            'x-amz-request-payer': 'requester',
            'x-amz-meta-meta': 'something very meta',
            'x-amz-meta-bits': '0',
            'x-amz-meta-blksize': '2097152',
            'x-amz-meta-compress': '0',
            'authorization': 'AWS accessKey1:V8g5UJUFmMzruMqUHVT6ZwvUw+M=',
            'host': 's3.amazonaws.com:80',
            'connection': 'Keep-Alive',
            'user-agent': 'Cyberduck/4.7.2.18004 (Mac OS X/10.10.5) (x86_64)',
        };
        const canonicalizedHeader = getCanonicalizedAmzHeaders(headers);
        assert.strictEqual(canonicalizedHeader,
            'x-amz-meta-bits:0\n' +
            'x-amz-meta-blksize:2097152\n' +
            'x-amz-meta-compress:0\n' +
            'x-amz-meta-meta:something very meta\n' +
            'x-amz-request-payer:requester\n');
    });

    it('should return an empty string as the canonicalized ' +
       'header if no amz headers', () => {
        const headers = {
            'date': 'Mon, 21 Sep 2015 22:29:27 GMT',
            'authorization': 'AWS accessKey1:V8g5UJUFmMzruMqUHVT6ZwvUw+M=',
            'host': 's3.amazonaws.com:80',
            'connection': 'Keep-Alive',
            'user-agent': 'Cyberduck/4.7.2.18004 (Mac OS X/10.10.5) (x86_64)',
        };
        const canonicalizedHeader = getCanonicalizedAmzHeaders(headers);
        assert.strictEqual(canonicalizedHeader, '');
    });

    it('should construct a canonicalized resource for AWS', () => {
        const request = {
            headers: { host: 'bucket.s3.amazonaws.com:80' },
            url: '/obj',
            query: {
                requestPayment: 'yes,please',
                ignore: 'me',
            },
            gotBucketNameFromHost: true,
            bucketName: 'bucket',
        };
        const canonicalizedResource = getCanonicalizedResource(request);
        assert.strictEqual(canonicalizedResource,
                           '/bucket/obj?requestPayment=yes,please');
    });

    it('should return the path as the canonicalized resource ' +
       'if no bucket name, overriding headers or delete query for AWS', () => {
        const request = {
            headers: { host: 's3.amazonaws.com:80' },
            url: '/',
            query: { ignore: 'me' },
        };
        const canonicalizedResource = getCanonicalizedResource(request);
        assert.strictEqual(canonicalizedResource, '/');
    });

    it('should sort the subresources (included query params) in ' +
        'lexicographical order for AWS', () => {
        const request = {
            headers: { host: 's3.amazonaws.com:80' },
            url: '/',
            query: {
                uploadId: 'iamanuploadid',
                partNumber: '5',
            },
        };
        const canonicalizedResource = getCanonicalizedResource(request);
        assert.strictEqual(canonicalizedResource,
            '/?partNumber=5&uploadId=iamanuploadid');
    });

    it('should construct a canonicalized header in the correct order for GCP',
    () => {
        const headers = {
            'date': 'Mon, 21 Sep 2015 22:29:27 GMT',
            'x-goog-request-payer': 'requester',
            'x-goog-meta-meta': 'something very meta',
            'x-goog-meta-bits': '0',
            'x-goog-meta-blksize': '2097152',
            'x-goog-meta-compress': '0',
            'authorization': 'GOOG1 accessKey1:V8g5UJUFmMzruMqUHVT6ZwvUw+M=',
            'host': 's3.amazonaws.com:80',
            'connection': 'Keep-Alive',
            'user-agent': 'Cyberduck/4.7.2.18004 (Mac OS X/10.10.5) (x86_64)',
        };
        const canonicalizedHeader = getCanonicalizedGcpHeaders(headers);
        assert.strictEqual(canonicalizedHeader,
            'x-goog-meta-bits:0\n' +
            'x-goog-meta-blksize:2097152\n' +
            'x-goog-meta-compress:0\n' +
            'x-goog-meta-meta:something very meta\n' +
            'x-goog-request-payer:requester\n');
    });

    it('should return an empty string as the canonicalized ' +
       'header if no goog headers', () => {
        const headers = {
            'date': 'Mon, 21 Sep 2015 22:29:27 GMT',
            'authorization': 'GOOG1 accessKey1:V8g5UJUFmMzruMqUHVT6ZwvUw+M=',
            'host': 'storage.googleapis.com:80',
            'connection': 'Keep-Alive',
            'user-agent': 'Cyberduck/4.7.2.18004 (Mac OS X/10.10.5) (x86_64)',
        };
        const canonicalizedHeader = getCanonicalizedGcpHeaders(headers);
        assert.strictEqual(canonicalizedHeader, '');
    });

    it('should construct a canonicalized resource for GCP', () => {
        const request = {
            headers: { host: 'bucket.storage.googapis.com:80' },
            url: '/obj',
            query: {
                billing: 'yes,please',
                ignore: 'me',
            },
            gotBucketNameFromHost: true,
            bucketName: 'bucket',
        };
        const canonicalizedResource = gcpCanonicalizedResource(request);
        assert.strictEqual(canonicalizedResource,
                           '/bucket/obj?billing=yes,please');
    });

    it('should return the path as the canonicalized resource ' +
       'if no bucket name, overriding headers or delete query for GCP', () => {
        const request = {
            headers: { host: 'storage.googleapis.com:80' },
            url: '/',
            query: { ignore: 'me' },
        };
        const canonicalizedResource = gcpCanonicalizedResource(request);
        assert.strictEqual(canonicalizedResource, '/');
    });


    it('should sort the subresources (included query params) in ' +
        'lexicographical order for GCP', () => {
        const request = {
            headers: { host: 'storage.googleapis.com:80' },
            url: '/',
            query: {
                versioning: 'yes,please',
                compose: 'yes,please',
            },
        };
        const canonicalizedResource = gcpCanonicalizedResource(request);
        assert.strictEqual(canonicalizedResource,
            '/?compose=yes,please&versioning=yes,please');
    });
});
