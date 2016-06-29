'use strict'; // eslint-disable-line strict

const errors = require('../errors');
const queryString = require('querystring');
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

function setAuthHandler(handler) {
    vault = handler;
    return auth;
}

/**
 * This function will check validity of request parameters to authenticate
 *
 * @param {Http.Request} request - Http request object
 * @param {object} log - Logger object
 * @param {string} awsService - Aws service related
 * @param {object} data - Parameters from queryString parsing or body of
 *      POST request
 * @return {object} Return object with information to authenticate
 */
function checkSignature(request, log, awsService, data) {
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
            return authV4.headerAuthCheck.check(request, log, data,
                awsService);
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
}

function doAuth(request, log, cb, awsService, requestContexts) {
    const res = checkSignature(request, log, awsService, request.query);
    requestContexts.forEach(requestContext => {
        requestContext.setAuthType(res.authType);
        requestContext.setSignatureVersion(res.signatureVersion);
        requestContext.setSignatureAge(res.signatureAge);
    });
    if (res.err) {
        return cb(res.err);
    } else if (res.version === 2) {
        return vault.authenticateV2Request(res.data.accessKey,
            res.data.signatureFromRequest,
            res.data.stringToSign, res.data.algo, requestContexts,
            log, cb);
    } else if (res.version === 4) {
        res.data.log = log;
        return vault.authenticateV4Request(res.data, requestContexts,
            cb, awsService);
    } else if (res.data instanceof AuthInfo) {
        return cb(null, res.data);
    }
    log.error('authentication method not found', {
        method: 'Arsenal.auth.doAuth',
    });
    return cb(errors.InternalError);
}


/**
 * This function will generate a version 4 header
 *
 * @param {Http.Request} request - Http request object
 * @param {object} data - Parameters from queryString parsing or body of
 *                        POST request
 * @param {string} accessKey - the accessKey
 * @param {string} secretKeyValue - the secretKey
 * @param {string} awsService - Aws service related
 * @return {undefined}
 */
function generateV4Headers(request, data, accessKey, secretKeyValue,
                           awsService) {
    Object.assign(request, { headers: {} });
    const amzDate = convertUTCtoISO8601(Date.now());
    // get date without time
    const scopeDate = amzDate.slice(0, amzDate.indexOf('T'));
    const region = 'us-east-1';
    const service = awsService || 'iam';
    const credentialScope =
        `${scopeDate}/${region}/${service}/aws4_request`;
    const timestamp = amzDate;
    const algorithm = 'AWS4-HMAC-SHA256';

    let payload = '';
    if (request.method === 'POST') {
        payload = queryString.stringify(data, null, null, {
            encodeURIComponent,
        });
    }
    const payloadChecksum = crypto.createHash('sha256').update(payload)
                                  .digest('hex');
    request.setHeader('host', request._headers.host);
    request.setHeader('x-amz-date', amzDate);
    request.setHeader('x-amz-content-sha256', payloadChecksum);
    Object.assign(request.headers, request._headers);
    const signedHeaders = Object.keys(request._headers)
        .filter(headerName =>
            headerName.startsWith('x-amz-')
            || headerName.startsWith('x-scal-')
            || headerName === 'host'
        ).sort().join(';');
    const params = { request, signedHeaders, payloadChecksum,
                     credentialScope, timestamp, query: data,
                     awsService: service };
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
}

module.exports = {
    setHandler: setAuthHandler,
    server: {
        checkSignature,
        doAuth,
    },
    client: {
        generateV4Headers,
    },
};
