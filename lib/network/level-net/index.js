'use strict'; // eslint-disable-line

const http = require('http');
const io = require('socket.io');
const ioClient = require('socket.io-client');
const sioStream = require('./sio-stream');
const async = require('async');
const assert = require('assert');
const errors = require('../../errors');

const flattenError = require('./utils').flattenError;
const reconstructError = require('./utils').reconstructError;

const WGM = require('../../versioning/WriteGatheringManager');
const WriteCache = require('../../versioning/WriteCache');
const VRP = require('../../versioning/VersioningRequestProcessor');

const DEFAULT_CALL_TIMEOUT_MS = 30000;

const SYNC_OPTIONS = { sync: true };
const SUBLEVEL_SEP = '::';


/**
 * lookup a sublevel db given by the @a path array from the main db handle.
 *
 * @param {Object} db The root LevelDB database object to expose to
 * remote clients
 * @param {String []} path path to the sublevel, as a
 * piecewise array of sub-levels
 * @return {Object} the handle to the sublevel
 */
function lookupSubLevel(db, path) {
    let subDb = db;
    path.forEach(pathItem => {
        subDb = subDb.sublevel(pathItem);
    });
    return subDb;
}

function createDBAPI(db) {
    return {
        get: (request, logger, callback) => {
            const dbPath = request.db.split(SUBLEVEL_SEP);
            const subDb = lookupSubLevel(db, dbPath);
            subDb.get(request.key, (err, data) => {
                if (err && err.notFound) {
                    return callback(errors.ObjNotFound);
                }
                return callback(err, data);
            });
        },
        list: (request, logger, callback) => {
            const dbPath = request.db.split(SUBLEVEL_SEP);
            const subDb = lookupSubLevel(db, dbPath);
            const stream = subDb.createReadStream(request.params);
            const res = [];
            let done = false;
            stream.on('data', data => res.push(data));
            stream.on('error', err => {
                if (done === false) {
                    done = true;
                    callback(err);
                }
            });
            stream.on('end', () => {
                if (done === false) {
                    done = true;
                    callback(null, res);
                }
            });
        },
        batch: (request, logger, callback) => {
            const dbPath = request.db.split(SUBLEVEL_SEP);
            const subDb = lookupSubLevel(db, dbPath);
            subDb.batch(request.array, SYNC_OPTIONS,
                        err => callback(err));
        },
    };
}

function packRequestArgs(remoteCall, decodedArgs) {
    const db = decodedArgs.subLevel.join(SUBLEVEL_SEP);
    const { rpcArgs } = decodedArgs;
    switch (remoteCall) {
    case 'put':
        return { db, type: 'put',
                 key: rpcArgs[0], value: rpcArgs[1],
                 options: rpcArgs[2], reqUids: rpcArgs[3] };
    case 'del':
        return { db, type: 'del',
                 key: rpcArgs[0],
                 options: rpcArgs[1], reqUids: rpcArgs[2] };
    case 'get':
        return { db,
                 key: rpcArgs[0],
                 options: rpcArgs[1], reqUids: rpcArgs[2] };
    case 'batch':
        return { db,
                 array: rpcArgs[0],
                 options: rpcArgs[1], reqUids: rpcArgs[2] };
    default:
        return {};
    }
}

class SocketIOConnection {

    /**
     * @constructor
     * @param {String} url URL of the socket.io namespace,
     *   e.g. 'http://localhost:9990/metadata'
     * @param {Object} params constructor additional params
     * @param {Logger} params.logger logger object
     * @param {Number} [params.streamMaxPendingAck] max number of
     *   in-flight output stream packets sent to the server without an ack
     *   received yet
     * @param {Number} [params.streamAckTimeoutMs] timeout for receiving
     *   an ack after an output stream packet is sent to the server
     */
    constructor(url, params) {
        assert(params.logger);
        this.logger = params.logger;
        this.socket = ioClient(url);
        this.socketStreams = sioStream.createSocket(
            this.socket,
            params.logger,
            params.streamMaxPendingAck,
            params.streamAckTimeoutMs);
        this.socket.on('error', err => {
            this.logger.warn('connectivity error to storage daemon',
                             { error: err });
            return undefined;
        });
    }

    /**
     * @brief internal RPC implementation w/o timeout
     *
     * @param {String} remoteCall name of the remote function to call
     * @param {Array} args list of arguments to the remote function
     * @param {function} cb callback called when done
     * @return {undefined}
     */
    _call(remoteCall, args, cb) {
        const wrapCb = (err, data) => {
            cb(reconstructError(err),
               this.socketStreams.decodeStreams(data));
        };
        this.logger.debug('remote call', { remoteCall, args });
        this.socket.emit('call', remoteCall,
                         this.socketStreams.encodeStreams(args), wrapCb);
        return undefined;
    }

    /**
     * @brief call a remote function named @a remoteCall, with
     * arguments @a args and callback @a cb
     *
     * @a cb is called when the remote function returns an ack, or
     * when the timeout set by @a timeoutMs expires, whichever comes
     * first. When an ack is received, the callback gets the arguments
     * sent by the remote function in the ack response. In the case of
     * timeout, it's passed a single Error argument with the code:
     * 'ETIMEDOUT' property, and a self-described string in the 'info'
     * property.
     *
     * @param {String} remoteCall name of the remote function to call
     * @param {Array} args list of arguments to the remote function
     * @param {function} cb callback called when done or timeout
     * @param {Number} timeoutMs timeout in milliseconds
     * @return {undefined}
     */
    callTimeout(remoteCall, args, cb, timeoutMs = DEFAULT_CALL_TIMEOUT_MS) {
        if (typeof cb !== 'function') {
            throw new Error(`argument cb=${cb} is not a callback`);
        }
        async.timeout(this._call.bind(this), timeoutMs,
                      `operation ${remoteCall} timed out`)(remoteCall,
                                                           args, cb);
        return undefined;
    }
}

const dbAsyncCommandNames = ['put', 'get', 'del', 'batch'];
const dbSyncCommandNames = ['createReadStream'];

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

/**
 * @brief get a LevelDB client object that proxies requests to a
 * remote DB server through socket.io events
 *
 * NOTE: synchronous calls on the server-side API (i.e those which
 * take no callback argument) become asynchronous on the client, take
 * one additional parameter (the callback), then:
 *
 * - if it throws, the error is passed as callback's first argument,
 *   otherwise null is passed
 * - the return value is passed as callback's second argument (unless
 *   an error occurred).
 *
 * The only DB call in this case currently is createReadStream().
 *
 * @param {Object} options options object
 * @param {Logger} options.logger logger object
 * @param {String} [options.baseNs=] custom namespace to use
 * @param {Number} [options.callTimeoutMs] timeout for remote calls
 * @param {Number} [options.streamMaxPendingAck] max number of
 *   in-flight output stream packets sent to the server without an ack
 *   received yet
 * @param {Number} [options.streamAckTimeoutMs] timeout for receiving
 *   an ack after an output stream packet is sent to the server
 * @return {Object} a LevelDB proxy object that can be called with
 * leveldb API functions directly, or sub-leveled with openSub()
 */
module.exports.client = function LevelClient(options) {
    assert(options.logger);

    const dbClient = {
        path: [],
        baseNs: options.baseNs || '',
        logger: options.logger,
        callTimeoutMs: options.callTimeoutMs,
    };
    assert(dbClient.baseNs === '' || dbClient.baseNs.startsWith('/'));

    dbClient.getCallTimeout = function getCallTimeout() {
        return this.callTimeoutMs;
    };
    dbClient.setCallTimeout = function setCallTimeout(newTimeoutMs) {
        this.callTimeoutMs = newTimeoutMs;
    };

    dbClient.connect = function connect(host, port) {
        this.mdClient = new SocketIOConnection(
            `http://${host}:${port}${this.baseNs}/metadata`, options);
        this.miscClient = new SocketIOConnection(
            `http://${host}:${port}${this.baseNs}/misc`, options);
    };
    for (const remoteCall of dbSyncCommandNames.concat(dbAsyncCommandNames)) {
        dbClient[remoteCall] = function onCall(...rpcArgs) {
            const cb = rpcArgs.pop();
            const args = { rpcArgs, subLevel: this.path };
            this.mdClient.callTimeout(remoteCall, args, cb,
                                      this.callTimeoutMs);
        };
    }
    for (const remoteCall of Object.keys(miscSyncCommands).concat(
        Object.keys(miscAsyncCommands))) {
        dbClient[remoteCall] = function onCall(...rpcArgs) {
            const cb = rpcArgs.pop();
            const args = { rpcArgs };
            this.miscClient.callTimeout(remoteCall, args, cb,
                                        this.callTimeoutMs);
        };
    }

    /**
     * @brief return a handle to a sublevel database
     *
     * @note this function has no side-effect on the db, it just
     * returns a handle properly configured to access the sublevel db
     * from the client.
     *
     * @param {String} subName name of sublevel
     * @return {Object} a handle to the sublevel database that has the
     * same API as its parent
     */
    dbClient.openSub = function openSub(subName) {
        const subLevel = {};
        Object.assign(subLevel, this);
        // maintain path as a list of nested sublevels
        subLevel.path = subLevel.path.slice();
        subLevel.path.push(subName);
        return subLevel;
    };

    return dbClient;
};

/**
 * @brief create a server object that serves remote LevelDB requests
 * through socket.io events
 *
 * @param {Object} db The root LevelDB database object to expose to
 * remote clients
 * @param {Object} options options object
 * @param {Object} options.logger logger object
 * @param {Number} [options.streamMaxPendingAck] max number of
 *   in-flight output stream packets sent to the server without an ack
 *   received yet
 * @param {Number} [options.streamAckTimeoutMs] timeout for receiving
 *   an ack after an output stream packet is sent to the server
 * @return {Object} a server object, not yet listening on a TCP port
 * (you must call listen(port) on the returned object)
 */
module.exports.createServer = function LevelServer(db, options) {
    assert(options.logger);

    const httpServer = http.createServer();
    const ioServer = io(httpServer);
    const log = options.logger;

    const wgm = new WGM(createDBAPI(db));
    const writeCache = new WriteCache(wgm);
    const vrp = new VRP(writeCache, wgm);

    ioServer.initMetadataService = function initMetadataService(baseNs = '') {
        assert(baseNs === '' || baseNs.startsWith('/'));

        // all metadata operations executed by leveldb go through this
        // namespace, other operations (ping etc.) go through /misc.
        const mdSock = this.of(`${baseNs}/metadata`);
        mdSock.on('connection', conn => {
            const mdStreams = sioStream.createSocket(
                conn,
                options.logger,
                options.streamMaxPendingAck,
                options.streamAckTimeoutMs);
            conn.on('error', err => {
                log.error('error on socket.io /metadata connection',
                          { error: err });
            });
            conn.on('call', (remoteCall, args, cb) => {
                // DB commands expect a 'subLevel' property as the
                // path to the sublevel DB (array of path items).
                const decodedArgs = mdStreams.decodeStreams(args);
                if (dbAsyncCommandNames.includes(remoteCall)) {
                    try {
                        const requestArgs = packRequestArgs(remoteCall,
                                                            decodedArgs);
                        const logger = log.newRequestLoggerFromSerializedUids(
                            requestArgs.reqUids);
                        vrp[remoteCall](requestArgs, logger, (err, data) => {
                            cb(flattenError(err),
                               mdStreams.encodeStreams(data));
                        });
                    } catch (err) {
                        cb(flattenError(err));
                    }
                } else if (dbSyncCommandNames.includes(remoteCall)) {
                    try {
                        const subDb = lookupSubLevel(db, decodedArgs.subLevel);
                        let result = subDb[remoteCall].apply(
                            subDb, decodedArgs.rpcArgs);
                        result = mdStreams.encodeStreams(result);
                        cb(null, result);
                    } catch (err) {
                        cb(flattenError(err));
                    }
                } else {
                    cb(flattenError(
                        new Error(`Unknown remote call ${remoteCall}`)));
                }
            });
        });

        const miscSock = this.of(`${baseNs}/misc`);
        miscSock.on('connection', conn => {
            const miscStreams = sioStream.createSocket(
                conn,
                options.logger,
                options.streamMaxPendingAck,
                options.streamAckTimeoutMs);

            conn.on('error', err => {
                log.error('error on socket.io /misc connection',
                          { error: err });
            });
            conn.on('call', (remoteCall, args, cb) => {
                const decodedArgs = miscStreams.decodeStreams(args);
                if (remoteCall in miscAsyncCommands) {
                    try {
                        decodedArgs.rpcArgs.push((err, data) => {
                            cb(flattenError(err),
                               miscStreams.encodeStreams(data));
                        });
                        miscAsyncCommands[remoteCall].apply(
                            null, decodedArgs.rpcArgs);
                    } catch (err) {
                        return cb(flattenError(err));
                    }
                } else if (remoteCall in miscSyncCommands) {
                    let result;

                    try {
                        result = miscSyncCommands[remoteCall].apply(
                            null, decodedArgs.rpcArgs);
                        result = miscStreams.encodeStreams(result);
                        return cb(null, result);
                    } catch (err) {
                        return cb(flattenError(err));
                    }
                } else {
                    return cb(flattenError(
                        new Error(`Unknown remote misc call ${remoteCall}`)));
                }
                return undefined;
            });
        });
    };

    return ioServer;
};
