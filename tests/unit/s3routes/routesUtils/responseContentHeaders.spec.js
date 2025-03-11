const sinon = require('sinon');
const assert = require('assert');
const werelogs = require('werelogs');
const { responseContentHeaders } = require('../../../../lib/s3routes/routesUtils');

const logger = new werelogs.Logger('test:responseContentHeaders', 'debug', 'debug');
const log = logger.newRequestLogger();

describe('responseContentHeaders', () => {
    let mockResponse;
    let sandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();

        mockResponse = {
            headersSent: false,
            setHeader: sandbox.stub(),
            writeHead: sandbox.stub(),
            end: sandbox.stub().callsFake((_, __, callback) => callback && callback()),
            statusCode: 200,
        };

        sandbox.stub(log, 'debug');
        sandbox.stub(log, 'end').returns({
            info: sandbox.stub(),
        });
    });

    afterEach(() => {
        sandbox.restore();
    });

    it('should set headers and return 200 when no error is provided', () => {
        const overrideParams = {
            'response-content-type': 'text/plain',
            'response-content-disposition': 'attachment',
        };
        const resHeaders = {
            'Content-Length': '123',
            'Content-Type': 'application/octet-stream',
        };

        responseContentHeaders(null, overrideParams, resHeaders, mockResponse, log);

        assert(mockResponse.setHeader.calledWith('server', 'S3 Server'));
        assert(mockResponse.setHeader.calledWith('Content-Type', 'text/plain'));
        assert(mockResponse.setHeader.calledWith('Content-Length', '123'));
        assert(mockResponse.setHeader.calledWith('Content-Disposition', 'attachment'));
        assert(mockResponse.writeHead.calledWith(200));
        assert(mockResponse.end.calledOnce);
        assert(log.debug.calledWith('response http code', { httpCode: 200 }));
    });

    it('should do nothing if headers are already sent', () => {
        mockResponse.headersSent = true;
        const overrideParams = { 'response-content-type': 'text/plain' };
        const resHeaders = { 'Content-Length': '123' };

        const result = responseContentHeaders(null, overrideParams, resHeaders, mockResponse, log);

        assert.strictEqual(result, undefined);
        assert(mockResponse.setHeader.notCalled);
        assert(mockResponse.writeHead.notCalled);
        assert(mockResponse.end.calledOnce);
    });

    it('should override common headers with overrideParams', () => {
        const overrideParams = {
            'response-content-type': 'text/html',
            'response-content-language': 'en',
            'response-expires': 'Thu, 01 Dec 2023 12:00:00 GMT',
            'response-cache-control': 'no-cache',
            'response-content-disposition': 'inline',
            'response-content-encoding': 'gzip',
        };
        const resHeaders = {
            'Content-Type': 'application/json',
            'Content-Language': 'fr',
            'Expires': 'Wed, 01 Dec 2021 12:00:00 GMT',
            'Cache-Control': 'max-age=3600',
            'Content-Disposition': 'attachment',
            'Content-Encoding': 'identity',
        };

        responseContentHeaders(null, overrideParams, resHeaders, mockResponse, log);

        assert(mockResponse.setHeader.calledWith('Content-Type', 'text/html'));
        assert(mockResponse.setHeader.calledWith('Content-Language', 'en'));
        assert(mockResponse.setHeader.calledWith('Expires', 'Thu, 01 Dec 2023 12:00:00 GMT'));
        assert(mockResponse.setHeader.calledWith('Cache-Control', 'no-cache'));
        assert(mockResponse.setHeader.calledWith('Content-Disposition', 'inline'));
        assert(mockResponse.setHeader.calledWith('Content-Encoding', 'gzip'));
        assert(mockResponse.writeHead.calledWith(200));
        assert(mockResponse.end.calledOnce);
    });

    it('should handle empty overrideParams and resHeaders', () => {
        responseContentHeaders(null, {}, {}, mockResponse, log);

        assert(mockResponse.setHeader.calledWith('server', 'S3 Server'));
        assert(mockResponse.setHeader.calledWith('x-amz-id-2', sinon.match.string));
        assert(mockResponse.setHeader.calledWith('x-amz-request-id', sinon.match.string));
        assert(mockResponse.writeHead.calledWith(200));
        assert(mockResponse.end.calledOnce);
    });
});
