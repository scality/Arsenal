import crypto from 'crypto';
import { Logger } from 'werelogs';
import errors from '../../../errors';
import { calculateSigningKey, hashSignature } from './vaultUtilities';
import Indexer from './Indexer';
import BaseBackend from '../base';
import { Accounts } from './types';

function _formatResponse(userInfoToSend: any) {
    return {
        message: {
            body: { userInfo: userInfoToSend },
        },
    };
}

/**
 * Class that provides a memory backend for verifying signatures and getting
 * emails and canonical ids associated with an account.
 *
 * @class InMemoryBackend
 */
class InMemoryBackend extends BaseBackend {
    indexer: Indexer;
    formatResponse: any;

    /**
     * @constructor
     * @param service - service identifer for construction arn
     * @param indexer - indexer instance for retrieving account info
     * @param formatter - function which accepts user info to send
     * back and returns it in an object
     */
    constructor(service: string, indexer: Indexer, formatter: typeof _formatResponse) {
        super(service);
        this.indexer = indexer;
        this.formatResponse = formatter;
    }

    verifySignatureV2(
        stringToSign: string,
        signatureFromRequest: string,
        accessKey: string,
        options: any,
        callback: any,
    ) {
        const entity = this.indexer.getEntityByKey(accessKey);
        if (!entity) {
            return callback(errors.InvalidAccessKeyId);
        }
        const secretKey = this.indexer.getSecretKey(entity, accessKey);
        const reconstructedSig =
            hashSignature(stringToSign, secretKey, options.algo);
        if (signatureFromRequest !== reconstructedSig) {
            return callback(errors.SignatureDoesNotMatch);
        }
        const userInfoToSend = {
            accountDisplayName: this.indexer.getAcctDisplayName(entity),
            canonicalID: entity.canonicalID,
            arn: entity.arn,
            // @ts-ignore
            IAMdisplayName: entity.IAMdisplayName,
        };
        const vaultReturnObject = this.formatResponse(userInfoToSend);
        return callback(null, vaultReturnObject);
    }

    verifySignatureV4(
        stringToSign: string,
        signatureFromRequest: string,
        accessKey: string,
        region: string,
        scopeDate: string,
        options: any,
        callback: any,
    ) {
        const entity = this.indexer.getEntityByKey(accessKey);
        if (!entity) {
            return callback(errors.InvalidAccessKeyId);
        }
        const secretKey = this.indexer.getSecretKey(entity, accessKey);
        const signingKey = calculateSigningKey(secretKey, region, scopeDate);
        const reconstructedSig = crypto.createHmac('sha256', signingKey)
            .update(stringToSign, 'binary').digest('hex');
        if (signatureFromRequest !== reconstructedSig) {
            return callback(errors.SignatureDoesNotMatch);
        }
        const userInfoToSend = {
            accountDisplayName: this.indexer.getAcctDisplayName(entity),
            canonicalID: entity.canonicalID,
            arn: entity.arn,
            // @ts-ignore
            IAMdisplayName: entity.IAMdisplayName,
        };
        const vaultReturnObject = this.formatResponse(userInfoToSend);
        return callback(null, vaultReturnObject);
    }

    getCanonicalIds(emails: string[], log: Logger, cb: any) {
        const results = {};
        emails.forEach(email => {
            const lowercasedEmail = email.toLowerCase();
            const entity = this.indexer.getEntityByEmail(lowercasedEmail);
            if (!entity) {
                results[email] = 'NotFound';
            } else {
                results[email] =
                    entity.canonicalID;
            }
        });
        const vaultReturnObject = {
            message: {
                body: results,
            },
        };
        return cb(null, vaultReturnObject);
    }

    getEmailAddresses(canonicalIDs: string[], options: any, cb: any) {
        const results = {};
        canonicalIDs.forEach(canonicalId => {
            const foundEntity = this.indexer.getEntityByCanId(canonicalId);
            if (!foundEntity || !foundEntity.email) {
                results[canonicalId] = 'NotFound';
            } else {
                results[canonicalId] = foundEntity.email;
            }
        });
        const vaultReturnObject = {
            message: {
                body: results,
            },
        };
        return cb(null, vaultReturnObject);
    }

    /**
     * Gets accountIds for a list of accounts based on
     * the canonical IDs associated with the account
     * @param canonicalIDs - list of canonicalIDs
     * @param options - to send log id to vault
     * @param cb - callback to calling function
     * @returns callback with either error or
     * an object from Vault containing account canonicalID
     * as each object key and an accountId as the value (or "NotFound")
     */
    getAccountIds(canonicalIDs: string[], options: any, cb: any) {
        const results = {};
        canonicalIDs.forEach(canonicalID => {
            const foundEntity = this.indexer.getEntityByCanId(canonicalID);
            if (!foundEntity || !foundEntity.shortid) {
                results[canonicalID] = 'Not Found';
            } else {
                results[canonicalID] = foundEntity.shortid;
            }
        });
        const vaultReturnObject = {
            message: {
                body: results,
            },
        };
        return cb(null, vaultReturnObject);
    }
}


class S3AuthBackend extends InMemoryBackend {
    /**
     * @constructor
     * @param authdata - the authentication config file's data
     * @param authdata.accounts - array of account objects
     * @param authdata.accounts[].name - account name
     * @param authdata.accounts[].email - account email
     * @param authdata.accounts[].arn - IAM resource name
     * @param authdata.accounts[].canonicalID - account canonical ID
     * @param authdata.accounts[].shortid - short account ID
     * @param authdata.accounts[].keys - array of key objects
     * @param authdata.accounts[].keys[].access - access key
     * @param authdata.accounts[].keys[].secret - secret key
     */
    constructor(authdata?: Accounts) {
        super('s3', new Indexer(authdata), _formatResponse);
    }

    refreshAuthData(authData?: Accounts) {
        this.indexer = new Indexer(authData);
    }
}

export { S3AuthBackend as s3 }
