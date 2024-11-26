const http = require('http');
const werelogs = require('werelogs');
const { StatsClient } = require('../../../lib/metrics');
const { routesUtils } = require('../../../lib/s3routes');
const { ArsenalError } = require('../../../lib/errors');
const { default: routePUT } = require('../../../lib/s3routes/routes/routePUT');

const logger = new werelogs.Logger('routePut', 'debug', 'debug');
const log = logger.newRequestLogger();

describe('routePUT', () => {
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

    it('should call bucketPut when no objectKey is provided', () => {
        request.bucketName = 'test-bucket';
        request.query = {};
        api.callApiMethod = jest.fn();

        routePUT(request, response, api, log, statsClient);

        expect(api.callApiMethod).toHaveBeenCalledWith(
            'bucketPut', request, response, log, expect.any(Function),
        );
    });

    it('should call objectPut when objectKey is present and valid content-md5', () => {
        request.objectKey = 'test-object';
        request.headers = {
            'content-md5': '1B2M2Y8AsgTpgAmY7PhCfg==',
            'content-length': 10,
        };
        request.query = {};
        request.bucketName = 'test-bucket';

        routePUT(request, response, api, log, statsClient);

        expect(api.callApiMethod).toHaveBeenCalledWith(
            'objectPut', request, response, log, expect.any(Function),
        );
    });

    it('should return InvalidDigest error for an invalid content-md5', () => {
        request.objectKey = 'test-object';
        request.headers = { 'content-md5': 'invalid-md5' };
        request.query = {};
        api.callApiMethod = jest.fn();

        routePUT(request, response, api, log, statsClient);

        expect(routesUtils.responseNoBody).toHaveBeenCalledWith(
            new ArsenalError('InvalidDigest'), null, response, 200, log,
        );
    });

    it('should return MissingContentLength error if content-length is missing', () => {
        request.objectKey = 'test-object';
        request.headers = { };
        request.query = {};
        api.callApiMethod = jest.fn();

        routePUT(request, response, api, log, statsClient);

        expect(routesUtils.responseNoBody).toHaveBeenCalledWith(
            new ArsenalError('MissingContentLength'), null, response, 411, log,
        );
    });

    it('should call bucketPutVersioning when query.versioning is set', () => {
        request.bucketName = 'test-bucket';
        request.query = { versioning: '' };
        api.callApiMethod = jest.fn();

        routePUT(request, response, api, log, statsClient);

        expect(api.callApiMethod).toHaveBeenCalledWith(
            'bucketPutVersioning', request, response, log, expect.any(Function),
        );
    });

    it('should call objectCopy when x-amz-copy-source is provided', () => {
        request.objectKey = 'test-object';
        request.headers = { 'x-amz-copy-source': 'source-bucket/source-key' };
        request.query = {};
        api.callApiMethod = jest.fn();

        routePUT(request, response, api, log, statsClient);

        expect(api.callApiMethod).toHaveBeenCalledWith(
            'objectCopy', request, response, log, expect.any(Function),
        );
    });

    it('should call objectPutACL when query.acl is present', () => {
        request.objectKey = 'test-object';
        request.query = { acl: '' };
        api.callApiMethod = jest.fn();

        routePUT(request, response, api, log, statsClient);

        expect(api.callApiMethod).toHaveBeenCalledWith(
            'objectPutACL', request, response, log, expect.any(Function),
        );
    });

    it('should call bucketUpdateQuota when query.quota is set', () => {
        request.bucketName = 'test-bucket';
        request.query = { quota: '' };
        api.callApiMethod = jest.fn();

        routePUT(request, response, api, log, statsClient);

        expect(api.callApiMethod).toHaveBeenCalledWith(
            'bucketUpdateQuota', request, response, log, expect.any(Function),
        );
    });

    it('should call bucketPutWebsite when query.website is set', () => {
        request.bucketName = 'test-bucket';
        request.query = { website: '' };
        api.callApiMethod = jest.fn();

        routePUT(request, response, api, log, statsClient);

        expect(api.callApiMethod).toHaveBeenCalledWith(
            'bucketPutWebsite', request, response, log, expect.any(Function),
        );
    });

    it('should call bucketPutTagging when query.tagging is set', () => {
        request.bucketName = 'test-bucket';
        request.query = { tagging: '' };
        api.callApiMethod = jest.fn();

        routePUT(request, response, api, log, statsClient);

        expect(api.callApiMethod).toHaveBeenCalledWith(
            'bucketPutTagging', request, response, log, expect.any(Function),
        );
    });

    it('should call bucketPutCors when query.cors is set', () => {
        request.bucketName = 'test-bucket';
        request.query = { cors: '' };
        api.callApiMethod = jest.fn();

        routePUT(request, response, api, log, statsClient);

        expect(api.callApiMethod).toHaveBeenCalledWith(
            'bucketPutCors', request, response, log, expect.any(Function),
        );
    });

    it('should call bucketPutReplication when query.replication is set', () => {
        request.bucketName = 'test-bucket';
        request.query = { replication: '' };
        api.callApiMethod = jest.fn();

        routePUT(request, response, api, log, statsClient);

        expect(api.callApiMethod).toHaveBeenCalledWith(
            'bucketPutReplication', request, response, log, expect.any(Function),
        );
    });

    it('should call bucketPutLifecycle when query.lifecycle is set', () => {
        request.bucketName = 'test-bucket';
        request.query = { lifecycle: '' };
        api.callApiMethod = jest.fn();

        routePUT(request, response, api, log, statsClient);

        expect(api.callApiMethod).toHaveBeenCalledWith(
            'bucketPutLifecycle', request, response, log, expect.any(Function),
        );
    });

    it('should call bucketPutPolicy when query.policy is set', () => {
        request.bucketName = 'test-bucket';
        request.query = { policy: '' };
        api.callApiMethod = jest.fn();

        routePUT(request, response, api, log, statsClient);

        expect(api.callApiMethod).toHaveBeenCalledWith(
            'bucketPutPolicy', request, response, log, expect.any(Function),
        );
    });

    it('should call bucketPutObjectLock when query.object-lock is set', () => {
        request.bucketName = 'test-bucket';
        request.query = { 'object-lock': '' };
        api.callApiMethod = jest.fn();

        routePUT(request, response, api, log, statsClient);

        expect(api.callApiMethod).toHaveBeenCalledWith(
            'bucketPutObjectLock', request, response, log, expect.any(Function),
        );
    });

    it('should call bucketPutNotification when query.notification is set', () => {
        request.bucketName = 'test-bucket';
        request.query = { notification: '' };
        api.callApiMethod = jest.fn();

        routePUT(request, response, api, log, statsClient);

        expect(api.callApiMethod).toHaveBeenCalledWith(
            'bucketPutNotification', request, response, log, expect.any(Function),
        );
    });

    it('should call bucketPutEncryption when query.encryption is set', () => {
        request.bucketName = 'test-bucket';
        request.query = { encryption: '' };
        api.callApiMethod = jest.fn();

        routePUT(request, response, api, log, statsClient);

        expect(api.callApiMethod).toHaveBeenCalledWith(
            'bucketPutEncryption', request, response, log, expect.any(Function),
        );
    });

    it('should return BadRequest when content-length is invalid for PUT bucket', () => {
        request.bucketName = 'test-bucket';
        request.query = {};
        request.headers['content-length'] = '-1';

        routePUT(request, response, api, log, statsClient);

        expect(routesUtils.responseNoBody).toHaveBeenCalledWith(
            new ArsenalError('BadRequest'), null, response, undefined, log,
        );
    });
});
