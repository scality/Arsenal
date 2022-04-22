import errors from '../../errors';

/**
 * Base backend class
 *
 * @class BaseBackend
 */
export default class BaseBackend {
    service: string;

    /**
     * @constructor
     * @param {string} service - service identifer for construction arn
     */
    constructor(service: string) {
        this.service = service;
    }

    /** verifySignatureV2
    * @param stringToSign - string to sign built per AWS rules
    * @param signatureFromRequest - signature sent with request
    * @param accessKey - account accessKey
    * @param options - contains algorithm (SHA1 or SHA256)
    * @param callback - callback with either error or user info
    * @return calls callback
    */
    verifySignatureV2(
        stringToSign: string,
        signatureFromRequest: string,
        accessKey: string,
        options: any,
        callback: any
    ) {
        return callback(errors.AuthMethodNotImplemented);
    }


    /** verifySignatureV4
     * @param stringToSign - string to sign built per AWS rules
     * @param signatureFromRequest - signature sent with request
     * @param accessKey - account accessKey
     * @param region - region specified in request credential
     * @param scopeDate - date specified in request credential
     * @param options - options to send to Vault
     * (just contains reqUid for logging in Vault)
     * @param callback - callback with either error or user info
     * @return calls callback
     */
    verifySignatureV4(
        stringToSign: string,
        signatureFromRequest: string,
        accessKey: string,
        region: string,
        scopeDate: string,
        options: any,
        callback: any
    ) {
        return callback(errors.AuthMethodNotImplemented);
    }

    /**
     * Gets canonical ID's for a list of accounts
     * based on email associated with account
     * @param emails - list of email addresses
     * @param options - to send log id to vault
     * @param callback - callback to calling function
     * @returns callback with either error or
     * object with email addresses as keys and canonical IDs
     * as values
     */
    getCanonicalIds(emails: string[], options: any, callback: any) {
        return callback(errors.AuthMethodNotImplemented);
    }

    /**
     * Gets email addresses (referred to as diplay names for getACL's)
     * for a list of accounts based on canonical IDs associated with account
     * @param canonicalIDs - list of canonicalIDs
     * @param options - to send log id to vault
     * @param callback - callback to calling function
     * @returns callback with either error or
     * an object from Vault containing account canonicalID
     * as each object key and an email address as the value (or "NotFound")
     */
    getEmailAddresses(canonicalIDs: string[], options: any, callback: any) {
        return callback(errors.AuthMethodNotImplemented);
    }

    checkPolicies(requestContextParams: any, userArn: string, options: any, callback: any) {
        return callback(null, { message: { body: [] } });
    }

    healthcheck(reqUid: string, callback: any) {
        return callback(null, { code: 200, message: 'OK' });
    }
}
