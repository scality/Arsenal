import { Logger } from 'werelogs';
import errors from '../errors';
import AuthInfo from './AuthInfo';

/** vaultSignatureCb parses message from Vault and instantiates
 * @param err - error from vault
 * @param authInfo - info from vault
 * @param log - log for request
 * @param callback - callback to authCheck functions
 * @param [streamingV4Params] - present if v4 signature;
 * items used to calculate signature on chunks if streaming auth
 */
function vaultSignatureCb(
    err: Error | null,
    authInfo: { message: { body: any } },
    log: Logger,
    callback: (err: Error | null, data?: any, results?: any, params?: any) => void,
    streamingV4Params?: any
) {
    // vaultclient API guarantees that it returns:
    // - either `err`, an Error object with `code` and `message` properties set
    // - or `err == null` and `info` is an object with `message.code` and
    //   `message.message` properties set.
    if (err) {
        log.debug('received error message from auth provider',
            { errorMessage: err });
        return callback(err);
    }
    log.debug('received info from Vault', { authInfo });
    const info = authInfo.message.body;
    const userInfo = new AuthInfo(info.userInfo);
    const authorizationResults = info.authorizationResults;
    const auditLog: { accountDisplayName: string, IAMdisplayName?: string } =
        { accountDisplayName: userInfo.getAccountDisplayName() };
    const iamDisplayName = userInfo.getIAMdisplayName();
    if (iamDisplayName) {
        auditLog.IAMdisplayName = iamDisplayName;
    }
    // @ts-ignore
    log.addDefaultFields(auditLog);
    return callback(null, userInfo, authorizationResults, streamingV4Params);
}


/**
 * Class that provides common authentication methods against different
 * authentication backends.
 * @class Vault
 */
export default class Vault {
    client: any;
    implName: string;

    /**
     * @constructor
     * @param {object} client - authentication backend or vault client
     * @param {string} implName - implementation name for auth backend
     */
    constructor(client: any, implName: string) {
        this.client = client;
        this.implName = implName;
    }
    /**
     * authenticateV2Request
     *
     * @param params - the authentication parameters as returned by
     *                          auth.extractParams
     * @param params.version - shall equal 2
     * @param params.data.accessKey - the user's accessKey
     * @param params.data.signatureFromRequest - the signature read
     *                                                    from the request
     * @param params.data.stringToSign - the stringToSign
     * @param params.data.algo - the hashing algorithm used for the
     *                                    signature
     * @param params.data.authType - the type of authentication (query
     *                                        or header)
     * @param params.data.signatureVersion - the version of the
     *                                                signature (AWS or AWS4)
     * @param [params.data.signatureAge] - the age of the signature in
     *                                              ms
     * @param params.data.log - the logger object
     * @param {RequestContext []} requestContexts - an array of RequestContext
     * instances which contain information for policy authorization check
     * @param callback - callback with either error or user info
     */
    authenticateV2Request(
        params: {
            version: 2;
            log: Logger;
            data: {
                securityToken: string;
                accessKey: string;
                signatureFromRequest: string;
                stringToSign: string;
                algo: string;
                authType: 'query' | 'header';
                signatureVersion: string;
                signatureAge?: number;
                log: Logger;
            };
        },
        requestContexts: any[],
        callback: (err: Error | null, data?: any) => void
    ) {
        params.log.debug('authenticating V2 request');
        let serializedRCsArr: any;
        if (requestContexts) {
            serializedRCsArr = requestContexts.map(rc => rc.serialize());
        }
        this.client.verifySignatureV2(
            params.data.stringToSign,
            params.data.signatureFromRequest,
            params.data.accessKey,
            {
                algo: params.data.algo,
                // @ts-ignore
                reqUid: params.log.getSerializedUids(),
                logger: params.log,
                securityToken: params.data.securityToken,
                requestContext: serializedRCsArr,
            },
            (err: Error | null, userInfo?: any) => vaultSignatureCb(err, userInfo,
                params.log, callback),
        );
    }

    /** authenticateV4Request
     * @param params - the authentication parameters as returned by
     *                          auth.extractParams
     * @param params.version - shall equal 4
     * @param params.data.log - the logger object
     * @param params.data.accessKey - the user's accessKey
     * @param params.data.signatureFromRequest - the signature read
     *                                                    from the request
     * @param params.data.region - the AWS region
     * @param params.data.stringToSign - the stringToSign
     * @param params.data.scopeDate - the timespan to allow the request
     * @param params.data.authType - the type of authentication (query
     *                                        or header)
     * @param params.data.signatureVersion - the version of the
     *                                                signature (AWS or AWS4)
     * @param params.data.signatureAge - the age of the signature in ms
     * @param params.data.timestamp - signaure timestamp
     * @param params.credentialScope - credentialScope for signature
     * @param {RequestContext [] | null} requestContexts -
     * an array of RequestContext or null if authenticaiton of a chunk
     * in streamingv4 auth
     * instances which contain information for policy authorization check
     * @param callback - callback with either error or user info
    */
    authenticateV4Request(
        params: {
            version: 4;
            log: Logger;
            data: {
                accessKey: string;
                signatureFromRequest: string;
                region: string;
                stringToSign: string;
                scopeDate: string;
                authType: 'query' | 'header';
                signatureVersion: string;
                signatureAge?: number;
                timestamp: number;
                credentialScope: string;
                securityToken: string;
                algo: string;
                log: Logger;
            };
        },
        requestContexts: any[],
        callback: (err: Error | null, data?: any) => void
    ) {
        params.log.debug('authenticating V4 request');
        let serializedRCs: any;
        if (requestContexts) {
            serializedRCs = requestContexts.map(rc => rc.serialize());
        }
        const streamingV4Params = {
            accessKey: params.data.accessKey,
            signatureFromRequest: params.data.signatureFromRequest,
            region: params.data.region,
            scopeDate: params.data.scopeDate,
            timestamp: params.data.timestamp,
            credentialScope: params.data.credentialScope };
        this.client.verifySignatureV4(
            params.data.stringToSign,
            params.data.signatureFromRequest,
            params.data.accessKey,
            params.data.region,
            params.data.scopeDate,
            {
                // @ts-ignore
                reqUid: params.log.getSerializedUids(),
                logger: params.log,
                securityToken: params.data.securityToken,
                requestContext: serializedRCs,
            },
            (err: Error | null, userInfo?: any) => vaultSignatureCb(err, userInfo,
                params.log, callback, streamingV4Params),
        );
    }

    /** getCanonicalIds -- call Vault to get canonicalIDs based on email
     * addresses
     * @param emailAddresses - list of emailAddresses
     * @param log - log object
     * @param callback - callback with either error or an array
     * of objects with each object containing the canonicalID and emailAddress
     * of an account as properties
    */
    getCanonicalIds(
        emailAddresses: string[],
        log: Logger,
        callback: (
            err: Error | null,
            data?: { canonicalID: string; email: string }[]
        ) => void
    ) {
        log.trace('getting canonicalIDs from Vault based on emailAddresses',
            { emailAddresses });
        this.client.getCanonicalIds(emailAddresses,
            // @ts-ignore
            { reqUid: log.getSerializedUids() },
            (err: Error | null, info?: any) => {
                if (err) {
                    log.debug('received error message from auth provider',
                        { errorMessage: err });
                    return callback(err);
                }
                const infoFromVault = info.message.body;
                log.trace('info received from vault', { infoFromVault });
                const foundIds: { canonicalID: string; email: string }[] = [];
                for (let i = 0; i < Object.keys(infoFromVault).length; i++) {
                    const key = Object.keys(infoFromVault)[i];
                    if (infoFromVault[key] === 'WrongFormat'
                    || infoFromVault[key] === 'NotFound') {
                        return callback(errors.UnresolvableGrantByEmailAddress);
                    }
                    foundIds.push({
                        email: key,
                        canonicalID: infoFromVault[key],
                    })
                }
                return callback(null, foundIds);
            });
    }

    /** getEmailAddresses -- call Vault to get email addresses based on
     * canonicalIDs
     * @param canonicalIDs - list of canonicalIDs
     * @param log - log object
     * @param callback - callback with either error or an object
     * with canonicalID keys and email address values
    */
    getEmailAddresses(
        canonicalIDs: string[],
        log: Logger,
        callback: (err: Error | null, data?: { [key: string]: any }) => void
    ) {
        log.trace('getting emailAddresses from Vault based on canonicalIDs',
            { canonicalIDs });
        this.client.getEmailAddresses(canonicalIDs,
            // @ts-ignore
            { reqUid: log.getSerializedUids() },
            (err: Error | null, info?: any) => {
                if (err) {
                    log.debug('received error message from vault',
                        { errorMessage: err });
                    return callback(err);
                }
                const infoFromVault = info.message.body;
                log.trace('info received from vault', { infoFromVault });
                const result = {};
                /* If the email address was not found in Vault, do not
                send the canonicalID back to the API */
                Object.keys(infoFromVault).forEach(key => {
                    if (infoFromVault[key] !== 'NotFound' &&
                    infoFromVault[key] !== 'WrongFormat') {
                        result[key] = infoFromVault[key];
                    }
                });
                return callback(null, result);
            });
    }

    /** getAccountIds -- call Vault to get accountIds based on
     * canonicalIDs
     * @param canonicalIDs - list of canonicalIDs
     * @param log - log object
     * @param callback - callback with either error or an object
     * with canonicalID keys and accountId values
    */
    getAccountIds(
        canonicalIDs: string[],
        log: Logger,
        callback: (err: Error | null, data?: { [key: string]: string }) => void
    ) {
        log.trace('getting accountIds from Vault based on canonicalIDs',
        { canonicalIDs });
        this.client.getAccountIds(canonicalIDs,
            // @ts-expect-error
            { reqUid: log.getSerializedUids() },
            (err: Error | null, info?: any) => {
                if (err) {
                    log.debug('received error message from vault',
                        { errorMessage: err });
                    return callback(err);
                }
                const infoFromVault = info.message.body;
                log.trace('info received from vault', { infoFromVault });
                const result = {};
                /* If the accountId was not found in Vault, do not
            send the canonicalID back to the API */
            Object.keys(infoFromVault).forEach(key => {
                if (infoFromVault[key] !== 'NotFound' &&
                infoFromVault[key] !== 'WrongFormat') {
                    result[key] = infoFromVault[key];
                }
            });
            return callback(null, result);
        });
    }

    /** checkPolicies -- call Vault to evaluate policies
     * @param {object} requestContextParams - parameters needed to construct
     * requestContext in Vault
     * @param {object} requestContextParams.constantParams - params that have
     * the same value for each requestContext to be constructed in Vault
     * @param {object} requestContextParams.paramaterize - params that have
     * arrays as values since a requestContext needs to be constructed with
     * each option in Vault
     * @param {string} userArn - arn of requesting user
     * @param {object} log - log object
     * @param {function} callback - callback with either error or an array
     * of authorization results
    */
    checkPolicies(
        requestContextParams: any[],
        userArn: string,
        log: Logger,
        callback: (err: Error | null, data?: any[]) => void
    ) {
        log.trace('sending request context params to vault to evaluate' +
        'policies');
        this.client.checkPolicies(requestContextParams, userArn, {
            // @ts-ignore
            reqUid: log.getSerializedUids(),
        }, (err: Error | null, info?: any) => {
            if (err) {
                log.debug('received error message from auth provider',
                    { error: err });
                return callback(err);
            }
            const result = info.message.body;
            return callback(null, result);
        });
    }

    checkHealth(log: Logger, callback: (err: Error | null, data?: any) => void) {
        if (!this.client.healthcheck) {
            const defResp = {};
            defResp[this.implName] = { code: 200, message: 'OK' };
            return callback(null, defResp);
        }
        // @ts-ignore
        return this.client.healthcheck(log.getSerializedUids(), (err: Error | null, obj?: any) => {
            const respBody = {};
            if (err) {
                log.debug(`error from ${this.implName}`, { error: err });
                respBody[this.implName] = {
                    error: err,
                };
                // error returned as null so async parallel doesn't return
                // before all backends are checked
                return callback(null, respBody);
            }
            respBody[this.implName] = {
                code: 200,
                message: 'OK',
                body: obj,
            };
            return callback(null, respBody);
        });
    }
}
