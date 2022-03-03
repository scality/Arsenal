import * as crypto from 'crypto';
import { Logger } from 'werelogs';
import errors from '../errors';
import * as queryString from 'querystring';
import AuthInfo from './AuthInfo';
import * as v2 from './v2/authV2';
import * as v4 from './v4/authV4';
import * as constants from '../constants';
import constructStringToSignV2 from './v2/constructStringToSign';
import constructStringToSignV4 from './v4/constructStringToSign';
import { convertUTCtoISO8601 } from './v4/timeUtils';
import * as vaultUtilities from './in_memory/vaultUtilities';
import * as backend from './in_memory/Backend';
import validateAuthConfig from './in_memory/validateAuthConfig';
import AuthLoader from './in_memory/AuthLoader';
import Vault from './Vault';

let vault: Vault | null = null;
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

function setAuthHandler(handler: Vault) {
    vault = handler;
    return auth;
}

/**
 * This function will check validity of request parameters to authenticate
 *
 * @param request - Http request object
 * @param log - Logger object
 * @param awsService - Aws service related
 * @param data - Parameters from queryString parsing or body of
 *      POST request
 *
 * @return ret
 * @return ret.err - arsenal.errors object if any error was found
 * @return ret.params - auth parameters to use later on for signature
 *                               computation and check
 * @return ret.params.version - the auth scheme version
 *                                       (undefined, 2, 4)
 * @return ret.params.data - the auth scheme's specific data
 */
function extractParams(
    request: any,
    log: Logger,
    awsService: string,
    data: { [key: string]: string }
) {
    log.trace('entered', { method: 'Arsenal.auth.server.extractParams' });
    const authHeader = request.headers.authorization;
    let version: 'v2' |'v4' | null = null;
    let method: 'query' | 'headers' | null = null;

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
 * @param request - Http request object
 * @param log - Logger object
 * @param cb - the callback
 * @param awsService - Aws service related
 * @param {RequestContext[] | null} requestContexts - array of RequestContext
 * or null if no requestContexts to be sent to Vault (for instance,
 * in multi-object delete request)
 */
function doAuth(
    request: any,
    log: Logger,
    cb: (err: Error | null, data?: any) => void,
    awsService: string,
    requestContexts: any[] | null
) {
    const res = extractParams(request, log, awsService, request.query);
    if (res.err) {
        return cb(res.err);
    } else if (res.params instanceof AuthInfo) {
        return cb(null, res.params);
    }
    if (requestContexts) {
        requestContexts.forEach((requestContext) => {
            const { params } = res
            if ('data' in params) {
                const { data } = params
                requestContext.setAuthType(data.authType);
                requestContext.setSignatureVersion(data.signatureVersion);
                requestContext.setSecurityToken(data.securityToken);
                if ('signatureAge' in data) {
                    requestContext.setSignatureAge(data.signatureAge);
                }
            }
        });
    }

    // Corner cases managed, we're left with normal auth
    // TODO What's happening here?
    // @ts-ignore
    res.params.log = log;
    if (res.params.version === 2) {
        // @ts-ignore
        return vault!.authenticateV2Request(res.params, requestContexts, cb);
    }
    if (res.params.version === 4) {
        // @ts-ignore
        return vault!.authenticateV4Request(res.params, requestContexts, cb);
    }

    log.error('authentication method not found', {
        method: 'Arsenal.auth.doAuth',
    });
    return cb(errors.InternalError);
}

/**
 * This function will generate a version 4 header
 *
 * @param request - Http request object
 * @param data - Parameters from queryString parsing or body of
 *                        POST request
 * @param accessKey - the accessKey
 * @param secretKeyValue - the secretKey
 * @param awsService - Aws service related
 * @param [proxyPath] - path that gets proxied by reverse proxy
 * @param [sessionToken] - security token if the access/secret keys
 *                                are temporary credentials from STS
 */
function generateV4Headers(
    request: any,
    data: { [key: string]: string },
    accessKey: string,
    secretKeyValue: string,
    awsService: string,
    proxyPath: string,
    sessionToken: string
) {
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
        payload = queryString.stringify(data, undefined, undefined, {
            encodeURIComponent,
        });
    }
    const payloadChecksum = crypto.createHash('sha256')
        .update(payload, 'binary').digest('hex');
    request.setHeader('host', request._headers.host);
    request.setHeader('x-amz-date', amzDate);
    request.setHeader('x-amz-content-sha256', payloadChecksum);

    if (sessionToken) {
        request.setHeader('x-amz-security-token', sessionToken);
    }

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
        .update(stringToSign as string, 'binary').digest('hex');
    const authorizationHeader = `${algorithm} Credential=${accessKey}` +
        `/${credentialScope}, SignedHeaders=${signedHeaders}, ` +
        `Signature=${signature}`;
    request.setHeader('authorization', authorizationHeader);
    Object.assign(request, { headers: {} });
}

export const server = { extractParams, doAuth }
export const client = { generateV4Headers, constructStringToSignV2 }
export const inMemory = { backend, validateAuthConfig, AuthLoader }
export {
    setAuthHandler as setHandler,
    AuthInfo,
    Vault
}
