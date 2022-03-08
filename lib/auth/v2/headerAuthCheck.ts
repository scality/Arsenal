'use strict'; // eslint-disable-line strict

const errors = require('../../errors');
const constants = require('../../constants');
const constructStringToSign = require('./constructStringToSign');
const checkRequestExpiry = require('./checkRequestExpiry');
const algoCheck = require('./algoCheck');

function check(request, log, data) {
    log.trace('running header auth check');
    const headers = request.headers;

    const token = headers['x-amz-security-token'];
    if (token && !constants.iamSecurityToken.pattern.test(token)) {
        log.debug('invalid security token', { token });
        return { err: errors.InvalidToken };
    }

    // Check to make sure timestamp is within 15 minutes of current time
    let timestamp = headers['x-amz-date'] ?
        headers['x-amz-date'] : headers.date;
    timestamp = Date.parse(timestamp);
    if (!timestamp) {
        log.debug('missing or invalid date header',
        { method: 'auth/v2/headerAuthCheck.check' });
        return { err: errors.AccessDenied.
          customizeDescription('Authentication requires a valid Date or ' +
          'x-amz-date header') };
    }

    const err = checkRequestExpiry(timestamp, log);
    if (err) {
        return { err };
    }

    // Authorization Header should be
    // in the format of 'AWS AccessKey:Signature'
    const authInfo = headers.authorization;

    if (!authInfo) {
        log.debug('missing authorization security header');
        return { err: errors.MissingSecurityHeader };
    }
    const semicolonIndex = authInfo.indexOf(':');
    if (semicolonIndex < 0) {
        log.debug('invalid authorization header', { authInfo });
        return { err: errors.InvalidArgument };
    }
    const accessKey = semicolonIndex > 4 ?
        authInfo.substring(4, semicolonIndex).trim() : undefined;
    if (typeof accessKey !== 'string' || accessKey.length === 0) {
        log.trace('invalid authorization header', { authInfo });
        return { err: errors.MissingSecurityHeader };
    }
    log.addDefaultFields({ accessKey });

    const signatureFromRequest = authInfo.substring(semicolonIndex + 1).trim();
    log.trace('signature from request', { signatureFromRequest });
    const stringToSign = constructStringToSign(request, data, log);
    log.trace('constructed string to sign', { stringToSign });
    const algo = algoCheck(signatureFromRequest.length);
    log.trace('algo for calculating signature', { algo });
    if (algo === undefined) {
        return { err: errors.InvalidArgument };
    }
    return {
        err: null,
        params: {
            version: 2,
            data: {
                accessKey,
                signatureFromRequest,
                stringToSign,
                algo,
                authType: 'REST-HEADER',
                signatureVersion: 'AWS',
                signatureAge: Date.now() - timestamp,
                securityToken: token,
            },
        },
    };
}

module.exports = { check };
