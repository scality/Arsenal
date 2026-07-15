const werelogs = require('werelogs');
const assert = require('assert');
const sinon = require('sinon');
const { routesUtils, routes } = require('../../../lib/s3routes');
const { errorInstances } = require('../../../lib/errors');
const { maxRequestUidsLength } = require('../../../lib/constants');

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
        expect(res.end.firstCall.args[0]).toContain(errorInstances.MethodNotAllowed.message);
    });

    it('should return InvalidURI error for invalid URI', () => {
        req.url = '/invalidBucket/object';
        sinon.stub(routesUtils, 'normalizeRequest').throws(new Error('Invalid URI'));

        routes(req, res, params, logger, s3config);

        expect(res.end.calledOnce).toBe(true);
        expect(res.end.firstCall.args[0]).toContain(errorInstances.InvalidURI.message);

        routesUtils.normalizeRequest.restore();
    });

    it('should return InvalidBucketName error for invalid bucket or key', () => {
        req.bucketName = '@invalidBucket';
        req.url = '/@invalidBucket/object';
        sinon.stub(routesUtils, 'isValidBucketName').returns(false);

        routes(req, res, params, logger, s3config);

        expect(res.end.calledOnce).toBe(true);
        expect(res.end.firstCall.args[0]).toContain(errorInstances.InvalidBucketName.message);

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

        assert.strictEqual(typeof res, 'object', 'bad routes param: res must be an object');
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

        assert.strictEqual(typeof res, 'object', 'bad routes param: res must be an object');
        expect(params.api.callApiMethod.calledOnce).toBe(true);

        routesUtils.isValidBucketName.restore();
    });

    it('should call the appropriate route method', () => {
        req.method = 'GET';
        req.url = '/bucket/object';
        sinon.stub(routesUtils, 'isValidBucketName').returns(true);
        params.api.callApiMethod = sinon.stub();

        routes(req, res, params, logger, s3config);

        assert.strictEqual(typeof res, 'object', 'bad routes param: res must be an object');
        expect(params.api.callApiMethod.calledOnce).toBe(true);

        routesUtils.isValidBucketName.restore();
    });
});

describe('routesUtils.newRequestLoggerFromRequest', () => {
    const parentLogger = new werelogs.Logger('reqUids', 'debug', 'debug');

    const reqWith = headers => ({ headers });

    it('seeds the chain from a valid x-scal-request-uids header', () => {
        const fromUids = sinon.spy(parentLogger, 'newRequestLoggerFromSerializedUids');

        routesUtils.newRequestLoggerFromRequest(parentLogger, reqWith({ 'x-scal-request-uids': 'parent-uid' }));

        expect(fromUids.calledOnceWithExactly('parent-uid')).toBe(true);

        fromUids.restore();
    });

    it('starts a fresh chain when the header is absent', () => {
        const fromUids = sinon.spy(parentLogger, 'newRequestLoggerFromSerializedUids');
        const fresh = sinon.spy(parentLogger, 'newRequestLogger');

        routesUtils.newRequestLoggerFromRequest(parentLogger, reqWith({}));

        expect(fromUids.called).toBe(false);
        expect(fresh.calledOnce).toBe(true);

        fromUids.restore();
        fresh.restore();
    });

    it('starts a fresh chain when the header is empty', () => {
        const fromUids = sinon.spy(parentLogger, 'newRequestLoggerFromSerializedUids');
        const fresh = sinon.spy(parentLogger, 'newRequestLogger');

        routesUtils.newRequestLoggerFromRequest(parentLogger, reqWith({ 'x-scal-request-uids': '' }));

        expect(fromUids.called).toBe(false);
        expect(fresh.calledOnce).toBe(true);

        fromUids.restore();
        fresh.restore();
    });

    it('ignores a header sent multiple times (array value)', () => {
        const fromUids = sinon.spy(parentLogger, 'newRequestLoggerFromSerializedUids');
        const fresh = sinon.spy(parentLogger, 'newRequestLogger');

        routesUtils.newRequestLoggerFromRequest(parentLogger, reqWith({ 'x-scal-request-uids': ['a', 'b'] }));

        expect(fromUids.called).toBe(false);
        expect(fresh.calledOnce).toBe(true);

        fromUids.restore();
        fresh.restore();
    });

    it('seeds just under maxRequestUidsLength but ignores at/above it', () => {
        const fromUids = sinon.spy(parentLogger, 'newRequestLoggerFromSerializedUids');
        const fresh = sinon.spy(parentLogger, 'newRequestLogger');

        routesUtils.newRequestLoggerFromRequest(
            parentLogger,
            reqWith({ 'x-scal-request-uids': 'x'.repeat(maxRequestUidsLength - 1) }),
        );
        routesUtils.newRequestLoggerFromRequest(
            parentLogger,
            reqWith({ 'x-scal-request-uids': 'x'.repeat(maxRequestUidsLength) }),
        );

        expect(fromUids.calledOnce).toBe(true);
        expect(fresh.calledOnce).toBe(true);

        fromUids.restore();
        fresh.restore();
    });
});
