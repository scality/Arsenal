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
            assert.match(responseMock._body, /<h1>302 Moved Temporarily<\/h1>/);
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

        afterAll(() => {
            if (dataWrapperGetStub) {
                dataWrapperGetStub.restore();
            }
        });

        it('should redirect 301 with body on GET', () => {
            const responseMock = new HttpResponseMock();
            const routing = { withError: true,
                location: 'http://scality.com/test' };
            const errorHeaders = {
                'x-amz-error-code': errors.AccessDenied.type,
                'x-amz-error-message': errors.AccessDenied.description,
            };
            dataWrapperGetStub = sinon.stub(DataWrapper.prototype, 'get');

            const mockedDataLocations = [{ mock: true }];
            const mockedRetrieveDataParams = {
                mockRetrieveDataParams: true,
            };

            routesUtils.redirectRequestOnError(
                errors.AccessDenied, 'GET',
                routing, mockedDataLocations, mockedRetrieveDataParams,
                responseMock, corsHeaders, new DummyRequestLogger(),
            );

            assert.strictEqual(responseMock.statusCode, 301);
            assertHeaders(responseMock, corsHeaders);
            assertHeaders(responseMock, errorHeaders);
            assert.strictEqual(responseMock._headers.Location, routing.location);
            assert.strictEqual(dataWrapperGetStub.callCount, 1);
            assert.strictEqual(dataWrapperGetStub.getCall(0).args[0],
                mockedDataLocations[0]);
            assert.strictEqual(dataWrapperGetStub.getCall(0).args[1],
                responseMock);
        });
    });
});
