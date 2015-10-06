import protobuf from 'protobufjs';
import crypto from 'crypto';

const VERSION = 0x46;
const protoFilePath = __dirname + '/kinetic-protocol/kinetic.proto';
const buildName = 'com.seagate.kinetic.proto';

/**
 * Represents the Kinetic Protocol Data Structure.
 * @constructor
 */
class Kinetic {
    constructor() {
        this._version = VERSION;
        this.op = {
            PUT: 0,
            PUT_RESPONSE: 1,
            GET: 2,
            GET_RESPONSE: 3,
            NOOP: 4,
            NOOP_RESPONSE: 5,
            DELETE: 6,
            DELETE_RESPONSE: 7,
            SET_CLUSTER_VERSION: 8,
            SETUP_RESPONSE: 9,
            GET_LOG: 10,
        };
        this.error = {
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

    getSlice(obj) {
        return obj.buffer.slice(obj.offset, obj.limit);
    }

    setProtobuf(pbMessage) {
        this._message = pbMessage;
        return this;
    }

    setChunk(chunk) {
        this._chunk = chunk;
        return this;
    }

    setCommand(command) {
        const message = new this.build.Command(command);
        return this.setProtobuf(message);
    }

    setHMAC(secret) {
        this._hmac = crypto.createHmac('sha1', secret)
            .update(this.getProtobuf().toBuffer()).digest('hex');
        return this;
    }

    getVersion() {
        return this._version;
    }

    getProtobuf() {
        return this._message;
    }

    getProtobufSize() {
        return this.getProtobuf().calculate();
    }

    getChunk() {
        return this._chunk;
    }

    getChunkSize() {
        return this._chunk.length;
    }

    getCommand() {
        return this.build.Command;
    }

    getHMAC() {
        return this._hmac;
    }

    getMessageType() {
        return this.getProtobuf().header.messageType;
    }

    getKey() {
        return this.getSlice(this.getProtobuf().body.keyValue.key);
    }

    getDbVersion() {
        return this.getSlice(this.getProtobuf().body.keyValue.dbVersion);
    }

    getNewVersion() {
        return this.getSlice(this.getProtobuf().body.keyValue.newVersion);
    }

    getErrorMessage() {
        return this.getSlice(this.getProtobuf().status.detailedMessage);
    }

    getGetLogMessage() {
        return this.getSlice(this.getProtobuf().body.getLog.messages);
    }
buffer
    /**
     * Getting logs and stats request following the kinetic protocol.
     * @param {number} incrementTCP - monotonically increasing number for each
     * request in a TCP connection.
     * @param {Array} types - array filled by logs types needed.
     * @param {number} clusterVersion - version of the cluster
     * !return {Kinetic} this - message structure following the kinetic protocol
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
        });
    }

    /**
     * Getting logs and stats response following the kinetic protocol.
     * @param {string or number} response - response code (SUCCESS, FAIL)
     * @param {string or Buffer} errorMessage - detailed error message.
     * @param {object} responseLogs - object filled by logs needed.
     * !return {Kinetic} this - message structure following the kinetic protocol
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
        });
    }

    /**
     * Flush all data request following the kinetic protocol.
     * @param {number} incrementTCP - monotonically increasing number for each
     * request in a TCP connection.
     * @param {number} clusterVersion - version of the cluster
     * !return {Kinetic} this - message structure following the kinetic protocol
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
            "body": { },
        });
    }

    /**
     * Flush all data response following the kinetic protocol.
     * @param {string or number} response - response code (SUCCESS, FAIL)
     * @param {string or Buffer} errorMessage - detailed error message.
     * !return {Kinetic} this - message structure following the kinetic protocol
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
        });
    }

    /**
     * set clusterVersion request following the kinetic protocol.
     * @param {number} clusterVersion - The version number of this cluster
     * definition
     * @param {number} incrementTCP - monotonically increasing number for each
     * request in a TCP connection.
     * @param {number} oldClusterVersion - The old version number of this
     * cluster definition
     * !return {Kinetic} this - message structure following the kinetic protocol
     */
    setClusterVersion(clusterVersion, incrementTCP, oldClusterVersion) {
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
        });
    }

    /**
     * Setup response request following the kinetic protocol.
     * @param {string or number} response - response code (SUCCESS, FAIL)
     * @param {String or Buffer} errorMessage - detailed error message.
     * !return {Kinetic} this - message structure following the kinetic protocol
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
        });
    }

    /**
     * NOOP request following the kinetic protocol.
     * @param {number} incrementTCP - monotonically increasing number for each
     * request in a TCP connection
     * @param {number} clusterVersion - The version number of this cluster
     * definition
     * !return {Kinetic} this - message structure following the kinetic protocol
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
        });
    }

    /**
     * Response for the NOOP request following the kinetic protocol.
     * @param {string or number} response - response code (SUCCESS, FAIL)
     * @param {String or Buffer} errorMessage - detailed error message.
     * !return {Kinetic} this - message structure following the kinetic protocol
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
        });
    }

    /**
     * PUT request following the kinetic protocol.
     * @param {string or Buffer} key - key of the item to put.
     * @param {number} incrementTCP - monotonically increasing number for each
     * request in a TCP connection
     * @param {string or Buffer} dbVersion - version of the item in the
     * database.
     * @param {string or Buffer} newVersion - new version of the item to put.
     * @param {number} clusterVersion - The version number of this cluster
     * definition
     * !return {Kinetic} this - message structure following the kinetic protocol
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
                },
            },
        });
    }

    /**
     * Response for the PUT request following the kinetic protocol.
     * @param {string or number} response - response code (SUCCESS, FAIL)
     * @param {string or Buffer} errorMessage - detailed error message.
     * !return {Kinetic} this - message structure following the kinetic protocol
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
        });
    }

    /**
     * GET request following the kinetic protocol.
     * @param {string or Buffer} key - key of the item to put.
     * @param {number} incrementTCP - monotonically increasing number for each
     * request in a TCP connection
     * @param {number} clusterVersion - The version number of this cluster
     * definition
     * !return {Kinetic} this - message structure following the kinetic protocol
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
        });
    }

    /**
     * Response for the GET request following the kinetic protocol.
     * @param {string or number} response - response code (SUCCESS, FAIL)
     * @param {string or Buffer} errorMessage - Detailed error message.
     * @param {string or Buffer} dbVersion - The version of the item in the
     * database.
     * !return {Kinetic} this - message structure following the kinetic protocol
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
        });
    }

    /**
     * DELETE request following the kinetic protocol.
     * @param {string or Buffer} key - key of the item to put.
     * @param {number} incrementTCP - monotonically increasing number for each
     * request in a TCP connection
     * @param {number} clusterVersion - The version number of this cluster
     * definition
     * !return {Kinetic} this - message structure following the kinetic protocol
     */
    delete(key, incrementTCP, clusterVersion) {
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
                },
            },
        });
    }

    /**
     * Response for the DELETE request following the kinetic protocol.
     * @param {string or number} response - response code (SUCCESS, FAIL)
     * @param {string or Buffer} errorMessage - Detailed error message.
     * !return {Kinetic} this - message structure following the kinetic protocol
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
        });
    }

    /**
     * Sends data following Kinetic protocol.
     * @param {Socket} sock - Socket to send data through.
     */
    send(sock) {
        const arrayBuffer = [];
        const buf = new Buffer(9);

        buf.writeInt8(this.getVersion(), 0);

        // BE stands for Big Endian
        buf.writeInt32BE(this.getProtobufSize(), 1);
        buf.writeInt32BE(this.getChunkSize(), 5);

        arrayBuffer[0] = buf;
        arrayBuffer[1] = this.getProtobuf().toBuffer();
        arrayBuffer[2] = this.getChunk();

        const endBuffer = Buffer.concat(arrayBuffer);
        sock.write(endBuffer);
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
            return (this.errors.VERSION_FAILURE);
        }
        this.setProtobuf(this.getCommand().decode(data.slice(9, pbMsgLen + 9)));
        this.setChunk(data.slice(pbMsgLen + 9, chunkLen + pbMsgLen + 9));
        if (this.getChunkSize !== chunkLen) {
            return (this.error.DATA_ERROR);
        }
        return (this.errors.SUCCESS);
    }
}

export default Kinetic;
