const http = require('http');
const werelogs = require('werelogs');
const { StatsClient } = require('../../../lib/metrics');
const { routesUtils } = require('../../../lib/s3routes');
const { ArsenalError } = require('../../../lib/errors');
const { default: routerGET } = require('../../../lib/s3routes/routes/routeGET');

const logger = new werelogs.Logger('routeGET', 'debug', 'debug');
const log = logger.newRequestLogger();

describe('routerGET', () => {
    let request;
    let response;
    let api;
    let statsClient;
    let dataRetrievalParams;

    beforeEach(() => {
        request = new http.IncomingMessage();
        response = new http.ServerResponse(request);
        api = { callApiMethod: jest.fn() };
        statsClient = new StatsClient();
        dataRetrievalParams = {};

        routesUtils.responseXMLBody = jest.fn();
        routesUtils.responseStreamData = jest.fn();
        routesUtils.statsReport500 = jest.fn();
    });

    it('should return NoSuchBucket error when objectKey is defined but bucketName is undefined', () => {
        request.bucketName = undefined;
        request.objectKey = 'objectKey';
        request.query = {};

        routerGET(request, response, api, log, statsClient, dataRetrievalParams);

        expect(routesUtils.responseXMLBody).toHaveBeenCalledWith(
            new ArsenalError('NoSuchBucket'),
            null,
            response,
            log,
        );
    });

    it('should call serviceGet when bucketName and objectKey are undefined', () => {
        request.bucketName = undefined;
        request.objectKey = undefined;
        request.query = {};

        routerGET(request, response, api, log, statsClient, dataRetrievalParams);

        expect(api.callApiMethod).toHaveBeenCalledWith(
            'serviceGet', request, response, log, expect.any(Function),
        );
    });

    it('should call bucketGetACL when bucketName is defined and query.acl is present', () => {
        request.bucketName = 'bucketName';
        request.objectKey = undefined;
        request.query = { acl: true };

        routerGET(request, response, api, log, statsClient, dataRetrievalParams);

        expect(api.callApiMethod).toHaveBeenCalledWith(
            'bucketGetACL', request, response, log, expect.any(Function),
        );
    });

    it('should call objectGet when both bucketName and objectKey are defined and no specific query is present', () => {
        request.bucketName = 'bucketName';
        request.objectKey = 'objectKey';
        request.query = {};

        routerGET(request, response, api, log, statsClient, dataRetrievalParams);

        expect(api.callApiMethod).toHaveBeenCalledWith(
            'objectGet', request, response, log, expect.any(Function),
        );
    });

    it('should call objectGetACL when query.acl is present for an object', () => {
        request.bucketName = 'bucketName';
        request.objectKey = 'objectKey';
        request.query = { acl: true };

        routerGET(request, response, api, log, statsClient, dataRetrievalParams);

        expect(api.callApiMethod).toHaveBeenCalledWith(
            'objectGetACL', request, response, log, expect.any(Function),
        );
    });

    it('should handle objectGet with responseStreamData when no query is present for an object', () => {
        request.bucketName = 'bucketName';
        request.objectKey = 'objectKey';
        request.query = {};

        api.callApiMethod = jest.fn((method, req, res, log, callback) => {
            callback(null, { data: 'objectData' }, { 'Content-Length': 100 }, null);
        });

        routerGET(request, response, api, log, statsClient, dataRetrievalParams);

        expect(routesUtils.responseStreamData).toHaveBeenCalledWith(
            null,
            request.query,
            { 'Content-Length': 100 },
            { data: 'objectData' },
            dataRetrievalParams,
            response,
            null,
            log,
        );
    });

    it('should report 500 stats if objectGet method returns an error', () => {
        request.bucketName = 'bucketName';
        request.objectKey = 'objectKey';
        request.query = {};

        api.callApiMethod = jest.fn((method, req, res, log, callback) => {
            callback(new ArsenalError('InternalError'), {}, {});
        });

        routerGET(request, response, api, log, statsClient, dataRetrievalParams);

        expect(routesUtils.statsReport500).toHaveBeenCalledWith(
            new ArsenalError('InternalError'), statsClient,
        );
    });
});
