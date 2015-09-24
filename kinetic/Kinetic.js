"use strict";

var protobuf = require('protobufjs');

var VERSION = 0x46;
var protoFilePath = __dirname + '/kinetic-protocol/kinetic.proto';
var buildName = 'com.seagate.kinetic.proto';

/**
 * Represents the Kinetic Protocol Data Structure.
 * @constructor
 */
function Kinetic() {
    this._version = VERSION;
    return this;
}

Kinetic.op = {};
Kinetic.op.PUT = 0;
Kinetic.op.PUT_RESPONSE = 1;

Kinetic.error = {};
Kinetic.error.INVALID_STATUS_CODE = -1;
Kinetic.error.NOT_ATTEMPTED = 0;
Kinetic.error.SUCCESS = 1;
Kinetic.error.HMAC_FAILURE = 2;
Kinetic.error.NOT_AUTHORIZED = 3;
Kinetic.error.VERSION_FAILURE = 4;
Kinetic.error.INTERNAL_ERROR = 5;
Kinetic.error.HEADER_REQUIRED = 6;
Kinetic.error.NOT_FOUND = 7;
Kinetic.error.VERSION_MISMATCH = 8;
Kinetic.error.SERVICE_BUSY = 9;
Kinetic.error.EXPIRED = 10;
Kinetic.error.DATA_ERROR = 11;
Kinetic.error.PERM_DATA_ERROR = 12;
Kinetic.error.REMOTE_CONNECTION_ERROR = 13;
Kinetic.error.NO_SPACE = 14;
Kinetic.error.NO_SUCH_HMAC_ALGORITHM = 15;
Kinetic.error.INVALID_REQUEST = 16;
Kinetic.error.NESTED_OPERATION_ERRORS = 17;
Kinetic.error.DEVICE_LOCKED = 18;
Kinetic.error.DEVICE_ALREADY_UNLOCKED = 19;
Kinetic.error.CONNECTION_TERMINATED = 20;
Kinetic.error.INVALID_BATCH = 21;

Kinetic.prototype = {
    constructor: Kinetic,

    _init: function() {
        let self = this;
        self.build = protobuf.loadProtoFile(protoFilePath).build(buildName);
        return self;
    },

    setProtobuf: function(pbMessage) {
        let self = this;
        self._message = pbMessage;
        return self;
    },

    setChunk: function(chunk) {
        let self = this;
        self._chunk = chunk;
        return self;
    },

    getVersion: function() {
        return this._version;
    },

    getProtobuf: function() {
        return this._message;
    },

    getProtobufSize: function() {
        return protobuf.calculate(this.getProtobuf());
    },

    getChunk: function() {
        return this._chunk;
    },

    getChunkSize: function() {
        return this._chunk.length;
    },

    /**
     * NOOP request following the kinetic protocol.
     * @param {Socket} socket - Socket to send data through.
     * @param {number} incrementTCP - monotonically increasing number for each request in a TCP connection
     */
    noOp: function(socket, incrementTCP){
        var self = this;
        var identity = (new Date).getTime();
        var File = this.build.Command;

        self.setProtobuf(new File({
                "header": {
                    "messageType" : "NOOP",
                    "connectionID" : identity,
                    "sequence" : incrementTCP,
                },
            }).encode().buffer
        );
        self.send(socket);
    },

    /**
     * Response for the NOOP request following the kinetic protocol.
     * @param {Socket} socket - Socket to send data through.
     * @param {number} response - error code.
     * @param {buffer} errorMessage - detailed error message.
     */
    noOpResponse: function(socket, response, errorMessage){
        var self = this;
        var File = this.build.Command;

        self.setProtobuf(new File({
                "header": {
                    "messageType" : "NOOP_RESPONSE",
                    "ackSequence" : self.getProtobuf().header.sequence,
                },
                "status" : {
                    "code" : response,
                    "detailedMessage" : errorMessage,
                },
            }).encode().buffer
        );
        self.send(socket);
    },

    /**
     * set clusterVersion request following the kinetic protocol.
     * @param {Socket} socket - Socket to send data through.
     * @param {number} clusterVersion - The version number of this cluster definition.
     * @param {number} incrementTCP - monotonically increasing number for each request in a TCP connection.
     */
    setClusterVersion: function(socket, clusterVersion, incrementTCP){
        var self = this;
        var identity = (new Date).getTime();
        var File = this.build.Command;

        self.setProtobuf(new File({
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
                "status" : { },
            }).encode().buffer
        );
        self.send(socket);
    },

    /**
     * Setup response request following the kinetic protocol.
     * @param {Socket} socket - Socket to send data through.
     * @param {number} response - error code.
     * @param {buffer} errorMessage - detailed error message.
     */
    setupResponse: function(socket, response, errorMessage){
        var self = this;
        var File = this.build.Command;

        self.setProtobuf(new File({
                "header": {
                    "messageType" : "SETUP_RESPONSE",
                    "ackSequence" : self.getProtobuf().header.sequence,
                },
                "body" : { },
                "status" : {
                    "code" : response,
                    "detailedMessage" : errorMessage,
                },
            }).encode().buffer
        );
        self.send(socket);
    },

    /**
     * PUT request following the kinetic protocol.
     * @param {Socket} socket - Socket to send data through.
     * @param {number} key - key of the item to put.
     * @param {number} incrementTCP - monotonically increasing number for each request in a TCP connection
     * @param {number} dbVersion - version of the item in the database.
     * @param {number} newVersion - new version of the item to put.
     */
    put: function(socket, key, incrementTCP, dbVersion, newVersion){
        var self = this;
        var identity = (new Date).getTime();
        var File = this.build.Command;

        self.setProtobuf(new File({
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
                "status" : { },
            }).encode().buffer
        );
        self.send(socket);
    },

    /**
     * Response for the PUT request following the kinetic protocol.
     * @param {Socket} socket - Socket to send data through.
     * @param {number} response - error code.
     * @param {buffer} errorMessage - detailed error message.
     */
    putResponse: function(socket, response, errorMessage){
        var self = this;
        var File = this.build.Command;

        self.setProtobuf(new File({
                "header": {
                    "messageType" : "PUT_RESPONSE",
                    "ackSequence" : self.getProtobuf().header.sequence,
                },
                "body" : {
                    "keyValue": { },
                },
                "status" : {
                    "code" : response,
                    "detailedMessage" : errorMessage,
                },
            }).encode().buffer
        );
        self.send(socket);
    },

    /**
     * Sends data following Kinetic protocol.
     * @param {Socket} sock - Socket to send data through.
     */
    send: function(sock) {
        let self = this;
        let buf = new Buffer(9);

        buf.writeInt8(self.getVersion(), 0);
        // BE stands for Big Endian
        buf.writeInt32BE(self.getProtobufSize(), 1);
        buf.writeInt32BE(self.getChunkSize(), 5);

        sock.write(buf);
        sock.write(self.getProtobuf());
        sock.write(self.getChunk());
        sock.end();
    },

    /**
    * Creates the Kinetic Protocol Data Structure from a buffer.
    * @param {Buffer} data - The data received by the socket.
    */
    parse: function(data) {
        let self = this;

        if (data[0] !== self.getVersion()) {
            return (self.errors.VERSION_FAILURE);
        }

        // BE stands for Big Endian
        const protobufSize = data.readInt32BE(1);
        const chunkSize = data.readInt32BE(5);
        self.setProtobuf(data.slice(9, 9 + protobufSize));
        self.setChunk(data.slice(9 + protobufSize));

        if (self.getChunkSize !== chunkSize) {
            return (self.error.DATA_ERROR = 11);
        }

        return (self.errors.SUCCESS);
    }
};

module.exports = new Kinetic()._init();
