const errors = require('../errors');
const AuthInfo = require('./AuthInfo');

/** vaultSignatureCb parses message from Vault and instantiates
 * @param {object} err - error from vault
 * @param {object} authInfo - info from vault
 * @param {object} log - log for request
 * @param {function} callback - callback to authCheck functions
 * @param {object} [streamingV4Params] - present if v4 signature;
 * items used to calculate signature on chunks if streaming auth
 * @return {undefined}
 */
function vaultSignatureCb(err, authInfo, log, callback, streamingV4Params) {
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
    return callback(null, userInfo, authorizationResults, streamingV4Params);
}


/**
 * Class that provides common authentication methods against different
 * authentication backends.
 * @class Vault
 */
class Vault {
    /**
     * @constructor
     * @param {object} client - authentication backend or vault client
     * @param {string} implName - implementation name for auth backend
     */
    constructor(client, implName) {
        this.client = client;
        this.implName = implName;
    }
    /**
     * authenticateV2Request
     *
     * @param {string} params - the authentication parameters as returned by
     *                          auth.extractParams
     * @param {number} params.version - shall equal 2
     * @param {string} params.data.accessKey - the user's accessKey
     * @param {string} params.data.signatureFromRequest - the signature read
     *                                                    from the request
     * @param {string} params.data.stringToSign - the stringToSign
     * @param {string} params.data.algo - the hashing algorithm used for the
     *                                    signature
     * @param {string} params.data.authType - the type of authentication (query
     *                                        or header)
     * @param {string} params.data.signatureVersion - the version of the
     *                                                signature (AWS or AWS4)
     * @param {number} [params.data.signatureAge] - the age of the signature in
     *                                              ms
     * @param {string} params.data.log - the logger object
     * @param {RequestContext []} requestContexts - an array of RequestContext
     * instances which contain information for policy authorization check
     * @param {function} callback - callback with either error or user info
     * @returns {undefined}
     */
    authenticateV2Request(params, requestContexts, callback) {
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
                reqUid: params.log.getSerializedUids(),
                logger: params.log,
                securityToken: params.data.securityToken,
                requestContext: serializedRCsArr,
            },
            (err, userInfo) => vaultSignatureCb(err, userInfo,
                                                params.log, callback)
        );
    }

    /** authenticateV4Request
     * @param {object} params - the authentication parameters as returned by
     *                          auth.extractParams
     * @param {number} params.version - shall equal 4
     * @param {string} params.data.log - the logger object
     * @param {string} params.data.accessKey - the user's accessKey
     * @param {string} params.data.signatureFromRequest - the signature read
     *                                                    from the request
     * @param {string} params.data.region - the AWS region
     * @param {string} params.data.stringToSign - the stringToSign
     * @param {string} params.data.scopeDate - the timespan to allow the request
     * @param {string} params.data.authType - the type of authentication (query
     *                                        or header)
     * @param {string} params.data.signatureVersion - the version of the
     *                                                signature (AWS or AWS4)
     * @param {number} params.data.signatureAge - the age of the signature in ms
     * @param {number} params.data.timestamp - signaure timestamp
     * @param {string} params.credentialScope - credentialScope for signature
     * @param {RequestContext [] | null} requestContexts -
     * an array of RequestContext or null if authenticaiton of a chunk
     * in streamingv4 auth
     * instances which contain information for policy authorization check
     * @param {function} callback - callback with either error or user info
     * @return {undefined}
    */
    authenticateV4Request(params, requestContexts, callback) {
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
        this.client.verifySignatureV4(
            params.data.stringToSign,
            params.data.signatureFromRequest,
            params.data.accessKey,
            params.data.region,
            params.data.scopeDate,
            {
                reqUid: params.log.getSerializedUids(),
                logger: params.log,
                securityToken: params.data.securityToken,
                requestContext: serializedRCs,
            },
            (err, userInfo) => vaultSignatureCb(err, userInfo,
                params.log, callback, streamingV4Params)
        );
    }

    /** getCanonicalIds -- call Vault to get canonicalIDs based on email
     * addresses
     * @param {array} emailAddresses - list of emailAddresses
     * @param {object} log - log object
     * @param {function} callback - callback with either error or an array
     * of objects with each object containing the canonicalID and emailAddress
     * of an account as properties
     * @return {undefined}
    */
    getCanonicalIds(emailAddresses, log, callback) {
        log.trace('getting canonicalIDs from Vault based on emailAddresses',
            { emailAddresses });
        this.client.getCanonicalIds(emailAddresses,
            { reqUid: log.getSerializedUids() },
            (err, info) => {
                if (err) {
                    log.debug('received error message from auth provider',
                        { errorMessage: err });
                    return callback(err);
                }
                const infoFromVault = info.message.body;
                log.trace('info received from vault', { infoFromVault });
                const foundIds = [];
                for (let i = 0; i < Object.keys(infoFromVault).length; i++) {
                    const key = Object.keys(infoFromVault)[i];
                    if (infoFromVault[key] === 'WrongFormat'
                    || infoFromVault[key] === 'NotFound') {
                        return callback(errors.UnresolvableGrantByEmailAddress);
                    }
                    const obj = {};
                    obj.email = key;
                    obj.canonicalID = infoFromVault[key];
                    foundIds.push(obj);
                }
                return callback(null, foundIds);
            });
    }

    /** getEmailAddresses -- call Vault to get email addresses based on
     * canonicalIDs
     * @param {array} canonicalIDs - list of canonicalIDs
     * @param {object} log - log object
     * @param {function} callback - callback with either error or an object
     * with canonicalID keys and email address values
     * @return {undefined}
    */
    getEmailAddresses(canonicalIDs, log, callback) {
        log.trace('getting emailAddresses from Vault based on canonicalIDs',
            { canonicalIDs });
        this.client.getEmailAddresses(canonicalIDs,
            { reqUid: log.getSerializedUids() },
            (err, info) => {
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
     * @return {undefined}
    */
    checkPolicies(requestContextParams, userArn, log, callback) {
        log.trace('sending request context params to vault to evaluate' +
        'policies');
        this.client.checkPolicies(requestContextParams, userArn, {
            reqUid: log.getSerializedUids(),
        }, (err, info) => {
            if (err) {
                log.debug('received error message from auth provider',
                    { error: err });
                return callback(err);
            }
            const result = info.message.body;
            return callback(null, result);
        });
    }

    checkHealth(log, callback) {
        if (!this.client.healthcheck) {
            const defResp = {};
            defResp[this.implName] = { code: 200, message: 'OK' };
            return callback(null, defResp);
        }
        return this.client.healthcheck(log.getSerializedUids(), (err, obj) => {
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

module.exports = Vault;
