'use strict'; // eslint-disable-line strict

const errors = require('../errors');

const AuthInfo = require('./AuthInfo');
const authV2 = require('./v2/authV2');
const authV4 = require('./v4/authV4');
const constants = require('../constants');
const constructStringToSignV4 = require('./v4/constructStringToSign');
const convertUTCtoISO8601 = require('./v4/timeUtils').convertUTCtoISO8601;
const crypto = require('crypto');
const vaultUtilities = require('./in_memory/vaultUtilities');


const auth = {};

auth.setAuthHandler = handler => {
    authV2.headerAuthCheck.setAuthHandler(handler);
    authV2.queryAuthCheck.setAuthHandler(handler);
    authV4.headerAuthCheck.setAuthHandler(handler);
    authV4.queryAuthCheck.setAuthHandler(handler);
    return auth;
};

auth.doAuth = (request, log, cb, awsService) => {
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
            authV4.headerAuthCheck.check(request, log, cb, awsService);
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

auth.generateV4Headers =
    (request, data, accessKey, secretKeyValue) => {
        Object.assign(request, { headers: {} });
        const amzDate = convertUTCtoISO8601(Date.now());
        // get date without time
        const scopeDate = amzDate.slice(0, amzDate.indexOf('T'));
        const signedHeaders = 'host;x-amz-date;x-amz-content-sha256';
        const region = 'us-east-1';
        const service = 'iam';
        const credentialScope =
            `${scopeDate}/${region}/${service}/aws4_request`;
        const timestamp = amzDate;
        const query = request.query || {};
        const algorithm = 'AWS4-HMAC-SHA256';

        const payload = !!data ? data : '';
        const payloadChecksum = crypto.createHash('sha256').update(payload)
                                      .digest('hex');
        const path = request.path;
        Object.assign(request, { path: '/' });

        request.setHeader('host', request._headers.host);
        request.setHeader('x-amz-date', amzDate);
        request.setHeader('x-amz-content-sha256', payloadChecksum);
        Object.assign(request.headers, { host: request.getHeader('host') });
        Object.assign(request.headers, { 'x-amz-date': amzDate });
        Object.assign(request.headers,
                      { 'x-amz-content-sha256': payloadChecksum });

        const params = { request, signedHeaders, payloadChecksum,
                         credentialScope, timestamp, query };
        const stringToSign = constructStringToSignV4(params);
        const signingKey = vaultUtilities.calculateSigningKey(secretKeyValue,
                                                              region,
                                                              scopeDate);
        const signature = crypto.createHmac('sha256', signingKey)
                            .update(stringToSign).digest('hex');
        const authorizationHeader = `${algorithm} Credential=${accessKey}` +
            `/${credentialScope}, SignedHeaders=${signedHeaders}, ` +
            `Signature=${signature}`;
        request.setHeader('authorization', authorizationHeader);
        Object.assign(request, { headers: {} });
        Object.assign(request, { path });
    };

module.exports = auth;
