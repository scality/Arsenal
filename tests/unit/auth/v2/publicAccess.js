'use strict'; // eslint-disable-line strict

const assert = require('assert');

const errors = require('../../../../lib/errors');
const auth = require('../../../../lib/auth/auth').server.doAuth;
const AuthInfo = require('../../../../lib/auth/AuthInfo');
const constants = require('../../../../lib/constants');
const DummyRequestLogger = require('../../helpers.js').DummyRequestLogger;
const RequestContext =
    require('../../../../lib/policyEvaluator/RequestContext.js');

const logger = new DummyRequestLogger();

describe('Public Access', () => {
    it('should grant access to a user that provides absolutely' +
        'no authentication information and should assign that user the ' +
        'All Users Group accessKey', done => {
        const request = {
            method: 'GET',
            headers: { host: 's3.amazonaws.com' },
            url: '/bucket',
            query: {},
        };
        const singleRequstContext = new RequestContext(request.headers,
            request.query, request.bucketName, request.objectKey,
            undefined, undefined,
            'bucketGet', 's3');
        const requestContext = [singleRequstContext, singleRequstContext];
        const publicAuthInfo = new AuthInfo({
            canonicalID: constants.publicId,
        });
        auth(request, logger, (err, authInfo) => {
            assert.strictEqual(err, null);
            assert.strictEqual(authInfo.getCanonicalID(),
                               publicAuthInfo.getCanonicalID());
            done();
        }, 's3', requestContext);
    });

    it('should not grant access to a request that contains ' +
    'an authorization header without proper credentials', done => {
        const request = {
            method: 'GET',
            headers: {
                host: 's3.amazonaws.com',
                authorization: 'noAuth',
            },
            url: '/bucket',
            query: {},
        };
        const requestContext = [new RequestContext(request.headers,
            request.query, request.bucketName, request.objectKey,
            undefined, undefined,
            'bucketGet', 's3')];
        auth(request, logger, err => {
            assert.deepStrictEqual(err, errors.AccessDenied);
            done();
        }, 's3', requestContext);
    });
});
