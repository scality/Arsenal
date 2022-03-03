import errors from '../../errors';
import { Callback } from './in_memory/types';

/** Base backend class */
export default class BaseBackend {
    service: string;

    constructor(service: string) {
        this.service = service;
    }

    verifySignatureV2(
        _stringToSign: string,
        _signatureFromRequest: string,
        _accessKey: string,
        _options: { algo: 'SHA1' | 'SHA256' },
        callback: Callback
    ) {
        return callback(errors.AuthMethodNotImplemented);
    }

    verifySignatureV4(
        _stringToSign: string,
        _signatureFromRequest: string,
        _accessKey: string,
        _region: string,
        _scopeDate: string,
        _options: any,
        callback: Callback
    ) {
        return callback(errors.AuthMethodNotImplemented);
    }

    /**
     * Gets canonical ID's for a list of accounts based on email associated
     * with account. The callback will be called with either error or object
     * with email addresses as keys and canonical IDs as values.
     */
    getCanonicalIds(_emails: string[], _options: any, callback: Callback) {
        return callback(errors.AuthMethodNotImplemented);
    }

    /**
     * Gets email addresses (referred to as diplay names for getACL's) for a
     * list of accounts based on canonical IDs associated with account.
     * The callback will be called with either error or an object from Vault
     * containing account canonicalID as each object key and an email address
     * as the value (or "NotFound").
     */
    getEmailAddresses(
        _canonicalIDs: string[],
        _options: any,
        callback: Callback
    ) {
        return callback(errors.AuthMethodNotImplemented);
    }

    checkPolicies(
        _requestContextParams: any,
        _userArn: string,
        _options: any,
        callback: Callback
    ) {
        return callback(null, { message: { body: [] } });
    }

    healthcheck(_reqUid: string, callback: Callback) {
        return callback(null, { code: 200, message: 'OK' });
    }
}
