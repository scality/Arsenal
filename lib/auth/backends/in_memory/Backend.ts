import * as crypto from 'crypto';
import errors from '../../../errors';
import { calculateSigningKey, hashSignature } from './vaultUtilities';
import Indexer from './Indexer';
import BaseBackend from '../BaseBackend';
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
class InMemoryBackend extends BaseBackend {
    indexer: Indexer;

    /**
     * @constructor
     * @param service - service identifer for construction arn
     * @param indexer - indexer instance for retrieving account info
     */
    constructor(service: string, indexer: Indexer) {
        super(service);
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
        const reconstructedSig = hashSignature(
            stringToSign,
            secretKey,
            options.algo
        );
        if (signatureFromRequest !== reconstructedSig) {
            return callback(errors.SignatureDoesNotMatch);
        }
        const userInfoToSend = {
            accountDisplayName: this.indexer.getAcctDisplayName(entity),
            canonicalID: entity.canonicalID,
            arn: entity.arn,
            // @ts-ignore TODO why ?
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
        const reconstructedSig = crypto
            .createHmac('sha256', signingKey)
            .update(stringToSign, 'binary')
            .digest('hex');
        if (signatureFromRequest !== reconstructedSig) {
            return callback(errors.SignatureDoesNotMatch);
        }
        const userInfoToSend = {
            accountDisplayName: this.indexer.getAcctDisplayName(entity),
            canonicalID: entity.canonicalID,
            arn: entity.arn,
            // @ts-ignore TODO why ?
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
        emails.forEach((email) => {
            const lowercasedEmail = email.toLowerCase();
            const entity = this.indexer.getEntityByEmail(lowercasedEmail);
            if (!entity) {
                results[email] = 'NotFound';
            } else {
                results[email] = entity.canonicalID;
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
        canonicalIDs.forEach((canonicalId) => {
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
     * @param options - to send log id to vault
     * @param cb - callback to calling function
     * @return The next is wrong. Here to keep archives.
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
        canonicalIDs.forEach((canonicalID) => {
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
    constructor(authdata: Accounts) {
        super('s3', new Indexer(authdata));
    }

    refreshAuthData(authData: Accounts) {
        this.indexer = new Indexer(authData);
    }
}

export { S3AuthBackend as s3 };
