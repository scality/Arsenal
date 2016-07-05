'use strict'; // eslint-disable-line strict

const errors = require('../errors');
const queryString = require('querystring');
const AuthInfo = require('./AuthInfo');
const v2 = require('./v2/authV2');
const v4 = require('./v4/authV4');
const constants = require('../constants');
const constructStringToSignV4 = require('./v4/constructStringToSign');
const convertUTCtoISO8601 = require('./v4/timeUtils').convertUTCtoISO8601;
const crypto = require('crypto');
const vaultUtilities = require('./in_memory/vaultUtilities');
let vault = null;
const auth = {};

// If no auth information is provided in request, then user is part of
// 'All Users Group' so use this group as the canonicalID for the publicUser
const publicUserInfo = new AuthInfo({ canonicalID: constants.publicId });

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
    log.trace('extracting authentication signature informations');
    const authHeader = request.headers.authorization;
    const checkFunctions = {
        v2: {
            headers: v2.header.check,
            query: v2.query.check,
        },
        v4: {
            headers: v4.header.check,
            query: v4.query.check,
        },
    }
    let version = null;
    let method = null;

    // Identify auth version and method to dispatch to the right check function
    if (authHeader) {
        method = 'headers';
        // TODO: Check for security token header to handle temporary security
        // credentials
        if (authHeader.startsWith('AWS ')) {
            version = 'v2';
        } else if (authHeader.startsWith('AWS4')) {
            version = 'v4';
        } else {
            log.trace('missing authorization security header',
                      { header: authHeader });
            return { err: errors.MissingSecurityHeader };
        }
    } else if (data.Signature) {
        method = 'query';
        version = 'v2';
    } else if (data['X-Amz-Algorithm']) {
        method = 'query';
        version = 'v4';
    }

    // Here, either both values are set, or none is set
    if (version !== null && method !== null) {
        if (!checkFunctions[version] || !checkFunctions[version][method]) {
            log.trace('invalid auth version or method', { version, method });
            return { err: errors.NotImplemented };
        }
        log.trace('identified auth method', { version, method });
        return checkFunctions[version][method](request, log, data, awsService);
    }

    // no auth info identified
    log.debug('assuming public user');
    return { err: null, data: publicUserInfo };
}

function doAuth(request, log, cb, awsService, data) {
    const res = checkSignature(request, log, awsService, data);
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
}

function generateV4Headers(request, data, accessKey, secretKeyValue,
                           awsService) {
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
    const algorithm = 'AWS4-HMAC-SHA256';

    let payload = '';
    if (request.method === 'POST') {
        payload = queryString.stringify(data, null, null, {
            encodeURIComponent,
        });
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
    Object.assign(request, { path });
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
