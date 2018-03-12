'use strict'; // eslint-disable-line strict

const assert = require('assert');

const constructStringToSign =
    require('../../../../lib/auth/v2/constructStringToSign');
const hashSignature =
    require('../../../../lib/auth/in_memory/vaultUtilities').hashSignature;
const DummyRequestLogger = require('../../helpers').DummyRequestLogger;

const log = new DummyRequestLogger();

const gcpConstructStringToSign = (request, query, log) =>
    constructStringToSign(request, query, log, 'GCP');

describe('checkAuth reconstruction of signature', () => {
    it('should reconstruct the signature for a ' +
       'GET request from s3-curl for AWS', () => {
        // Based on s3-curl run
        const request = {
            method: 'GET',
            headers: {
                'host': 's3.amazonaws.com',
                'user-agent': 'curl/7.43.0',
                'accept': '*/*',
                'date': 'Fri, 18 Sep 2015 22:57:23 +0000',
                'authorization': 'AWS accessKey1:MJNF7AqNapSu32TlBOVkcAxj58c=',
            },
            url: '/bucket',
            query: {},
        };
        const secretKey = 'verySecretKey1';
        const stringToSign = constructStringToSign(request, request.query, log);
        const reconstructedSig = hashSignature(stringToSign, secretKey, 'sha1');
        assert.strictEqual(reconstructedSig, 'MJNF7AqNapSu32TlBOVkcAxj58c=');
    });

    it('should reconstruct the signature for a GET request from ' +
       'CyberDuck for AWS', () => {
        // Based on CyberDuck request
        const request = {
            method: 'GET',
            headers: {
                'date': 'Mon, 21 Sep 2015 22:29:27 GMT',
                'x-amz-request-payer': 'requester',
                'authorization': 'AWS accessKey1:V8g5UJUFmMzruMqUHVT6ZwvUw+M=',
                'host': 's3.amazonaws.com:80',
                'connection': 'Keep-Alive',
                'user-agent':
                    'Cyberduck/4.7.2.18004 (Mac OS X/10.10.5) (x86_64)',
            },
            url: '/mb/?max-keys=1000&prefix&delimiter=%2F',
            query: { 'max-keys': '1000', 'prefix': '', 'delimiter': '/' },
        };
        const secretKey = 'verySecretKey1';
        const stringToSign = constructStringToSign(request, request.query, log);
        const reconstructedSig = hashSignature(stringToSign, secretKey, 'sha1');
        assert.strictEqual(reconstructedSig, 'V8g5UJUFmMzruMqUHVT6ZwvUw+M=');
    });

    it('should reconstruct the signature for a PUT request from ' +
       's3cmd for AWS', () => {
        // Based on s3cmd run
        const request = {
            method: 'PUT',
            headers: {
                'host': '127.0.0.1:8000',
                'accept-encoding': 'identity',
                'authorization': 'AWS accessKey1:fWPcicKn7Fhzfje/0pRTifCxL44=',
                'content-length': '3941',
                'content-type': 'binary/octet-stream',
                'x-amz-date': 'Fri, 18 Sep 2015 23:32:34 +0000',
                'x-amz-meta-s3cmd-attrs':
                    'uid:501/gname:staff/uname:lhs/gid:20/mode:33060/' +
                    'mtime:1319136702/atime:1442619138/' +
                    'md5:5e714348185ffe355a76b754f79176d6/ctime:1441840220',
                'x-amz-now': 'susdr',
                'x-amz-y': 'what',
            },
            url: '/test/obj',
            query: {},
        };
        const secretKey = 'verySecretKey1';
        const stringToSign = constructStringToSign(request, request.query, log);
        const reconstructedSig = hashSignature(stringToSign, secretKey, 'sha1');
        assert.strictEqual(reconstructedSig, 'fWPcicKn7Fhzfje/0pRTifCxL44=');
    });

    it('should reconstruct the signature for a ' +
       'GET request from s3-curl for GCP', () => {
        // Based on s3-curl run
        const request = {
            method: 'GET',
            headers: {
                'host': 'storage.google.com:80',
                'user-agent': 'curl/7.43.0',
                'accept': '*/*',
                'date': 'Fri, 18 Sep 2015 22:57:23 +0000',
                'authorization':
                    'GOOG1 accessKey1:MJNF7AqNapSu32TlBOVkcAxj58c=',
            },
            url: '/bucket',
            query: {},
        };
        const secretKey = 'verySecretKey1';
        const stringToSign =
            gcpConstructStringToSign(request, request.query, log);
        const reconstructedSig = hashSignature(stringToSign, secretKey, 'sha1');
        assert.strictEqual(reconstructedSig, 'MJNF7AqNapSu32TlBOVkcAxj58c=');
    });

    it('should reconstruct the signature for a GET request from ' +
       'CyberDuck for GCP', () => {
        // Based on CyberDuck request
        const request = {
            method: 'GET',
            headers: {
                'date': 'Mon, 21 Sep 2015 22:29:27 GMT',
                'x-goog-request-payer': 'requester',
                'authorization':
                    'GOOG1 accessKey1:V8g5UJUFmMzruMqUHVT6ZwvUw+M=',
                'host': 'storage.google.com:80',
                'connection': 'Keep-Alive',
                'user-agent':
                    'Cyberduck/4.7.2.18004 (Mac OS X/10.10.5) (x86_64)',
            },
            url: '/mb/?max-keys=1000&prefix&delimiter=%2F',
            query: { 'max-keys': '1000', 'prefix': '', 'delimiter': '/' },
        };
        const secretKey = 'verySecretKey1';
        const stringToSign =
            gcpConstructStringToSign(request, request.query, log);
        const reconstructedSig = hashSignature(stringToSign, secretKey, 'sha1');
        assert.strictEqual(reconstructedSig, 'bdcnXSDhpN0lR2NBUlayg4vmMDU=');
    });

    it('should reconstruct the signature for a PUT request from ' +
       's3cmd for GCP', () => {
        // Based on s3cmd run
        const request = {
            method: 'PUT',
            headers: {
                'host': '127.0.0.1:8000',
                'accept-encoding': 'identity',
                'authorization':
                    'GOOG1 accessKey1:fWPcicKn7Fhzfje/0pRTifCxL44=',
                'content-length': '3941',
                'content-type': 'binary/octet-stream',
                'x-goog-date': 'Fri, 18 Sep 2015 23:32:34 +0000',
                'x-goog-meta-s3cmd-attrs':
                    'uid:501/gname:staff/uname:lhs/gid:20/mode:33060/' +
                    'mtime:1319136702/atime:1442619138/' +
                    'md5:5e714348185ffe355a76b754f79176d6/ctime:1441840220',
                'x-goog-now': 'susdr',
                'x-goog-y': 'what',
            },
            url: '/test/obj',
            query: {},
        };
        const secretKey = 'verySecretKey1';
        const stringToSign =
            gcpConstructStringToSign(request, request.query, log);
        const reconstructedSig = hashSignature(stringToSign, secretKey, 'sha1');
        assert.strictEqual(reconstructedSig, 'F1f5Gpj+nYEShVawmOlH2P4JbjI=');
    });
});
