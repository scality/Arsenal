'use strict'; // eslint-disable-line strict

const assert = require('assert');
const http = require('http');

const { generateV4Headers } = require('../../../../lib/auth/auth').client;

const host = 'localhost:8000';
const headers = {
    host,
};
const token = 'token';
const data = 'data';

describe('v4 header generation', () => {
    it('should add x-amz-security-token if needed', done => {
        const req = http.request({ headers });

        generateV4Headers(req, data, 'accessKey', 'secretKey', 'iam', null, token);

        try {
            assert.deepStrictEqual(req.getHeader('x-amz-security-token'), token);
            return done();
        } catch (err) {
            return done(err);
        }
    });

    it('should add x-amz-security-token if needed (POST case)', done => {
        const req = http.request({
            method: 'POST',
            headers,
        });

        generateV4Headers(req, data, 'accessKey', 'secretKey', 'iam', null, token);

        try {
            assert.deepStrictEqual(req.getHeader('x-amz-security-token'), token);
            return done();
        } catch (err) {
            return done(err);
        }
    });

    it('should not add x-amz-security-token by default', done => {
        const req = http.request({ headers });

        generateV4Headers(req, data, 'accessKey', 'secretKey', 'iam');

        try {
            assert.deepStrictEqual(req.getHeader('x-amz-security-token'), undefined);
            return done();
        } catch (err) {
            return done(err);
        }
    });
});
