import * as http from 'http';
import * as https from 'https';
import { https as HttpsAgent } from 'httpagent';
import * as tls from 'tls';
import * as net from 'net';
import assert from 'assert';
import { dhparam } from '../../https/dh2048';
import { ciphers } from '../../https/ciphers';
import errors from '../../errors';
import { checkSupportIPv6 } from './utils';
import { Logger } from 'werelogs';

export default class Server {
    _noDelay: boolean;
    _cbOnListening: () => void;
    _cbOnRequest: (req: http.IncomingMessage, res: http.ServerResponse) => void;
    _cbOnCheckContinue: (req: http.IncomingMessage, res: http.ServerResponse) => void;
    _cbOnCheckExpectation: (req: http.IncomingMessage, res: http.ServerResponse) => void;
    _cbOnError: (err: Error) => boolean;
    _cbOnStop: () => void;
    _https: {
        agent?: https.Agent;
        ciphers: string;
        dhparam: string;
        cert?: string;
        key?: string;
        ca?: string[];
        requestCert: boolean;
        rejectUnauthorized: boolean;
    };
    _port: number;
    _address: string;
    _server: http.Server | https.Server | null;
    _logger: Logger;
    _keepAliveTimeout: number | null;

    /**
     * @constructor
     *
     * @param port - Port to listen into
     * @param logger - Logger object
     */
    constructor(port: number, logger: Logger) {
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
            requestCert: false,
            rejectUnauthorized: true,
        };
        this._port = port;
        this._address = checkSupportIPv6() ? '::' : '0.0.0.0';
        this._server = null;
        this._logger = logger;
        this._keepAliveTimeout = null; // null: use default node.js value
    }

    /**
     * Setter to noDelay, this disable the nagle tcp algorithm, reducing
     * latency for each request
     *
     * @param value - { true: Disable, false: Enable }
     * @return itself
     */
    setNoDelay(value: boolean) {
        this._noDelay = value;
        return this;
    }

    /**
     * Set the keep-alive timeout after which inactive client
     * connections are automatically closed (default should be
     * 5 seconds in node.js)
     *
     * @param keepAliveTimeout - keep-alive timeout in milliseconds
     * @return - returns this
     */
    setKeepAliveTimeout(keepAliveTimeout: number) {
        this._keepAliveTimeout = keepAliveTimeout;
        return this;
    }

    /**
     * Getter to access to the http/https server
     *
     * @return http/https server
     */
    getServer() {
        return this._server;
    }

    /**
     * Getter to access to the current authority certificate
     *
     * @return Authority certificate
     */
    getAuthorityCertificate() {
        return this._https.ca;
    }

    /**
     * Setter to the listening port
     *
     * @param port - Port to listen into
     */
    setPort(port: number) {
        this._port = port;
    }

    /**
     * Getter to access to the listening port
     *
     * @return listening port
     */
    getPort() {
        return this._port;
    }

    /**
     * Setter to the bind address
     *
     * @param address - address bound to the socket
     */
    setBindAddress(address: string) {
        this._address = address;
    }

    /**
     * Getter to access the bind address
     *
     * @return address bound to the socket
     */
    getBindAddress() {
        return this._address;
    }

    /**
     * Getter to access to the noDelay (nagle algorithm) configuration
     *
     * @return - { true: Disable, false: Enable }
     */
    isNoDelay() {
        return this._noDelay;
    }

    /**
     * Getter to know if the server run under https or http
     *
     * @return - { true: Https server, false: http server }
     */
    isHttps() {
        return !!this._https.cert && !!this._https.key;
    }

    /**
     * Setter for the https configuration
     *
     * @param [cert] - Content of the certificate
     * @param [key] - Content of the key
     * @param [ca] - Content of the authority certificate
     * @param [twoWay] - Enable the two way exchange, which means
     *   each client needs to set up an ssl certificate
     * @return itself
     */
    setHttps(cert: string, key: string, ca: string, twoWay: boolean) {
        this._https = {
            ciphers,
            dhparam,
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
     * @param _req - Request object
     * @param res - Response object
     */
    _noHandlerCb(_req: http.IncomingMessage, res: http.ServerResponse) {
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
     * @param req - Request object
     * @param res - Response object
     */
    _onRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        return this._cbOnRequest(req, res);
    }

    /** Function called when the Server is listening */
    _onListening() {
        this._logger.info('Server is listening', {
            method: 'arsenal.network.Server._onListening',
            address: this._server?.address(),
            serverIP: this._address,
            serverPort: this._port,
        });
        this._cbOnListening();
    }

    /**
     * Function called when the Server sends back an error
     *
     * @param err - Error to be sent back
     * @return
     */
    _onError(err: Error) {
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

    /** Function called when the Server is stopped */
    _onClose() {
        if (this._server?.listening) {
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
     * @param cb - Callback()
     * @return itself
     */
    onListening(cb: () => void) {
        assert.strictEqual(typeof cb, 'function',
            'Callback must be a function');
        this._cbOnListening = cb;
        return this;
    }

    /**
     * Set the request handler callback
     *
     * @param cb - Callback(req, res)
     * @return itself
     */
    onRequest(cb: (req: http.IncomingMessage, res: http.ServerResponse) => void) {
        assert.strictEqual(typeof cb, 'function',
            'Callback must be a function');
        this._cbOnRequest = cb;
        return this;
    }

    /**
     * Set the checkExpectation handler callback
     *
     * @param cb - Callback(req, res)
     * @return itself
     */
    onCheckExpectation(cb: (req: http.IncomingMessage, res: http.ServerResponse) => void) {
        assert.strictEqual(typeof cb, 'function',
            'Callback must be a function');
        this._cbOnCheckExpectation = cb;
        return this;
    }

    /**
     * Set the checkContinue handler callback
     *
     * @param cb - Callback(req, res)
     * @return itself
     */
    onCheckContinue(cb: (req: http.IncomingMessage, res: http.ServerResponse) => void) {
        assert.strictEqual(typeof cb, 'function',
            'Callback must be a function');
        this._cbOnCheckContinue = cb;
        return this;
    }

    /**
     * Set the error handler callback, if this handler returns true when an
     * error is triggered, the server will restart
     *
     * @param cb - Callback(err)
     * @return itself
     */
    onError(cb: (err: Error) => boolean) {
        assert.strictEqual(typeof cb, 'function',
            'Callback must be a function');
        this._cbOnError = cb;
        return this;
    }

    /**
     * Set the stop handler callback
     *
     * @param cb - Callback()
     * @return itself
     */
    onStop(cb: () => void) {
        assert.strictEqual(typeof cb, 'function',
            'Callback must be a function');
        this._cbOnStop = cb;
        return this;
    }

    /**
     * Function called when a secure connection is etablished
     *
     * @param sock - socket
     */
    _onSecureConnection(sock: tls.TLSSocket) {
        if (this._https.requestCert && !sock.authorized) {
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
     * @param err - Error
     * @param sock - Socket
     */
    _onClientError(err: Error, sock: net.Socket | tls.TLSSocket) {
        this._logger.error('client error', {
            method: 'arsenal.network.Server._onClientError',
            error: err.stack || err,
            address: sock.address(),
        });
        // socket is not systematically destroyed
        sock.destroy();
    }

    /**
     * Function called when request with an HTTP Expect header is received,
     * where the value is not 100-continue
     *
     * @param req - Request object
     * @param res - Response object
     */
    _onCheckExpectation(req: http.IncomingMessage, res: http.ServerResponse) {
        return this._cbOnCheckExpectation(req, res);
    }

    /**
     * Function called when request with an HTTP Expect: 100-continue
     * is received
     *
     * @param req - Request object
     * @param res - Response object
     */
    _onCheckContinue(req: http.IncomingMessage, res: http.ServerResponse) {
        return this._cbOnCheckContinue(req, res);
    }

    /**
     * Function to start the Server
     *
     * @return itself
     */
    start() {
        if (!this._server) {
            if (this.isHttps()) {
                this._logger.info('starting Server under https', {
                    method: 'arsenal.network.Server.start',
                    port: this._port,
                });
                this._https.agent = new HttpsAgent.Agent(this._https);
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
            if (this._keepAliveTimeout) {
                this._server.keepAliveTimeout = this._keepAliveTimeout;
            }

            this._server.on('error', err => this._onError(err));
            this._server.on('secureConnection',
                sock => this._onSecureConnection(sock));
            this._server.on('connection', sock => {
                // Setting no delay of the socket to the value configured
                // TODO fix this
                // @ts-expect-errors
                sock.setNoDelay(this.isNoDelay());
                sock.on('error', err => this._logger.info(
                    'socket error - request rejected', { error: err }));
            });
            this._server.on('tlsClientError', (err, sock) =>
                this._onClientError(err, sock));
            this._server.on('clientError', (err, sock) =>
                // @ts-expect-errors
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
     * @return itself
     */
    stop() {
        if (this._server) {
            this._server.close(() => this._onClose());
        }
        return this;
    }
}
