const http = require('http');
const werelogs = require('werelogs');
const { StatsClient } = require('../../../lib/metrics');
const { routesUtils } = require('../../../lib/s3routes');
const { ArsenalError } = require('../../../lib/errors');
const { default: routeOPTIONS } = require('../../../lib/s3routes/routes/routeOPTIONS');

const logger = new werelogs.Logger('routeOption', 'debug', 'debug');
const log = logger.newRequestLogger();

describe('routeOPTIONS', () => {
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
        routesUtils.responseXMLBody = jest.fn();
        routesUtils.statsReport500 = jest.fn();
    });

    it('should return BadRequest error if origin header is missing', () => {
        request.headers = {
            'access-control-request-method': 'GET',
        };

        routeOPTIONS(request, response, api, log, statsClient);

        expect(routesUtils.responseXMLBody).toHaveBeenCalledWith(
            new ArsenalError('BadRequest', 'Insufficient information. Origin request header needed.'),
            null,
            response,
            log,
        );
    });

    it('should return BadRequest error for an invalid Access-Control-Request-Method', () => {
        request.headers = {
            'origin': 'http://example.com',
            'access-control-request-method': 'INVALID',
        };

        routeOPTIONS(request, response, api, log, statsClient);

        expect(routesUtils.responseXMLBody).toHaveBeenCalledWith(
            new ArsenalError('BadRequest', 'Invalid Access-Control-Request-Method: INVALID'),
            null,
            response,
            log,
        );
    });

    it('should call corsPreflight method for a valid CORS request', () => {
        request.headers = {
            'origin': 'http://example.com',
            'access-control-request-method': 'GET',
        };

        routeOPTIONS(request, response, api, log, statsClient);

        expect(api.callApiMethod).toHaveBeenCalledWith(
            'corsPreflight', request, response, log, expect.any(Function),
        );
    });

    it('should report 500 stats if corsPreflight method returns an error', () => {
        request.headers = {
            'origin': 'http://example.com',
            'access-control-request-method': 'GET',
        };

        api.callApiMethod = jest.fn((method, req, res, log, callback) => {
            callback(new ArsenalError('InternalError'), {});
        });

        routeOPTIONS(request, response, api, log, statsClient);

        expect(routesUtils.statsReport500).toHaveBeenCalledWith(
            new ArsenalError('InternalError'), statsClient,
        );
    });
});
