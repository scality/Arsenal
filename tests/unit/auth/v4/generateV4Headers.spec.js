'use strict'; // eslint-disable-line strict

const assert = require('assert');
const crypto = require('crypto');
const http = require('http');
const querystring = require('querystring');

const { generateV4Headers } = require('../../../../lib/auth/auth').client;

const host = 'localhost:8000';
const token = 'token';
const data = 'data';

const sha256hex = payload => crypto.createHash('sha256').update(payload, 'binary').digest('hex');

describe('v4 header generation', () => {
    it('should add x-amz-security-token if needed', done => {
        const req = new http.OutgoingMessage();
        req.setHeader('host', host);

        generateV4Headers(req, data, 'accessKey', 'secretKey', 'iam', null, token);

        try {
            assert.deepStrictEqual(req.getHeader('x-amz-security-token'), token);
            return done();
        } catch (err) {
            return done(err);
        }
    });

    it('should not add x-amz-security-token by default', done => {
        const req = new http.OutgoingMessage();
        req.setHeader('host', host);

        generateV4Headers(req, data, 'accessKey', 'secretKey', 'iam');

        try {
            assert.deepStrictEqual(req.getHeader('x-amz-security-token'), undefined);
            return done();
        } catch (err) {
            return done(err);
        }
    });

    it('should sign the querystring-encoded data for a POST with no payload', () => {
        const req = new http.OutgoingMessage();
        req.method = 'POST';
        req.setHeader('host', host);
        const postData = { Action: 'ListMetrics', Version: '20160815' };

        generateV4Headers(req, postData, 'accessKey', 'secretKey', 's3');

        const expected = sha256hex(
            querystring.stringify(postData, undefined, undefined, {
                encodeURIComponent,
            }),
        );
        assert.strictEqual(req.getHeader('x-amz-content-sha256'), expected);
    });

    it('should sign the explicit payload for a POST when one is provided', () => {
        const req = new http.OutgoingMessage();
        req.method = 'POST';
        req.setHeader('host', host);
        const body = '<Delete><Object><Key>foo</Key></Object></Delete>';

        generateV4Headers(req, { delete: '' }, 'accessKey', 'secretKey', 's3', null, null, body);

        assert.strictEqual(req.getHeader('x-amz-content-sha256'), sha256hex(body));
    });

    it('should sign an empty body for a POST with an explicit empty payload', () => {
        const req = new http.OutgoingMessage();
        req.method = 'POST';
        req.setHeader('host', host);

        generateV4Headers(req, { uploads: '' }, 'accessKey', 'secretKey', 's3', null, null, '');

        assert.strictEqual(req.getHeader('x-amz-content-sha256'), sha256hex(''));
    });

    it('should sign the explicit payload for a non-POST request', () => {
        const req = new http.OutgoingMessage();
        req.method = 'PUT';
        req.setHeader('host', host);
        const body = 'some-object-body';

        generateV4Headers(req, {}, 'accessKey', 'secretKey', 's3', null, null, body);

        assert.strictEqual(req.getHeader('x-amz-content-sha256'), sha256hex(body));
    });
});
