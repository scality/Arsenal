'use strict'; // eslint-disable-line strict

const errors = require('../errors');

const AuthInfo = require('./AuthInfo');
const authV2 = require('./v2/authV2');
const authV4 = require('./v4/authV4');
const constants = require('../constants');

const auth = {};

auth.setAuthHandler = handler => {
    authV2.headerAuthCheck.setAuthHandler(handler);
    authV2.queryAuthCheck.setAuthHandler(handler);
    authV4.headerAuthCheck.setAuthHandler(handler);
    authV4.queryAuthCheck.setAuthHandler(handler);
    return auth;
};

auth.doAuth = (request, log, cb) => {
    log.debug('running auth checks', { method: 'auth' });
    const authHeader = request.headers.authorization;
    // Check whether signature is in header
    if (authHeader) {
        log.trace('authorization header', { authHeader });
        // TODO: Check for security token header to
        // handle temporary security credentials
        if (authHeader.startsWith('AWS ')) {
            log.trace('authenticating request with auth v2 using headers');
            authV2.headerAuthCheck.check(request, log, cb);
        } else if (authHeader.startsWith('AWS4')) {
            log.debug('authenticating request with Auth V4 using headers');
            authV4.headerAuthCheck.check(request, log, cb);
        } else {
            log.warn('missing authorization security header');
            return cb(errors.MissingSecurityHeader);
        }
    } else if (request.query.Signature) {
        // Check whether signature is in query string
        log.trace('authenticating request with auth v2 using query string');
        authV2.queryAuthCheck.check(request, log, cb);
    } else if (request.query['X-Amz-Algorithm']) {
        log.debug('authenticating request with Auth v4 using query string');
        authV4.queryAuthCheck.check(request, log, cb);
    } else {
        // If no auth information is provided in request, then
        // user is part of 'All Users Group' so send back this
        // group as the canonicalID
        log.trace('No authentication provided. User identified as public');
        const authInfo = new AuthInfo({ canonicalID: constants.publicId });
        return cb(null, authInfo);
    }
    return undefined;
};

module.exports = auth;
