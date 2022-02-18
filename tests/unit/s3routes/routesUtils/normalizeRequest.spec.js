const assert = require('assert');
const routesUtils = require('../../../../lib/s3routes/routesUtils.js');

const bucketName = 'bucketname';
const objName = 'testObject';

const validHosts = [
    'localhost',
    '127.0.0.1',
    's3.amazonaws.com',
    's3-website-us-east-1.amazonaws.com',
    's3-website-us-west-1.amazonaws.com',
];

describe('routesUtils.normalizeRequest', () => {
    it('should parse bucket name from path', () => {
        const request = {
            url: `/${bucketName}`,
            headers: { host: 's3.amazonaws.com' },
        };
        const result = routesUtils.normalizeRequest(request, validHosts);
        assert.strictEqual(result.bucketName, bucketName);
        assert.strictEqual(result.parsedHost, 's3.amazonaws.com');
    });

    it('should parse bucket name from path when no slash', () => {
        const request = {
            url: `${bucketName}`,
            headers: { host: 's3.amazonaws.com' },
        };
        const result = routesUtils.normalizeRequest(request, validHosts);
        assert.strictEqual(result.bucketName, bucketName);
        assert.strictEqual(result.parsedHost, 's3.amazonaws.com');
    });

    it('should parse bucket name from host', () => {
        const request = {
            url: '/',
            headers: { host: `${bucketName}.s3.amazonaws.com` },
        };
        const result = routesUtils.normalizeRequest(request, validHosts);
        assert.strictEqual(result.bucketName, bucketName);
        assert.strictEqual(result.parsedHost, 's3.amazonaws.com');
    });

    it('should parse bucket and object name from path', () => {
        const request = {
            url: `/${bucketName}/${objName}`,
            headers: { host: 's3.amazonaws.com' },
        };
        const result = routesUtils.normalizeRequest(request, validHosts);
        assert.strictEqual(result.bucketName, bucketName);
        assert.strictEqual(result.objectKey, objName);
        assert.strictEqual(result.parsedHost, 's3.amazonaws.com');
    });

    it('should parse bucket and object name from path with IP address', () => {
        const request = {
            url: `/${bucketName}/${objName}`,
            headers: { host: '[::1]' },
        };
        const result = routesUtils.normalizeRequest(request, validHosts);
        assert.strictEqual(result.bucketName, bucketName);
        assert.strictEqual(result.objectKey, objName);
        assert.strictEqual(result.parsedHost, '[::1]');
    });

    it('should parse bucket name from host ' +
        'and object name from path', () => {
        const request = {
            url: `/${objName}`,
            headers: { host: `${bucketName}.s3.amazonaws.com` },
        };
        const result = routesUtils.normalizeRequest(request, validHosts);
        assert.strictEqual(result.bucketName, bucketName);
        assert.strictEqual(result.objectKey, objName);
        assert.strictEqual(result.parsedHost, 's3.amazonaws.com');
    });
});
