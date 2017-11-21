'use strict'; // eslint-disable-line strict

const crypto = require('crypto');
const errors = require('../errors');
const queryString = require('querystring');
const AuthInfo = require('./AuthInfo');
const v2 = require('./v2/authV2');
const v4 = require('./v4/authV4');
const constants = require('../constants');
const constructStringToSignV2 = require('./v2/constructStringToSign');
const constructStringToSignV4 = require('./v4/constructStringToSign');
const convertUTCtoISO8601 = require('./v4/timeUtils').convertUTCtoISO8601;
const vaultUtilities = require('./in_memory/vaultUtilities');
const backend = require('./in_memory/Backend');
const validateAuthConfig = require('./in_memory/validateAuthConfig');
const AuthLoader = require('./in_memory/AuthLoader');
const Vault = require('./Vault');

let vault = null;
const auth = {};
const checkFunctions = {
    v2: {
        headers: v2.header.check,
        query: v2.query.check,
    },
    v4: {
        headers: v4.header.check,
        query: v4.query.check,
    },
};

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
 *
 * @return {object} ret
 * @return {object} ret.err - arsenal.errors object if any error was found
 * @return {object} ret.params - auth parameters to use later on for signature
 *                               computation and check
 * @return {object} ret.params.version - the auth scheme version
 *                                       (undefined, 2, 4)
 * @return {object} ret.params.data - the auth scheme's specific data
 */
function extractParams(request, log, awsService, data) {
    log.trace('entered', { method: 'Arsenal.auth.server.extractParams' });
    const authHeader = request.headers.authorization;
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
            log.trace('invalid authorization security header',
                      { header: authHeader });
            return { err: errors.AccessDenied };
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
            log.trace('invalid auth version or method',
                      { version, authMethod: method });
            return { err: errors.NotImplemented };
        }
        log.trace('identified auth method', { version, authMethod: method });
        return checkFunctions[version][method](request, log, data, awsService);
    }

    // no auth info identified
    log.debug('assuming public user');
    return { err: null, params: publicUserInfo };
}

/**
 * This function will check validity of request parameters to authenticate
 *
 * @param {Http.Request} request - Http request object
 * @param {object} log - Logger object
 * @param {function} cb - the callback
 * @param {string} awsService - Aws service related
 * @param {RequestContext[] | null} requestContexts - array of RequestContext
 * or null if no requestContexts to be sent to Vault (for instance,
 * in multi-object delete request)
 * @return {undefined}
 */
function doAuth(request, log, cb, awsService, requestContexts) {
    const res = extractParams(request, log, awsService, request.query);
    if (res.err) {
        return cb(res.err);
    } else if (res.params instanceof AuthInfo) {
        return cb(null, res.params);
    }
    if (requestContexts) {
        requestContexts.forEach(requestContext => {
            requestContext.setAuthType(res.params.data.authType);
            requestContext.setSignatureVersion(res.params
                .data.signatureVersion);
            requestContext.setSignatureAge(res.params.data.signatureAge);
            requestContext.setSecurityToken(res.params.data.securityToken);
        });
    }

    // Corner cases managed, we're left with normal auth
    res.params.log = log;
    if (res.params.version === 2) {
        return vault.authenticateV2Request(res.params, requestContexts, cb);
    }
    if (res.params.version === 4) {
        return vault.authenticateV4Request(res.params, requestContexts, cb,
            awsService);
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
 * @param {sting} [proxyPath] - path that gets proxied by reverse proxy
 * @return {undefined}
 */
function generateV4Headers(request, data, accessKey, secretKeyValue,
                           awsService, proxyPath) {
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
    const payloadChecksum = crypto.createHash('sha256')
        .update(payload, 'binary').digest('hex');
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
        awsService: service, proxyPath };
    const stringToSign = constructStringToSignV4(params);
    const signingKey = vaultUtilities.calculateSigningKey(secretKeyValue,
                                                          region,
                                                          scopeDate,
                                                          service);
    const signature = crypto.createHmac('sha256', signingKey)
        .update(stringToSign, 'binary').digest('hex');
    const authorizationHeader = `${algorithm} Credential=${accessKey}` +
        `/${credentialScope}, SignedHeaders=${signedHeaders}, ` +
        `Signature=${signature}`;
    request.setHeader('authorization', authorizationHeader);
    Object.assign(request, { headers: {} });
}

module.exports = {
    setHandler: setAuthHandler,
    server: {
        extractParams,
        doAuth,
    },
    client: {
        generateV4Headers,
        constructStringToSignV2,
    },
    inMemory: {
        backend,
        validateAuthConfig,
        AuthLoader,
    },
    AuthInfo,
    Vault,
};
