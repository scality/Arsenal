"use strict";

var VERSION = 0x46;

// TODO: We need to parse our .proto file at startup and integrate protobuf.js

/**
 * Represents the Kinetic Protocol Data Structure.
 * @constructor
 */
function Kinetic() {
    this.version = VERSION;
}

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
    /**
     * Sends data following Kinetic protocol.
     * @param {Socket} sock - Socket to send data through.
     */
    constructor: Kinetic,
    send: function(sock) {
        let self = this;
        let buf = new Buffer(8);

        // BE stands for Big Endian
        buf.writeInt32BE(calculate(self.message), 0);
        buf.writeInt32BE(self.data.length, 4);

        sock.write(self.version);
        sock.write(buf);
        sock.write(self.message);
        sock.write(self.chunk);
        sock.end();
    },

    /**
    * Creates the Kinetic Protocol Data Structure from a buffer.
    * @param {Buffer} data - The data received by the socket.
    */
    parse: function(data) {
        let self = this;

        if (data[0] !== VERSION) {
            return (self.errors.VERSION_FAILURE);
        }
        // BE stands for Big Endian
        self.protobufSize = data.readInt32BE(1);
        const chunkSize = data.readInt32BE(5);
        self.message = data.slice(9, 9 + protobufSize);
        self.chunk = data.slice(9 + ProtobufSize);

        if (self.chunk.length !== chunkSize) {
            return (self.error.DATA_ERROR = 11);
        }

        return (self.errors.SUCCESS);
    }
};

module.exports = Kinetic;
