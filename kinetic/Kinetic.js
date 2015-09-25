"use strict";

var protobuf = require('protobufjs');

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
            SET_CLUSTER_VERSION: 6,
            SETUP_RESPONSE: 7,
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
        return this;
    }

    _init() {
        this.build = protobuf.loadProtoFile(protoFilePath).build(buildName);
        return this;
    }

    setProtobuf(pbMessage) {
        this._message = pbMessage;
        return this;
    }

    setChunk(chunk) {
        this._chunk = chunk;
        return this;
    }

    getVersion() {
        return this._version;
    }

    getProtobuf() {
        return this._message;
    }

    getProtobufSize() {
        return protobuf.calculate(this.getProtobuf());
    }

    getChunk() {
        return this._chunk;
    }

    getChunkSize() {
        return this._chunk.length;
    }

    /**
     * set clusterVersion request following the kinetic protocol.
     * @param {Socket} socket - Socket to send data through.
     * @param {number} clusterVersion - The version number of this cluster
     * definition
     * @param {number} incrementTCP - monotonically increasing number for each
     * request in a TCP connection.
     */
    setClusterVersion(socket, clusterVersion, incrementTCP) {
        const identity = (new Date).getTime();
        const message = new this.build.Command({
            "header": {
                "messageType" : "SETUP",
                "connectionID" : identity,
                "sequence" : incrementTCP,
            },
            "body" : {
                "setup" : {
                    "newClusterVersion": clusterVersion,
                },
            },
        });

        this.setProtobuf(message);
        this.send(socket);
    }

    /**
     * Setup response request following the kinetic protocol.
     * @param {Socket} socket - Socket to send data through.
     * @param {number} response - error code.
     * @param {string or buffer} errorMessage - detailed error message.
     */
    setupResponse(socket, response, errorMessage) {
        const message = new this.build.Command({
            "header": {
                "messageType" : "SETUP_RESPONSE",
                "ackSequence" : this.getProtobuf().header.sequence,
            },
            "status" : {
                "code" : response,
                "detailedMessage" : errorMessage,
            },
        });

        this.setProtobuf(message);
        this.send(socket);
    }

    /**
     * NOOP request following the kinetic protocol.
     * @param {Socket} socket - Socket to send data through.
     * @param {number} incrementTCP - monotonically increasing number for each
     * request in a TCP connection
     */
    noOp(socket, incrementTCP) {
        const identity = (new Date).getTime();
        const message = new this.build.Command({
            "header": {
                "messageType" : "NOOP",
                "connectionID" : identity,
                "sequence" : incrementTCP,
            },
        });
        this.setProtobuf(message);
        this.send(socket);
    }

    /**
     * Response for the NOOP request following the kinetic protocol.
     * @param {Socket} socket - Socket to send data through.
     * @param {number} response - error code.
     * @param {string or buffer} errorMessage - detailed error message.
     */
    noOpResponse(socket, response, errorMessage) {
        const message = new this.build.Command({
            "header": {
                "messageType" : "NOOP_RESPONSE",
                "ackSequence" : this.getProtobuf().header.sequence,
            },
            "status" : {
                "code" : response,
                "detailedMessage" : errorMessage,
            },
        });
        this.setProtobuf(message);
        this.send(socket);
    }

    /**
     * PUT request following the kinetic protocol.
     * @param {Socket} socket - Socket to send data through.
     * @param {string or Buffer} key - key of the item to put.
     * @param {number} incrementTCP - monotonically increasing number for each
     * request in a TCP connection
     * @param {string or Buffer} dbVersion - version of the item in the
     * database.
     * @param {string or Buffer} newVersion - new version of the item to put.
     */
    put(socket, key, incrementTCP, dbVersion, newVersion) {
        const identity = (new Date).getTime();
        const message = new this.build.Command({
            "header": {
                "messageType" : "PUT",
                "connectionID" : identity,
                "sequence" : incrementTCP,
            },
            "body" : {
                "keyValue": {
                    "key": key,
                    "newVersion" : newVersion,
                    "dbVersion" : dbVersion,
                },
            },
        });
        this.setProtobuf(message);
        this.send(socket);
    }

    /**
     * Response for the PUT request following the kinetic protocol.
     * @param {Socket} socket - Socket to send data through.
     * @param {number} response - error code.
     * @param {string or buffer} errorMessage - detailed error message.
     */
    putResponse(socket, response, errorMessage) {
        const message = new this.build.Command({
            "header": {
                "messageType" : "PUT_RESPONSE",
                "ackSequence" : this.getProtobuf().header.sequence,
            },
            "body" : {
                "keyValue": { },
            },
            "status" : {
                "code" : response,
                "detailedMessage" : errorMessage,
            },
        });
        this.setProtobuf(message);
        this.send(socket);
    }

    /**
     * GET request following the kinetic protocol.
     * @param {Socket} socket - Socket to send data through.
     * @param {string or Buffer} key - key of the item to put.
     * @param {number} incrementTCP - monotonically increasing number for each
     * request in a TCP connection
     */
    get(socket, key, incrementTCP) {
        const identity = (new Date).getTime();
        const message = new this.build.Command({
            "header": {
                "messageType" : "GET",
                "connectionID" : identity,
                "sequence" : incrementTCP,
            },
            "body" : {
                "keyValue": {
                    "key": key,
                },
            },
        });
        this.setProtobuf(message);
        this.send(socket);
    }

    /**
     * Response for the GET request following the kinetic protocol.
     * @param {Socket} socket - Socket to send data through.
     * @param {number} response - Error code.
     * @param {string or Buffer} errorMessage - Detailed error message.
     * @param {string or buffer} dbVersion - The version of the item in the
     * database.
     */
    getResponse(socket, response, errorMessage, dbVersion) {
        const message = new this.build.Command({
            "header": {
                "messageType" : "GET_RESPONSE",
                "ackSequence" : this.getProtobuf().header.sequence,
            },
            "body" : {
                "keyValue": {
                    "key" : this.getProtobuf().body.keyValue.key,
                    "dbVersion" : dbVersion,
                },
            },
            "status" : {
                "code" : response,
                "detailedMessage" : errorMessage,
            },
        });
        this.setProtobuf(message);
        this.send(socket);
    }

    /**
     * Sends data following Kinetic protocol.
     * @param {Socket} sock - Socket to send data through.
     */
    send(sock) {
        let buf = new Buffer(9);

        buf.writeInt8(this.getVersion(), 0);

        // BE stands for Big Endian
        buf.writeInt32BE(this.getProtobufSize(), 1);
        buf.writeInt32BE(this.getChunkSize(), 5);

        sock.write(buf);
        sock.write(this.getProtobuf().toBuffer());
        sock.write(this.getChunk());
    }

    /**
     * Creates the Kinetic Protocol Data Structure from a buffer.
     * @param {Buffer} data - The data received by the socket.
     */
    parse(data) {
        //if (data[0] !== this.getVersion()) {
        //    return (this.errors.VERSION_FAILURE);
        //}

        var util = require('util');
        var fs = require('fs');
        //
        //var parser = new protobuf.DotProto.Parser(fs.readFileSync(protoFilePath));
        //var ast = parser.parse();



        var buffer = data;
        var msg = new this.build.Command;
        var tmp = msg.decode(buffer);

        console.log(util.inspect(tmp, {showHidden: false, depth: null}));
        this.setProtobuf(msg);

        //if (this.getChunkSize !== chunkSize) {
        //    return (this.error.DATA_ERROR = 11);
        //}

        //return (this.errors.SUCCESS);
    }
};

module.exports = new Kinetic()._init();
