const assert = require('assert');
const sinon = require('sinon');

const DummyRequestLogger = require('../../storage/metadata/mongoclient/utils/DummyRequestLogger');
const HttpResponseMock = require('../../../utils/HttpResponseMock');
const routesUtils = require('../../../../lib/s3routes/routesUtils');
const { errors } = require('../../../../index');
const DataWrapper = require('../../../../lib/storage/data/DataWrapper');

const corsHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET',
};

function assertHeaders(responseMock, expectedHeaders) {
    for (const [key, val] of Object.entries(expectedHeaders)) {
        assert.strictEqual(responseMock._headers[key], val);
    }
}

describe('routesUtils.redirectRequestOnError', () => {
    describe('from request on folder containing ' +
    'index without trailing /', () => {
        const errorHeaders = {
            'x-amz-error-code': errors.Found.type,
            'x-amz-error-message': errors.Found.description,
        };

        it('should redirect 302 with body on GET', () => {
            const responseMock = new HttpResponseMock();
            const routing = { withError: true, location: '/photos/' };
            routesUtils.redirectRequestOnError(
                errors.Found, 'GET',
                routing, null, null, responseMock,
                corsHeaders, new DummyRequestLogger(),
            );

            assert.strictEqual(responseMock.statusCode, 302);
            assertHeaders(responseMock, corsHeaders);
            assertHeaders(responseMock, errorHeaders);
            assert.strictEqual(responseMock._headers.Location, routing.location);
            assert.match(responseMock._body, /<h1>302 Found<\/h1>/);
            assert.match(responseMock._body, /<li>Code: Found<\/li>/);
            assert.match(responseMock._body, /<li>Message: Resource Found<\/li>/);
        });

        it('should redirect 302 without body on HEAD', () => {
            const responseMock = new HttpResponseMock();
            const routing = { withError: true, location: '/photos/' };
            routesUtils.redirectRequestOnError(
                errors.Found, 'HEAD',
                routing, null, null, responseMock,
                corsHeaders, new DummyRequestLogger(),
            );

            assert.strictEqual(responseMock.statusCode, 302);
            assertHeaders(responseMock, corsHeaders);
            assertHeaders(responseMock, errorHeaders);
            assert.strictEqual(responseMock._headers.Location, routing.location);
            assert.strictEqual(responseMock._body, null);
        });
    });

    describe('from error document redirect location header', () => {
        let dataWrapperGetStub;

        afterEach(() => {
            dataWrapperGetStub?.restore();
        });

        it('should redirect 301 with body on GET and stream data', () => {
            const responseMock = new HttpResponseMock();
            const routing = { withError: true, location: 'http://scality.com/test' };
            const Readable = require('stream').Readable;
            const mockStream = new Readable({
                read() {
                    this.push('mocked error page content');
                    this.push(null);
                },
            });
            dataWrapperGetStub = sinon.stub(DataWrapper.prototype, 'get')
                .yields(null, mockStream);
            routesUtils.redirectRequestOnError(
                errors.AccessDenied, 'GET',
                routing, [{ mock: true }], { mockRetrieveDataParams: true },
                responseMock, corsHeaders, new DummyRequestLogger(),
            );
            assert.strictEqual(responseMock.statusCode, 301);
            assert.strictEqual(responseMock._headers.Location, routing.location);
        });
    });
});
