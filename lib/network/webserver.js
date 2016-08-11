'use strict'; // eslint-disable-line

const http = require('http');
const https = require('https');
const assert = require('assert');
const Logger = require('werelogs').Logger;
const dhparam = require('../https/dh2048').dhparam;
const ciphers = require('../https/ciphers').ciphers;
const errors = require('../errors');

class WebServer {

    /**
     * @constructor
     *
     * @param {number} port - Port to listen into
     * @param {werelogs.Logger} logger - Logger object
     */
    constructor(port, logger) {
        assert.strictEqual(typeof port, 'number', 'Port must be a number');
        assert.strictEqual(logger instanceof Logger, true,
            'Logger must be an instance of werelogs');
        this._noDelay = true;
        this._cbOnListening = () => {};
        this._cbOnRequest = null;
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
        this._server = null;
        this._logger = logger;
    }

    /**
     * Setter to noDelay, this disable the nagle tcp algorithm, reducing
     * latency for each request
     *
     * @param {boolean} value - { true: Disable, false: Enable }
     * @return {WebServer} itself
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
    get server() {
        return this._server;
    }

    /**
     * Getter to access to the current authority certificate
     *
     * @return {string} Authority certificate
     */
    get authorityCertificate() {
        return this._https.ca;
    }

    /**
     * Setter to the listening port
     *
     * @param {number} port - Port to listen into
     * @return {WebServer} itself
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
     * Getter to access to the noDelay (nagle algorithm) configuration
     *
     * @return {boolean} { true: Disable, false: Enable }
     */
    get isNoDelay() {
        return this._noDelay;
    }

    /**
     * Getter to know if the server run under https or http
     *
     * @return {boolean} { true: Https server, false: http server }
     */
    get isHttps() {
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
     * @return {WebServer} itself
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
     * Function called when request received
     *
     * @param {http.IncomingMessage|https.IncomingMessage} req - Request object
     * @param {http.ServerResponse|https.ServerResponse} res - Response object
     * @return {undefined}
     */
    _onRequest(req, res) {
        // Setting no delay of the socket to the value configured
        req.connection.setNoDelay(this.isNoDelay);
        if (this._cbOnRequest) {
            return this._cbOnRequest(req, res);
        }
        // if no handler on the webserver, send back an internal error
        const err = errors.InternalError;
        const msg = `${err.message}: No handler in webserver`;
        res.writeHead(err.code, {
            'Content-Type': 'text/plain',
            'Content-Length': msg.length,
        });
        return res.end(msg);
    }

    /**
     * Function called when the webserver is listening
     *
     * @return {undefined}
     */
    _onListening() {
        this._logger.info('webserver is listening', {
            method: 'arsenal.network.WebServer._onListening',
            address: this.server.address(),
        });
        this._cbOnListening();
    }

    /**
     * Function called when the webserver sends back an error
     *
     * @param {Error} err - Error to be sent back
     * @return {undefined}
     */
    _onError(err) {
        this._logger.error('webserver error', {
            method: 'arsenal.network.WebServer._onError',
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
     * Function called when the webserver is stopped
     *
     * @return {undefined}
     */
    _onClose() {
        if (this.server.listening) {
            this._logger.info('webserver is stopped', {
                address: this.server.address(),
            });
        }
        this._server = null;
        this._cbOnStop();
    }

    /**
     * Set the listening callback
     *
     * @param {function} cb - Callback()
     * @return {WebServer} itself
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
     * @return {WebServer} itself
     */
    onRequest(cb) {
        assert.strictEqual(typeof cb, 'function',
            'Callback must be a function');
        this._cbOnRequest = cb;
        return this;
    }

    /**
     * Set the error handler callback
     *
     * @param {function} cb - Callback(err)
     * @return {WebServer} itself
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
     * @return {WebServer} itself
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
            method: 'arsenal.network.WebServer._onClientError',
            error: err,
            address: sock.address(),
        });
    }

    /**
     * Function to start the webserver
     *
     * @return {WebServer} itself
     */
    start() {
        if (!this._server) {
            if (this.isHttps) {
                this._logger.info('starting webserver under https', {
                    method: 'arsenal.network.WebServer.start',
                    port: this._port,
                });
                this._https.agent = new https.Agent(this._https);
                this._server = https.createServer(this._https,
                    (req, res) => this._onRequest(req, res));
            } else {
                this._logger.info('starting webserver under http', {
                    method: 'arsenal.network.WebServer.start',
                    port: this._port,
                });
                this._server = http.createServer(
                    (req, res) => this._onRequest(req, res));
            }
        }
        this._server.on('error', err => this._onError(err));
        this._server.on('secureConnection',
            sock => this._onSecureConnection(sock));
        this._server.on('tlsClientError', (err, sock) =>
            this._onClientError(err, sock));
        this._server.on('clientError', (err, sock) =>
            this._onClientError(err, sock));
        this._server.listen(this._port, () => this._onListening());
        return this;
    }

    /**
     * Function to stop the webserver
     *
     * @return {WebServer} itself
     */
    stop() {
        if (this.server) {
            this.server.close(() => this._onClose());
        }
        return this;
    }
}

module.exports = WebServer;
