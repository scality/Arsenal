import { RequestLogger } from 'werelogs';
import errors from '../errors';
import AuthInfo, { AccountInfos, AuthInfoType, AuthorizationResults,
    AuthV4Results, AccountCanonicalInfo } from './AuthInfo';
import { ArsenalCallback } from '../types';
import RequestContext from '../policyEvaluator/RequestContext';

/** vaultSignatureCb parses message from Vault and instantiates
 * @param err - error from vault
 * @param authInfo - info from vault
 * @param log - log for request
 * @param callback - callback to authCheck functions
 * @param [streamingV4Params] - present if v4 signature;
 * items used to calculate signature on chunks if streaming auth
 */
export function vaultSignatureCb(
    err: Error | null,
    authInfo: {
        message: {
            message: string,
            body: AuthV4Results,
        },
    },
    log: RequestLogger,
    callback: (
        err: Error | null,
        data?: AuthInfoType,
        results?: AuthorizationResults,
        params?: any,
        infos?: AccountInfos,
    ) => void,
    streamingV4Params?: any
) {
    console.log("FFFFF 10 vaultSignatureCb err", err);
    console.log("FFFFF 11 vaultSignatureCb authInfo", authInfo);
    // vaultclient API guarantees that it returns:
    // - either `err`, an Error object with `code` and `message` properties set
    // - or `err == null` and `info` is an object with `message.code` and
    //   `message.message` properties set.
    if (err) {
        log.debug('received error message from auth provider',
            { errorMessage: err });
        return callback(err);
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { email: _, ...userInfoWithoutEmail } = authInfo.message.body.userInfo;
    log.debug('received info from Vault', {
        message: authInfo.message.message,
        body: {
            ...authInfo.message.body,
            userInfo: userInfoWithoutEmail,
        },
    });

    const info = authInfo.message.body as AuthV4Results;
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
    return callback(null, userInfo, authorizationResults, streamingV4Params, {
        accountQuota: info.accountQuota || {},
    });
}
export type AuthV2RequestParams = {
    version: 2;
    log: RequestLogger;
    data: {
        accessKey: string;
        algo: 'sha1' | 'sha256';
        authType: 'query' | 'header' | 'REST-HEADER' | 'REST-QUERY-STRING';
        securityToken?: string;
        signatureAge?: number;
        signatureFromRequest: string;
        signatureVersion: string;
        stringToSign: string;
    };
};

export type AuthV4RequestParams = {
    version: 4;
    log: RequestLogger;
    data: {
        accessKey: string;
        algo?: 'sha1' | 'sha256';
        authType?: 'query' | 'header' | 'REST-HEADER' | 'REST-QUERY-STRING';
        credentialScope?: string;
        region: string;
        scopeDate: string;
        securityToken?: string;
        service?: string;
        signatureVersion?: string;
        signatureAge?: number;
        signatureFromRequest: string;
        stringToSign: string;
        timestamp?: string;
    };
};

export type AuthenticationOptions = {
    algo?: 'sha1' | 'sha256'; // for v2 auth
    reqUid?: string;
    get?: boolean;
    logger?: RequestLogger;
    requestContext?: RequestContext;
    securityToken?: string;
};

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
        params: AuthV2RequestParams,
        requestContexts: RequestContext[] | null,
        callback: (err: Error | null, data?: any) => void
    ) {
        console.log("FFFFF 31", params)

        params.log.debug('authenticating V2 request');
        let serializedRCsArr;
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
            (err: Error | null, userInfo?: any) => {
                console.log("FFFFF 32 authenticateV2Request callback err", err);
                console.log("FFFFF 33 authenticateV2Request callback userInfo", userInfo);
                vaultSignatureCb(err, userInfo,
                params.log, callback);
            },
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
     * @param options - options for authentication
     * @param callback - callback with either error or user info
    */
    authenticateV4Request(
        params: AuthV4RequestParams,
        requestContexts: RequestContext[] | null,
        options: AuthenticationOptions = {},
        callback: (err: Error | null, data?: any) => void,
    ) {
        console.log("FFFFF 41", params)
        console.log("FFFFF 41.2", params.data)
        params.log.debug('authenticating V4 request');
        let serializedRCs;
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
            
        console.log("FFFFF 41.3", this.client);
        console.log("FFFFF 41.4", this.client?.constructor?.name);
        
        this.client.verifySignatureV4(
            params.data.stringToSign,
            params.data.signatureFromRequest,
            params.data.accessKey,
            params.data.region,
            params.data.scopeDate,
            {
                ...options,
                // @ts-ignore
                reqUid: params.log.getSerializedUids(),
                logger: params.log,
                securityToken: params.data.securityToken,
                requestContext: serializedRCs,
            },
            (err: Error | null, userInfo?: any) => {
                console.log("FFFFF 42 authenticateV4Request callback err", err);
                console.log("FFFFF 43 authenticateV4Request callback userInfo", userInfo);
                vaultSignatureCb(err, userInfo,
                params.log, callback, streamingV4Params);
            },
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
        log: RequestLogger,
        callback: (
            err: Error | null,
            data?: { canonicalID: string; email: string }[]
        ) => void
    ) {
        console.log("FFFFF 51 getCanonicalIds emailAddresses", emailAddresses);
        log.trace('getting canonicalIDs from Vault based on emailAddresses');
        this.client.getCanonicalIds(emailAddresses,
            // @ts-ignore
            { reqUid: log.getSerializedUids() },
            (err: Error | null, info?: any) => {
                console.log("FFFFF 52 getCanonicalIds callback err", err);
                console.log("FFFFF 53 getCanonicalIds callback info", info);
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
                    });
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
        log: RequestLogger,
        callback: (err: Error | null, data?: Record<string, any>) => void
    ) {
        console.log("FFFFF 61 getEmailAddresses canonicalIDs", canonicalIDs);
        log.trace('getting emailAddresses from Vault based on canonicalIDs',
            { canonicalIDs });
        this.client.getEmailAddresses(canonicalIDs,
            // @ts-ignore
            { reqUid: log.getSerializedUids() },
            (err: Error | null, info?: any) => {
                console.log("FFFFF 62 getEmailAddresses callback err", err);
                console.log("FFFFF 63 getEmailAddresses callback info", info);
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
        log: RequestLogger,
        callback: (err: Error | null, data?: Record<string, string>) => void
    ) {
        console.log("FFFFF 71 getAccountIds canonicalIDs", canonicalIDs);
        log.trace('getting accountIds from Vault based on canonicalIDs',
            { canonicalIDs });
        this.client.getAccountIds(canonicalIDs,
            { reqUid: log.getSerializedUids() },
            (err: Error | null, info?: any) => {
                console.log("FFFFF 72 getAccountIds callback err", err);
                console.log("FFFFF 73 getAccountIds callback info", info);
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

    /**
     * A getter for account canonical IDs given a list of account IDs
     * @param accountIds - list of account IDs
     * @param log - log object
     * @param callback - callback function
     * @returns callback with either error or an object from Vault
     * containing canonicalID and display name for each account ID
     */
    getCanonicalIdsByAccountIds(
        accountIds: string[],
        log: RequestLogger,
        callback: ArsenalCallback<AccountCanonicalInfo[]>,
    ) {
        console.log("FFFFF 81 getCanonicalIdsByAccountIds accountIds", accountIds);
        log.trace('getting canonicalIDs from Vault based on accountIDs');
        const options = {
            reqUid: log.getSerializedUids(),
            logger: log,
        };
        this.client.getCanonicalIdsByAccountIds(accountIds, options, (err, res) => {
            console.log("FFFFF 82 getCanonicalIdsByAccountIds callback err", err);
            console.log("FFFFF 83 getCanonicalIdsByAccountIds callback res", res);
            if (err) {
                log.debug('received error message from vault', {
                    error: err,
                    accountIds,
                });
                return callback(err);
            }
            return callback(null, res.message.body);
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
        log: RequestLogger,
        callback: (err: Error | null, data?: any[]) => void
    ) {
        console.log("FFFFF 91 checkPolicies requestContextParams", requestContextParams);
        console.log("FFFFF 92 checkPolicies userArn", userArn);
        log.trace('sending request context params to vault to evaluate' +
        'policies');
        this.client.checkPolicies(requestContextParams, userArn, {
            // @ts-ignore
            reqUid: log.getSerializedUids(),
        }, (err: Error | null, info?: any) => {
            console.log("FFFFF 93 checkPolicies callback err", err);
            console.log("FFFFF 94 checkPolicies callback info", info);
            if (err) {
                log.debug('received error message from auth provider',
                    { error: err });
                return callback(err);
            }
            const result = info.message.body;
            return callback(null, result);
        });
    }

    checkHealth(log: RequestLogger, callback: (err: Error | null, data?: any) => void) {
        console.log("FFFFF 101 checkHealth");
        if (!this.client.healthcheck) {
            const defResp = {};
            defResp[this.implName] = { code: 200, message: 'OK' };
            return callback(null, defResp);
        }
        // @ts-ignore
        return this.client.healthcheck(log.getSerializedUids(), (err: Error | null, obj?: any) => {
            console.log("FFFFF 102 checkHealth callback err", err);
            console.log("FFFFF 103 checkHealth callback obj", obj);
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

    report(log: RequestLogger, callback: (err: Error | null, data?: any) => void) {
        console.log("FFFFF 111 report");
        // call the report function of the client
        if (!this.client.report) {
            return callback(null, {});
        }
        // @ts-ignore
        return this.client.report(log.getSerializedUids(), (err: Error | null, obj?: any) => {
            console.log("FFFFF 112 report callback err", err);
            console.log("FFFFF 113 report callback obj", obj);
            if (err) {
                log.debug(`error from ${this.implName}`, { error: err });
                return callback(err);
            }
            return callback(null, obj);
        });
    }

    /**
     * Calls Vault to retrieve the default encryption key id of the account, or creates it if it doesn't exist.
     *
     * @param {string} canonicalID - The canonical id of the account for which 
     * the encryption key id is being retrieved or created.
     * @param {RequestLogger} log - logger
     * @param {(err: Error | null, data?: { 
     *    canonicalId: string, 
     *    encryptionKeyId: string, 
     *    action: 'retrieved' | 'created' 
     * }) => void}
     *   - canonicalId: The canonical id of the account.
     *   - encryptionKeyId: The retrieved or newly created encryption key id.
     *   - action: Describes if the key was 'retrieved' or 'created'.
     *
     * @returns {void}
    */
    getOrCreateEncryptionKeyId(
        canonicalID: string,
        log: RequestLogger,
        callback: (err: Error | null, data?: { 
            canonicalId: string, 
            encryptionKeyId: string, 
            action: 'retrieved' | 'created' 
        }) => void
    ) {
        console.log("FFFFF 121 getOrCreateEncryptionKeyId canonicalID", canonicalID);
        log.trace('sending request context params to vault to get or create encryption key id');
        this.client.getOrCreateEncryptionKeyId(canonicalID, {
            // @ts-ignore
            reqUid: log.getSerializedUids(),
        }, (err: Error | null, info?: any) => {
            console.log("FFFFF 122 getOrCreateEncryptionKeyId callback err", err);
            console.log("FFFFF 123 getOrCreateEncryptionKeyId callback info", info);
            if (err) {
                log.debug('received error message from auth provider',
                    { error: err });
                return callback(err);
            }
            const result = info.message.body;
            return callback(null, result);
        });
    }
}
