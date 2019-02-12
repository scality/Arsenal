'use strict'; // eslint-disable-line
/* eslint new-cap: "off" */

const async = require('async');

const TTLVCodec = require('./codec/ttlv.js');
const TlsTransport = require('./transport/tls.js');
const KMIP = require('.');

const CRYPTOGRAPHIC_OBJECT_TYPE = 'Symmetric Key';
const CRYPTOGRAPHIC_ALGORITHM = 'AES';
const CRYPTOGRAPHIC_CIPHER_MODE = 'CBC';
const CRYPTOGRAPHIC_PADDING_METHOD = 'PKCS5';
const CRYPTOGRAPHIC_LENGTH = 256;
const CRYPTOGRAPHIC_USAGE_MASK = ['Encrypt', 'Decrypt'];
const CRYPTOGRAPHIC_DEFAULT_IV = Buffer(16).fill(0);

const searchFilter = {
    protocolVersionMajor:
    'Response Message/Batch Item/' +
        'Response Payload/Protocol Version/' +
        'Protocol Version Major',
    protocolVersionMinor:
    'Response Message/Batch Item/' +
        'Response Payload/Protocol Version/' +
        'Protocol Version Minor',
    extensionName:
    'Response Message/Batch Item/Response Payload' +
        '/Extension Information/Extension Name',
    extensionTag:
    'Response Message/Batch Item/Response Payload' +
        '/Extension Information/Extension Tag',
    vendorIdentification:
    'Response Message/Batch Item/Response Payload/Vendor Identification',
    serverInformation:
    'Response Message/Batch Item/Response Payload/Server Information',
    operation:
    'Response Message/Batch Item/Response Payload/Operation',
    objectType:
    'Response Message/Batch Item/Response Payload/Object Type',
    uniqueIdentifier:
    'Response Message/Batch Item/Response Payload/Unique Identifier',
    data:
    'Response Message/Batch Item/Response Payload/Data',
};

/**
 * Negotiate with the server the use of a recent version of the protocol and
 * update the low level driver with this new knowledge.
 * @param {Object} client - The Client instance
 * @param {Object} logger - Werelog logger object
 * @param {Function} cb - The callback triggered after the negotiation.
 * @returns {undefined}
 */
function _negotiateProtocolVersion(client, logger, cb) {
    return client.kmip.request(logger, 'Discover Versions', [
        KMIP.Structure('Protocol Version', [
            KMIP.Integer('Protocol Version Major', 1),
            KMIP.Integer('Protocol Version Minor', 4),
        ]),
        KMIP.Structure('Protocol Version', [
            KMIP.Integer('Protocol Version Major', 1),
            KMIP.Integer('Protocol Version Minor', 3),
        ]),
        KMIP.Structure('Protocol Version', [
            KMIP.Integer('Protocol Version Major', 1),
            KMIP.Integer('Protocol Version Minor', 2),
        ]),
    ], (err, response) => {
        if (err) {
            logger.error('KMIP::negotiateProtocolVersion',
                         { error: err,
                           vendorIdentification: client.vendorIdentification });
            return cb(err);
        }
        const majorVersions =
              response.lookup(searchFilter.protocolVersionMajor);
        const minorVersions =
              response.lookup(searchFilter.protocolVersionMinor);
        if (majorVersions.length === 0 ||
            majorVersions.length !== minorVersions.length) {
            const error = Error('No suitable protocol version');
            logger.error('KMIP::negotiateProtocolVersion',
                         { error,
                           vendorIdentification: client.vendorIdentification });
            return cb(error);
        }
        client.kmip.changeProtocolVersion(majorVersions[0], minorVersions[0]);
        return cb(null);
    });
}

/**
 * Obtain from the server the various extensions defined by the vendor
 * and update the low level driver with this new knowledge.
 * @param {Object} client - The Client instance
 * @param {Object} logger - Werelog logger object
 * @param {Function} cb - The callback triggered after the extension mapping
 * @returns {undefined}
 */
function _mapExtensions(client, logger, cb) {
    return client.kmip.request(logger, 'Query', [
        KMIP.Enumeration('Query Function', 'Query Extension Map'),
    ], (err, response) => {
        if (err) {
            logger.error('KMIP::mapExtensions',
                         { error: err,
                           vendorIdentification: client.vendorIdentification });
            return cb(err);
        }
        const extensionNames = response.lookup(searchFilter.extensionName);
        const extensionTags = response.lookup(searchFilter.extensionTag);
        if (extensionNames.length !== extensionTags.length) {
            return cb(Error('Inconsistent extension list'));
        }
        extensionNames.forEach((extensionName, idx) => {
            client.kmip.mapExtension(extensionName, extensionTags[idx]);
        });
        return cb(null);
    });
}

/**
 * Query the Server information and identify its vendor
 * @param {Object} client - The Client instance
 * @param {Object} logger - Werelog logger object
 * @param {Function} cb - The callback triggered after the information discovery
 * @returns {undefined}
 */
function _queryServerInformation(client, logger, cb) {
    client.kmip.request(logger, 'Query', [
        KMIP.Enumeration('Query Function', 'Query Server Information'),
    ], (err, response) => {
        if (err) {
            logger.warn('KMIP::queryServerInformation',
                        { error: err });
            return cb(null);
        }
        client._setVendorIdentification(
            response.lookup(searchFilter.vendorIdentification)[0]);
        client._setServerInformation(
            JSON.stringify(response.lookup(searchFilter.serverInformation)[0]));

        logger.info('KMIP Server identified',
                    { vendorIdentification: client.vendorIdentification,
                      serverInformation: client.serverInformation,
                      negotiatedProtocolVersion: client.kmip.protocolVersion });
        return cb(null);
    });
}

/**
 * Query the Server for the supported operations and managed object types.
 * The fact that a server doesn't announce the support for a required feature
 * is not a show stopper because some vendor support more or less what they
 * announce. If a subsequent request fails, this information can be used to
 * figure out the reason for the failure.
 * @param {Object} client - The Client instance
 * @param {Object} logger - Werelog logger object
 * @param {Function} cb - The callback triggered after the information discovery
 * @returns {undefined}
 */
function _queryOperationsAndObjects(client, logger, cb) {
    return client.kmip.request(logger, 'Query', [
        KMIP.Enumeration('Query Function', 'Query Operations'),
        KMIP.Enumeration('Query Function', 'Query Objects'),
    ], (err, response) => {
        if (err) {
            logger.error('KMIP::queryOperationsAndObjects',
                         { error: err,
                           vendorIdentification: client.vendorIdentification });
            return cb(err);
        }
        const supportedOperations = response.lookup(searchFilter.operation);
        const supportedObjectTypes = response.lookup(searchFilter.objectType);
        const supportsEncrypt = supportedOperations.includes('Encrypt');
        const supportsDecrypt = supportedOperations.includes('Decrypt');
        const supportsActivate = supportedOperations.includes('Activate');
        const supportsRevoke = supportedOperations.includes('Revoke');
        const supportsCreate = supportedOperations.includes('Create');
        const supportsDestroy = supportedOperations.includes('Destroy');
        const supportsQuery = supportedOperations.includes('Query');
        const supportsSymmetricKeys =
              supportedObjectTypes.includes('Symmetric Key');
        if (!supportsEncrypt || !supportsDecrypt ||
            !supportsActivate || !supportsRevoke ||
            !supportsCreate || !supportsDestroy ||
            !supportsQuery || !supportsSymmetricKeys) {
            /* This should not be considered as an error since some vendors
             * are not consistent between what they really support and what
             * they announce to support.
             */
            logger.warn('KMIP::queryOperationsAndObjects: ' +
                        'The KMIP Server announces that it ' +
                        'does not support all of the required features',
                        { vendorIdentification: client.vendorIdentification,
                          serverInformation: client.serverInformation,
                          supportsEncrypt, supportsDecrypt,
                          supportsActivate, supportsRevoke,
                          supportsCreate, supportsDestroy,
                          supportsQuery, supportsSymmetricKeys });
        } else {
            logger.info('KMIP Server provides the necessary feature set',
                        { vendorIdentification: client.vendorIdentification });
        }
        return cb(null);
    });
}


class Client {
    /**
     * Construct a high level KMIP driver suitable for cloudserver
     * @param {Object} options - Instance options
     * @param {Object} options.kmip - Low level driver options
     * @param {Object} options.kmip.client - This high level driver options
     * @param {Object} options.kmip.client.compoundCreateActivate -
     *                 Depends on the server's ability. False offers the best
     *                 compatibility. True does not offer a significant
     *                 performance gain, but can be useful in case of unreliable
     *                 time synchronization between the client and the server.
     * @param {Object} options.kmip.client.bucketNameAttributeName -
     *                 Depends on the server's ability. Not specifying this
     *                 offers the best compatibility and disable the attachement
     *                 of the bucket name as a key attribute.
     * @param {Object} options.kmip.codec - KMIP Codec options
     * @param {Object} options.kmip.transport - KMIP Transport options
     * @param {Class} CodecClass - diversion for the Codec class,
     *                             defaults to TTLVCodec
     * @param {Class} TransportClass - diversion for the Transport class,
     *                                 defaults to TlsTransport
     */
    constructor(options, CodecClass, TransportClass) {
        this.options = options.kmip.client || {};
        this.vendorIdentification = '';
        this.serverInformation = [];
        this.kmip = new KMIP(CodecClass || TTLVCodec,
                             TransportClass || TlsTransport,
                             options);
        this.kmip.registerHandshakeFunction((logger, cb) => {
            this._kmipHandshake(logger, cb);
        });
    }

    /**
     * Update this client with the vendor identification of the server
     * @param {String} vendorIdentification - Vendor identification string
     * @returns {undefined}
     */
    _setVendorIdentification(vendorIdentification) {
        this.vendorIdentification = vendorIdentification;
    }

    /**
     * Update this client with the information about the server
     * @param {Object} serverInformation - Server information object
     * @returns {undefined}
     */
    _setServerInformation(serverInformation) {
        this.serverInformation = serverInformation;
    }

    /**
     * Perform the KMIP level handshake with the server
     * @param {Object} logger - Werelog logger object
     * @param {Function} cb - Callback to be triggered at the end of the
     *                        handshake. cb(err: Error)
     * @returns {undefined}
     */
    _kmipHandshake(logger, cb) {
        return async.waterfall([
            next => _negotiateProtocolVersion(this, logger, next),
            next => _mapExtensions(this, logger, next),
            next => _queryServerInformation(this, logger, next),
            next => _queryOperationsAndObjects(this, logger, next),
        ], cb);
    }


    /**
     * Activate a cryptographic key managed by the server,
     * for a specific bucket. This is a required action to perform after
     * the key creation.
     * @param {string} keyIdentifier - The bucket key Id
     * @param {object} logger - Werelog logger object
     * @param {function} cb - The callback(err: Error)
     * @returns {undefined}
     */
    _activateBucketKey(keyIdentifier, logger, cb) {
        return this.kmip.request(logger, 'Activate', [
            KMIP.TextString('Unique Identifier', keyIdentifier),
        ], (err, response) => {
            if (err) {
                logger.error('KMIP::_activateBucketKey',
                             { error: err,
                               serverInformation: this.serverInformation });
                return cb(err);
            }
            const uniqueIdentifier =
                  response.lookup(searchFilter.uniqueIdentifier)[0];
            if (uniqueIdentifier !== keyIdentifier) {
                const error = Error(
                    'Server did not return the right identifier',
                    { uniqueIdentifier });
                logger.error('KMIP::cipherDataKey',
                             { error, uniqueIdentifier });
            }
            return cb(err, keyIdentifier);
        });
    }

    /**
     * Create a new cryptographic key managed by the server,
     * for a specific bucket
     * @param {string} bucketName - The bucket name
     * @param {object} logger - Werelog logger object
     * @param {function} cb - The callback(err: Error, bucketKeyId: String)
     * @returns {undefined}
     */
    createBucketKey(bucketName, logger, cb) {
        const attributes = [];
        if (!!this.options.bucketNameAttributeName) {
            attributes.push(KMIP.Attribute('TextString',
                                           this.options.bucketNameAttributeName,
                                           bucketName));
        }
        attributes.push(...[
            KMIP.Attribute('Enumeration', 'Cryptographic Algorithm',
                           CRYPTOGRAPHIC_ALGORITHM),
            KMIP.Attribute('Integer', 'Cryptographic Length',
                           CRYPTOGRAPHIC_LENGTH),
            KMIP.Attribute('Integer', 'Cryptographic Usage Mask',
                           this.kmip.encodeMask('Cryptographic Usage Mask',
                                                CRYPTOGRAPHIC_USAGE_MASK))]);
        if (this.options.compoundCreateActivate) {
            attributes.push(KMIP.Attribute('Date-Time', 'Activation Date',
                                           new Date(Date.UTC())));
        }

        return this.kmip.request(logger, 'Create', [
            KMIP.Enumeration('Object Type', CRYPTOGRAPHIC_OBJECT_TYPE),
            KMIP.Structure('Template-Attribute', attributes),
        ], (err, response) => {
            if (err) {
                logger.error('KMIP::createBucketKey',
                             { error: err,
                               serverInformation: this.serverInformation });
                return cb(err);
            }
            const createdObjectType =
                  response.lookup(searchFilter.objectType)[0];
            const uniqueIdentifier =
                  response.lookup(searchFilter.uniqueIdentifier)[0];
            if (createdObjectType !== CRYPTOGRAPHIC_OBJECT_TYPE) {
                const error = Error('Server created an object of wrong type');
                logger.error('KMIP::createBucketKey',
                             { error, createdObjectType });
            }
            if (!this.options.compoundCreateActivate) {
                return this._activateBucketKey(uniqueIdentifier, logger, cb);
            }
            return cb(err, uniqueIdentifier);
        });
    }

    /**
     * Revoke a cryptographic key managed by the server, for a specific bucket.
     * This is a required action to perform before being able to destroy the
     * managed key.
     * @param {string} bucketKeyId - The bucket key Id
     * @param {object} logger - Werelog logger object
     * @param {function} cb - The callback(err: Error)
     * @returns {undefined}
     */
    _revokeBucketKey(bucketKeyId, logger, cb) {
        // maybe revoke first
        return this.kmip.request(logger, 'Revoke', [
            KMIP.TextString('Unique Identifier', bucketKeyId),
            KMIP.Structure('Revocation Reason', [
                KMIP.Enumeration('Revocation Reason Code',
                                 'Cessation of Operation'),
                KMIP.TextString('Revocation Message',
                                'About to be deleted'),
            ]),
        ], (err, response) => {
            if (err) {
                logger.error('KMIP::_revokeBucketKey',
                             { error: err,
                               serverInformation: this.serverInformation });
                return cb(err);
            }
            const uniqueIdentifier =
                  response.lookup(searchFilter.uniqueIdentifier)[0];
            if (uniqueIdentifier !== bucketKeyId) {
                const error = Error(
                    'Server did not return the right identifier',
                    { uniqueIdentifier });
                logger.error('KMIP::_revokeBucketKey',
                             { error, uniqueIdentifier });
            }
            return cb(err);
        });
    }

    /**
     * Destroy a cryptographic key managed by the server, for a specific bucket.
     * @param {string} bucketKeyId - The bucket key Id
     * @param {object} logger - Werelog logger object
     * @param {function} cb - The callback(err: Error)
     * @returns {undefined}
     */
    destroyBucketKey(bucketKeyId, logger, cb) {
        return this._revokeBucketKey(bucketKeyId, logger, err => {
            if (err) {
                logger.error('KMIP::destroyBucketKey: revocation failed',
                             { error: err,
                               serverInformation: this.serverInformation });
                return cb(err);
            }
            return this.kmip.request(logger, 'Destroy', [
                KMIP.TextString('Unique Identifier', bucketKeyId),
            ], (err, response) => {
                if (err) {
                    logger.error('KMIP::destroyBucketKey',
                                 { error: err,
                                   serverInformation: this.serverInformation });
                    return cb(err);
                }
                const uniqueIdentifier =
                      response.lookup(searchFilter.uniqueIdentifier)[0];
                if (uniqueIdentifier !== bucketKeyId) {
                    const error = Error(
                        'Server did not return the right identifier',
                        { uniqueIdentifier });
                    logger.error('KMIP::destroyBucketKey',
                                 { error, uniqueIdentifier });
                }
                return cb(err);
            });
        });
    }

    /**
     *
     * @param {number} cryptoScheme - crypto scheme version number
     * @param {string} masterKeyId - key to retrieve master key
     * @param {buffer} plainTextDataKey - data key
     * @param {object} logger - werelog logger object
     * @param {function} cb - callback
     * @returns {undefined}
     * @callback called with (err, cipheredDataKey: Buffer)
     */
    cipherDataKey(cryptoScheme,
                  masterKeyId,
                  plainTextDataKey,
                  logger,
                  cb) {
        return this.kmip.request(logger, 'Encrypt', [
            KMIP.TextString('Unique Identifier', masterKeyId),
            KMIP.Structure('Cryptographic Parameters', [
                KMIP.Enumeration('Block Cipher Mode',
                                CRYPTOGRAPHIC_CIPHER_MODE),
                KMIP.Enumeration('Padding Method',
                                CRYPTOGRAPHIC_PADDING_METHOD),
                KMIP.Enumeration('Cryptographic Algorithm',
                               CRYPTOGRAPHIC_ALGORITHM),
            ]),
            KMIP.ByteString('Data', plainTextDataKey),
            KMIP.ByteString('IV/Counter/Nonce', CRYPTOGRAPHIC_DEFAULT_IV),
        ], (err, response) => {
            if (err) {
                logger.error('KMIP::cipherDataKey',
                             { error: err,
                               serverInformation: this.serverInformation });
                return cb(err);
            }
            const uniqueIdentifier =
                  response.lookup(searchFilter.uniqueIdentifier)[0];
            const data = response.lookup(searchFilter.data)[0];
            if (uniqueIdentifier !== masterKeyId) {
                const error = Error(
                    'Server did not return the right identifier',
                    { uniqueIdentifier });
                logger.error('KMIP::cipherDataKey',
                             { error, uniqueIdentifier });
            }
            return cb(err, data);
        });
    }

    /**
     *
     * @param {number} cryptoScheme - crypto scheme version number
     * @param {string} masterKeyId - key to retrieve master key
     * @param {buffer} cipheredDataKey - data key
     * @param {object} logger - werelog logger object
     * @param {function} cb - callback
     * @returns {undefined}
     * @callback called with (err, plainTextDataKey: Buffer)
     */
    decipherDataKey(cryptoScheme,
                    masterKeyId,
                    cipheredDataKey,
                    logger,
                    cb) {
        return this.kmip.request(logger, 'Decrypt', [
            KMIP.TextString('Unique Identifier', masterKeyId),
            KMIP.Structure('Cryptographic Parameters', [
                KMIP.Enumeration('Block Cipher Mode',
                                CRYPTOGRAPHIC_CIPHER_MODE),
                KMIP.Enumeration('Padding Method',
                                 CRYPTOGRAPHIC_PADDING_METHOD),
                KMIP.Enumeration('Cryptographic Algorithm',
                                 CRYPTOGRAPHIC_ALGORITHM),
            ]),
            KMIP.ByteString('Data', cipheredDataKey),
            KMIP.ByteString('IV/Counter/Nonce', CRYPTOGRAPHIC_DEFAULT_IV),
        ], (err, response) => {
            if (err) {
                logger.error('KMIP::decipherDataKey',
                             { error: err,
                               serverInformation: this.serverInformation });
                return cb(err);
            }
            const uniqueIdentifier =
                  response.lookup(searchFilter.uniqueIdentifier)[0];
            const data = response.lookup(searchFilter.data)[0];
            if (uniqueIdentifier !== masterKeyId) {
                const error = Error(
                    'Server did not return the right identifier',
                    { uniqueIdentifier });
                logger.error('KMIP::decipherDataKey',
                             { error, uniqueIdentifier });
            }
            return cb(err, data);
        });
    }

}

module.exports = Client;
