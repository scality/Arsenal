const assert = require('assert');

const DummyRequest = require('../../../utils/DummyRequest');
const DummyRequestLogger = require('../../storage/metadata/mongoclient/utils/DummyRequestLogger');
const HttpResponseMock = require('../../../utils/HttpResponseMock');
const routesUtils = require('../../../../lib/s3routes/routesUtils');

const encrypted = false;
const hostHeader = 'cloudserver.test';
const corsHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET',
};

function assertCors(responseMock) {
    for (const [key, val] of Object.entries(corsHeaders)) {
        assert.strictEqual(responseMock._headers[key], val);
    }
}

describe('routesUtils.redirectRequest', () => {
    describe('like object redirect header', () => {
        const objectKey = '';
        const redirectLocationHeader = true;

        it('should redirect to absolute url (path style bucket)', () => {
            const requestMock = new DummyRequest({
                socket: { encrypted: false },
                gotBucketNameFromHost: false,
                bucketName: 'test',
            });
            const responseMock = new HttpResponseMock();
            const routing = {
                redirectLocationHeader,
                protocol: 'https',
                hostName: 'scality.com',
            };
            routesUtils.redirectRequest(
                routing, objectKey, requestMock, responseMock,
                corsHeaders, new DummyRequestLogger(),
            );
            assert.strictEqual(responseMock.statusCode, 301);
            assert.strictEqual(responseMock._body, null);
            assertCors(responseMock);
            console.log({ location: responseMock._headers.Location })
            assert.strictEqual(responseMock._headers.Location, 'https://scality.com/test');
        });

        it('should redirect to absolute url (virtual-hosted style bucket)', () => {
            const requestMock = new DummyRequest({
                socket: { encrypted: false },
                gotBucketNameFromHost: true,
                bucketName: 'test',
            });
            const responseMock = new HttpResponseMock();
            const routing = {
                redirectLocationHeader,
                protocol: 'https',
                hostName: 'test.scality.com',
            };
            routesUtils.redirectRequest(
                routing, objectKey, requestMock, responseMock,
                corsHeaders, new DummyRequestLogger(),
            );;
            assert.strictEqual(responseMock.statusCode, 301);
            assert.strictEqual(responseMock._body, null);
            assertCors(responseMock);
            assert.strictEqual(responseMock._headers.Location, 'https://test.scality.com');
        });

        it('should redirect to relative url (path style bucket)', () => {
            const requestMock = new DummyRequest({
                socket: { encrypted: false },
                gotBucketNameFromHost: false,
                bucketName: 'test',
            });
            const responseMock = new HttpResponseMock();
            const routing = {
                redirectLocationHeader,
                justPath: true,
                replaceKeyWith: 'testing/redirect.html',
            };
            routesUtils.redirectRequest(
                routing, objectKey, requestMock, responseMock,
                corsHeaders, new DummyRequestLogger(),
            );
            assert.strictEqual(responseMock.statusCode, 301);
            assert.strictEqual(responseMock._body, null);
            assertCors(responseMock);
            assert.strictEqual(responseMock._headers.Location, '/test/testing/redirect.html');
        });

        it('should redirect to relative url (virtual-hosted style bucket)', () => {
            const requestMock = new DummyRequest({
                socket: { encrypted: false },
                gotBucketNameFromHost: true,
                bucketName: 'test',
            });
            const responseMock = new HttpResponseMock();
            const routing = {
                redirectLocationHeader,
                justPath: true,
                replaceKeyWith: 'testing/redirect.html',
            };
            routesUtils.redirectRequest(
                routing, objectKey, requestMock, responseMock,
                corsHeaders, new DummyRequestLogger(),
            );
            assert.strictEqual(responseMock.statusCode, 301);
            assert.strictEqual(responseMock._body, null);
            assertCors(responseMock);
            assert.strictEqual(responseMock._headers.Location, '/testing/redirect.html');
        });

        it('should redirect to root / (path style bucket)', () => {
            const requestMock = new DummyRequest({
                socket: { encrypted: false },
                gotBucketNameFromHost: false,
                bucketName: 'test',
            });
            const responseMock = new HttpResponseMock();
            const routing = {
                redirectLocationHeader,
                justPath: true,
                // cloudserver removes the /, arsenal puts it back
                replaceKeyWith: '',
            };
            routesUtils.redirectRequest(
                routing, objectKey, requestMock, responseMock,
                corsHeaders, new DummyRequestLogger(),
            );
            assert.strictEqual(responseMock.statusCode, 301);
            assert.strictEqual(responseMock._body, null);
            assertCors(responseMock);
            assert.strictEqual(responseMock._headers.Location, '/test');
        });

        it('should redirect to root / (dns style bucket)', () => {
            const requestMock = new DummyRequest({
                socket: { encrypted: false },
                gotBucketNameFromHost: true,
                bucketName: 'test',
            });
            const responseMock = new HttpResponseMock();
            const routing = {
                redirectLocationHeader,
                justPath: true,
                // cloudserver removes the /, arsenal puts it back
                replaceKeyWith: '',
            };
            routesUtils.redirectRequest(
                routing, objectKey, requestMock, responseMock,
                corsHeaders, new DummyRequestLogger(),
            );
            assert.strictEqual(responseMock.statusCode, 301);
            assert.strictEqual(responseMock._body, null);
            assertCors(responseMock);
            assert.strictEqual(responseMock._headers.Location, '/');
        });
    });
});
