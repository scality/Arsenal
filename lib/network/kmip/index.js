'use strict'; // eslint-disable-line
/* eslint new-cap: "off" */

const uuidv4 = require('uuid/v4');

const Message = require('./Message.js');

/* This client requires at least a KMIP 1.2 compatible server */
const DEFAULT_PROTOCOL_VERSION_MAJOR = 1;
const DEFAULT_PROTOCOL_VERSION_MINOR = 2;
/* Response is for one operation, consider raising this value if
 * compounding ops */
const DEFAULT_MAXIMUM_RESPONSE_SIZE = 8000;

function _uniqueBatchItemID() {
    const theUUID = Buffer.alloc(16);
    return uuidv4(null, theUUID);
}


function _PrimitiveType(tagName, type, value) {
    return { [tagName]: { type, value } };
}

class KMIP {
    /**
     * Construct a new KMIP Object
     * @param {Class} Codec -
     * @param {Class} Transport -
     * @param {Object} options -
     * @param {Function} cb -
     */
    constructor(Codec, Transport, options) {
        this.protocolVersion = {
            major: DEFAULT_PROTOCOL_VERSION_MAJOR,
            minor: DEFAULT_PROTOCOL_VERSION_MINOR,
        };
        this.maximumResponseSize = DEFAULT_MAXIMUM_RESPONSE_SIZE;
        this.options = options.kmip;
        this.codec = new Codec(options.kmip.codec);
        this.transport = new Transport(options.kmip.transport);
    }

    /* Static class methods */

    /**
     * create a new abstract message instance
     * @param {Object} content - Most likely a call to KMIP.Structure
     *                           with 'Request Message' as tagName
     * @returns {Object} an instance of Message
     */
    static Message(content) {
        return new Message(content);
    }

    /**
     * Create a KMIP Structure field instance
     * @param {String} tagName - Name of the KMIP field
     * @param {Array} value - array of KMIP fields
     * @returns {Object} an abstract KMIP field
     */
    static Structure(tagName, value) {
        return _PrimitiveType(tagName, 'Structure', value);
    }

    /**
     * Create a KMIP Integer field instance
     * @param {String} tagName - Name of the KMIP field
     * @param {Number} value - a number
     * @returns {Object} an abstract KMIP field
     */
    static Integer(tagName, value) {
        return _PrimitiveType(tagName, 'Integer', value);
    }

    /**
     * Create a KMIP Long Integer field instance
     * @param {String} tagName - Name of the KMIP field
     * @param {Number} value - a number (beware of the 53-bit limitation)
     * @returns {Object} an abstract KMIP field
     */
    static LongInteger(tagName, value) {
        return _PrimitiveType(tagName, 'LongInteger', value);
    }

    /**
     * Create a KMIP Big Integer field instance
     * @param {String} tagName - Name of the KMIP field
     * @param {Buffer} value - buffer containing the big integer
     * @returns {Object} an abstract KMIP field
     */
    static BigInteger(tagName, value) {
        if (value.length % 8 !== 0) {
            throw Error('Big Integer value length must be a multiple of 8');
        }
        return _PrimitiveType(tagName, 'BigInteger', value);
    }

    /**
     * Create a KMIP Enumeration field instance
     * @param {String} tagName - Name of the KMIP Enumeration
     * @param {String} value - Name of the KMIP Enumeration value
     * @returns {Object} an abstract KMIP field
     */
    static Enumeration(tagName, value) {
        return _PrimitiveType(tagName, 'Enumeration', value);
    }

    /**
     * Create a KMIP Boolean field instance
     * @param {String} tagName - Name of the KMIP field
     * @param {Boolean} value - anything falsey or not (converted to a Boolean)
     * @returns {Object} an abstract KMIP field
     */
    static Boolean(tagName, value) {
        return _PrimitiveType(tagName, 'Boolean', !!value);
    }

    /**
     * Create a KMIP Text String field instance
     * @param {String} tagName - Name of the KMIP field
     * @param {String} value - the text string
     * @returns {Object} an abstract KMIP field
     */
    static TextString(tagName, value) {
        return _PrimitiveType(tagName, 'TextString', value);
    }

    /**
     * Create a KMIP Byte String field instance
     * @param {String} tagName - Name of the KMIP field
     * @param {Buffer} value - buffer containing the byte string
     * @returns {Object} an abstract KMIP field
     */
    static ByteString(tagName, value) {
        return _PrimitiveType(tagName, 'ByteString', value);
    }

    /**
     * Create a KMIP Date-Time field instance
     * @param {String} tagName - Name of the KMIP field
     * @param {Date} value - instance of a Date (ms are discarded)
     * @returns {Object} an abstract KMIP field
     */
    static DateTime(tagName, value) {
        value.setMilliseconds(0);
        return _PrimitiveType(tagName, 'Date-Time', value);
    }

    /**
     * Create a KMIP Interval field instance
     * @param {String} tagName - Name of the KMIP field
     * @param {Integer} value - number of seconds of the interval
     * @returns {Object} an abstract KMIP field
     */
    static Interval(tagName, value) {
        return _PrimitiveType(tagName, 'Interval', value);
    }

    /**
     * Create a KMIP Attribute field instance
     * @param {String} type - type of the attribute value
     * @param {String} name - Name of the attribute or KMIP field
     * @param {Object} value - value of the field suitable for the
     *                         specified type
     * @returns {Object} an abstract KMIP field
     */
    static Attribute(type, name, value) {
        if (type === 'Date-Time') {
            value.setMilliseconds(0);
        }
        return {
            Attribute: {
                type: 'Structure',
                value: [
                    {
                        'Attribute Name': {
                            type: 'TextString',
                            value: name,
                        },
                    },
                    {
                        'Attribute Value': {
                            type,
                            value,
                            diversion: name,
                        },
                    },
                ],
            },
        };
    }

    /* Object methods */

    /**
     * Register a higher level handshake function to be called
     * after the connection is initialized and before the first
     * message is sent.
     * @param {Function} handshakeFunction - (logger: Object, cb: Function(err))
     * @returns {undefined}
     */
    registerHandshakeFunction(handshakeFunction) {
        this.transport.registerHandshakeFunction(handshakeFunction);
    }

    /**
     * Decode a raw message, usually received from the transport layer
     * @param {Object} logger - a Logger instance
     * @param {Buffer} rawMessage - the message to decode
     * @returns {Object} the decoded message as an instance of KMIP.Message
     */
    _decodeMessage(logger, rawMessage) {
        return this.codec.decode(logger, rawMessage);
    }

    /**
     * Encode an message
     * @param {Object} message - Instance of a KMIP.Message
     * @returns {Buffer} the encoded message suitable for the transport layer
     */
    _encodeMessage(message) {
        return this.codec.encode(message);
    }

    /**
     * Decode a bitmask
     * @param {string} tagName - name of the bit mask defining tag
     * @param {Integer} givenMask - bit mask to decode
     * @returns {Array} array of named bits set in the given bit mask
     */
    decodeMask(tagName, givenMask) {
        return this.codec.decodeMask(tagName, givenMask);
    }

    /**
     * Encode a bitmask
     * @param {String} tagName - name of the bit mask defining tag
     * @param {Array} value - array of named bits to set in the mask
     * @returns {Integer} Integer encoded bitmask
     */
    encodeMask(tagName, value) {
        return this.codec.encodeMask(tagName, value);
    }

    /**
     * Amend the tag nomenclature with a vendor specific extension
     * @param {String} extensionName - Name of the tag to record
     * @param {Integer} extensionTag - Tag value represented as an integer
     * @returns {undefined}
     */
    mapExtension(extensionName, extensionTag) {
        return this.codec.mapExtension(extensionName, extensionTag);
    }

    changeProtocolVersion(major, minor) {
        this.protocolVersion = { major, minor };
    }

    /**
     * Send an operation request message to the KMIP Server
     * @param {Object} logger - Werelog logger object
     * @param {String} operation - The name of the operation as defined in
     *                             the KMIP protocol specification.
     * @param {Object} payload - payload of the operation request. Specifically
     *                           the content of the Request Payload as defined
     *                           by the KMIP protocol specification.
     * @param {Function} cb - The callback(error: Object, response: Object)
     * @returns {undefined}
     */
    request(logger, operation, payload, cb) {
        const uuid = _uniqueBatchItemID();
        const message = KMIP.Message([
            KMIP.Structure('Request Message', [
                KMIP.Structure('Request Header', [
                    KMIP.Structure('Protocol Version', [
                        KMIP.Integer('Protocol Version Major',
                                     this.protocolVersion.major),
                        KMIP.Integer('Protocol Version Minor',
                                     this.protocolVersion.minor)]),
                    KMIP.Integer('Maximum Response Size',
                                 this.maximumResponseSize),
                    KMIP.Integer('Batch Count', 1)]),
                KMIP.Structure('Batch Item', [
                    KMIP.Enumeration('Operation', operation),
                    KMIP.ByteString('Unique Batch Item ID', uuid),
                    KMIP.Structure('Request Payload', payload),
                ])])]);
        const encodedMessage = this._encodeMessage(message);
        this.transport.send(
            logger, encodedMessage,
            (err, conversation, rawResponse) => {
                if (err) {
                    logger.error('KMIP::request: Failed to encode message',
                                 { error: err });
                    return cb(err);
                }
                const response = this._decodeMessage(logger, rawResponse);
                const performedOperation =
                      response.lookup('Response Message/' +
                                      'Batch Item/Operation')[0];
                const resultStatus =
                      response.lookup('Response Message/' +
                                      'Batch Item/Result Status')[0];
                const resultUniqueBatchItemID =
                      response.lookup('Response Message/' +
                                      'Batch Item/Unique Batch Item ID')[0];

                if (!resultUniqueBatchItemID ||
                    resultUniqueBatchItemID.compare(uuid) !== 0) {
                    this.transport.abortPipeline(conversation);
                    const error = Error('Invalid batch item ID returned');
                    logger.error('KMIP::request: failed',
                                 { resultUniqueBatchItemID, uuid, error });
                    return cb(error);
                }
                if (performedOperation !== operation) {
                    this.transport.abortPipeline(conversation);
                    const error = Error('Operation mismatch',
                                        { got: performedOperation,
                                         expected: operation });
                    logger.error('KMIP::request: Operation mismatch',
                                 { error });
                    return cb(error);
                }
                if (resultStatus !== 'Success') {
                    const resultReason =
                          response.lookup(
                              'Response Message/Batch Item/Result Reason')[0];
                    const resultMessage =
                          response.lookup(
                              'Response Message/Batch Item/Result Message')[0];
                    const error = Error('KMIP request failure',
                                        { resultStatus,
                                          resultReason,
                                          resultMessage });
                    logger.error('KMIP::request: request failed',
                                 { error, resultStatus,
                                   resultReason, resultMessage });
                    return cb(error);
                }
                return cb(null, response);
            });
    }


}


module.exports = KMIP;
