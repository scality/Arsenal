const http = require('http');
const werelogs = require('werelogs');
const { StatsClient } = require('../../../lib/metrics');
const { routesUtils } = require('../../../lib/s3routes');
const { ArsenalError, default: errors } = require('../../../lib/errors');
const { default: routeDELETE } = require('../../../lib/s3routes/routes/routeDELETE');

const logger = new werelogs.Logger('routeDelete', 'debug', 'debug');
const log = logger.newRequestLogger();

describe('routeDELETE', () => {
    let request;
    let response;
    let api;
    let statsClient;

    beforeEach(() => {
        request = new http.IncomingMessage();
        response = new http.ServerResponse(request);
        api = { callApiMethod: jest.fn() };
        statsClient = new StatsClient();

        routesUtils.responseNoBody = jest.fn();
        routesUtils.statsReport500 = jest.fn();
    });

    it('should return InvalidRequest error if uploadId is present but objectKey is undefined', () => {
        request.query = { uploadId: '1234' };
        request.objectKey = undefined;

        routeDELETE(request, response, api, log, statsClient);

        const err = errors.InvalidRequest.customizeDescription('A key must be specified');
        expect(routesUtils.responseNoBody).toHaveBeenCalledWith(
            err, null, response, 200, log,
        );
    });

    it('should call multipartDelete if uploadId and objectKey are present', () => {
        request.query = { uploadId: '1234' };
        request.objectKey = 'objectKey';

        routeDELETE(request, response, api, log, statsClient);

        expect(api.callApiMethod).toHaveBeenCalledWith(
            'multipartDelete', request, response, log, expect.any(Function),
        );
    });

    it('should call bucketDeleteWebsite if query.website is present and objectKey is undefined', () => {
        request.query = { website: true };
        request.objectKey = undefined;

        routeDELETE(request, response, api, log, statsClient);

        expect(api.callApiMethod).toHaveBeenCalledWith(
            'bucketDeleteWebsite', request, response, log, expect.any(Function),
        );
    });

    it('should call bucketDelete when objectKey and query are undefined', () => {
        request.query = {};
        request.objectKey = undefined;

        routeDELETE(request, response, api, log, statsClient);

        expect(api.callApiMethod).toHaveBeenCalledWith(
            'bucketDelete', request, response, log, expect.any(Function),
        );
    });

    it('should call objectDelete if objectKey is present and no query is defined', () => {
        request.objectKey = 'objectKey';
        request.query = {};

        routeDELETE(request, response, api, log, statsClient);

        expect(api.callApiMethod).toHaveBeenCalledWith(
            'objectDelete', request, response, log, expect.any(Function),
        );
    });

    it('should call objectDeleteTagging if query.tagging is present and objectKey is defined', () => {
        request.query = { tagging: true };
        request.objectKey = 'objectKey';

        routeDELETE(request, response, api, log, statsClient);

        expect(api.callApiMethod).toHaveBeenCalledWith(
            'objectDeleteTagging', request, response, log, expect.any(Function),
        );
    });

    it('should return 204 when objectDelete encounters NoSuchKey or NoSuchVersion errors', () => {
        request.objectKey = 'objectKey';
        request.query = {};

        const noSuchKeyError = new ArsenalError('NoSuchKey');
        api.callApiMethod = jest.fn((method, req, res, log, callback) => {
            callback(noSuchKeyError, {});
        });

        routeDELETE(request, response, api, log, statsClient);

        expect(routesUtils.responseNoBody).toHaveBeenCalledWith(
            null, {}, response, 204, log,
        );
    });

    it('should return 204 when objectDelete encounters errors other than NoSuchKey or NoSuchVersion', () => {
        request.objectKey = 'objectKey';
        request.query = {};

        const otherError = new Error('NotAnArsenalError');
        api.callApiMethod = jest.fn((method, req, res, log, callback) => {
            callback(otherError, {});
        });

        routeDELETE(request, response, api, log, statsClient);

        expect(routesUtils.responseNoBody).toHaveBeenCalledWith(
            null, {}, response, 204, log,
        );
        expect(routesUtils.statsReport500).toHaveBeenCalledWith(
            otherError, statsClient,
        );
    });
});
