'use strict'; // eslint-disable-line strict

const http = require('http');
const assert = require('assert');
const lolex = require('lolex');

const generateV4Headers = require('../../../../lib/auth/auth')
    .client.generateV4Headers;

describe('generateV4Headers', () => {
    it('should generate valid v4 headers for signing a ' +
        'request even when request has a query', () => {
        const query = 'userMd.`x-amz-meta-dog`="labrador"';
        const escapedSearch = encodeURIComponent(query);
        const options = {
            host: '127.0.0.1',
            port: '8000',
            method: 'GET',
            path: `/searchdemo/?search=${escapedSearch}`,
            headers: { 'Content-Length': 0 },
        };
        const request = http.request(options, () => {});
        const clock = lolex.install(1515718759886);
        generateV4Headers(request, { search: query },
            'accessKey1', 'verySecretKey1', 's3');
        const result = request._headers.authorization;
        clock.uninstall();
        assert.strictEqual(result,
            'AWS4-HMAC-SHA256 Credential=accessKey1' +
            '/20180112/us-east-1/s3/aws4_request, ' +
            'SignedHeaders=host;x-amz-content-sha256;x-amz-date, ' +
            'Signature=84b568558470827963fb6aeb1ba4747d75e394dc2' +
            '14044febe2ec3247de6a839');
    });
});
