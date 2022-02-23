import errors from '../../errors';

/**
 * Base backend class
 *
 * @class BaseBackend
 */
export default class BaseBackend {
    service
    
    /**
     * @constructor
     * @param {string} service - service identifer for construction arn
     */
    constructor(service) {
        this.service = service;
    }

    /** verifySignatureV2
    * @param {string} stringToSign - string to sign built per AWS rules
    * @param {string} signatureFromRequest - signature sent with request
    * @param {string} accessKey - account accessKey
    * @param {object} options - contains algorithm (SHA1 or SHA256)
    * @param {function} callback - callback with either error or user info
    * @return {function} calls callback
    */
    verifySignatureV2(stringToSign, signatureFromRequest,
        accessKey, options, callback) {
        return callback(errors.AuthMethodNotImplemented);
    }


    /** verifySignatureV4
     * @param {string} stringToSign - string to sign built per AWS rules
     * @param {string} signatureFromRequest - signature sent with request
     * @param {string} accessKey - account accessKey
     * @param {string} region - region specified in request credential
     * @param {string} scopeDate - date specified in request credential
     * @param {object} options - options to send to Vault
     * (just contains reqUid for logging in Vault)
     * @param {function} callback - callback with either error or user info
     * @return {function} calls callback
     */
    verifySignatureV4(stringToSign, signatureFromRequest, accessKey,
        region, scopeDate, options, callback) {
        return callback(errors.AuthMethodNotImplemented);
    }

    /**
     * Gets canonical ID's for a list of accounts
     * based on email associated with account
     * @param {array} emails - list of email addresses
     * @param {object} options - to send log id to vault
     * @param {function} callback - callback to calling function
     * @returns {function} callback with either error or
     * object with email addresses as keys and canonical IDs
     * as values
     */
    getCanonicalIds(emails, options, callback) {
        return callback(errors.AuthMethodNotImplemented);
    }

    /**
     * Gets email addresses (referred to as diplay names for getACL's)
     * for a list of accounts based on canonical IDs associated with account
     * @param {array} canonicalIDs - list of canonicalIDs
     * @param {object} options - to send log id to vault
     * @param {function} callback - callback to calling function
     * @returns {function} callback with either error or
     * an object from Vault containing account canonicalID
     * as each object key and an email address as the value (or "NotFound")
     */
    getEmailAddresses(canonicalIDs, options, callback) {
        return callback(errors.AuthMethodNotImplemented);
    }

    checkPolicies(requestContextParams, userArn, options, callback) {
        return callback(null, { message: { body: [] } });
    }

    healthcheck(reqUid, callback) {
        return callback(null, { code: 200, message: 'OK' });
    }
}
