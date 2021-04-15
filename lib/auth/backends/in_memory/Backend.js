'use strict'; // eslint-disable-line strict

const crypto = require('crypto');

const errors = require('../../../errors');
const calculateSigningKey = require('./vaultUtilities').calculateSigningKey;
const hashSignature = require('./vaultUtilities').hashSignature;
const Indexer = require('./Indexer');
const BaseBackend = require('../base');

function _formatResponse(userInfoToSend) {
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
    /**
     * @constructor
     * @param {string} service - service identifer for construction arn
     * @param {Indexer} indexer - indexer instance for retrieving account info
     * @param {function} formatter - function which accepts user info to send
     * back and returns it in an object
     */
    constructor(service, indexer, formatter) {
        super(service);
        this.indexer = indexer;
        this.formatResponse = formatter;
    }

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

    getCanonicalIds(emails, log, cb) {
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


class S3AuthBackend extends InMemoryBackend {
    /**
     * @constructor
     * @param {object} authdata - the authentication config file's data
     * @param {object[]} authdata.accounts - array of account objects
     * @param {string=} authdata.accounts[].name - account name
     * @param {string} authdata.accounts[].email - account email
     * @param {string} authdata.accounts[].arn - IAM resource name
     * @param {string} authdata.accounts[].canonicalID - account canonical ID
     * @param {string} authdata.accounts[].shortid - short account ID
     * @param {object[]=} authdata.accounts[].keys - array of key objects
     * @param {string} authdata.accounts[].keys[].access - access key
     * @param {string} authdata.accounts[].keys[].secret - secret key
     * @return {undefined}
     */
    constructor(authdata) {
        super('s3', new Indexer(authdata), _formatResponse);
    }

    refreshAuthData(authData) {
        this.indexer = new Indexer(authData);
    }
}

module.exports = {
    s3: S3AuthBackend,
};
