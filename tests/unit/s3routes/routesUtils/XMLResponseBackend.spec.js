const http = require('http');
const werelogs = require('werelogs');
const { default: errors } = require('../../../../lib/errors');
const { XMLResponseBackend } = require('../../../../lib/s3routes/routesUtils');
const logger = new werelogs.Logger('XMLResponseBackend', 'debug', 'debug');
const log = logger.newRequestLogger();

describe('XMLResponseBackend', () => {
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
        it('should send an XML response with 200 status code', () => {
            const xml = '<Response>Success</Response>';

            XMLResponseBackend.okResponse(xml, response, log);

            const bytesSent = Buffer.byteLength(xml);
            expect(response.writeHead).toHaveBeenCalledWith(200, { 'Content-type': 'application/xml' });
            expect(response.end).toHaveBeenCalledWith(xml, 'utf8', expect.any(Function));
            expect(log.addDefaultFields).toHaveBeenCalledWith({ bytesSent });
        });

        it('should include additional headers in the response', () => {
            const xml = '<Response>Success</Response>';
            const additionalHeaders = { 'x-custom-header': 'value' };

            XMLResponseBackend.okResponse(xml, response, log, additionalHeaders);

            expect(response.setHeader).toHaveBeenCalledWith('x-custom-header', 'value');
            expect(response.writeHead).toHaveBeenCalledWith(200, {
                'Content-type': 'application/xml',
            });
        });
    });

    describe('errorResponse', () => {
        it('should handle ArsenalError and return appropriate XML error response', () => {
            const errCode = errors.NoSuchKey;

            XMLResponseBackend.errorResponse(errCode, response, log);

            const expectedXML = [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<Error>',
                '<Code>NoSuchKey</Code>',
                '<Message>The specified key does not exist.</Message>',
                '<Resource></Resource>',
                `<RequestId>${log.getSerializedUids()}</RequestId>`,
                '</Error>',
            ].join('');

            const bytesSent = Buffer.byteLength(expectedXML);

            expect(response.end).toHaveBeenCalledWith(expectedXML, 'utf8', expect.any(Function));
            expect(response.writeHead).toHaveBeenCalledWith(404, {
                'Content-Type': 'application/xml',
                'Content-Length': bytesSent,
            });
            expect(log.addDefaultFields).toHaveBeenCalledWith({ bytesSent });
        });

        it('should handle standard Error and return InternalError as XML', () => {
            const errCode = new Error('Some error occurred');

            XMLResponseBackend.errorResponse(errCode, response, log);

            const internalError = errors.InternalError.customizeDescription('Some error occurred');

            const expectedXML = [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<Error>',
                `<Code>${internalError.message}</Code>`,
                `<Message>${internalError.description}</Message>`,
                '<Resource></Resource>',
                `<RequestId>${log.getSerializedUids()}</RequestId>`,
                '</Error>',
            ].join('');

            const bytesSent = Buffer.byteLength(expectedXML);

            expect(response.writeHead).toHaveBeenCalledWith(500, {
                'Content-Type': 'application/xml',
                'Content-Length': bytesSent,
            });
            expect(response.end).toHaveBeenCalledWith(expectedXML, 'utf8', expect.any(Function));
            expect(log.addDefaultFields).toHaveBeenCalledWith({ bytesSent });
        });

        it('should return 304 without body if error code is 304', () => {
            const errCode = errors.NotModified;

            XMLResponseBackend.errorResponse(errCode, response, log);

            expect(response.writeHead).toHaveBeenCalledWith(304);
            expect(response.end).toHaveBeenCalledWith('', 'utf8', expect.any(Function));
        });

        it('should include invalidArguments metadata if present in the error', () => {
            const errCode = errors.InvalidArgument;
            errCode.metadata.set('invalidArguments', [
                { ArgumentName: 'arg1', ArgumentValue: 'value1' },
                { ArgumentName: 'arg2', ArgumentValue: 'value2' },
            ]);

            XMLResponseBackend.errorResponse(errCode, response, log);

            const expectedXML = [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<Error>',
                '<Code>InvalidArgument</Code>',
                '<Message>Invalid Argument</Message>',
                '<ArgumentName1>arg1</ArgumentName1>',
                '<ArgumentValue1>value1</ArgumentValue1>',
                '<ArgumentName2>arg2</ArgumentName2>',
                '<ArgumentValue2>value2</ArgumentValue2>',
                '<Resource></Resource>',
                `<RequestId>${log.getSerializedUids()}</RequestId>`,
                '</Error>',
            ].join('');

            const bytesSent = Buffer.byteLength(expectedXML);

            expect(response.end).toHaveBeenCalledWith(expectedXML, 'utf8', expect.any(Function));
            expect(response.writeHead).toHaveBeenCalledWith(400, {
                'Content-Type': 'application/xml',
                'Content-Length': bytesSent,
            });
            expect(log.addDefaultFields).toHaveBeenCalledWith({ bytesSent });
        });
    });
});
