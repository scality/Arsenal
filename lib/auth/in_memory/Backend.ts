import * as crypto from 'crypto';
import errors from '../../errors';
import { calculateSigningKey, hashSignature } from './vaultUtilities';
import Indexer from './Indexer';
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
 */
class Backend {
    indexer: Indexer;
    service: string;

    constructor(service: string, indexer: Indexer) {
        this.service = service;
        this.indexer = indexer;
    }

    // CODEQUALITY-TODO-SYNC Should be synchronous
    verifySignatureV2(
        stringToSign: string,
        signatureFromRequest: string,
        accessKey: string,
        options: { algo: 'SHA256' | 'SHA1' },
        callback: (
            error: Error | null,
            data?: ReturnType<typeof _formatResponse>
        ) => void
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
            // TODO Why?
            // @ts-ignore
            IAMdisplayName: entity.IAMdisplayName,
        };
        const vaultReturnObject = _formatResponse(userInfoToSend);
        return callback(null, vaultReturnObject);
    }

    // TODO Options not used. Why ?
    // CODEQUALITY-TODO-SYNC Should be synchronous
    verifySignatureV4(
        stringToSign: string,
        signatureFromRequest: string,
        accessKey: string,
        region: string,
        scopeDate: string,
        _options: { algo: 'SHA256' | 'SHA1' },
        callback: (
            err: Error | null,
            data?: ReturnType<typeof _formatResponse>
        ) => void
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
            // TODO Why?
            // @ts-ignore
            IAMdisplayName: entity.IAMdisplayName,
        };
        const vaultReturnObject = _formatResponse(userInfoToSend);
        return callback(null, vaultReturnObject);
    }

    // TODO log not used. Why ?
    // CODEQUALITY-TODO-SYNC Should be synchronous
    getCanonicalIds(
        emails: string[],
        _log: any,
        cb: (err: null, data: { message: { body: any } }) => void
    ) {
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

    // TODO options not used. Why ?
    // CODEQUALITY-TODO-SYNC Should be synchronous
    getEmailAddresses(
        canonicalIDs: string[],
        _options: any,
        cb: (err: null, data: { message: { body: any } }) => void
    ) {
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

    // TODO options not used. Why ?
    // CODEQUALITY-TODO-SYNC Should be synchronous
    /**
     * Gets accountIds for a list of accounts based on
     * the canonical IDs associated with the account
     * @param canonicalIDs - list of canonicalIDs
     * @param _options - to send log id to vault
     * @param cb - callback to calling function
     * @returns The next is wrong. Here to keep archives.
     * callback with either error or
     * an object from Vault containing account canonicalID
     * as each object key and an accountId as the value (or "NotFound")
     */
    getAccountIds(
        canonicalIDs: string[],
        _options: any,
        cb: (err: null, data: { message: { body: any } }) => void
    ) {
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

        /**
         * Retrieves or creates an encryption key id for the specified canonical id.
         *
         * @param {string} canonicalId - The canonical id of the account for which to retrieve or create the encryption key.
         * @param {any} _options - An options object, currently unused.
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
            canonicalId: string, 
            _options: any, 
            cb: (err: null, data: { message: { body: { canonicalId: string, encryptionKeyId: string, action: string } } }) => void
        ): void {
            return cb(null, {
                message: {
                    body: {
                        canonicalId,
                        encryptionKeyId: 'account-level-master-encryption-key',
                        action: 'retrieved',
                    }
                }
            });
        }
}

class S3AuthBackend extends Backend {
    constructor(authdata: Accounts) {
        super('s3', new Indexer(authdata));
    }

    refreshAuthData(authData: Accounts) {
        this.indexer = new Indexer(authData);
    }
}

export { S3AuthBackend as s3 };
