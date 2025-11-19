import crypto from 'crypto';
import { Logger } from 'werelogs';
import errors from '../../../errors';
import { calculateSigningKey, hashSignature } from './vaultUtilities';
import Indexer from './Indexer';
import BaseBackend from '../base';
import { Accounts } from './types';
import { AuthInfoType, AuthV4Results,
    AccountCanonicalInfo, AccountCanonicalInfoResults } from '../../AuthInfo';
import { ArsenalCallback } from '../../../types';
import { KmsType, KmsProtocol, makeScalityArnPrefix } from '../../../network/KMSInterface';

function _formatResponse(userInfo: AuthInfoType): { message: { body: AuthV4Results } } {
    return {
        message: {
            body: {
                userInfo,
                accountQuota: {
                    account: userInfo.canonicalID,
                    quota: 0n,
                },
            },
        },
    };
};

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
        console.log("FFFFF 11", stringToSign)
        console.log("FFFFF 12", signatureFromRequest)
        console.log("FFFFF 13", accessKey)
        console.log("FFFFF 14", region)
        console.log("FFFFF 15", scopeDate)
        console.log("FFFFF 16.1", callback)
        console.log("FFFFF 16.2", callback.toString())
        const entity = this.indexer.getEntityByKey(accessKey);
        console.log("FFFFF 17", entity)
        console.log("FFFFF 18", this.indexer)
        if (!entity) {
            console.log("FFFFF 19.1", entity)
            return callback(errors.InvalidAccessKeyId);
        }
        const secretKey = this.indexer.getSecretKey(entity, accessKey);
        const signingKey = calculateSigningKey(secretKey, region, scopeDate);
        const reconstructedSig = crypto.createHmac('sha256', signingKey)
            .update(stringToSign, 'binary').digest('hex');
        console.log("FFFFF 19.2", secretKey)
        console.log("FFFFF 19.3", signingKey)
        console.log("FFFFF 19.4", reconstructedSig)
        console.log("FFFFF 19.41", signatureFromRequest !== reconstructedSig)
        
        if (signatureFromRequest !== reconstructedSig) {
            console.log("FFFFF 19.42", signatureFromRequest !== reconstructedSig)
            return callback(errors.SignatureDoesNotMatch);
        }
        const userInfoToSend = {
            accountDisplayName: this.indexer.getAcctDisplayName(entity),
            canonicalID: entity.canonicalID,
            arn: entity.arn,
            // @ts-ignore
            IAMdisplayName: entity.IAMdisplayName,
        };
        console.log("FFFFF 19.5", userInfoToSend)
        const vaultReturnObject = this.formatResponse(userInfoToSend);
        console.log("FFFFF 19.6", vaultReturnObject)
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

    /**
     * A getter for account canonical IDs given a list of account IDs
     * @param accountIds - list of account IDs
     * @param options - additional arguments
     * @param callback - callback function
     * @returns callback with either error or an object from Vault
     * containing canonicalID and display name for each account ID
     */
    getCanonicalIdsByAccountIds(
        accountIds: string[],
        options: {},
        callback: ArsenalCallback<AccountCanonicalInfoResults>,
    ) {
        const results: AccountCanonicalInfo[] = [];
        accountIds.forEach(accountId => {
            const foundEntity = this.indexer.getEntityByShortId(accountId);
            if (foundEntity) {
                results.push({
                    accountId,
                    canonicalId: foundEntity.canonicalID,
                    name : foundEntity.accountDisplayName,
                });
            }
        });
        const vaultReturnObject = {
            message: {
                body: results,
            },
        };
        return callback(null, vaultReturnObject);
    }

    report(log: Logger, callback: any) {
        return callback(null, {});
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
        cb: (err: null, data: { message: { 
            body: { canonicalId: string, encryptionKeyId: string, action: string } } }) => void
    ): void {
        const kmsProtocol = process.env.S3KMS === 'file' ? KmsProtocol.file : KmsProtocol.mem;
        const arnPrefix = makeScalityArnPrefix(KmsType.internal, kmsProtocol, 'scality');
        return cb(null, {
            message: {
                body: {
                    canonicalId,
                    encryptionKeyId: `${arnPrefix}account-level-master-encryption-key`,
                    action: 'retrieved',
                }
            }
        });
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

export { S3AuthBackend as s3 };
