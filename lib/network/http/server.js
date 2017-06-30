'use strict'; // eslint-disable-line

const http = require('http');
const https = require('https');
const assert = require('assert');
const dhparam = require('../../https/dh2048').dhparam;
const ciphers = require('../../https/ciphers').ciphers;
const errors = require('../../errors');

class Server {

    /**
     * @constructor
     *
     * @param {number} port - Port to listen into
     * @param {werelogs.Logger} logger - Logger object
     */
    constructor(port, logger) {
        assert.strictEqual(typeof port, 'number', 'Port must be a number');
        this._noDelay = true;
        this._cbOnListening = () => {};
        this._cbOnRequest = (req, res) => this._noHandlerCb(req, res);
        this._cbOnCheckContinue = (req, res) => {
            res.writeContinue();
            this._cbOnRequest(req, res);
        };
        // AWS S3 does not respond with 417 Expectation Failed or any error
        // when Expect header is received and the value is not 100-continue
        this._cbOnCheckExpectation = (req, res) => this._cbOnRequest(req, res);
        this._cbOnError = () => false;
        this._cbOnStop = () => {};
        this._https = {
            ciphers,
            dhparam,
            cert: null,
            key: null,
            ca: null,
            requestCert: false,
            rejectUnauthorized: true,
        };
        this._port = port;
        this._address = '::';
        this._server = null;
        this._logger = logger;
    }

    /**
     * Setter to noDelay, this disable the nagle tcp algorithm, reducing
     * latency for each request
     *
     * @param {boolean} value - { true: Disable, false: Enable }
     * @return {Server} itself
     */
    setNoDelay(value) {
        this._noDelay = value;
        return this;
    }

    /**
     * Getter to access to the http/https server
     *
     * @return {http.Server|https.Server} http/https server
     */
    getServer() {
        return this._server;
    }

    /**
     * Getter to access to the current authority certificate
     *
     * @return {string} Authority certificate
     */
    getAuthorityCertificate() {
        return this._https.ca;
    }

    /**
     * Setter to the listening port
     *
     * @param {number} port - Port to listen into
     * @return {undefined}
     */
    setPort(port) {
        this._port = port;
    }

    /**
     * Getter to access to the listening port
     *
     * @return {number} listening port
     */
    getPort() {
        return this._port;
    }

    /**
     * Setter to the bind address
     *
     * @param {String} address - address bound to the socket
     * @return {undefined}
     */
    setBindAddress(address) {
        this._address = address;
    }

    /**
     * Getter to access the bind address
     *
     * @return {String} address bound to the socket
     */
    getBindAddress() {
        return this._address;
    }

    /**
     * Getter to access to the noDelay (nagle algorithm) configuration
     *
     * @return {boolean} { true: Disable, false: Enable }
     */
    isNoDelay() {
        return this._noDelay;
    }

    /**
     * Getter to know if the server run under https or http
     *
     * @return {boolean} { true: Https server, false: http server }
     */
    isHttps() {
        return !!this._https.cert && !!this._https.key;
    }

    /**
     * Setter for the https configuration
     *
     * @param {string} [cert] - Content of the certificate
     * @param {string} [key] - Content of the key
     * @param {string} [ca] - Content of the authority certificate
     * @param {boolean} [twoWay] - Enable the two way exchange, which means
     *   each client needs to set up an ssl certificate
     * @return {Server} itself
     */
    setHttps(cert, key, ca, twoWay) {
        this._https = {
            ciphers,
            dhparam,
            cert: null,
            key: null,
            ca: null,
            requestCert: false,
            rejectUnauthorized: true,
        };
        if (cert && key) {
            assert.strictEqual(typeof cert, 'string');
            assert.strictEqual(typeof key, 'string');
            this._https.cert = cert;
            this._https.key = key;
        }
        if (ca) {
            assert.strictEqual(typeof ca, 'string');
            this._https.ca = [ca];
        }
        if (twoWay) {
            assert.strictEqual(typeof twoWay, 'boolean');
            this._https.requestCert = twoWay;
        }
        return this;
    }

    /**
     * Function called when no handler specified in the server
     *
     * @param {http.IncomingMessage|https.IncomingMessage} req - Request object
     * @param {http.ServerResponse|https.ServerResponse} res - Response object
     * @return {undefined}
     */
    _noHandlerCb(req, res) {
        // if no handler on the Server, send back an internal error
        const err = errors.InternalError;
        const msg = `${err.message}: No handler in Server`;
        res.writeHead(err.code, {
            'Content-Type': 'text/plain',
            'Content-Length': msg.length,
        });
        return res.end(msg);
    }

    /**
     * Function called when request received
     *
     * @param {http.IncomingMessage|https.IncomingMessage} req - Request object
     * @param {http.ServerResponse|https.ServerResponse} res - Response object
     * @return {undefined}
     */
    _onRequest(req, res) {
        return this._cbOnRequest(req, res);
    }

    /**
     * Function called when the Server is listening
     *
     * @return {undefined}
     */
    _onListening() {
        this._logger.info('Server is listening', {
            method: 'arsenal.network.Server._onListening',
            address: this._server.address(),
        });
        this._cbOnListening();
    }

    /**
     * Function called when the Server sends back an error
     *
     * @param {Error} err - Error to be sent back
     * @return {undefined}
     */
    _onError(err) {
        this._logger.error('Server error', {
            method: 'arsenal.network.Server._onError',
            port: this._port,
            error: err.stack || err,
        });
        if (this._cbOnError) {
            if (this._cbOnError(err) === true) {
                process.nextTick(() => this.start());
            }
        }
    }

    /**
     * Function called when the Server is stopped
     *
     * @return {undefined}
     */
    _onClose() {
        if (this._server.listening) {
            this._logger.info('Server is stopped', {
                address: this._server.address(),
            });
        }
        this._server = null;
        this._cbOnStop();
    }

    /**
     * Set the listening callback
     *
     * @param {function} cb - Callback()
     * @return {Server} itself
     */
    onListening(cb) {
        assert.strictEqual(typeof cb, 'function',
            'Callback must be a function');
        this._cbOnListening = cb;
        return this;
    }

    /**
     * Set the request handler callback
     *
     * @param {function} cb - Callback(req, res)
     * @return {Server} itself
     */
    onRequest(cb) {
        assert.strictEqual(typeof cb, 'function',
            'Callback must be a function');
        this._cbOnRequest = cb;
        return this;
    }

    /**
     * Set the checkExpectation handler callback
     *
     * @param {function} cb - Callback(req, res)
     * @return {Server} itself
     */
    onCheckExpectation(cb) {
        assert.strictEqual(typeof cb, 'function',
            'Callback must be a function');
        this._cbOnCheckExpectation = cb;
        return this;
    }

    /**
     * Set the checkContinue handler callback
     *
     * @param {function} cb - Callback(req, res)
     * @return {Server} itself
     */
    onCheckContinue(cb) {
        assert.strictEqual(typeof cb, 'function',
            'Callback must be a function');
        this._cbOnCheckContinue = cb;
        return this;
    }

    /**
     * Set the error handler callback, if this handler returns true when an
     * error is triggered, the server will restart
     *
     * @param {function} cb - Callback(err)
     * @return {Server} itself
     */
    onError(cb) {
        assert.strictEqual(typeof cb, 'function',
            'Callback must be a function');
        this._cbOnError = cb;
        return this;
    }

    /**
     * Set the stop handler callback
     *
     * @param {function} cb - Callback()
     * @return {Server} itself
     */
    onStop(cb) {
        assert.strictEqual(typeof cb, 'function',
            'Callback must be a function');
        this._cbOnStop = cb;
        return this;
    }

    /**
     * Function called when a secure connection is etablished
     *
     * @param {tls.TlsSocket} sock - socket
     * @return {undefined}
     */
    _onSecureConnection(sock) {
        if (!sock.authorized) {
            this._logger.error('rejected secure connection', {
                address: sock.address(),
                authorized: false,
                error: sock.authorizationError,
            });
        }
    }

    /**
     * function called when an error came from the client request
     *
     * @param {Error} err - Error
     * @param {net.Socket|tls.TlsSocket} sock - Socket
     * @return {undefined}
     */
    _onClientError(err, sock) {
        this._logger.error('client error', {
            method: 'arsenal.network.Server._onClientError',
            error: err.stack || err,
            address: sock.address(),
        });
    }

    /**
     * Function called when request with an HTTP Expect header is received,
     * where the value is not 100-continue
     *
     * @param {http.IncomingMessage|https.IncomingMessage} req - Request object
     * @param {http.ServerResponse|https.ServerResponse} res - Response object
     * @return {undefined}
     */
    _onCheckExpectation(req, res) {
        return this._cbOnCheckExpectation(req, res);
    }

    /**
     * Function called when request with an HTTP Expect: 100-continue
     * is received
     *
     * @param {http.IncomingMessage|https.IncomingMessage} req - Request object
     * @param {http.ServerResponse|https.ServerResponse} res - Response object
     * @return {undefined}
     */
    _onCheckContinue(req, res) {
        return this._cbOnCheckContinue(req, res);
    }

    /**
     * Function to start the Server
     *
     * @return {Server} itself
     */
    start() {
        if (!this._server) {
            if (this.isHttps()) {
                this._logger.info('starting Server under https', {
                    method: 'arsenal.network.Server.start',
                    port: this._port,
                });
                this._https.agent = new https.Agent(this._https);
                this._server = https.createServer(this._https,
                    (req, res) => this._onRequest(req, res));
            } else {
                this._logger.info('starting Server under http', {
                    method: 'arsenal.network.Server.start',
                    port: this._port,
                });
                this._server = http.createServer(
                    (req, res) => this._onRequest(req, res));
            }

            this._server.on('error', err => this._onError(err));
            this._server.on('secureConnection',
                sock => this._onSecureConnection(sock));
            this._server.on('connection', sock => {
                // Setting no delay of the socket to the value configured
                sock.setNoDelay(this.isNoDelay());
                sock.on('error', err => this._logger.info(
                 'socket error - request rejected', { error: err }));
            });
            this._server.on('tlsClientError', (err, sock) =>
                    this._onClientError(err, sock));
            this._server.on('clientError', (err, sock) =>
                    this._onClientError(err, sock));
            this._server.on('checkContinue', (req, res) =>
                    this._onCheckContinue(req, res));
            this._server.on('checkExpectation', (req, res) =>
                    this._onCheckExpectation(req, res));
            this._server.on('listening', () => this._onListening());
        }
        this._server.listen(this._port, this._address);
        return this;
    }

    /**
     * Function to stop the Server
     *
     * @return {Server} itself
     */
    stop() {
        if (this._server) {
            this._server.close(() => this._onClose());
        }
        return this;
    }
}

module.exports = Server;
