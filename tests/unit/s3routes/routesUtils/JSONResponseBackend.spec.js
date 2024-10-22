const http = require('http');
const werelogs = require('werelogs');
const { default: errors } = require('../../../../lib/errors');
const { JSONResponseBackend } = require('../../../../lib/s3routes/routesUtils');
const logger = new werelogs.Logger('JSONResponseBackend', 'debug', 'debug');
const log = logger.newRequestLogger();

describe('JSONResponseBackend', () => {
    let request;
    let response;

    beforeEach(() => {
        request = new http.IncomingMessage();
        response = new http.ServerResponse(request);
        response.writeHead = jest.fn();
        response.end = jest.fn();
        response.setHeader = jest.fn();
        log.addDefaultFields = jest.fn();
    });

    describe('okResponse', () => {
        it('should send a JSON response with 200 status code', () => {
            const json = '{"message":"Success"}';

            JSONResponseBackend.okResponse(json, response, log);

            const bytesSent = Buffer.byteLength(json);
            expect(response.writeHead).toHaveBeenCalledWith(200, { 'Content-type': 'application/json' });
            expect(response.end).toHaveBeenCalledWith(json, 'utf8', expect.any(Function));
            expect(log.addDefaultFields).toHaveBeenCalledWith({ bytesSent });
        });

        it('should include additional headers in the response', () => {
            const json = '{"message":"Success"}';
            const additionalHeaders = { 'x-custom-header': 'value' };

            JSONResponseBackend.okResponse(json, response, log, additionalHeaders);

            expect(response.setHeader).toHaveBeenCalledWith('x-custom-header', 'value');
            expect(response.writeHead).toHaveBeenCalledWith(200, {
                'Content-type': 'application/json',
            });
        });
    });

    describe('errorResponse', () => {
        it('should handle ArsenalError and return appropriate JSON error response', () => {
            const errCode = errors.NoSuchKey;

            JSONResponseBackend.errorResponse(errCode, response, log);

            const expectedJSON = JSON.stringify({
                code: 'NoSuchKey',
                message: 'The specified key does not exist.',
                resource: null,
                requestId: log.getSerializedUids(),
            });

            const bytesSent = Buffer.byteLength(expectedJSON);

            expect(response.end).toHaveBeenCalledWith(expectedJSON, 'utf8', expect.any(Function));
            expect(response.writeHead).toHaveBeenCalledWith(404, {
                'Content-Type': 'application/json',
                'Content-Length': bytesSent,
            });
            expect(log.addDefaultFields).toHaveBeenCalledWith({ bytesSent });
        });

        it('should handle standard Error and return InternalError as JSON', () => {
            const errCode = new Error('Some error occurred');

            JSONResponseBackend.errorResponse(errCode, response, log);

            const internalError = errors.InternalError.customizeDescription('Some error occurred');

            const expectedJSON = JSON.stringify({
                code: internalError.message,
                message: internalError.description,
                resource: null,
                requestId: log.getSerializedUids(),
            });

            const bytesSent = Buffer.byteLength(expectedJSON);

            expect(response.writeHead).toHaveBeenCalledWith(500, {
                'Content-Type': 'application/json',
                'Content-Length': bytesSent,
            });
            expect(response.end).toHaveBeenCalledWith(expectedJSON, 'utf8', expect.any(Function));
            expect(log.addDefaultFields).toHaveBeenCalledWith({ bytesSent });
        });

        it('should return 304 without body if error code is 304', () => {
            const errCode = errors.NotModified;

            JSONResponseBackend.errorResponse(errCode, response, log);

            expect(response.writeHead).toHaveBeenCalledWith(304, {
                'Content-Length': 99,
                'Content-Type': 'application/json',
            });
        });

        it('should include invalidArguments metadata if present in the error', () => {
            const errCode = errors.InvalidArgument;
            errCode.metadata.set('invalidArguments', [
                { ArgumentName: 'arg1', ArgumentValue: 'value1' },
                { ArgumentName: 'arg2', ArgumentValue: 'value2' },
            ]);

            JSONResponseBackend.errorResponse(errCode, response, log);

            const expectedJSON = JSON.stringify({
                code: 'InvalidArgument',
                message: 'Invalid Argument',
                ArgumentName1: 'arg1',
                ArgumentValue1: 'value1',
                ArgumentName2: 'arg2',
                ArgumentValue2: 'value2',
                resource: null,
                requestId: log.getSerializedUids(),
            });

            const bytesSent = Buffer.byteLength(expectedJSON);

            expect(response.end).toHaveBeenCalledWith(expectedJSON, 'utf8', expect.any(Function));
            expect(response.writeHead).toHaveBeenCalledWith(400, {
                'Content-Type': 'application/json',
                'Content-Length': bytesSent,
            });
            expect(log.addDefaultFields).toHaveBeenCalledWith({ bytesSent });
        });
    });
});
