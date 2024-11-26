const werelogs = require('werelogs');
const logger = new werelogs.Logger('test:routesUtils.routeHEAD');
const http = require('http');
const { routesUtils } = require('../../../lib/s3routes');
const { default: errors } = require('../../../lib/errors');
const { StatsClient } = require('../../../lib/metrics');
const { default: routeHEAD } = require('../../../lib/s3routes/routes/routeHEAD');

describe('routeHEAD', () => {
    let request;
    let response;
    let api;
    let statsClient;

    beforeEach(() => {
        request = new http.IncomingMessage(null);
        response = new http.ServerResponse(request);
        api = {
            callApiMethod: jest.fn(),
        };
        statsClient = new StatsClient();
    });

    it('should respond with MethodNotAllowed if bucketName is undefined', () => {
        request = { ...request, bucketName: undefined };

        jest.spyOn(routesUtils, 'responseXMLBody').mockImplementation();

        routeHEAD(request, response, api, logger, statsClient);
        expect(routesUtils.responseXMLBody).toHaveBeenCalledWith(
            errors.MethodNotAllowed,
            null,
            response,
            logger,
        );
    });

    it('should call bucketHead if objectKey is undefined', () => {
        request = { ...request, bucketName: 'test-bucket', objectKey: undefined };

        jest.spyOn(routesUtils, 'responseNoBody').mockImplementation();
        jest.spyOn(routesUtils, 'statsReport500').mockImplementation();

        routeHEAD(request, response, api, logger, statsClient);

        expect(api.callApiMethod).toHaveBeenCalledWith(
            'bucketHead',
            request,
            response,
            logger,
            expect.any(Function),
        );

        const callback = api.callApiMethod.mock.calls[0][4];
        const corsHeaders = { 'x-amz-cors': 'test' };
        callback(null, corsHeaders);

        expect(routesUtils.statsReport500).toHaveBeenCalledWith(null, statsClient);
        expect(routesUtils.responseNoBody).toHaveBeenCalledWith(
            null,
            corsHeaders,
            response,
            200,
            logger,
        );
    });

    it('should call objectHead if bucketName and objectKey are defined', () => {
        request = { ...request, bucketName: 'test-bucket', objectKey: 'test-object' };

        jest.spyOn(routesUtils, 'responseContentHeaders').mockImplementation();
        jest.spyOn(routesUtils, 'statsReport500').mockImplementation();

        routeHEAD(request, response, api, logger, statsClient);

        expect(api.callApiMethod).toHaveBeenCalledWith(
            'objectHead',
            request,
            response,
            logger,
            expect.any(Function),
        );

        const callback = api.callApiMethod.mock.calls[0][4];
        const resHeaders = { 'x-amz-meta-test': 'test' };
        callback(null, resHeaders);

        expect(routesUtils.statsReport500).toHaveBeenCalledWith(null, statsClient);
        expect(routesUtils.responseContentHeaders).toHaveBeenCalledWith(
            null,
            {},
            resHeaders,
            response,
            logger,
        );
    });
});
