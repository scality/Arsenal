import crypto from 'crypto';

const VERSION = 0x46;

/**
 * Represents the Kinetic Protocol Data Structure.
 * @constructor
 */
class JSONLib {
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
        return this;
    }

    setChunk(data) {
        this._chunk = data;
        return this;
    }

    setProtobuf(protobuf) {
        this._message = protobuf;
        return this;
    }

    setHMAC(integrity) {
        this._hmac =  crypto.createHmac('sha1', 'asdfasdf')
            .update(integrity).digest();
        return this;
    }

    setMessage() {
        const buf = new Buffer(JSON.stringify(this._message));
        this.setHMAC(buf);
        const tmp = {
            "authType": 1,
            "hmacAuth": {
                "identity": 1,
                "hmac": this._hmac,
            },
            "commandBytes": buf,
        };
        return this.setProtobuf(tmp);
    }

    setCommand(command) {
        return this.setProtobuf(command);
    }

    noOp(incrementTCP, clusterVersion) {
        const identity = (new Date).getTime();
        this.setCommand({
            "header": {
                "messageType": "NOOP",
                "connectionID": identity,
                "sequence": incrementTCP,
                "clusterVersion": clusterVersion,
            },
            "body": {},
        });
        return this.setMessage();
    }

    put(key, incrementTCP, dbVersion, newVersion, clusterVersion) {
        const identity = (new Date).getTime();
        this.setCommand({
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
        });
        return this.setMessage();
    }

    get(key, incrementTCP, clusterVersion) {
        const identity = (new Date).getTime();
        this.setCommand({
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
        return this.setMessage();
    }

    delete(key, incrementTCP, clusterVersion, dbVersion) {
        const identity = (new Date).getTime();
        this.setCommand({
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
        });
        return this.setMessage();
    }

    getLog(incrementTCP, types, clusterVersion) {
        const identity = (new Date).getTime();
        this.setCommand({
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
        return this.setMessage();
    }

    flush(incrementTCP, clusterVersion) {
        const identity = (new Date).getTime();
        this.setCommand({
            "header": {
                "messageType": "FLUSHALLDATA",
                "connectionID": identity,
                "sequence": incrementTCP,
                "clusterVersion": clusterVersion,
            },
            "body": {
            },
        });
        return this.setMessage();
    }


    getProtobuf() {
        return this._message;
    }
    getChunk() {
        return this._chunk;
    }
    getVersion() {
        return this._version;
    }
    getJSONSize() {
        return this._message.length;
    }
    getChunkSize() {
        return this._chunk.length;
    }

    getHMAC() {
        return this._hmac;
    }

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

    hmacIntegrity(hmac) {
        const buf = new Buffer(JSON.stringify(this._message));
        this.setHMAC(buf);
        if (this.diff(hmac, this.getHMAC()) === false)
            return this.errors.HMAC_FAILURE;
        return true;
    }

    parseJSON(data) {
        const version = data.readInt8(0);
        const pbMsgLen = data.readInt32BE(1);
        const chunkLen = data.readInt32BE(5);

        if (version !== this.getVersion()) {
            return this.errors.VERSION_FAILURE;
        }
        try {
            this._cmd = JSON.parse(data.slice(9, 9 + pbMsgLen).toString());
            this._tmp = new Buffer(this._cmd.commandBytes.data);
            this.setProtobuf(JSON.parse(this._tmp.toString()));
        } catch (e) {
            if (e.decoded) {
                this.setProtobuf(e.decoded);
            } else {
                return [this.errors.INTERNAL_ERROR, e];
            }
        }
        this.setChunk(data.slice(pbMsgLen + 9, chunkLen + pbMsgLen + 9));
        if (this.getChunkSize() !== chunkLen) {
            return this.errors.DATA_ERROR;
        }
        if (this._cmd.authType === 1 &&
            this.hmacIntegrity(this._cmd.hmacAuth.hmac.data) !== true)
            return this.errors.HMAC_FAILURE;
        return this.errors.SUCCESS;
    }
}
export default JSONLib;
