'use strict'; // eslint-disable-line strict

const assert = require('assert');
const fakeTimers = require('@sinonjs/fake-timers');

const errors = require('../../../../lib/errors').default;

const createAlteredRequest = require('../../helpers').createAlteredRequest;
const formAuthCheck = require('../../../../lib/auth/v4/formAuthCheck').check;
const DummyRequestLogger = require('../../helpers').DummyRequestLogger;

const log = new DummyRequestLogger();

const method = 'POST';
const path = decodeURIComponent('/mybucket');
const host = 'localhost:8000';

const formatDate = now => now.toISOString().replace(/[:-]|\.\d{3}/g, '');

const requestDate = new Date(Date.now());

function prepPolicy(data, expiration = new Date(requestDate.getTime() + 15 * 60 * 1000)) {
    try {
        // 15 minutes
        const policy = { expiration: expiration.toISOString() };
        policy.conditions = Object.keys(data).map(key => ({ key: data[key] }));
        // return base64 version of policy
        return policy;
    } catch (e) {
        throw new Error('Policy is not a valid JSON');
    }
}

const formData = {
    'x-amz-algorithm': 'AWS4-HMAC-SHA256',
    'x-amz-credential': `accessKey1/${formatDate(requestDate).split('T')[0]}/us-east-1/s3/aws4_request`,
    'x-amz-date': formatDate(requestDate),
    'x-amz-signature': '036c5d854aca98a003c1c155a' +
        '7723157d8148ad5888b3aee1133784eb5aec08b',
};
formData.policy = `${btoa(JSON.stringify(prepPolicy(formData)))}`;

const headers = {
    host,
};
const request = {
    method,
    path,
    headers,
    formData,
};

describe('v4 formAuthCheck', () => {
    it('should return error if algorithm param incorrect', done => {
        const alteredRequest = createAlteredRequest({
            'x-amz-algorithm':
                'AWS4-HMAC-SHA1',
        }, 'formData', request, formData);
        const res = formAuthCheck(alteredRequest, log, alteredRequest.formData);
        assert.deepStrictEqual(res.err, errors.InvalidArgument);
        done();
    });

    it('should return error if x-amz-credential param is undefined', done => {
        const alteredRequest = createAlteredRequest({
            'x-amz-credential':
                undefined,
        }, 'formData', request, formData);
        const res = formAuthCheck(alteredRequest, log, alteredRequest.formData);
        assert.deepStrictEqual(res.err, errors.InvalidArgument);
        done();
    });

    it('should return error if credential param format incorrect', done => {
        const alteredRequest = createAlteredRequest({
            'x-amz-credential':
                'incorrectformat',
        }, 'formData', request, formData);
        const res = formAuthCheck(alteredRequest, log, alteredRequest.formData);
        assert.deepStrictEqual(res.err, errors.InvalidArgument);
        done();
    });

    it('should return error if service set forth in ' +
        'credential param is not s3', done => {
        const alteredRequest = createAlteredRequest({
            'x-amz-credential':
                    `accessKey1/${formatDate(requestDate).split('T')[0]}/us-east-1/EC2/aws4_request`,
        },
        'formData', request, formData);
        const res = formAuthCheck(alteredRequest, log, alteredRequest.formData);
        assert.deepStrictEqual(res.err, errors.InvalidArgument);
        done();
    });

    it('should return error if requestType set forth in ' +
        'credential param is not aws4_request', done => {
        const alteredRequest = createAlteredRequest({
            'x-amz-credential':
                    `accessKey1/${formatDate(requestDate).split('T')[0]}/us-east-1/s3/aws2_request`,
        },
        'formData', request, formData);
        const res = formAuthCheck(alteredRequest, log, alteredRequest.formData);
        assert.deepStrictEqual(res.err, errors.InvalidArgument);
        done();
    });

    it('should return error if undefined x-amz-signature param', done => {
        const alteredRequest = createAlteredRequest({
            'x-amz-signature':
                undefined,
        }, 'formData', request, formData);
        const res = formAuthCheck(alteredRequest, log, alteredRequest.formData);
        assert.deepStrictEqual(res.err, errors.InvalidArgument);
        done();
    });

    it('should return error if undefined x-amz-date param', done => {
        const alteredRequest = createAlteredRequest({
            'x-amz-date':
                undefined,
        }, 'formData', request, formData);
        const res = formAuthCheck(alteredRequest, log, alteredRequest.formData);
        assert.deepStrictEqual(res.err, errors.InvalidArgument);
        done();
    });

    it('should return error if expiration param is too old', done => {
        const expiredDate = new Date(Date.now() - 30 * 60 * 1000);

        // Update the expiration date in formData
        const alteredFormData = Object.assign({}, formData, {
            policy: `${btoa(JSON.stringify(prepPolicy(formData, expiredDate)))}`,
        });

        // Assuming alteredRequest is the request object that includes formData
        const alteredRequest = Object.assign({}, request, {
            formData: alteredFormData,
        });

        const res = formAuthCheck(alteredRequest, log, alteredRequest.formData);
        assert.deepStrictEqual(res.err, errors.AccessDenied);
        done();
    });

    it('should return error if scope date from x-amz-credential param' +
        'does not match date from x-amz-date param', done => {
        const clock = fakeTimers.install({ now: 1454974984001 });
        const alteredRequest = createAlteredRequest({
            'x-amz-credential': 'accessKey1/20160209/' +
                    'us-east-1/s3/aws4_request',
        }, 'formData', request, formData);
        const res = formAuthCheck(alteredRequest, log, alteredRequest.formData);
        clock.uninstall();
        assert.deepStrictEqual(res.err, errors.RequestTimeTooSkewed);
        done();
    });

    it('should successfully return v4 and no error', done => {
        // Freezes time so date created within function will be Feb 8, 2016
        // (within 15 minutes of timestamp in request)
        const clock = fakeTimers.install({ now: 1454974984001 });
        const res = formAuthCheck(request, log, request.formData);
        clock.uninstall();
        assert.deepStrictEqual(res.err, null);
        assert.strictEqual(res.params.version, 4);
        done();
    });
});
