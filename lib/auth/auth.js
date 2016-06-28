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
let vault = null;
const auth = {};

auth.setAuthHandler = handler => {
    vault = handler;
    return auth;
};

auth.check = (request, log, awsService, data) => {
    log.debug('running auth checks', { method: 'auth' });
    const authHeader = request.headers.authorization;
    // Check whether signature is in header
    if (authHeader) {
        log.trace('authorization header', { authHeader });
        // TODO: Check for security token header to
        // handle temporary security credentials
        if (authHeader.startsWith('AWS ')) {
            log.trace('authenticating request with auth v2 using headers');
            return authV2.headerAuthCheck.check(request, log, data);
        } else if (authHeader.startsWith('AWS4')) {
            log.trace('authenticating request with Auth V4 using headers');
            return authV4.headerAuthCheck.check(request, log, data, awsService);
        }
        log.debug('missing authorization security header');
        return { err: errors.MissingSecurityHeader };
    } else if (data.Signature) {
        // Check whether signature is in query string
        log.trace('authenticating request with auth v2 using query string');
        return authV2.queryAuthCheck.check(request, log, data);
    } else if (data['X-Amz-Algorithm']) {
        log.trace('authenticating request with Auth v4 using query string');
        return authV4.queryAuthCheck.check(request, log, data);
    }
    // If no auth information is provided in request, then
    // user is part of 'All Users Group' so send back this
    // group as the canonicalID
    log.debug('No authentication provided. User identified as public');
    const authInfo = new AuthInfo({ canonicalID: constants.publicId });
    return { err: null, data: authInfo };
};

auth.doAuth = (request, log, cb, awsService, data) => {
    const res = auth.check(request, log, awsService, data);
    if (res.err) {
        return cb(res.err);
    } else if (res.version === 2) {
        return vault.authenticateV2Request(res.data.accessKey,
            res.data.signatureFromRequest,
            res.data.stringToSign, res.data.algo, log,
            (err, authInfo) => {
                if (err) {
                    return cb(err);
                }
                return cb(null, authInfo);
            });
    } else if (res.version === 4) {
        res.data.log = log;
        return vault.authenticateV4Request(res.data, cb, awsService);
    } else if (res.data instanceof AuthInfo) {
        return cb(null, res.data);
    }
    log.error('authentication method not found', {
        method: 'Arsenal.auth.doAuth',
    });
    return cb(errors.InternalError);
};

auth.generateV4Headers =
    (request, data, accessKey, secretKeyValue, awsService) => {
        Object.assign(request, { headers: {} });
        const amzDate = convertUTCtoISO8601(Date.now());
        // get date without time
        const scopeDate = amzDate.slice(0, amzDate.indexOf('T'));
        const signedHeaders = 'host;x-amz-date;x-amz-content-sha256';
        const region = 'us-east-1';
        const service = awsService || 'iam';
        const credentialScope =
            `${scopeDate}/${region}/${service}/aws4_request`;
        const timestamp = amzDate;
        const query = request.query || data;
        const algorithm = 'AWS4-HMAC-SHA256';

        let payload = '';
        if (request.method === 'POST') {
            const formattedData = [];
            Object.keys(data).forEach(key => {
                const formattedKey = encodeURIComponent(key);
                const formattedValue = encodeURIComponent(data[key]);
                if (formattedData.length > 0) {
                    formattedData.push('&');
                }
                formattedData.push(`${formattedKey}=${formattedValue}`);
            });
            payload = formattedData.join('');
        }
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
                                                              scopeDate,
                                                              service);
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
