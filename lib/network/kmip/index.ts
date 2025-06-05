import uuid from 'uuid/v4';
import Message from './Message';
import * as werelogs from 'werelogs';
import { errorMapping, kmipMsg } from './errorMapping';
import { errorInstances } from '../../errors';

type UUIDOptions = { random?: number[]; rng?: () => number[]; } | null;
function uuidv4(options: UUIDOptions, buffer: Buffer, offset?: number): Buffer;
function uuidv4(options?: UUIDOptions): string;
function uuidv4(options?: any, buffer?: any, offset?: any) {
    return uuid(options, buffer, offset);
}

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


function _PrimitiveType(tagName: string, type: string, value: any) {
    return { [tagName]: { type, value } };
}

/**
 * Thales has a 24h idle tls session error. We can close and reopen new connection.
 * This is not part of KMIP spec and it is not documented.
 * We asked for a tweaked lab with a 10m timeout to test this behavior.
 */
const thalesInternalTokenError = {
    status: 'Operation Failed',
    reason: 'General Failure',
    messages: [
        '[NCERRUnauthorizedAccess]: Token has been revoked',
        '[NCERRUnauthorizedAccess]: Invalid token'
    ],
};

function isThalesInternalTokenError(status, reason, message) {
    return status === thalesInternalTokenError.status
        && reason === thalesInternalTokenError.reason
        && thalesInternalTokenError.messages.includes(message);
}

export type Options = { codec: any; transport: any; };
export default class KMIP {
    protocolVersion: {
        major: number;
        minor: number;
    };
    maximumResponseSize: number;
    options: Options;
    codec: any;
    transport: any;
    handshakeDone: boolean;

    /**
     * Construct a new KMIP Object
     * @param {Class} Codec -
     * @param {Class} Transport -
     * @param {Object} options -
     */
    constructor(Codec: any, Transport: any, options: { kmip: Options }) {
        this.protocolVersion = {
            major: DEFAULT_PROTOCOL_VERSION_MAJOR,
            minor: DEFAULT_PROTOCOL_VERSION_MINOR,
        };
        this.maximumResponseSize = DEFAULT_MAXIMUM_RESPONSE_SIZE;
        this.options = options.kmip;
        this.codec = new Codec(options.kmip.codec);
        this.transport = new Transport(options.kmip.transport);
        this.handshakeDone = false;
    }

    /* Static class methods */

    /**
     * create a new abstract message instance
     * @param content - Most likely a call to KMIP.Structure
     *                           with 'Request Message' as tagName
     * @returns an instance of Message
     */
    static Message(content: any) {
        return new Message(content);
    }

    /**
     * Create a KMIP Structure field instance
     * @param tagName - Name of the KMIP field
     * @param value - array of KMIP fields
     * @returns an abstract KMIP field
     */
    static Structure(tagName: string, value: any[]) {
        return _PrimitiveType(tagName, 'Structure', value);
    }

    /**
     * Create a KMIP Integer field instance
     * @param tagName - Name of the KMIP field
     * @param value - a number
     * @returns an abstract KMIP field
     */
    static Integer(tagName: string, value: number) {
        return _PrimitiveType(tagName, 'Integer', value);
    }

    /**
     * Create a KMIP Long Integer field instance
     * @param tagName - Name of the KMIP field
     * @param value - a number (beware of the 53-bit limitation)
     * @returns an abstract KMIP field
     */
    static LongInteger(tagName: string, value: number) {
        return _PrimitiveType(tagName, 'LongInteger', value);
    }

    /**
     * Create a KMIP Big Integer field instance
     * @param tagName - Name of the KMIP field
     * @param value - buffer containing the big integer
     * @returns an abstract KMIP field
     */
    static BigInteger(tagName: string, value: Buffer) {
        if (value.length % 8 !== 0) {
            throw Error('Big Integer value length must be a multiple of 8');
        }
        return _PrimitiveType(tagName, 'BigInteger', value);
    }

    /**
     * Create a KMIP Enumeration field instance
     * @param tagName - Name of the KMIP Enumeration
     * @param value - Name of the KMIP Enumeration value
     * @returns an abstract KMIP field
     */
    static Enumeration(tagName: string, value: string) {
        return _PrimitiveType(tagName, 'Enumeration', value);
    }

    /**
     * Create a KMIP Boolean field instance
     * @param tagName - Name of the KMIP field
     * @param value - anything falsey or not (converted to a Boolean)
     * @returns an abstract KMIP field
     */
    static Boolean(tagName: string, value: boolean) {
        return _PrimitiveType(tagName, 'Boolean', !!value);
    }

    /**
     * Create a KMIP Text String field instance
     * @param tagName - Name of the KMIP field
     * @param value - the text string
     * @returns an abstract KMIP field
     */
    static TextString(tagName: string, value: string) {
        return _PrimitiveType(tagName, 'TextString', value);
    }

    /**
     * Create a KMIP Byte String field instance
     * @param tagName - Name of the KMIP field
     * @param value - buffer containing the byte string
     * @returns an abstract KMIP field
     */
    static ByteString(tagName: string, value: Buffer) {
        return _PrimitiveType(tagName, 'ByteString', value);
    }

    /**
     * Create a KMIP Date-Time field instance
     * @param tagName - Name of the KMIP field
     * @param value - instance of a Date (ms are discarded)
     * @returns an abstract KMIP field
     */
    static DateTime(tagName: string, value: Date) {
        value.setMilliseconds(0);
        return _PrimitiveType(tagName, 'Date-Time', value);
    }

    /**
     * Create a KMIP Interval field instance
     * @param tagName - Name of the KMIP field
     * @param value - number of seconds of the interval
     * @returns an abstract KMIP field
     */
    static Interval(tagName: string, value: number) {
        return _PrimitiveType(tagName, 'Interval', value);
    }

    /**
     * Create a KMIP Attribute field instance
     * @param type - type of the attribute value
     * @param name - Name of the attribute or KMIP field
     * @param value - value of the field suitable for the
     *                         specified type
     * @returns an abstract KMIP field
     */
    static Attribute(type: string, name: string, value: any) {
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
     * @param handshakeFunction - (logger: Object, cb: Function(err))
     */
    registerHandshakeFunction(
        handshakeFunction: (
            logger: werelogs.Logger,
            cb: (error: Error | null) => void,
        ) => void,
    ) {
        this.transport.registerHandshakeFunction(handshakeFunction);
    }

    /**
     * Decode a raw message, usually received from the transport layer
     * @param logger - a Logger instance
     * @param rawMessage - the message to decode
     * @returns the decoded message as an instance of KMIP.Message
     */
    _decodeMessage(logger: werelogs.Logger, rawMessage: Buffer) {
        return this.codec.decode(logger, rawMessage);
    }

    /**
     * Encode an message
     * @param message - Instance of a KMIP.Message
     * @returns the encoded message suitable for the transport layer
     */
    _encodeMessage(message: any) {
        return this.codec.encode(message);
    }

    /**
     * Decode a bitmask
     * @param tagName - name of the bit mask defining tag
     * @param givenMask - bit mask to decode
     * @returns array of named bits set in the given bit mask
     */
    decodeMask(tagName: string, givenMask: number) {
        return this.codec.decodeMask(tagName, givenMask);
    }

    /**
     * Encode a bitmask
     * @param tagName - name of the bit mask defining tag
     * @param value - array of named bits to set in the mask
     * @returns Integer encoded bitmask
     */
    encodeMask(tagName: string, value: any[]): number {
        return this.codec.encodeMask(tagName, value);
    }

    /**
     * Amend the tag nomenclature with a vendor specific extension
     * @param extensionName - Name of the tag to record
     * @param extensionTag - Tag value represented as an integer
     */
    mapExtension(extensionName: string, extensionTag: number) {
        return this.codec.mapExtension(extensionName, extensionTag);
    }

    changeProtocolVersion(major: number, minor: number) {
        this.protocolVersion = { major, minor };
    }

    /**
     * Send an operation request message to the KMIP Server
     * @param logger - Werelog logger object
     * @param {String} operation - The name of the operation as defined in
     *                             the KMIP protocol specification.
     * @param {Object} payload - payload of the operation request. Specifically
     *                           the content of the Request Payload as defined
     *                           by the KMIP protocol specification.
     * @param {Function} cb - The callback(error: Object, response: Object)
     * @param {String} [resource] - KeyId or BucketName to identify in error message
     * @returns {undefined}
     */
    request(logger: werelogs.Logger, operation: string, payload: any,
        cb: (error: Error | null, response?: any) => void, resource?: string) {
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
        this._sendEncodedMessage(logger, operation, encodedMessage, uuid, false, cb, resource);
    }

    _sendEncodedMessage(
        logger: werelogs.Logger,
        operation: string,
        encodedMessage: Message,
        uuid: Buffer,
        isRetry: boolean,
        cb: (error: Error | null, response?: any) => void,
        resource?: string
    ) {
        const startDate = Date.now();
        this.transport.send(
            logger, encodedMessage,
            (err, conversation, rawResponse, latencies, queues) => {
                const now = Date.now();
                const kmipLog = {
                    host: this.options.transport.tls.host,
                    op: operation,
                    latencyMs: {
                        total: now - startDate,
                        deferred: (latencies.req ?? now) - latencies.defered,
                        req: now - latencies.req,
                    },
                    queues,
                };
                if (err) {
                    // Retryable most likely network related
                    const error = errorInstances.InternalError
                        .customizeDescription(kmipMsg(operation, resource, err.toString()));
                    // warn level to avoid dumping debug and trace logs on retryable errors
                    logger.warn('KMIP::request: Failed to send message',
                        { error: err, msg: err?.toString?.(), kmip: kmipLog });
                    return cb(error);
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
                /** Collect all possible error from the response */
                const errorList: { msg: string, got: any, expected: any }[] = [];
                if (!resultUniqueBatchItemID ||
                    resultUniqueBatchItemID.compare(uuid) !== 0) {
                    this.transport.abortPipeline(conversation);
                    errorList.push({
                        msg: 'Invalid batch item ID returned',
                        got: resultUniqueBatchItemID?.toString('hex'),
                        expected: uuid.toString('hex'),
                    });
                }
                if (performedOperation !== operation) {
                    this.transport.abortPipeline(conversation);
                    errorList.push({
                        msg: 'Operation mismatch',
                        got: performedOperation,
                        expected: operation,
                    });
                }
                if (resultStatus !== 'Success') {
                    const resultReason =
                          response.lookup(
                              'Response Message/Batch Item/Result Reason')[0];
                    const resultMessage =
                          response.lookup(
                              'Response Message/Batch Item/Result Message')[0];
                    errorList.push({
                        msg: 'error reponse',
                        got: { resultStatus, resultReason, resultMessage },
                        expected: undefined,
                    });

                    if (!isRetry && isThalesInternalTokenError(resultStatus, resultReason, resultMessage)) {
                        logger.info('KMIP::reconnecting', { errorList, kmipLog, handshakeDone: this.handshakeDone });
                        // Close TLS channel socket
                        this.transport.abortPipeline(conversation, () => {
                            // Once completely closed and all callbacks are drained,
                            // reopen the TLS channel connection and skip KMIP handshake if it was already done
                            // as we already have kmip details
                            this.transport._createConversation(logger, () => {}, this.handshakeDone);
                            this._sendEncodedMessage(logger, operation, encodedMessage, uuid, true, cb, resource);
                        });
                        return undefined;
                    }

                    // Use AccessDenied as default to avoid retryable error
                    // Error message does not match AWS, generic message for KMIP provide every details
                    const kmsErr = (errorMapping[resultStatus]?.[resultReason] ?? errorInstances.AccessDenied)
                        .customizeDescription(
                            kmipMsg(operation, resource, `${resultReason}: ${resultMessage}`)
                        );
                    // warn level to avoid dumping debug and trace logs on retryable errors
                    logger.warn('KMIP::request error', { errorList, kmip: kmipLog, error: kmsErr });
                    return cb(kmsErr);
                }
                if (errorList.length) {
                    // warn level to avoid dumping debug and trace logs on retryable errors
                    logger.warn('KMIP::request error', { errorList, kmip: kmipLog });
                    // Retryable as connection is closed and all messages errored
                    return cb(errorInstances.InternalError.customizeDescription(
                        kmipMsg(operation, resource, `Internal ${errorList.map(e => e.msg)}`)
                    ));
                }
                logger.info('KMIP::success', { kmip: kmipLog });
                return cb(null, response);
            });
    }

    stop(cb?: Function) {
        this.transport.end(cb);
    }
}
