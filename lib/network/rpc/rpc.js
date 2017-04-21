'use strict'; // eslint-disable-line

const http = require('http');
const io = require('socket.io');
const ioClient = require('socket.io-client');
const sioStream = require('./sio-stream');
const async = require('async');
const assert = require('assert');
const EventEmitter = require('events').EventEmitter;

const flattenError = require('./utils').flattenError;
const reconstructError = require('./utils').reconstructError;

const DEFAULT_CALL_TIMEOUT_MS = 30000;


/**
 * @brief get a client object that proxies RPC calls to a remote
 * server through socket.io events
 *
 * Additional request environment parameters that are not passed as
 * explicit RPC arguments can be passed using addRequestInfoProducer()
 * method, directly or through sub-classing
 *
 * NOTE: synchronous calls on the server-side API (i.e those which
 * take no callback argument) become asynchronous on the client, take
 * one additional parameter (the callback), then:
 *
 * - if it throws, the error is passed as callback's first argument,
 *   otherwise null is passed
 * - the return value is passed as callback's second argument (unless
 *   an error occurred).
 */
class BaseClient extends EventEmitter {

    /**
     * @constructor

     * @param {Object} params - constructor params
     * @param {String} params.url - URL of the socket.io namespace,
     *   e.g. 'http://localhost:9990/metadata'
     * @param {Logger} params.logger - logger object
     * @param {Number} [params.callTimeoutMs] - timeout for remote calls
     * @param {Number} [params.streamMaxPendingAck] - max number of
     *   in-flight output stream packets sent to the server without an ack
     *   received yet
     * @param {Number} [params.streamAckTimeoutMs] - timeout for receiving
     *   an ack after an output stream packet is sent to the server
     */
    constructor(params) {
        const { url, logger, callTimeoutMs,
                streamMaxPendingAck, streamAckTimeoutMs } = params;
        assert(url);
        assert(logger);

        super();

        this.url = url;
        this.logger = logger;
        this.callTimeoutMs = callTimeoutMs;
        this.streamMaxPendingAck = streamMaxPendingAck;
        this.streamAckTimeoutMs = streamAckTimeoutMs;

        this.requestInfoProducers = [];
        this.requestInfoProducers.push(
            dbClient => ({ reqUids: dbClient.withReqUids }));
    }

    /**
     * @brief internal RPC implementation w/o timeout
     *
     * @param {String} remoteCall - name of the remote function to call
     * @param {Array} args - list of arguments to the remote function
     * @param {function} cb - callback called when done
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
     * @param {String} remoteCall - name of the remote function to call
     * @param {Array} args - list of arguments to the remote function
     * @param {function} cb - callback called when done or timeout
     * @param {Number} timeoutMs - timeout in milliseconds
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

    getCallTimeout() {
        return this.callTimeoutMs;
    }
    setCallTimeout(newTimeoutMs) {
        this.callTimeoutMs = newTimeoutMs;
    }

    /**
     * connect to the remote RPC server
     *
     * @param {function} cb - callback when connection is complete or
     *   if there is an error
     * @return {undefined}
     */
    connect(cb) {
        this.socket = ioClient(this.url);
        this.socketStreams = sioStream.createSocket(
            this.socket,
            this.logger,
            this.streamMaxPendingAck,
            this.streamAckTimeoutMs);
        const url = this.url;
        this.socket.on('error', err => {
            this.logger.warn('connectivity error to the RPC service',
                             { url, error: err });
        });
        this.socket.on('connect', () => {
            this.emit('connect');
        });
        this.socket.on('disconnect', () => {
            this.emit('disconnect');
        });

        // only hard-coded call necessary to discover the others
        this.createCall('getManifest');
        this.getManifest((err, manifest) => {
            if (err) {
                this.logger.error('Error fetching manifest from RPC server',
                                  { error: err });
            } else {
                manifest.api.forEach(apiItem => {
                    this.createCall(apiItem.name);
                });
            }
            if (cb) {
                return cb(err);
            }
            return undefined;
        });
    }

    /**
     * disconnect this client from the RPC server. A disconnect event
     * is emitted when done.
     *
     * @return {undefined}
     */
    disconnect() {
        this.socket.disconnect();
    }

    /**
     * create a new RPC call with the given name
     *
     * This function should normally not be called by the user,
     * because the API is automatically exposed by reading the
     * manifest from the server.
     *
     * @param {String} remoteCall - name of the API call to create
     * @return {undefined}
     */
    createCall(remoteCall) {
        this[remoteCall] = function onCall(...rpcArgs) {
            const cb = rpcArgs.pop();
            const args = { rpcArgs };
            // produce the extra parameters for the request
            this.requestInfoProducers.forEach(f => {
                Object.assign(args, f(this));
            });
            this.callTimeout(remoteCall, args, cb, this.callTimeoutMs);
            // reset temporary argument-passing sugar
            this.withReqUids = undefined;
        };
    }

    /**
     * add a function that provides additional parameters to send
     * along each request. It will be called before every single
     * request, so the parameters can be dynamic.
     *
     * @param {function} f - function returning an object that
     *   contains the additional parameters for the request. It is
     *   called with the client object passed as a parameter.
     * @return {undefined}
     */
    addRequestInfoProducer(f) {
        this.requestInfoProducers.push(f);
    }

    /**
     * decorator function that adds information from the given logger
     * object so that the remote end can reconstruct this information
     * in the logs (namely the request UIDs). This call takes effect
     * only for the next RPC call.
     *
     * The typical use case is:
     * ```
     * rpcClient.withRequestLogger(logger).callSomeFunction(params);
     * ```
     *
     * @param {Object} logger - werelogs logger object
     * @return {BaseClient} returns the original called client object
     * so that the result can be chained with further calls
     */
    withRequestLogger(logger) {
        this.withReqUids = logger.getSerializedUids();
        return this;
    }
}

/**
 * @class
 * @classdesc RPC service class
 *
 * A service maps to a specific namespace and provides a set of RPC
 * functions.
 *
 * Additional request environment parameters passed by the client
 * should be parsed in helpers passed to addRequestInfoConsumer()
 * method.
 *
 */
class BaseService {

    /**
     * @constructor
     *
     * @param {Object} params - constructor parameters
     * @param {String} params.namespace - socket.io namespace, a free
     *   string name that must start with '/'. The client will have to
     *   provide the same namespace in the URL
     *   (http://host:port/namespace)
     * @param {Object} params.logger - logger object
     * @param {String} [params.apiVersion="1.0"] - Version number that
     *   is shared with clients in the manifest (may be used to ensure
     *   backward compatibility)
     * @param {RPCServer} [params.server] - convenience parameter,
     * calls server.registerServices() automatically
     */
    constructor(params) {
        const { namespace, logger, apiVersion, server } = params;
        assert(namespace);
        assert(namespace.startsWith('/'));
        assert(logger);
        this.namespace = namespace;
        this.logger = logger;
        this.apiVersion = apiVersion || '1.0';
        this.requestInfoConsumers = [];

        // initialize with a single hard-coded API call, the user will
        // register its own calls later
        this.syncAPI = {
            getManifest: () => {
                const exposedAPI = [];
                Object.keys(this.syncAPI).forEach(callName => {
                    if (callName !== 'getManifest') {
                        exposedAPI.push({ name: callName });
                    }
                });
                Object.keys(this.asyncAPI).forEach(callName => {
                    exposedAPI.push({ name: callName });
                });
                return { apiVersion: this.apiVersion,
                         api: exposedAPI };
            },
        };
        this.asyncAPI = {};

        this.addRequestInfoConsumer((dbService, params) => {
            const env = {};
            if (params.reqUids) {
                env.reqUids = params.reqUids;
                env.requestLogger = dbService.logger
                    .newRequestLoggerFromSerializedUids(params.reqUids);
            } else {
                env.requestLogger = dbService.logger.newRequestLogger();
            }
            return env;
        });

        if (server) {
            server.registerServices(this);
        }
    }

    /**
     * register a set of API functions that return a result synchronously
     *
     * @param {Object} apiExtension - Object mapping names to API
     *   function implementation. Each API function gets an
     *   environment object as first parameter that contains various
     *   useful attributes, while the rest of parameters are the RPC
     *   parameters as passed by the client in the call.
     * @return {undefined}
     */
    registerSyncAPI(apiExtension) {
        Object.assign(this.syncAPI, apiExtension);
    }

    /**
     * register a set of API functions that return a result through a
     * callback passed as last argument
     *
     * @param {Object} apiExtension - Object mapping names to API
     *   function implementation. Each API function gets an
     *   environment object as first parameter that contains various
     *   useful attributes, while the rest of parameters are the RPC
     *   parameters as passed by the client in the call, followed by a
     *   callback function to call with an error status and optional
     *   additional response values.
     * @return {undefined}
     */
    registerAsyncAPI(apiExtension) {
        Object.assign(this.asyncAPI, apiExtension);
    }

    /**
     * set the API version string, that is communicated to connecting
     * clients in the manifest
     *
     * @param {String} apiVersion - arbitrary version string
     * (suggested format "x.y")
     * @return {undefined}
     */
    setAPIVersion(apiVersion) {
        this.apiVersion = apiVersion;
    }

    /**
     * add a function to be called before each API call that is in
     * charge of converting some extra request info (outside raw RPC
     * arguments) into environment attributes directly usable by the
     * API implementation
     *
     * @param {function} f - function to be called with two arguments:
     * the service object and the params object received from the
     * client, and which returns an object with the additional
     * environment attributes
     * @return {undefined}
     */
    addRequestInfoConsumer(f) {
        this.requestInfoConsumers.push(f);
    }

    _onCall(streamsSocket, remoteCall, args, cb) {
        const decodedArgs = streamsSocket.decodeStreams(args);
        if (remoteCall in this.asyncAPI) {
            try {
                this.onAsyncCall(remoteCall, decodedArgs, (err, data) => {
                    cb(flattenError(err),
                       streamsSocket.encodeStreams(data));
                });
            } catch (err) {
                return cb(flattenError(err));
            }
        } else if (remoteCall in this.syncAPI) {
            let result;

            try {
                result = this.onSyncCall(remoteCall, decodedArgs);
                result = streamsSocket.encodeStreams(result);
                return cb(null, result);
            } catch (err) {
                return cb(flattenError(err));
            }
        } else {
            return cb(flattenError(
                new Error(`Unknown remote call ${remoteCall} ` +
                          `in namespace ${this.namespace}`)));
        }
        return undefined;
    }

    _createCallEnv(params) {
        const env = {};
        this.requestInfoConsumers.forEach(f => {
            const extraEnv = f(this, params);
            Object.assign(env, extraEnv);
        });
        return env;
    }

    onSyncCall(remoteCall, params) {
        const env = this._createCallEnv(params);
        return this.syncAPI[remoteCall].apply(
            null, [env].concat(params.rpcArgs));
    }

    onAsyncCall(remoteCall, params, cb) {
        const env = this._createCallEnv(params);
        this.asyncAPI[remoteCall].apply(
            null, [env].concat(params.rpcArgs).concat(cb));
    }
}

/**
 * @brief create a server object that serves remote requests through
 * socket.io events.
 *
 * Services associated to namespaces (aka. URL base path) must be
 * registered thereafter on this server.
 *
 * Each service may customize the sending and reception of RPC
 * messages through subclassing, e.g. LevelDbService looks up a
 * particular sub-level before forwarding the RPC, providing it the
 * target sub-level handle.
 *
 * @param {Object} params - params object
 * @param {Object} params.logger - logger object
 * @param {Number} [params.streamMaxPendingAck] - max number of
 *   in-flight output stream packets sent to the server without an ack
 *   received yet
 * @param {Number} [params.streamAckTimeoutMs] - timeout for receiving
 *   an ack after an output stream packet is sent to the server
 * @return {Object} a server object, not yet listening on a TCP port
 * (you must call listen(port) on the returned object)
 */
function RPCServer(params) {
    assert(params.logger);

    const httpServer = http.createServer();
    const server = io(httpServer);
    const log = params.logger;

    /**
     * register a list of service objects on this server
     *
     * It's not necessary to call this function if you provided a
     * "server" parameter to the service constructor.
     *
     * @param {BaseService} serviceList - list of services to register
     * @return {undefined}
     */
    server.registerServices = function registerServices(...serviceList) {
        serviceList.forEach(service => {
            const sock = this.of(service.namespace);
            sock.on('connection', conn => {
                const streamsSocket = sioStream.createSocket(
                    conn,
                    params.logger,
                    params.streamMaxPendingAck,
                    params.streamAckTimeoutMs);

                conn.on('error', err => {
                    log.error('error on socket.io connection',
                              { namespace: service.namespace, error: err });
                });
                conn.on('call', service._onCall.bind(service, streamsSocket));
            });
        });
    };

    return server;
}

module.exports = {
    BaseClient,
    RPCServer,
    BaseService,
};
