import protobuf from 'protobufjs';
import crypto from 'crypto';

const VERSION = 0x46;
const protoFilePath = __dirname + '/kinetic.proto';
const buildName = 'com.seagate.kinetic.proto';

/**
 * Represents the Kinetic Protocol Data Structure.
 * @constructor
 */
class Kinetic {
    constructor() {
        this._version = VERSION;
        this.logs = {
            UTILIZATIONS: 0,
            TEMPERATURES: 1,
            CAPACITIES: 2,
            CONFIGURATION: 3,
            STATISTICS: 4,
            MESSAGES: 5,
            LIMITS: 6,
            DEVICE: 7,
        };
        this.op = {
            PUT: 4,
            PUT_RESPONSE: 3,
            GET: 2,
            GET_RESPONSE: 1,
            NOOP: 30,
            NOOP_RESPONSE: 29,
            DELETE: 6,
            DELETE_RESPONSE: 5,
            SET_CLUSTER_VERSION: 22,
            SETUP_RESPONSE: 21,
            FLUSH: 32,
            FLUSH_RESPONSE: 31,
            GETLOG: 24,
            GETLOG_RESPONSE: 23,
        };
        this.errors = {
            INVALID_STATUS_CODE: -1,
            NOT_ATTEMPTED: 0,
            SUCCESS: 1,
            HMAC_FAILURE: 2,
            NOT_AUTHORIZED: 3,
            VERSION_FAILURE: 4,
            INTERNAL_ERROR: 5,
            HEADER_REQUIRED: 6,
            NOT_FOUND: 7,
            VERSION_MISMATCH: 8,
            SERVICE_BUSY: 9,
            EXPIRED: 10,
            DATA_ERROR: 11,
            PERM_DATA_ERROR: 12,
            REMOTE_CONNECTION_ERROR: 13,
            NO_SPACE: 14,
            NO_SUCH_HMAC_ALGORITHM: 15,
            INVALID_REQUEST: 16,
            NESTED_OPERATION_ERRORS: 17,
            DEVICE_LOCKED: 18,
            DEVICE_ALREADY_UNLOCKED: 19,
            CONNECTION_TERMINATED: 20,
            INVALID_BATCH: 21,
        };
        this.build = protobuf.loadProtoFile(protoFilePath).build(buildName);
        return this;
    }

    /**
     * Sets the actual protobuf message for the Kinetic Protocol Data Unit.
     * @param {Object} pbMessage - the well formated kinetic protobuf structure.
     * @returns {Kinetic} to allow for a functional style.
     */
    setProtobuf(pbMessage) {
        this._message = pbMessage;
        return this;
    }

    /**
     * Sets the chunk for the Kinetic Protocol Data Unit.
     * @param {Buffer} chunk.
     * @returns {Kinetic} to allow for a functional style.
     */
    setChunk(chunk) {
        this._chunk = chunk;
        return this;
    }

    /**
     * Sets the general protobuf message for the Kinetic Protocol Data Unit.
     * @param {Object} command - the well formated general kinetic protobuf
     * structure.
     * @returns {Kinetic} setting the protobuf message.
     */
    setCommand(command) {
        const message = new this.build.Command(command);
        return this.setProtobuf(message);
    }


    setMessage() {
        const buf = new Buffer(4);
        buf.writeInt32BE(this.getProtobufSize());
        this.setHMAC(Buffer.concat([buf, this.getProtobuf().toBuffer()]));
        const tmp = new this.build.Message({
            "authType": 1,
            "hmacAuth": {
                "identity": 1,
                "hmac": this.getHMAC(),
            },
            "commandBytes": this.getProtobuf().toBuffer(),
        });

        return this.setProtobuf(tmp);
    }

    /**
     * Sets the HMAC for the Kinetic Protocol Data Unit integrity.
     * @param {Buffer} secret - the shared secret.
     * @returns {Kinetic} to allow for a functional style.
     */
    setHMAC(integrity) {
        this._hmac =  crypto.createHmac('sha1', 'asdfasdf')
            .update(integrity).digest();
        return this;
    }

    /**
     * Slice the buffer with the offset and the limit.
     * @param {Object} obj - an object buffer with offset and limit.
     * @returns {Buffer} sliced buffer from the buffer structure with the offset
     * and the limit.
     */
    getSlice(obj) {
        return obj.buffer.slice(obj.offset, obj.limit);
    }

    /**
     * Gets the actual version of the kinetic protocol.
     * @returns {Number} the current version of the kinetic protocol.
     */
    getVersion() {
        return this._version;
    }

    /**
     * Gets the actual protobuf message.
     * @returns {Object} Kinetic protobuf message.
     */
    getProtobuf() {
        return this._message;
    }

    /**
     * Gets the actual protobuf message size.
     * @returns {Number} Size of the kinetic protobuf message.
     */
    getProtobufSize() {
        return this.getProtobuf().calculate();
    }

    /**
     * Gets the actual chunk.
     * @returns {Buffer} Chunk.
     */
    getChunk() {
        return this._chunk;
    }

    /**
     * Gets the actual chunk size.
     * @returns {Number} Chunk size.
     */
    getChunkSize() {
        return this._chunk.length;
    }

    /**
     * Gets the general build template.
     * @returns {Object} General kinetic protobuf structure.
     */
    getCommand() {
        return this.build.Command;
    }

    /**
     * Gets the general build template.
     * @returns {Object} General kinetic protobuf structure.
     */
    getMessage() {
        return this.build.Message;
    }

    /**
     * Gets the actual HMAC.
     * @returns {Buffer} HMAC.
     */
    getHMAC() {
        return this._hmac;
    }

    /**
     * Gets the actual request messageType.
     * @returns {Number} The code number of the request.
     */
    getMessageType() {
        return this.getProtobuf().header.messageType;
    }

    /**
     * Gets the actual clusterVersion.
     * @returns {Number} The clusterVersion.
     */
    getClusterVersion() {
        return this.getProtobuf().header.clusterVersion.low;
    }

    /**
     * Gets the actual key.
     * @returns {Buffer} Key.
     */
    getKey() {
        return this.getSlice(this.getProtobuf().body.keyValue.key);
    }

    /**
     * Gets the version of the data unit in the database.
     * @returns {Buffer} Version of the data unit in the database.
     */
    getDbVersion() {
        return this.getSlice(this.getProtobuf().body.keyValue.dbVersion);
    }

    /**
     * Gets the new version of the data unit.
     * @returns {Buffer} New version of the data unit.
     */
    getNewVersion() {
        return this.getSlice(this.getProtobuf().body.keyValue.newVersion);
    }

    /**
     * Gets the detailed error message.
     * @returns {Buffer} Detailed error message.
     */
    getErrorMessage() {
        return this.getSlice(this.getProtobuf().status.detailedMessage);
    }

    /**
     * Gets the logs message.
     * @returns {Buffer} Logs message.
     */
    getGetLogMessage() {
        return this.getSlice(this.getProtobuf().body.getLog.messages);
    }

    /**
     * Gets the operation name with it code.
     * @param {Number} opCode - the operation code.
     * @returns {String} operation name.
     */
    getOp(opCode) {
        return this.getKeyByValue(this.op, opCode);
    }

    /**
     * Gets the error name with it code.
     * @param {Number} errorCode - the error code.
     * @returns {String} error name.
     */
    getError(errorCode) {
        return this.getKeyByValue(this.errors, errorCode);
    }

    /**
     * Gets the log type name with it code.
     * @param {Number} logCode - the log type code.
     * @returns {String} log type name.
     */
    getLogType(logCode) {
        return this.getKeyByValue(this.logs, logCode);
    }

    /**
     * Gets the key of an object with it value.
     * @param {Object} object - the corresponding object.
     * @param {value} value - the corresponding value.
     * @returns {Buffer} object key.
     */
    getKeyByValue(object, value) {
        return Object.keys(object).find(key => object[key] === value);
    }

    /**
     * Compare two buffers.
     * @param {Buffer} buf0/buf1 - the buffers to compare.
     * @returns {Boolean} false if it's different true if not.
     */
    diff(buf0, buf1) {
        if (buf0.length !== buf1.length) {
            return false;
        }
        for (let i = 0; i <= buf0.length; i++) {
            if (buf0[i] !== buf1[i])
                return false;
        }
        return true;
    }

    /**
     * Test the HMAC integrity between the actual instance and the given HMAC.
     * @param {Buffer} hmac - the non instance hmac to compare.
     * @returns {Boolean} true if the HMACs are the same.
     * @returns an error if they are different.
     */
    hmacIntegrity(hmac) {
        if (hmac === undefined || this.getHMAC() === undefined)
            return this.errors.HMAC_FAILURE;

        const buf = new Buffer(4);
        buf.writeInt32BE(this.getProtobufSize());
        this.setHMAC(Buffer.concat([buf, this.getProtobuf().toBuffer()]));
        if (this.diff(hmac, this.getHMAC()) === false)
            return this.errors.HMAC_FAILURE;
        return true;
    }

    /**
     * Getting logs and stats request following the kinetic protocol.
     * @param {number} incrementTCP - monotonically increasing number for each
     * request in a TCP connection.
     * @param {Array} types - array filled by logs types needed.
     * @param {number} clusterVersion - version of the cluster
     * @returns {Kinetic} this - message structure following the kinetic
     * protocol
     */
    getLog(incrementTCP, types, clusterVersion) {
        const identity = (new Date).getTime();
        return this.setCommand({
            "header": {
                "messageType": "GETLOG",
                "connectionID": identity,
                "sequence": incrementTCP,
                "clusterVersion": clusterVersion,
            },
            "body": {
                "getLog": {
                    "types": types,

                },
            },
        }).setMessage();
    }

    /**
     * Getting logs and stats response following the kinetic protocol.
     * @param {String or number} response - response code (SUCCESS, FAIL)
     * @param {String or Buffer} errorMessage - detailed error message.
     * @param {object} responseLogs - object filled by logs needed.
     * @returns {Kinetic} this - message structure following the kinetic
     * protocol
     */
    getLogResponse(response, errorMessage, responseLogs) {
        return this.setCommand({
            "header": {
                "ackSequence": this.getProtobuf().header.sequence,
                "messageType": "GETLOG_RESPONSE",
            },
            "body": {
                "getLog": responseLogs,
            },
            "status": {
                "code": response,
                "detailedMessage": errorMessage,
            },
        }).setMessage();
    }

    /**
     * Flush all data request following the kinetic protocol.
     * @param {number} incrementTCP - monotonically increasing number for each
     * request in a TCP connection.
     * @param {number} clusterVersion - version of the cluster
     * @returns {Kinetic} this - message structure following the kinetic
     * protocol
     */
    flush(incrementTCP, clusterVersion) {
        const identity = (new Date).getTime();
        return this.setCommand({
            "header": {
                "messageType": "FLUSHALLDATA",
                "connectionID": identity,
                "sequence": incrementTCP,
                "clusterVersion": clusterVersion,
            },
            "body": {
            },
        }).setMessage();
    }

    /**
     * Flush all data response following the kinetic protocol.
     * @param {String or number} response - response code (SUCCESS, FAIL)
     * @param {String or Buffer} errorMessage - detailed error message.
     * @returns {Kinetic} this - message structure following the kinetic
     * protocol
     */
    flushResponse(response, errorMessage) {
        return this.setCommand({
            "header": {
                "messageType": "FLUSHALLDATA_RESPONSE",
                "ackSequence": this.getProtobuf().header.sequence,
            },
            "status": {
                "code": response,
                "detailedMessage": errorMessage,
            },
        }).setMessage();
    }

    /**
     * set clusterVersion request following the kinetic protocol.
     * @param {number} incrementTCP - monotonically increasing number for each
     * request in a TCP connection.
     * @param {number} clusterVersion - The version number of this cluster
     * definition
     * @param {number} oldClusterVersion - The old version number of this
     * cluster definition
     * @returns {Kinetic} this - message structure following the kinetic
     * protocol
     */
    setClusterVersion(incrementTCP, clusterVersion, oldClusterVersion) {
        const identity = (new Date).getTime();
        return this.setCommand({
            "header": {
                "messageType": "SETUP",
                "connectionID": identity,
                "sequence": incrementTCP,
                "clusterVersion": oldClusterVersion,
            },
            "body": {
                "setup": {
                    "newClusterVersion": clusterVersion,
                },
            },
        }).setMessage();
    }

    /**
     * Setup response request following the kinetic protocol.
     * @param {String or number} response - response code (SUCCESS, FAIL)
     * @param {String or Buffer} errorMessage - detailed error message.
     * @returns {Kinetic} this - message structure following the kinetic
     * protocol
     */
    setupResponse(response, errorMessage) {
        return this.setCommand({
            "header": {
                "messageType": "SETUP_RESPONSE",
                "ackSequence": this.getProtobuf().header.sequence,
            },
            "status": {
                "code": response,
                "detailedMessage": errorMessage,
            },
        }).setMessage();
    }

    /**
     * NOOP request following the kinetic protocol.
     * @param {number} incrementTCP - monotonically increasing number for each
     * request in a TCP connection
     * @param {number} clusterVersion - The version number of this cluster
     * definition
     * @returns {Kinetic} this - message structure following the kinetic
     * protocol
     */
    noOp(incrementTCP, clusterVersion) {
        const identity = (new Date).getTime();
        return this.setCommand({
            "header": {
                "messageType": "NOOP",
                "connectionID": identity,
                "sequence": incrementTCP,
                "clusterVersion": clusterVersion,
            },
            "body": {
            },
        }).setMessage();
    }

    /**
     * Response for the NOOP request following the kinetic protocol.
     * @param {String or number} response - response code (SUCCESS, FAIL)
     * @param {String or Buffer} errorMessage - detailed error message.
     * @returns {Kinetic} this - message structure following the kinetic
     * protocol
     */
    noOpResponse(response, errorMessage) {
        return this.setCommand({
            "header": {
                "messageType": "NOOP_RESPONSE",
                "ackSequence": this.getProtobuf().header.sequence,
            },
            "status": {
                "code": response,
                "detailedMessage": errorMessage,
            },
        }).setMessage();
    }

    /**
     * PUT request following the kinetic protocol.
     * @param {String or Buffer} key - key of the item to put.
     * @param {number} incrementTCP - monotonically increasing number for each
     * request in a TCP connection
     * @param {String or Buffer} dbVersion - version of the item in the
     * database.
     * @param {String or Buffer} newVersion - new version of the item to put.
     * @param {number} clusterVersion - The version number of this cluster
     * definition
     * @returns {Kinetic} this - message structure following the kinetic
     * protocol
     */
    put(key, incrementTCP, dbVersion, newVersion, clusterVersion) {
        const identity = (new Date).getTime();
        return this.setCommand({
            "header": {
                "messageType": "PUT",
                "connectionID": identity,
                "sequence": incrementTCP,
                "clusterVersion": clusterVersion,
            },
            "body": {
                "keyValue": {
                    "key": key,
                    "newVersion": newVersion,
                    "dbVersion": dbVersion,
                    "synchronization": 'WRITETHROUGH',
                },
            },
        }).setMessage();
    }

    /**
     * Response for the PUT request following the kinetic protocol.
     * @param {String or number} response - response code (SUCCESS, FAIL)
     * @param {String or Buffer} errorMessage - detailed error message.
     * @returns {Kinetic} this - message structure following the kinetic
     * protocol
     */
    putResponse(response, errorMessage) {
        return this.setCommand({
            "header": {
                "messageType": "PUT_RESPONSE",
                "ackSequence": this.getProtobuf().header.sequence,
            },
            "body": {
                "keyValue": { },
            },
            "status": {
                "code": response,
                "detailedMessage": errorMessage,
            },
        }).setMessage();
    }

    /**
     * GET request following the kinetic protocol.
     * @param {String or Buffer} key - key of the item to put.
     * @param {number} incrementTCP - monotonically increasing number for each
     * request in a TCP connection
     * @param {number} clusterVersion - The version number of this cluster
     * definition
     * @returns {Kinetic} this - message structure following the kinetic
     * protocol
     */
    get(key, incrementTCP, clusterVersion) {
        const identity = (new Date).getTime();
        return this.setCommand({
            "header": {
                "messageType": "GET",
                "connectionID": identity,
                "sequence": incrementTCP,
                "clusterVersion": clusterVersion,
            },
            "body": {
                "keyValue": {
                    "key": key,
                },
            },
        }).setMessage();
    }

    /**
     * Response for the GET request following the kinetic protocol.
     * @param {String or number} response - response code (SUCCESS, FAIL)
     * @param {String or Buffer} errorMessage - Detailed error message.
     * @param {String or Buffer} dbVersion - The version of the item in the
     * database.
     * @returns {Kinetic} this - message structure following the kinetic
     * protocol
     */
    getResponse(response, errorMessage, dbVersion) {
        return this.setCommand({
            "header": {
                "messageType": "GET_RESPONSE",
                "ackSequence": this.getProtobuf().header.sequence,
            },
            "body": {
                "keyValue": {
                    "key": this.getProtobuf().body.keyValue.key,
                    "dbVersion": dbVersion,
                },
            },
            "status": {
                "code": response,
                "detailedMessage": errorMessage,
            },
        }).setMessage();
    }

    /**
     * DELETE request following the kinetic protocol.
     * @param {String or Buffer} key - key of the item to put.
     * @param {number} incrementTCP - monotonically increasing number for each
     * request in a TCP connection
     * @param {String or Buffer} dbVersion - version of the item in the
     * database.
     * @param {number} clusterVersion - The version number of this cluster
     * definition
     * @returns {Kinetic} this - message structure following the kinetic
     * protocol
     */
    delete(key, incrementTCP, clusterVersion, dbVersion) {
        const identity = (new Date).getTime();
        return this.setCommand({
            "header": {
                "messageType": "DELETE",
                "connectionID": identity,
                "sequence": incrementTCP,
                "clusterVersion": clusterVersion,
            },
            "body": {
                "keyValue": {
                    "key": key,
                    "dbVersion": dbVersion,
                    "synchronization": 'WRITETHROUGH',
                },
            },
        }).setMessage();
    }

    /**
     * Response for the DELETE request following the kinetic protocol.
     * @param {String or number} response - response code (SUCCESS, FAIL)
     * @param {String or Buffer} errorMessage - Detailed error message.
     * @returns {Kinetic} this - message structure following the kinetic
     * protocol
     */
    deleteResponse(response, errorMessage) {
        return this.setCommand({
            "header": {
                "messageType": "DELETE_RESPONSE",
                "ackSequence": this.getProtobuf().header.sequence,
            },
            "body": {
                "keyValue": { },
            },
            "status": {
                "code": response,
                "detailedMessage": errorMessage,
            },
        }).setMessage();
    }

    /**
     * Sends data following Kinetic protocol.
     * @param {Socket} sock - Socket to send data through.
     */
    send(sock) {
        const buf = new Buffer(9);

        buf.writeInt8(this.getVersion(), 0);

        // BE stands for Big Endian
        buf.writeInt32BE(this.getProtobufSize(), 1);
        buf.writeInt32BE(this.getChunkSize(), 5);

        sock.write(Buffer.concat(
                [buf, this.getProtobuf().toBuffer(), this.getChunk()]
            ));
    }

    /**
     * Creates the Kinetic Protocol Data Structure from a buffer.
     * @param {Buffer} data - The data received by the socket.
     */
    parse(data) {
        const version = data.readInt8(0);
        const pbMsgLen = data.readInt32BE(1);
        const chunkLen = data.readInt32BE(5);

        if (version !== this.getVersion()) {
            return this.errors.VERSION_FAILURE;
        }

        try {
            this._cmd = this.build.Message.decode(data.slice(9, 9 + pbMsgLen));
            this.setProtobuf(this.getCommand().decode(this._cmd.commandBytes));
        } catch (e) {
            if (e.decoded) {
                this.setProtobuf(e.decoded);
            } else {
                return this.errors.INTERNAL_ERROR;
            }
        }
        this.setChunk(data.slice(pbMsgLen + 9, chunkLen + pbMsgLen + 9));

        if (this.getChunkSize() !== chunkLen) {
            return this.errors.DATA_ERROR;
        }
        if (this._cmd.authType === 1 &&
            this.hmacIntegrity(this.getSlice(this._cmd.hmacAuth.hmac)) !== true)
            return this.errors.HMAC_FAILURE;

        return this.errors.SUCCESS;
    }
}

export default Kinetic;
