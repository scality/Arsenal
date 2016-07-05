'use strict'; // eslint-disable-line strict

const AuthInfo = require('./AuthInfo');
const backend = require('./in_memory/backend');

const client = backend;

/** vaultSignatureCb parses message from Vault and instantiates
 * @param {object} err - error from vault
 * @param {object} userInfo - info from vault
 * @param {object} log - log for request
 * @param {function} callback - callback to authCheck functions
 * @return {undefined}
 */
function vaultSignatureCb(err, userInfo, log, callback) {
    // vaultclient API guarantees that it returns:
    // - either `err`, an Error object with `code` and `message` properties set
    // - or `err == null` and `info` is an object with `message.code` and
    //   `message.message` properties set.
    if (err) {
        log.error('received error message from vault', { errorMessage: err });
        return callback(err);
    }

    log.debug('received user info from Vault', { userInfo });
    return callback(null, new AuthInfo(userInfo.message.body));
}

const vault = {};

/**
 * authenticateV2Request
 *
 * @param {string} params - the authentication parameters as returned by
 *                          auth.extractParams
 * @param {number} params.version - shall equal 4
 * @param {number} params.version - shall equal 2
 * @param {string} params.data.accessKey - the user's accessKey
 * @param {string} params.data.signatureFromRequest - the signature read from
 *                                                    the request
 * @param {string} params.data.stringToSign - the stringToSign
 * @param {string} params.data.algo - the hashing algorithm used for the
 *                                    signature
 * @param {string} params.data.authType - the type of authentication (query or
 *                                        header)
 * @param {string} params.data.signatureVersion - the version of the signature
 *                                                (AWS or AWS4)
 * @param {number} [params.data.signatureAge] - the age of the signature in ms
 * @param {string} params.data.log - the logger object
 * @param {RequestContext} requestContext - an instance of a RequestContext
 * object containing information for policy authorization check
 * @param {function} callback - callback with either error or user info
 * @return {undefined}
 */
vault.authenticateV2Request = (params, requestContext, callback) => {
    params.log.debug('authenticating V2 request');
    client.verifySignatureV2(
        params.data.stringToSign,
        params.data.signatureFromRequest,
        params.data.accessKey,
        {
            algo: params.data.algo,
            reqUid: params.log.getSerializedUids(),
            requestContext,
        },
        (err, userInfo) => vaultSignatureCb(err, userInfo,
                                            params.log, callback)
    );
};

/** authenticateV4Request
 * @param {object} params - the authentication parameters as returned by
 *                          auth.extractParams
 * @param {number} params.version - shall equal 4
 * @param {string} params.data.accessKey - the user's accessKey
 * @param {string} params.data.signatureFromRequest - the signature read from
 *                                                    the request
 * @param {string} params.data.region - the AWS region
 * @param {string} params.data.stringToSign - the stringToSign
 * @param {string} params.data.scopeDate - the timespan to allow the request
 * @param {string} params.data.authType - the type of authentication (query or
 *                                        header)
 * @param {string} params.data.signatureVersion - the version of the signature
 *                                                (AWS or AWS4)
 * @param {number} params.data.signatureAge - the age of the signature in ms
 * @param {string} params.data.log - the logger object
 * @param {RequestContext} requestContext - an instance of a RequestContext
 * object containing information for policy authorization check
 * @param {function} callback - callback with either error or user info
 * @return {undefined}
*/
vault.authenticateV4Request = (params, requestContext, callback) => {
    params.log.debug('authenticating V4 request');
    client.verifySignatureV4(
        params.data.stringToSign,
        params.data.signatureFromRequest,
        params.data.accessKey,
        params.data.region,
        params.data.scopeDate,
        {
            reqUid: params.log.getSerializedUids(),
            requestContext,
        },
        (err, userInfo) => vaultSignatureCb(err, userInfo,
                                            params.log, callback)
    );
};

module.exports = vault;
