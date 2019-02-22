'use strict'; // eslint-disable-line

const TTLVCodec = require('./codec/ttlv.js');
const Message = require('./Message.js');

function _PrimitiveType(tagName, type, value) {
    return { [tagName]: { type, value } };
}

class KMIP {
    /**
     * Construct a new KMIP Object
     */
    constructor() {
        this.codec = new TTLVCodec();
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
     * Create a KMIP Structure field
     * @param {String} tagName - Name of the KMIP field
     * @param {Array} value - array of KMIP fields
     * @returns {Object} an abstract KMIP field
     */
    static Structure(tagName, value) {
        return _PrimitiveType(tagName, 'Structure', value);
    }

    /**
     * Create a KMIP Integer field
     * @param {String} tagName - Name of the KMIP field
     * @param {Number} value - a number
     * @returns {Object} an abstract KMIP field
     */
    static Integer(tagName, value) {
        return _PrimitiveType(tagName, 'Integer', value);
    }

    /**
     * Create a KMIP Long Integer field
     * @param {String} tagName - Name of the KMIP field
     * @param {Number} value - a number (beware of the 53-bit limitation)
     * @returns {Object} an abstract KMIP field
     */
    static LongInteger(tagName, value) {
        return _PrimitiveType(tagName, 'LongInteger', value);
    }

    /**
     * Create a KMIP Big Integer field
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
     * Create a KMIP Enumeration field
     * @param {String} tagName - Name of the KMIP Enumeration
     * @param {String} value - Name of the KMIP Enumeration value
     * @returns {Object} an abstract KMIP field
     */
    static Enumeration(tagName, value) {
        return _PrimitiveType(tagName, 'Enumeration', value);
    }

    /**
     * Create a KMIP Boolean field
     * @param {String} tagName - Name of the KMIP field
     * @param {Boolean} value - anything falsey or not (converted to a Boolean)
     * @returns {Object} an abstract KMIP field
     */
    static Boolean(tagName, value) {
        return _PrimitiveType(tagName, 'Boolean', !!value);
    }

    /**
     * Create a KMIP Text String field
     * @param {String} tagName - Name of the KMIP field
     * @param {String} value - the text string
     * @returns {Object} an abstract KMIP field
     */
    static TextString(tagName, value) {
        return _PrimitiveType(tagName, 'TextString', value);
    }

    /**
     * Create a KMIP Byte String field
     * @param {String} tagName - Name of the KMIP field
     * @param {Buffer} value - buffer containing the byte string
     * @returns {Object} an abstract KMIP field
     */
    static ByteString(tagName, value) {
        return _PrimitiveType(tagName, 'ByteString', value);
    }

    /**
     * Create a KMIP Date-Time field
     * @param {String} tagName - Name of the KMIP field
     * @param {Date} value - instance of a Date (ms are discarded)
     * @returns {Object} an abstract KMIP field
     */
    static DateTime(tagName, value) {
        value.setMilliseconds(0);
        return _PrimitiveType(tagName, 'Date-Time', value);
    }

    /**
     * Create a KMIP Interval field
     * @param {String} tagName - Name of the KMIP field
     * @param {Integer} value - number of seconds of the interval
     * @returns {Object} an abstract KMIP field
     */
    static Interval(tagName, value) {
        return _PrimitiveType(tagName, 'Interval', value);
    }

    /**
     *
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
     * Decode a raw message, usually received from the transport layer
     * @param {Object} logger - a Logger instance
     * @param {Buffer} rawMessage - the message to decode
     * @returns {Object} the decoded message as an instance of KMIP.Message
     */
    decodeMessage(logger, rawMessage) {
        return this.codec.decode(logger, rawMessage);
    }

    /**
     * Encode an message
     * @param {Object} message - Instance of a KMIP.Message
     * @returns {Buffer} the encoded message suitable for the transport layer
     */
    encodeMessage(message) {
        return this.codec.encode(message);
    }

    /**
     * Amend the tag nomenclature with a vendor specific extension
     * @param {String} tagName - Name of the tag to record
     * @param {Integer} tagValue - Tag value represented as an integer
     * @returns {undefined}
     */
    mapExtension(tagName, tagValue) {
        return this.codec.mapExtension(tagName, tagValue);
    }
}


module.exports = KMIP;
