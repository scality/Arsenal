'use strict'; // eslint-disable-line strict

const crypto = require('crypto');

const errors = require('../../errors');
const accountsKeyedbyAccessKey =
    require('./vault.json').accountsKeyedbyAccessKey;
const accountsKeyedbyCanID =
    require('./vault.json').accountsKeyedbyCanID;
const accountsKeyedbyEmail =
    require('./vault.json').accountsKeyedbyEmail;
const calculateSigningKey = require('./vaultUtilities').calculateSigningKey;
const hashSignature = require('./vaultUtilities').hashSignature;


const _indexer = {
    getEntityByKey(accessKey) {
        return accountsKeyedbyAccessKey[accessKey];
    },
    getEntityByEmail(email) {
        return accountsKeyedbyEmail[email];
    },
    getEntityByCanId(canonicalId) {
        return accountsKeyedbyCanID[canonicalId];
    },
    getSecretKey(account) {
        return account.secretKey;
    },
    getAcctDisplayName(account) {
        return account.displayName;
    },
};

function _formatResponse(userInfoToSend) {
    return {
        message: {
            body: userInfoToSend,
        },
    };
}

class BackendTemplate {
    constructor(indexer, formatter) {
        this.indexer = indexer;
        this.formatResponse = formatter;
    }

    /** verifySignatureV2
    * @param {string} stringToSign - string to sign built per AWS rules
    * @param {string} signatureFromRequest - signature sent with request
    * @param {string} accessKey - user's accessKey
    * @param {object} options - contains algorithm (SHA1 or SHA256)
    * @param {function} callback - callback with either error or user info
    * @return {function} calls callback
    */
    verifySignatureV2(stringToSign, signatureFromRequest,
        accessKey, options, callback) {
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
            IAMdisplayName: entity.IAMdisplayName,
        };
        const vaultReturnObject = this.formatResponse(userInfoToSend);
        return callback(null, vaultReturnObject);
    }


    /** verifySignatureV4
     * @param {string} stringToSign - string to sign built per AWS rules
     * @param {string} signatureFromRequest - signature sent with request
     * @param {string} accessKey - user's accessKey
     * @param {string} region - region specified in request credential
     * @param {string} scopeDate - date specified in request credential
     * @param {object} options - options to send to Vault
     * (just contains reqUid for logging in Vault)
     * @param {function} callback - callback with either error or user info
     * @return {function} calls callback
     */
    verifySignatureV4(stringToSign, signatureFromRequest, accessKey,
        region, scopeDate, options, callback) {
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
            IAMdisplayName: entity.IAMdisplayName,
        };
        const vaultReturnObject = this.formatResponse(userInfoToSend);
        return callback(null, vaultReturnObject);
    }

    /**
     * Gets canonical ID's for a list of accounts
     * based on email associated with account
     * @param {array} emails - list of email addresses
     * @param {object} log - log object
     * @param {function} cb - callback to calling function
     * @returns {function} callback with either error or
     * object with email addresses as keys and canonical IDs
     * as values
     */
    getCanonicalIds(emails, log, cb) {
        const results = {};
        emails.forEach(email => {
            const lowercasedEmail = email.toLowerCase();
            const entity = this.indexer.getEntityByEmail[lowercasedEmail];
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

    /**
     * Gets email addresses (referred to as diplay names for getACL's)
     * for a list of accounts
     * based on canonical IDs associated with account
     * @param {array} canonicalIDs - list of canonicalIDs
     * @param {object} options - to send log id to vault
     * @param {function} cb - callback to calling function
     * @returns {function} callback with either error or
     * an object from Vault containing account canonicalID
     * as each object key and an email address as the value (or "NotFound")
     */
    getEmailAddresses(canonicalIDs, options, cb) {
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
}

const backend = new BackendTemplate(_indexer, _formatResponse);

module.exports = {
    backend,
    BackendTemplate,
};
