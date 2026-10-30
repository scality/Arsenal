const http = require('http');
const werelogs = require('werelogs');
const { StatsClient } = require('../../../lib/metrics');
const { routesUtils } = require('../../../lib/s3routes');
const { errorInstances } = require('../../../lib/errors');
const { default: routeNotificationDestination } = require('../../../lib/s3routes/routes/routeNotificationDestination');

const logger = new werelogs.Logger('routeNotificationDestination', 'debug', 'debug');
const log = logger.newRequestLogger();

describe('routeNotificationDestination', () => {
    let request;
    let response;
    let api;
    let statsClient;

    beforeEach(() => {
        request = new http.IncomingMessage();
        response = new http.ServerResponse(request);
        api = { callApiMethod: jest.fn() };
        statsClient = new StatsClient();

        jest.spyOn(routesUtils, 'responseXMLBody').mockImplementation(() => undefined);
        jest.spyOn(routesUtils, 'responseNoBody').mockImplementation(() => undefined);
        jest.spyOn(routesUtils, 'statsReport500').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    const route = (method, query, bucketName, objectKey) => {
        request.method = method;
        request.query = { 'notification-destination': '', ...query };
        request.bucketName = bucketName;
        request.objectKey = objectKey;
        routeNotificationDestination(request, response, api, log, statsClient);
    };

    const errorAnswered = () => routesUtils.responseXMLBody.mock.calls[0][0];

    it.each([
        ['PUT', 'notificationDestinationCreate'],
        ['POST', 'notificationDestinationUpdate'],
        ['GET', 'notificationDestinationGet'],
        ['DELETE', 'notificationDestinationDelete'],
    ])('should route a %s with a name to %s', (method, apiMethod) => {
        route(method, { name: 'dest' });

        expect(api.callApiMethod).toHaveBeenCalledWith(apiMethod, request, response, log, expect.any(Function));
    });

    it('should route a GET with no name to notificationDestinationList', () => {
        route('GET', {});

        expect(api.callApiMethod).toHaveBeenCalledWith(
            'notificationDestinationList',
            request,
            response,
            log,
            expect.any(Function),
        );
    });

    it.each([
        ['PUT', 200],
        ['POST', 200],
        ['DELETE', 204],
    ])('should answer a %s with %s and no body', (method, httpCode) => {
        const corsHeaders = { 'access-control-allow-origin': '*' };
        route(method, { name: 'dest' });

        api.callApiMethod.mock.calls[0][4](null, corsHeaders);

        expect(routesUtils.responseNoBody).toHaveBeenCalledWith(null, corsHeaders, response, httpCode, log);
    });

    it.each([[{ name: 'dest' }], [{}]])('should answer a GET with %j with the XML body', query => {
        const corsHeaders = { 'access-control-allow-origin': '*' };
        route('GET', query);

        api.callApiMethod.mock.calls[0][4](null, '<xml/>', corsHeaders);

        expect(routesUtils.responseXMLBody).toHaveBeenCalledWith(null, '<xml/>', response, log, corsHeaders);
    });

    it.each([
        ['PUT', { name: 'dest' }],
        ['GET', { name: 'dest' }],
        ['GET', {}],
    ])('should report and answer the error of a %s with %j', (method, query) => {
        const err = errorInstances.InternalError;
        route(method, query);

        api.callApiMethod.mock.calls[0][4](err);

        expect(routesUtils.statsReport500).toHaveBeenCalledWith(err, statsClient);
        const answer = method === 'GET' ? routesUtils.responseXMLBody : routesUtils.responseNoBody;
        expect(answer.mock.calls[0][0]).toBe(err);
    });

    it.each([
        ['bucket', undefined],
        ['bucket', 'key'],
        [undefined, 'key'],
    ])('should answer MethodNotAllowed with bucket %s and key %s', (bucketName, objectKey) => {
        route('DELETE', { name: 'dest' }, bucketName, objectKey);

        expect(api.callApiMethod).not.toHaveBeenCalled();
        expect(errorAnswered().is.MethodNotAllowed).toBe(true);
    });

    it.each(['HEAD', 'PATCH'])('should answer MethodNotAllowed to a %s', method => {
        route(method, { name: 'dest' });

        expect(api.callApiMethod).not.toHaveBeenCalled();
        expect(errorAnswered().is.MethodNotAllowed).toBe(true);
    });

    it.each([
        ['PUT', {}],
        ['POST', {}],
        ['DELETE', {}],
        ['PUT', { name: '' }],
        ['POST', { name: '' }],
        ['DELETE', { name: '' }],
        ['GET', { name: '' }],
        ['PUT', { name: ['first', 'second'] }],
    ])('should answer InvalidArgument to a %s with %j', (method, query) => {
        route(method, query);

        expect(api.callApiMethod).not.toHaveBeenCalled();
        expect(errorAnswered().is.InvalidArgument).toBe(true);
        expect(errorAnswered().description).toBe('A bucket notification destination name must be specified.');
    });
});
