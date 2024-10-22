const werelogs = require('werelogs');
const http = require('http');
const assert = require('assert');
const { StatsClient } = require('../../../lib/metrics');
const { routesUtils } = require('../../../lib/s3routes');
const { default: errors } = require('../../../lib/errors');
const { default: routerWebsite } = require('../../../lib/s3routes/routes/routeWebsite');

const logger = new werelogs.Logger('routeWebsite', 'debug', 'debug');
const log = logger.newRequestLogger();

describe('routerWebsite', () => {
    let request;
    let response;
    let api;
    let statsClient;
    let dataRetrievalParams;

    beforeEach(() => {
        request = new http.IncomingMessage();
        request.connection = { encrypted: true };
        response = new http.ServerResponse(request);
        api = { callApiMethod: jest.fn() };
        statsClient = new StatsClient();
        dataRetrievalParams = {};

        routesUtils.errorHtmlResponse = jest.fn();
        routesUtils.redirectRequest = jest.fn();
        routesUtils.redirectRequestOnError = jest.fn();
        routesUtils.errorHeaderResponse = jest.fn();
        routesUtils.streamUserErrorPage = jest.fn();
        routesUtils.responseStreamData = jest.fn();
        routesUtils.statsReport500 = jest.fn();
        routesUtils.responseContentHeaders = jest.fn();
    });

    it('should return MethodNotAllowed error if request method is not GET or HEAD', () => {
        request.method = 'POST';
        request.bucketName = 'test-bucket';

        routerWebsite(request, response, api, log, statsClient, dataRetrievalParams);

        assert(routesUtils.errorHtmlResponse.mock.calls.length > 0);
        assert.strictEqual(routesUtils.errorHtmlResponse.mock.calls[0][0].code, 405);
    });

    it('should return MethodNotAllowed error if no bucketName is present', () => {
        request.method = 'GET';
        request.bucketName = undefined;

        routerWebsite(request, response, api, log, statsClient, dataRetrievalParams);

        assert(routesUtils.errorHtmlResponse.mock.calls.length > 0);
        assert.strictEqual(routesUtils.errorHtmlResponse.mock.calls[0][0].code, 405);
    });

    it('should call websiteGet when request method is GET', () => {
        request.method = 'GET';
        request.bucketName = 'test-bucket';

        routerWebsite(request, response, api, log, statsClient, dataRetrievalParams);

        expect(api.callApiMethod).toHaveBeenCalledWith(
            'websiteGet', request, response, log, expect.any(Function),
        );
    });

    it('should call websiteHead when request method is HEAD', () => {
        request.method = 'HEAD';
        request.bucketName = 'test-bucket';

        routerWebsite(request, response, api, log, statsClient, dataRetrievalParams);

        expect(api.callApiMethod).toHaveBeenCalledWith(
            'websiteHead', request, response, log, expect.any(Function),
        );
    });

    it('should handle error with HEAD and call redirectRequestOnError', () => {
        request.method = 'HEAD';
        request.bucketName = 'test-bucket';

        const mockRedirectInfo = { withError: true };
        api.callApiMethod.mockImplementation((method, req, res, log, cb) => {
            cb(errors.InternalError, null, mockRedirectInfo, null);
        });

        routerWebsite(request, response, api, log, statsClient, dataRetrievalParams);

        expect(routesUtils.redirectRequestOnError).toHaveBeenCalledTimes(1);
    });

    it('should handle error with HEAD and call redirectRequest', () => {
        request.method = 'HEAD';
        request.bucketName = 'test-bucket';

        const mockRedirectInfo = { withError: false };
        api.callApiMethod.mockImplementation((method, req, res, log, cb) => {
            cb(errors.InternalError, null, mockRedirectInfo, null);
        });

        routerWebsite(request, response, api, log, statsClient, dataRetrievalParams);

        expect(routesUtils.redirectRequest).toHaveBeenCalledTimes(1);
    });

    it('should handle error with HEAD and call errorHeaderResponse', () => {
        request.method = 'HEAD';
        request.bucketName = 'test-bucket';

        api.callApiMethod.mockImplementation((method, req, res, log, cb) => {
            cb(errors.InternalError, null, null, null);
        });

        routerWebsite(request, response, api, log, statsClient, dataRetrievalParams);

        expect(routesUtils.errorHeaderResponse).toHaveBeenCalledTimes(1);
    });

    it('should call responseContentHeaders', () => {
        request.method = 'HEAD';
        request.bucketName = 'test-bucket';

        api.callApiMethod.mockImplementation((method, req, res, log, cb) => {
            cb(null, null, null, null);
        });

        routerWebsite(request, response, api, log, statsClient, dataRetrievalParams);

        expect(routesUtils.responseContentHeaders).toHaveBeenCalledTimes(1);
    });

    it('should handle redirect in websiteGet correctly', () => {
        request.method = 'GET';
        request.bucketName = 'test-bucket';

        const mockRedirectInfo = { withError: false };
        api.callApiMethod.mockImplementation((method, req, res, log, cb) => {
            cb(null, null, null, null, mockRedirectInfo, 'some-key');
        });

        routerWebsite(request, response, api, log, statsClient, dataRetrievalParams);

        expect(routesUtils.redirectRequest).toHaveBeenCalledWith(
            mockRedirectInfo, 'some-key', true, response, request.headers.host, null, log,
        );
    });

    it('should handle error in websiteGet and send default error response', () => {
        request.method = 'GET';
        request.bucketName = 'test-bucket';

        const mockError = errors.InternalError;
        api.callApiMethod.mockImplementation((method, req, res, log, cb) => {
            cb(mockError, null, null, null, null, null);
        });

        routerWebsite(request, response, api, log, statsClient, dataRetrievalParams);

        expect(routesUtils.errorHtmlResponse).toHaveBeenCalledWith(
            mockError, null, 'test-bucket', response, null, log,
        );
    });

    it('should handle error in websiteGet and call redirectRequestOnError', () => {
        request.method = 'GET';
        request.bucketName = 'test-bucket';

        const mockRedirectInfo = { withError: true };
        const mockError = errors.InternalError;
        api.callApiMethod.mockImplementation((method, req, res, log, cb) => {
            cb(mockError, null, null, null, mockRedirectInfo, null);
        });

        routerWebsite(request, response, api, log, statsClient, dataRetrievalParams);

        expect(routesUtils.redirectRequestOnError).toHaveBeenCalledTimes(1);
    });

    it('should handle error and call streamUserErrorPage', () => {
        request.method = 'GET';
        request.bucketName = 'test-bucket';

        const mockError = errors.InternalError;
        api.callApiMethod.mockImplementation((method, req, res, log, cb) => {
            cb(mockError, null, true, null, null, null);
        });

        routerWebsite(request, response, api, log, statsClient, dataRetrievalParams);

        expect(routesUtils.streamUserErrorPage).toHaveBeenCalledTimes(1);
    });

    it('should handle error and call errorHtmlResponse', () => {
        request.method = 'GET';
        request.bucketName = 'test-bucket';

        const mockError = errors.InternalError;
        api.callApiMethod.mockImplementation((method, req, res, log, cb) => {
            cb(mockError, null, null, null, null, null);
        });

        routerWebsite(request, response, api, log, statsClient, dataRetrievalParams);

        expect(routesUtils.errorHtmlResponse).toHaveBeenCalledTimes(1);
    });

    it('should stream data if no error is present in websiteGet', () => {
        request.method = 'GET';
        request.bucketName = 'test-bucket';

        api.callApiMethod.mockImplementation((method, req, res, log, cb) => {
            cb(null, null, { content: 'data' }, null, null, 'some-key');
        });

        routerWebsite(request, response, api, log, statsClient, dataRetrievalParams);

        expect(routesUtils.responseStreamData).toHaveBeenCalledWith(
            null, undefined, null, { content: 'data' }, dataRetrievalParams, response, undefined, log,
        );
    });
});
