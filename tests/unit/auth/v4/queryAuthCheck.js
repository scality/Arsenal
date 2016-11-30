'use strict'; // eslint-disable-line strict

const assert = require('assert');
const lolex = require('lolex');

const errors = require('../../../../lib/errors');

const createAlteredRequest = require('../../helpers').createAlteredRequest;
const queryAuthCheck = require('../../../../lib/auth/v4/queryAuthCheck').check;
const DummyRequestLogger = require('../../helpers').DummyRequestLogger;

const log = new DummyRequestLogger();

const method = 'GET';
const path = decodeURIComponent('/mybucket');
const host = 'localhost:8000';
const query = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': 'accessKey1/20160208/us-east-1/s3/aws4_request',
    'X-Amz-Date': '20160208T234304Z',
    // 900 seconds = 15 minutes
    'X-Amz-Expires': '900',
    'X-Amz-Signature': '036c5d854aca98a003c1c155a' +
        '7723157d8148ad5888b3aee1133784eb5aec08b',
    'X-Amz-SignedHeaders': 'host',
};
const headers = {
    host,
};
const request = {
    method,
    path,
    headers,
    query,
};

describe('v4 queryAuthCheck', () => {
    it('should return error if algorithm param incorrect', done => {
        const alteredRequest = createAlteredRequest({ 'X-Amz-Algorithm':
            'AWS4-HMAC-SHA1' }, 'query', request, query);
        const res = queryAuthCheck(alteredRequest, log, alteredRequest.query);
        assert.deepStrictEqual(res.err, errors.InvalidArgument);
        done();
    });

    it('should return error if X-Amz-Credential param is undefined', done => {
        const alteredRequest = createAlteredRequest({ 'X-Amz-Credential':
            undefined }, 'query', request, query);
        const res = queryAuthCheck(alteredRequest, log, alteredRequest.query);
        assert.deepStrictEqual(res.err, errors.InvalidArgument);
        done();
    });

    it('should return error if credential param format incorrect', done => {
        const alteredRequest = createAlteredRequest({ 'X-Amz-Credential':
            'incorrectformat' }, 'query', request, query);
        const res = queryAuthCheck(alteredRequest, log, alteredRequest.query);
        assert.deepStrictEqual(res.err, errors.InvalidArgument);
        done();
    });

    it('should return error if service set forth in ' +
        'credential param is not s3', done => {
        const alteredRequest = createAlteredRequest({ 'X-Amz-Credential':
        'accessKey1/20160208/us-east-1/EC2/aws4_request' },
        'query', request, query);
        const res = queryAuthCheck(alteredRequest, log, alteredRequest.query);
        assert.deepStrictEqual(res.err, errors.InvalidArgument);
        done();
    });

    it('should return error if requestType set forth in ' +
        'credential param is not aws4_request', done => {
        const alteredRequest = createAlteredRequest({ 'X-Amz-Credential':
        'accessKey1/20160208/us-east-1/s3/aws2_request' },
        'query', request, query);
        const res = queryAuthCheck(alteredRequest, log, alteredRequest.query);
        assert.deepStrictEqual(res.err, errors.InvalidArgument);
        done();
    });

    it('should return error if undefined X-Amz-SignedHeaders param', done => {
        const alteredRequest = createAlteredRequest({ 'X-Amz-SignedHeaders':
        undefined }, 'query', request, query);
        const res = queryAuthCheck(alteredRequest, log, alteredRequest.query);
        assert.deepStrictEqual(res.err, errors.InvalidArgument);
        done();
    });

    it('should return error if undefined X-Amz-Signature param', done => {
        const alteredRequest = createAlteredRequest({ 'X-Amz-Signature':
        undefined }, 'query', request, query);
        const res = queryAuthCheck(alteredRequest, log, alteredRequest.query);
        assert.deepStrictEqual(res.err, errors.InvalidArgument);
        done();
    });

    it('should return error if host is not included as signed header', done => {
        const alteredRequest = createAlteredRequest({ 'X-Amz-SignedHeaders':
            'none' }, 'query', request, query);
        const res = queryAuthCheck(alteredRequest, log, alteredRequest.query);
        assert.deepStrictEqual(res.err, errors.AccessDenied);
        done();
    });

    it('should return error if an x-amz header is not included as signed ' +
        'header but is in request', done => {
        const alteredRequest = createAlteredRequest({
            'x-amz-acl': 'public' }, 'headers', request, headers);
        const res = queryAuthCheck(alteredRequest, log, alteredRequest.query);
        assert.deepStrictEqual(res.err, errors.AccessDenied);
        done();
    });

    it('should return error if an x-scal header is not included as signed ' +
        'header but is in request', done => {
        const alteredRequest = createAlteredRequest({
            'x-scal-encryption': 'true' }, 'headers', request, headers);
        const res = queryAuthCheck(alteredRequest, log, alteredRequest.query);
        assert.deepStrictEqual(res.err, errors.AccessDenied);
        done();
    });

    it('should return error if undefined X-Amz-Date param', done => {
        const alteredRequest = createAlteredRequest({ 'X-Amz-Date':
        undefined }, 'query', request, query);
        const res = queryAuthCheck(alteredRequest, log, alteredRequest.query);
        assert.deepStrictEqual(res.err, errors.InvalidArgument);
        done();
    });

    it('should return error if undefined X-Amz-Expires param', done => {
        const alteredRequest = createAlteredRequest({ 'X-Amz-Expires':
        undefined }, 'query', request, query);
        const res = queryAuthCheck(alteredRequest, log, alteredRequest.query);
        assert.deepStrictEqual(res.err, errors.InvalidArgument);
        done();
    });

    it('should return error if X-Amz-Expires param ' +
    'is less than 1', done => {
        const alteredRequest = createAlteredRequest({ 'X-Amz-Expires':
        0 }, 'query', request, query);
        const res = queryAuthCheck(alteredRequest, log, alteredRequest.query);
        assert.deepStrictEqual(res.err, errors.InvalidArgument);
        done();
    });

    it('should return error if X-Amz-Expires param ' +
    'is greater than 604800', done => {
        // Greater than 604800 seconds (7 days)
        const alteredRequest = createAlteredRequest({ 'X-Amz-Expires':
        604801 }, 'query', request, query);
        const res = queryAuthCheck(alteredRequest, log, alteredRequest.query);
        assert.deepStrictEqual(res.err, errors.InvalidArgument);
        done();
    });

    it('should return error if X-Amz-Date param is in the future', done => {
        // 2095 instead of 2016
        const alteredRequest = createAlteredRequest({
            'X-Amz-Date': '20950208T234304Z',
            'X-Amz-Credential': 'accessKey1/20950208/us-east-1/s3/aws4_request',
        }, 'query', request, query);
        const res = queryAuthCheck(alteredRequest, log, alteredRequest.query);
        assert.deepStrictEqual(res.err, errors.RequestTimeTooSkewed);
        done();
    });

    it('should return error if X-Amz-Date param is too old', done => {
        const alteredRequest = createAlteredRequest({
            'X-Amz-Date': '20160208T234304Z',
        }, 'query', request, query);
        const res = queryAuthCheck(alteredRequest, log, alteredRequest.query);
        assert.deepStrictEqual(res.err, errors.RequestTimeTooSkewed);
        done();
    });

    it('should return error if scope date from X-Amz-Credential param' +
        'does not match date from X-Amz-Date param', done => {
        const clock = lolex.install(1454974984001);
        const alteredRequest = createAlteredRequest({
            'X-Amz-Credential': 'accessKey1/20160209/' +
                'us-east-1/s3/aws4_request',
        }, 'query', request, query);
        const res = queryAuthCheck(alteredRequest, log, alteredRequest.query);
        clock.uninstall();
        assert.deepStrictEqual(res.err, errors.RequestTimeTooSkewed);
        done();
    });

    it('should successfully return v4 and no error', done => {
        // Freezes time so date created within function will be Feb 8, 2016
        // (within 15 minutes of timestamp in request)
        const clock = lolex.install(1454974984001);
        const res = queryAuthCheck(request, log, request.query);
        clock.uninstall();
        assert.deepStrictEqual(res.err, null);
        assert.strictEqual(res.params.version, 4);
        done();
    });
});
