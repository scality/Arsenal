'use strict'; // eslint-disable-line strict
/* eslint new-cap: "off" */
/* eslint dot-notation: "off" */

const assert = require('assert');
const crypto = require('crypto');
const uuidv4 = require('uuid/v4');

const {
    EchoChannel,
    logger,
} = require('./ersatz.js');

const expectedObjectType = 'Symmetric Key';
const expectedAlgorithm = 'AES';
const expectedLength = 256;
const expectedBlockCipherMode = 'CBC';
const expectedPaddingMethod = 'PKCS5';
const expectedIV = Buffer.alloc(16).fill(0);
const versionMajor = 1;
const versionMinor = 4;
const vendorIdentification = 'Scality Loopback KMIP Server';
const serverExtensions = [
    {
        name: 'Security Level',
        tag: 0x541976,
        type: 7,
        value: 'Gangsta Grade',
    },
    {
        name: 'Prefered Algorithm',
        tag: 0x542008,
        type: 7,
        value: 'Kevin Bacon',
    },
    {
        name: 'Yo Dawg',
        tag: 0x542011,
        type: 7,
        value: 'I heard you like kmip, so I put a server in your client ' +
            'so you can do both ends of the conversation while you are ' +
            'talking about server side encryption',
    },
];


class DummyServerTransport {
    registerHandshakeFunction() {
        throw new Error('DummyServerTransport::registerHandshakeFunction: ' +
                        'Client side operations not implemented');
    }
    send() {
        throw new Error('DummyServerTransport::send: ' +
                        'Client side operations not implemented');
    }
}


class LoopbackServerChannel extends EchoChannel {
    constructor(KMIPClass, Codec, options) {
        super();
        this.options = options || {
            kmip: {
                codec: {},
                transport: {},
            },
        };
        this.KMIP = KMIPClass;
        this.kmip = new KMIPClass(Codec, DummyServerTransport,
            this.options);
        serverExtensions.forEach(extension => {
            this.kmip.mapExtension(extension.name, extension.tag);
        });
        this.managedKeys = {};
    }

    write(data) {
        const request = this.kmip._decodeMessage(logger, data);
        const requestOperation = request.lookup(
            'Request Message/Batch Item/Operation')[0];
        this.routeRequest(
            requestOperation, request, (err, responsePayload) => {
                const uniqueBatchItemID = request.lookup(
                    'Request Message/Batch Item/Unique Batch Item ID')[0];
                const requestProtocolVersionMinor = request.lookup(
                    'Request Message/Request Header/Protocol Version/' +
                        'Protocol Version Minor')[0];
                const requestProtocolVersionMajor = request.lookup(
                    'Request Message/Request Header/Protocol Version/' +
                        'Protocol Version Major')[0];

                let result;
                if (err) {
                    logger.error('Request processing failed', { error: err });
                    result = err;
                } else {
                    result = [
                        this.KMIP.Enumeration('Result Status', 'Success'),
                        this.KMIP.Structure('Response Payload',
                            responsePayload),
                    ];
                }

                const response = this.KMIP.Message([
                    this.KMIP.Structure('Response Message', [
                        this.KMIP.Structure('Response Header', [
                            this.KMIP.Structure('Protocol Version', [
                                this.KMIP.Integer('Protocol Version Major',
                                    requestProtocolVersionMajor),
                                this.KMIP.Integer('Protocol Version Minor',
                                    requestProtocolVersionMinor),
                            ]),
                            this.KMIP.DateTime('Time Stamp', new Date),
                            this.KMIP.Integer('Batch Count', 1),
                        ]),
                        this.KMIP.Structure('Batch Item', [
                            this.KMIP.Enumeration('Operation',
                                requestOperation),
                            this.KMIP.ByteString('Unique Batch Item ID',
                                uniqueBatchItemID),
                            ...result,
                        ]),
                    ]),
                ]);
                super.write(this.kmip._encodeMessage(response));
            });
        return this;
    }

    errorResponse(reason, message) {
        return [
            this.KMIP.Enumeration('Result Status', 'Operation Failed'),
            this.KMIP.Enumeration('Result Reason', reason),
            this.KMIP.Enumeration('Result Message', message),
        ];
    }

    routeRequest(operation, request, cb) {
        switch (operation) {
        case 'Query': return this.routeQuery(request, cb);
        case 'Discover Versions':
            return this.routeDiscoverVersions(request, cb);
        case 'Create': return this.routeCreate(request, cb);
        case 'Activate': return this.routeActivate(request, cb);
        case 'Encrypt': return this.routeEncrypt(request, cb);
        case 'Decrypt': return this.routeDecrypt(request, cb);
        case 'Revoke': return this.routeRevoke(request, cb);
        case 'Destroy': return this.routeDestroy(request, cb);
        default: return cb(new Error(`Unknown Operation: ${operation}`));
        }
    }

    routeQuery(request, cb) {
        const queryFunctions = request.lookup(
            'Request Message/Batch Item/Request Payload/Query Function');
        const response = [];
        if (queryFunctions.includes('Query Operations')) {
            response.push(
                this.KMIP.Enumeration('Operation', 'Query'),
                this.KMIP.Enumeration('Operation', 'Discover Versions'),
                this.KMIP.Enumeration('Operation', 'Create'),
                this.KMIP.Enumeration('Operation', 'Activate'),
                this.KMIP.Enumeration('Operation', 'Encrypt'),
                this.KMIP.Enumeration('Operation', 'Decrypt'),
                this.KMIP.Enumeration('Operation', 'Revoke'),
                this.KMIP.Enumeration('Operation', 'Destroy'));
        }
        if (queryFunctions.includes('Query Objects')) {
            response.push(
                this.KMIP.Enumeration('Object Type', 'Symmetric Key'));
        }
        if (queryFunctions.includes('Query Server Information')) {
            response.push(
                this.KMIP.TextString('Vendor Identification',
                    vendorIdentification),
                this.KMIP.Structure('Server Information',
                    serverExtensions.map(extension =>
                        this.KMIP.TextString(
                            extension.name,
                            extension.value),
                    )));
        }
        if (queryFunctions.includes('Query Extension Map')) {
            serverExtensions.forEach(extension => {
                response.push(
                    this.KMIP.Structure('Extension Information', [
                        this.KMIP.TextString('Extension Name', extension.name),
                        this.KMIP.Integer('Extension Tag', extension.tag),
                        /* 7 is KMIP TextString, not really used anyway in
                         * this implenetation, it could be anything
                         * without changing the behavior of the client code. */
                        this.KMIP.Integer('Extension Type', 7),
                    ]));
            });
        }
        return cb(null, response);
    }

    routeDiscoverVersions(request, cb) {
        const response = [
            this.KMIP.Structure('Protocol Version', [
                this.KMIP.Integer('Protocol Version Major', versionMajor),
                this.KMIP.Integer('Protocol Version Minor', versionMinor),
            ]),
        ];
        return cb(null, response);
    }

    routeCreate(request, cb) {
        let cryptographicAlgorithm;
        let cryptographicLength;
        let cryptographicUsageMask;
        let activationDate;
        const attributes = request.lookup(
            'Request Message/Batch Item/Request Payload/Template-Attribute')[0];
        attributes.forEach(item => {
            const attribute = item['Attribute'];
            const attributeValue = attribute.value[1]['Attribute Value'];
            const diversion = attributeValue.diversion;
            const value = attributeValue.value;
            switch (diversion) {
            case 'Cryptographic Algorithm':
                assert(!cryptographicAlgorithm);
                cryptographicAlgorithm = value;
                break;
            case 'Cryptographic Length':
                assert(!cryptographicLength);
                cryptographicLength = value;
                break;
            case 'Cryptographic Usage Mask':
                assert(!cryptographicUsageMask);
                cryptographicUsageMask = value;
                break;
            case 'Activation Date':
                assert(!activationDate);
                activationDate = value;
                break;
            default:
            }
        });
        const decodedUsageMask =
              this.kmip.decodeMask('Cryptographic Usage Mask',
                  cryptographicUsageMask);
        assert(cryptographicAlgorithm === expectedAlgorithm);
        assert(cryptographicLength === expectedLength);
        assert(decodedUsageMask.includes('Encrypt'));
        assert(decodedUsageMask.includes('Decrypt'));
        const key = Buffer.from(crypto.randomBytes(cryptographicLength / 8));
        const keyIdentifier = uuidv4();
        this.managedKeys[keyIdentifier] = {
            key,
            activationDate,
        };
        const response = [
            this.KMIP.Enumeration('Object Type', expectedObjectType),
            this.KMIP.TextString('Unique Identifier', keyIdentifier),
        ];
        return cb(null, response);
    }

    routeActivate(request, cb) {
        const keyIdentifier = (
            request.lookup(
                'Request Message/Batch Item/Request Payload/' +
                    'Unique Identifier') || [undefined])[0];
        this.managedKeys[keyIdentifier].activationDate =
            new Date;
        const response = [
            this.KMIP.TextString('Unique Identifier', keyIdentifier),
        ];
        return cb(null, response);
    }

    _getIvCounterNonce(request) {
        /* Having / in the path is not a good idea for the server side.
         * Because of this, Message::lookup() cannot be directly used to
         * extract the IV, hence this function */
        const requestPayload = (
            request.lookup(
                'Request Message/Batch Item/Request Payload')
                || [undefined])[0];
        let ivCounterNonce;
        requestPayload.forEach(attr => {
            const ivCounterNonceAttr = attr['IV/Counter/Nonce'];
            if (ivCounterNonceAttr) {
                ivCounterNonce = ivCounterNonceAttr.value;
            }
        });
        return ivCounterNonce;
    }

    _transform(cipherFunc, request, cb) {
        const keyIdentifier = (
            request.lookup(
                'Request Message/Batch Item/Request Payload/' +
                    'Unique Identifier') || [undefined])[0];
        const blockCipherMode = (
            request.lookup(
                'Request Message/Batch Item/Request Payload/' +
                    'Cryptographic Parameters/Block Cipher Mode')
                || [undefined])[0];
        const paddingMethod = (
            request.lookup(
                'Request Message/Batch Item/Request Payload/' +
                    'Cryptographic Parameters/Padding Method')
                || [undefined])[0];
        const cryptographicAlgorithm = (
            request.lookup(
                'Request Message/Batch Item/Request Payload/' +
                    'Cryptographic Parameters/Cryptographic Algorithm')
                || [undefined])[0];
        const ivCounterNonce = this._getIvCounterNonce(request);
        const data = (
            request.lookup(
                'Request Message/Batch Item/Request Payload/' +
                    'Data')
                || [undefined])[0];
        assert(blockCipherMode === expectedBlockCipherMode);
        assert(paddingMethod === expectedPaddingMethod);
        assert(cryptographicAlgorithm === expectedAlgorithm);
        assert(expectedIV.compare(ivCounterNonce) === 0);
        const keySpec = this.managedKeys[keyIdentifier];
        const now = new Date;
        assert(keySpec.activationDate && keySpec.activationDate <= now);
        const cipher = cipherFunc('aes-256-cbc', keySpec.key, ivCounterNonce);
        let cipheredData = cipher.update(data);
        const final = cipher.final();
        if (final.length !== 0) {
            cipheredData = Buffer.concat([cipheredData, final]);
        }
        const response = [
            this.KMIP.TextString('Unique Identifier', keyIdentifier),
            this.KMIP.ByteString('Data', cipheredData),
        ];
        return cb(null, response);
    }

    routeEncrypt(request, cb) {
        return this._transform(crypto.createCipheriv, request, cb);
    }

    routeDecrypt(request, cb) {
        return this._transform(crypto.createDecipheriv, request, cb);
    }

    routeRevoke(request, cb) {
        const keyIdentifier = (
            request.lookup(
                'Request Message/Batch Item/Request Payload/' +
                    'Unique Identifier') || [undefined])[0];
        this.managedKeys[keyIdentifier].activationDate = null;
        const response = [
            this.KMIP.TextString('Unique Identifier', keyIdentifier),
        ];
        return cb(null, response);
    }

    routeDestroy(request, cb) {
        const keyIdentifier = (
            request.lookup(
                'Request Message/Batch Item/Request Payload/' +
                    'Unique Identifier') || [undefined])[0];
        assert(!this.managedKeys[keyIdentifier].activationDate);
        this.managedKeys[keyIdentifier] = null;
        const response = [
            this.KMIP.TextString('Unique Identifier', keyIdentifier),
        ];
        return cb(null, response);
    }
}

module.exports = LoopbackServerChannel;
