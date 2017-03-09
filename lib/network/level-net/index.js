'use strict'; // eslint-disable-line

const http = require('http');
const io = require('socket.io');
const ioClient = require('socket.io-client');
const ioStream = require('socket.io-stream');

function serializeError(err) {
    if (!err) {
        return err;
    }
    const serializedErr = Object.assign({}, err);

    serializedErr.message = err.message;
    for (const k in err) {
        if (!(k in serializedErr)) {
            serializedErr[k] = err[k];
        }
    }
    return serializedErr;
}

function deserializeError(err) {
    if (!err) {
        return err;
    }
    const deserializedErr = new Error(err.message);

    for (const k in err) {
        if (!(k in deserializedErr)) {
            deserializedErr[k] = err[k];
        }
    }
    return deserializedErr;
}

class SocketIOConnection {
    constructor(url, logger) {
        this.logger = logger;
        this.socket = ioClient(url);
        this.socketStreamed = ioStream(this.socket);
        this.socket.on('error', err => {
            this.logger.warn('connectivity error to storage daemon',
                             { error: err });
            return undefined;
        });
    }

    callTimeout(remoteCall, isStreamed, args, cb, timeoutMs = 5000) {
        if (typeof cb !== 'function') {
            return cb(new Error(`argument cb=${cb} is not a callback`));
        }
        let timedOut = false;
        const timeoutHandle = setTimeout(() => {
            timedOut = true;
            const err = new Error(`operation ${remoteCall} timed out`);
            err.timeout = true;
            cb(err);
        }, timeoutMs);

        let socket;
        let eventName;
        if (isStreamed) {
            socket = this.socketStreamed;
            eventName = 'callStream';
        } else {
            socket = this.socket;
            eventName = 'call';
        }
        socket.emit(eventName, remoteCall, args, function callback(err, data) {
            if (!timedOut) {
                clearTimeout(timeoutHandle);
                cb(deserializeError(err), data);
            } else {
                this.logger.warn(
                    'call to remote function ended after timeout expired',
                    { error: err });
            }
        });
        return undefined;
    }
}

const dbAsyncCommandNames = ['put', 'get', 'del', 'batch'];
const dbStreamCommandNames = ['createReadStream'];

const miscSyncCommands = {
    ping: function ping() {
        return 'pong';
    },
};

const miscAsyncCommands = {
    pingAsync: function pingAsync(cb) {
        setImmediate(() => cb(null, 'pong'));
    },
    slowCommand: function slowCommand(cb) {
        setTimeout(() => cb(null, 'ok'), 2000);
    },
};

module.exports.client = function LevelClient(logger) {
    const dbClient = {};

    dbClient.path = [];
    dbClient.logger = logger;
    dbClient.connect = function connect(host, port) {
        this.dbClient = new SocketIOConnection(
            `http://${host}:${port}/metadata`, this.logger);
        this.miscClient = new SocketIOConnection(
            `http://${host}:${port}/misc`, this.logger);
    };
    for (const remoteCall of dbStreamCommandNames.concat(dbAsyncCommandNames)) {
        dbClient[remoteCall] = function onCall(...args) {
            const cb = args.pop();
            args.push(this.path);
            const isStreamed = dbStreamCommandNames.includes(remoteCall);
            this.dbClient.callTimeout(remoteCall, isStreamed,
                                      args, cb, this.timeoutMs);
        };
    }
    for (const remoteCall of Object.keys(miscSyncCommands).concat(
        Object.keys(miscAsyncCommands))) {
        dbClient[remoteCall] = function onCall(...args) {
            const cb = args.pop();
            this.miscClient.callTimeout(remoteCall, false,
                                        args, cb, this.timeoutMs);
        };
    }
    dbClient.openSub = function openSub(subName) {
        const subLevel = {};
        for (const prop in this) {
            if (!(prop in subLevel)) {
                subLevel[prop] = this[prop];
            }
        }
        // maintain path as a list of nested sublevels
        subLevel.path = subLevel.path.slice();
        subLevel.path.push(subName);
        return subLevel;
    };

    dbClient.timeoutMs = 5000;
    dbClient.getTimeout = function getTimeout() {
        return this.timeoutMs;
    };
    dbClient.setTimeout = function setNewTimeout(newTimeoutMs) {
        this.timeoutMs = newTimeoutMs;
    };

    return dbClient;
};

module.exports.createServer = function LevelServer(db) {
    const httpServer = http.createServer();
    const ioServer = io(httpServer);

    const mdSock = ioServer.of('/metadata');
    mdSock.on('connection', conn => {
        function openSub(path) {
            let subDb = db;
            path.forEach(pathItem => {
                subDb = subDb.sublevel(pathItem);
            });
            return subDb;
        }

        conn.on('error', () => {});
        conn.on('call', (remoteCall, args, cb) => {
            if (dbAsyncCommandNames.includes(remoteCall)) {
                try {
                    const path = args.pop();
                    args.push((err, data) => {
                        cb(serializeError(err), data);
                    });

                    const subDb = openSub(path);
                    subDb[remoteCall].apply(subDb, args);
                } catch (err) {
                    return cb(serializeError(err));
                }
            } else {
                return cb(serializeError(
                    new Error(`Unknown remote call ${remoteCall}`)));
            }
            return undefined;
        });

        // add streaming support for commands that return a streamed result
        const connStreamed = ioStream(conn);
        connStreamed.on('callStream', (remoteCall, args, cb) => {
            if (dbStreamCommandNames.includes(remoteCall)) {
                let result;

                try {
                    const path = args.pop();
                    const subDb = openSub(path);
                    result = subDb[remoteCall].apply(subDb, args);
                    if (typeof result === 'object'
                        && result.pipe !== undefined) {
                        // looks like a stream object, wrap it with
                        // RPC stream support
                        const stream =
                            ioStream.createStream({ objectMode: true });
                        result.pipe(stream);
                        result = stream;
                    }
                } catch (err) {
                    return cb(serializeError(err));
                }
                return cb(null, result);
            }
            return undefined;
        });
    });

    const miscSock = ioServer.of('/misc');
    miscSock.on('connection', conn => {
        conn.on('error', () => {});
        conn.on('call', (remoteCall, args, cb) => {
            if (remoteCall in miscAsyncCommands) {
                try {
                    args.push((err, data) => {
                        cb(serializeError(err), data);
                    });
                    miscAsyncCommands[remoteCall].apply(null, args);
                } catch (err) {
                    return cb(serializeError(err));
                }
            } else if (remoteCall in miscSyncCommands) {
                let result;

                try {
                    result = miscSyncCommands[remoteCall].apply(null, args);
                    return cb(null, result);
                } catch (err) {
                    return cb(serializeError(err));
                }
            } else {
                return cb(serializeError(
                    new Error(`Unknown remote misc call ${remoteCall}`)));
            }
            return undefined;
        });
    });

    return ioServer;
};
