const werelogs = require('werelogs');
const assert = require('assert');
const sinon = require('sinon');
const { routesUtils, routes } = require('../../../lib/s3routes');
const { default: errors } = require('../../../lib/errors');

const logger = new werelogs.Logger('routePut', 'debug', 'debug');

describe('routes', () => {
    let req;
    let res;
    let params;
    let s3config;

    beforeEach(() => {
        req = {
            method: 'GET',
            headers: {
                host: 'localhost',
            },
            socket: { remotePort: 12345 },
            url: '/invalidBucket/object',
            parsedHost: '127.0.0.1',
        };

        res = {
            end: sinon.stub(),
            setHeader: sinon.stub(),
            writeHead: sinon.stub(),
            on: sinon.stub(),
            removeAllListeners: sinon.stub(),
        };

        params = {
            allEndpoints: ['localhost'],
            internalHandlers: {},
            websiteEndpoints: ['localhost'],
            dataRetrievalParams: {},
            blacklistedPrefixes: {
                bucket: [],
                object: [],
            },
            unsupportedQueries: {},
            api: { callApiMethod: sinon.stub() },
        };

        s3config = {};
    });

    it('should call internal handler for internal requests', () => {
        req.url = '/_/internalService';
        params.internalHandlers.internalService = sinon.stub();

        routes(req, res, params, logger, s3config);

        expect(params.internalHandlers.internalService.calledOnce).toBe(true);
    });

    it('should return MethodNotAllowed error for unsupported methods', () => {
        req.method = 'WRONG';

        routes(req, res, params, logger, s3config);

        expect(res.end.calledOnce).toBe(true);
        expect(res.end.firstCall.args[0]).toContain(errors.MethodNotAllowed.message);
    });

    it('should return InvalidURI error for invalid URI', () => {
        req.url = '/invalidBucket/object';
        sinon.stub(routesUtils, 'normalizeRequest').throws(new Error('Invalid URI'));

        routes(req, res, params, logger, s3config);

        expect(res.end.calledOnce).toBe(true);
        expect(res.end.firstCall.args[0]).toContain(errors.InvalidURI.message);

        routesUtils.normalizeRequest.restore();
    });

    it('should return InvalidBucketName error for invalid bucket or key', () => {
        req.bucketName = '@invalidBucket';
        req.url = '/@invalidBucket/object';
        sinon.stub(routesUtils, 'isValidBucketName').returns(false);

        routes(req, res, params, logger, s3config);

        expect(res.end.calledOnce).toBe(true);
        expect(res.end.firstCall.args[0]).toContain(errors.InvalidBucketName.message);

        routesUtils.isValidBucketName.restore();
    });

    it('should return InvalidRequest error for invalid request', () => {
        req.url = '/bucket/?uploadId=123';

        routes(req, res, params, logger, s3config);

        expect(res.end.calledOnce).toBe(true);
        expect(res.end.firstCall.args[0]).toContain('A key must be specified');
    });

    it('should call the appropriate route method with req uids', () => {
        req.headers['x-scal-request-uids'] = '123456';
        req.method = 'GET';
        req.url = '/bucket/object';
        sinon.stub(routesUtils, 'isValidBucketName').returns(true);
        params.api.callApiMethod = sinon.stub();

        routes(req, res, params, logger, s3config);

        assert.strictEqual(typeof res, 'object',
            'bad routes param: res must be an object');
        expect(params.api.callApiMethod.calledOnce).toBe(true);

        routesUtils.isValidBucketName.restore();
    });

    it('should call the appropriate route method with invalid req uids', () => {
        // in this case, we should just ignore the request uids
        req.headers['x-scal-request-uids'] = 'x'.repeat(200);
        req.method = 'GET';
        req.url = '/bucket/object';
        sinon.stub(routesUtils, 'isValidBucketName').returns(true);
        params.api.callApiMethod = sinon.stub();

        routes(req, res, params, logger, s3config);

        assert.strictEqual(typeof res, 'object',
            'bad routes param: res must be an object');
        expect(params.api.callApiMethod.calledOnce).toBe(true);

        routesUtils.isValidBucketName.restore();
    });


    it('should call the appropriate route method', () => {
        req.method = 'GET';
        req.url = '/bucket/object';
        sinon.stub(routesUtils, 'isValidBucketName').returns(true);
        params.api.callApiMethod = sinon.stub();

        routes(req, res, params, logger, s3config);

        assert.strictEqual(typeof res, 'object',
            'bad routes param: res must be an object');
        expect(params.api.callApiMethod.calledOnce).toBe(true);

        routesUtils.isValidBucketName.restore();
    });
});
