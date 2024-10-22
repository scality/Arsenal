const http = require('http');
const werelogs = require('werelogs');
const { default: errors } = require('../../../../lib/errors');
const { errorHtmlResponse } = require('../../../../lib/s3routes/routesUtils');
const logger = new werelogs.Logger('ErrorHtmlResponse', 'debug', 'debug');
const log = logger.newRequestLogger();

describe('errorHtmlResponse', () => {
    let response;

    beforeEach(() => {
        response = new http.ServerResponse(new http.IncomingMessage());
        response.writeHead = jest.fn();
        response.end = jest.fn();
        log.addDefaultFields = jest.fn();
    });

    it('should send HTML response for ArsenalError', () => {
        const err = errors.NoSuchKey;
        const bucketName = 'test-bucket';
        const corsHeaders = null;
        const userErrorPageFailure = false;

        response.statusMessage = 'Not Found';

        errorHtmlResponse(err, userErrorPageFailure, bucketName, response, corsHeaders, log);

        const expectedHtml = [
            '<html>',
            '<head>',
            '<title>404 Not Found</title>',
            '</head>',
            '<body>',
            '<h1>404 Not Found</h1>',
            '<ul>',
            '<li>Code: NoSuchKey</li>',
            '<li>Message: The specified key does not exist.</li>',
            '<li>BucketName: test-bucket</li>',
            '<li>RequestId: ', log.getSerializedUids(), '</li>',
            '</ul>',
            '<hr/>',
            '</body>',
            '</html>',
        ].join('');

        expect(response.writeHead).toHaveBeenCalledWith(404, { 'Content-type': 'text/html' });
        expect(response.end).toHaveBeenCalledWith(expectedHtml, 'utf8', expect.any(Function));
    });

    it('should send HTML response for standard Error', () => {
        const err = new Error('Some error occurred');
        const bucketName = 'test-bucket';
        const corsHeaders = null;
        const userErrorPageFailure = false;

        response.statusMessage = 'Internal Server Error';

        errorHtmlResponse(err, userErrorPageFailure, bucketName, response, corsHeaders, log);

        const internalError = errors.InternalError.customizeDescription('Some error occurred');

        const expectedHtml = [
            '<html>',
            '<head>',
            '<title>500 Internal Server Error</title>',
            '</head>',
            '<body>',
            '<h1>500 Internal Server Error</h1>',
            '<ul>',
            `<li>Code: ${internalError.message}</li>`,
            `<li>Message: ${internalError.description}</li>`,
            '<li>BucketName: test-bucket</li>',
            `<li>RequestId: ${log.getSerializedUids()}</li>`,
            '</ul>',
            '<hr/>',
            '</body>',
            '</html>',
        ].join('');

        expect(response.writeHead).toHaveBeenCalledWith(500, { 'Content-type': 'text/html' });
        expect(response.end).toHaveBeenCalledWith(expectedHtml, 'utf8', expect.any(Function));
    });

    it('should not include bucket name when userErrorPageFailure is true', () => {
        const err = errors.NoSuchKey;
        const bucketName = 'test-bucket';
        const corsHeaders = null;
        const userErrorPageFailure = true;

        response.statusMessage = 'Not Found';

        errorHtmlResponse(err, userErrorPageFailure, bucketName, response, corsHeaders, log);

        const expectedHtml = [
            '<html>',
            '<head>',
            '<title>404 Not Found</title>',
            '</head>',
            '<body>',
            '<h1>404 Not Found</h1>',
            '<ul>',
            '<li>Code: NoSuchKey</li>',
            '<li>Message: The specified key does not exist.</li>',
            '<li>RequestId: ', log.getSerializedUids(), '</li>',
            '</ul>',
            '<h3>An Error Occurred While Attempting to Retrieve a Custom Error Document</h3>',
            '<ul>',
            '<li>Code: NoSuchKey</li>',
            '<li>Message: The specified key does not exist.</li>',
            '</ul>',
            '<hr/>',
            '</body>',
            '</html>',
        ].join('');

        expect(response.writeHead).toHaveBeenCalledWith(404, { 'Content-type': 'text/html' });
        expect(response.end).toHaveBeenCalledWith(expectedHtml, 'utf8', expect.any(Function));
    });
});
