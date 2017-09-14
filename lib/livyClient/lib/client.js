'use strict'; // eslint-disable-line strict

const assert = require('assert');
const http = require('http');
const https = require('https');
const querystring = require('querystring');
const Backoff = require('backo');
const GET_BACKOFF_PARAMS = { min: 150, max: 8000 };
const POST_BACKOFF_PARAMS = { min: 1000, max: 5000 };


class LivyClient {
    /**
     * Constructor for REST client to apache livy
     *
     * @param {string} host - hostname or IP of the livy server
     * @param {number} [port=8998] - port of the livy server
     * @param {object} [logger=console] - logger object
     * @param {boolean} [useHttps] - whether to use https or not
     * @param {string} [key] - https private key content
     * @param {string} [cert] - https public certificate content
     * @param {string} [ca] - https authority certificate content
     * @return {undefined}
     */
    constructor(host, port = 8998, logger = console, useHttps, key, cert, ca) {
        assert(typeof host === 'string' && host !== '', 'host is required');
        assert(Number.isInteger(port), 'port must be an integer');
        assert(typeof logger === 'object', 'logger must be an object');
        assert(typeof logger.error === 'function', 'logger must have' +
        'error method');
        assert(typeof logger.info === 'function', 'logger must have' +
        'info method');
        assert(key === undefined || typeof key === 'string',
                'key must be a string');
        assert(cert === undefined || typeof cert === 'string',
                'cert must be a string');
        assert(ca === undefined || typeof ca === 'string',
                'ca must be a string');
        this.serverHost = host;
        this.serverPort = port;
        this.logger = logger;
        this._key = key;
        this._cert = cert;
        this._ca = ca;
        this.useHttps = (useHttps === true);
        if (this.useHttps) {
            this.transport = https;
            this._agent = new https.Agent({
                ca: ca ? [ca] : undefined,
                keepAlive: true,
                requestCert: true,
            });
        } else {
            this.transport = http;
            this._agent = new http.Agent({
                keepAlive: true,
            });
        }
        return undefined;
    }

    /** Returns interactive sessions
     * @param {number} [startIndex] - index to start listing
     * @param {number} [numOfSessions] - number of sessions to
     * return
     * @param {function} callback - callback
     * @return {undefined}
     */
    getSessions(startIndex, numOfSessions, callback) {
        assert(typeof callback === 'function', 'callback must be a function');
        const params = {};
        if (startIndex) {
            assert(Number.isInteger(startIndex),
            'startIndex must be an integer');
            params.from = startIndex;
        }
        if (numOfSessions) {
            assert(Number.isInteger(numOfSessions),
            'numOfSessions must be an integer');
            params.size = numOfSessions;
        }
        this._request('GET', '/sessions',
            params, null, callback);
        return undefined;
    }

    /** Returns state of batch or session
     * @param {string} batchOrSession - either 'batch' or 'session'
     * @param {number} id - batch or session id
     * @param {function} callback - callback
     * @return {undefined}
     */
    getSessionOrBatchState(batchOrSession, id, callback) {
        assert(typeof callback === 'function', 'callback must be a function');
        assert(batchOrSession === 'batch' || batchOrSession === 'session',
        'batchOrSession must be string "batch" or "session"');
        assert(Number.isInteger(id), 'id must be an integer');
        const pathPrefix = batchOrSession === 'batch' ?
            '/batches' : '/sessions';
        this._request('GET', `${pathPrefix}/${id}/state`,
            null, null, callback);
        return undefined;
    }

    /** Creates a new interactive Scala, Python, or R shell in the cluster
     * @param {object} options - options for session
     * @param {string} options.kind - type of session: spark, pyspark,
     * pyspark3 or sparkr. If not specified, defaults to spark.
     * For other options, see: https://github.com/apache/
     * incubator-livy/blob/master/docs/rest-api.md#post-sessions
     * @param {function} callback - callback
     * @return {undefined}
     */
    postSession(options, callback) {
        assert(typeof callback === 'function', 'callback must be a function');
        assert(typeof options === 'object', 'options must be an object');
        let postBody = options;
        if (!options.kind) {
            postBody.kind = 'spark';
        }
        postBody = JSON.stringify(postBody);
        this._request('POST', '/sessions',
            null, postBody, callback);
        return undefined;
    }

    /** Deletes a session
     * @param {number} sessionId - sessionId to delete
     * @param {function} callback - callback
     * @return {undefined}
     */
    deleteSession(sessionId, callback) {
        assert(typeof callback === 'function', 'callback must be a function');
        assert(Number.isInteger(sessionId), 'sessionId must be an integer');
        this._request('DELETE', `/sessions/${sessionId}`,
            null, null, callback);
        return undefined;
    }

    /** Run a statement in a session
     * @param {number} sessionId - options for session
     * @param {string} codeToExecute - actual code to be executed by spark
     * @param {function} callback - callback
    * @param {object} [backoff] - backoff instance
     * @return {undefined}
     */
    postStatement(sessionId, codeToExecute, callback, backoff) {
        assert(typeof callback === 'function', 'callback must be a function');
        assert(Number.isInteger(sessionId), 'sessionId must be an integer');
        assert(typeof codeToExecute === 'string', 'codeToExecute must be ' +
            'a string');
        const backoffInstance = backoff || new Backoff(POST_BACKOFF_PARAMS);
        // Need to check status of session
        this.getSessionOrBatchState('session', sessionId, (err, res) => {
            if (err) {
                return callback(err);
            }
            if (res.state === 'starting' || res.state === 'busy') {
                this.logger.info('session not ready',
                    { sessionState: res.state });
                const retryDelayMs = backoffInstance.duration();
                return setTimeout(this.postStatement.bind(this),
                    retryDelayMs, sessionId, codeToExecute,
                    callback, backoffInstance);
            }
            if (res.state !== 'idle') {
                const error = new Error('Session is in state: ' +
                `${res.state}. Cannot accept statement`);
                return callback(error);
            }
            const postBody = JSON.stringify({ code: codeToExecute });
            this._request('POST', `/sessions/${sessionId}/statements`,
                null, postBody, callback);
            return undefined;
        });
    }

    /** Returns a specified statement within a session
     * @param {number} sessionId - session id
     * @param {number} statementId - statement id
     * @param {function} callback - callback
     * @param {object} [backoff] - backoff instance
     * @return {undefined}
     */
    getStatement(sessionId, statementId, callback, backoff) {
        assert(typeof callback === 'function', 'callback must be a function');
        assert(Number.isInteger(sessionId), 'sessionId must be an integer');
        assert(Number.isInteger(statementId), 'statementId must be an integer');
        const backoffInstance = backoff || new Backoff(GET_BACKOFF_PARAMS);
        this._request('GET', `/sessions/${sessionId}/statements/${statementId}`,
            null, null, (err, res) => {
                if (err) {
                    return callback(err);
                }
                if (!res) {
                    const error = new Error('Livy did not send response' +
                    'to get statement request');
                    return callback(error);
                }
                if (res.output && res.output.status === 'error') {
                    const error = new Error('Error response to statement:' +
                    ` ${res.output.evalue}`);
                    return callback(error);
                }
                if (res.output && res.output.data) {
                    return callback(null, res.output);
                }
                if (res.state === 'waiting' || res.state === 'running') {
                    this.logger.info('statement result not ready',
                        { statementStatus: res.state });
                    const retryDelayMs = backoffInstance.duration();
                    return setTimeout(this.getStatement.bind(this),
                        retryDelayMs, sessionId, statementId,
                        callback, backoff);
                }
                // otherwise, error out (status could be error,
                // cancelling or cancelled or possibly other issue)
                const error = new Error('Statement status is: ' +
                `${res.status}. Cannot obtain result`);
                return callback(error);
            });
        return undefined;
    }

    /** Returns all active batch sessions
     * @param {number} [startIndex] - index to start listing
     * @param {number} [numOfBatches] - number of batches to
     * return
     * @param {function} callback - callback
     * @return {undefined}
     */
    getBatches(startIndex, numOfBatches, callback) {
        assert(typeof callback === 'function', 'callback must be a function');
        const params = {};
        if (startIndex) {
            assert(Number.isInteger(startIndex),
            'startIndex must be an integer');
            params.from = startIndex;
        }
        if (numOfBatches) {
            assert(Number.isInteger(numOfBatches),
            'numOfBatches must be an integer');
            params.size = numOfBatches;
        }
        this._request('GET', '/batches',
            params, null, callback);
        return undefined;
    }

    /** Creates a new batch job
     * @param {object} options - options for batch
     * @param {string} options.file - path of file containing the
     * application to execute
     * For other options, see: https://github.com/apache/incubator-livy/
     * blob/master/docs/rest-api.md#post-batches
     * @param {function} callback - callback
     * @return {undefined}
     */
    postBatch(options, callback) {
        assert(typeof callback === 'function', 'callback must be a function');
        assert(typeof options === 'object', 'options must be an object');
        assert(typeof options.file === 'string',
            'options.file must be a string');
        this._request('POST', '/batches',
            null, JSON.stringify(options), callback);
        return undefined;
    }

    /** Deletes a batch job
     * @param {number} batchId - batchId to delete
     * @param {function} callback - callback
     * @return {undefined}
     */
    deleteBatch(batchId, callback) {
        assert(typeof callback === 'function', 'callback must be a function');
        assert(Number.isInteger(batchId), 'batchId must be an integer');
        this._request('DELETE', `/batches/${batchId}`,
            null, null, callback);
        return undefined;
    }

    _endResponse(res, data, callback) {
        const code = res.statusCode;
        const parsedData = data ? JSON.parse(data) : null;
        if (code <= 201) {
            this.logger.info(`request to ${this.serverHost} returned success`,
                { httpCode: code });
            return callback(null, parsedData);
        }
        const error = new Error(res.statusMessage);
        this.logger.info(`request to ${this.serverHost} returned error`,
            { statusCode: code, statusMessage: res.statusMessage,
                info: data });
        return callback(error, parsedData);
    }

    /**
     * @param {string} method - the HTTP method of the request
     * @param {string} path - path without query parameters
     * @param {object} params - query parameters of the request
     * @param {string} dataToSend - data of the request
     * @param {function} callback - callback
     * @return {undefined}
     */
    _request(method, path, params, dataToSend, callback) {
        assert(method === 'GET' || method === 'POST' || method === 'DELETE',
        'httpMethod must be GET, POST or DELETE');
        assert(typeof callback === 'function', 'callback must be a function');
        assert(typeof path === 'string', 'path must be a string');
        assert(typeof params === 'object', 'pararms must be an object');
        this.logger.info('sending request',
        { httpMethod: method, path, params });
        let fullPath = path;
        const headers = {
            'content-length': 0,
        };

        if (params) {
            fullPath += `?${querystring.stringify(params)}`;
        }

        const options = {
            method,
            path: fullPath,
            headers,
            hostname: this.serverHost,
            port: this.serverPort,
            agent: this.agent,
        };
        if (this._cert && this._key) {
            options.key = this._key;
            options.cert = this._cert;
        }
        const dataResponse = [];
        let dataResponseLength = 0;

        const req = this.transport.request(options);
        req.setNoDelay();

        if (dataToSend) {
            /*
            * Encoding data to binary provides a hot path to write data
            * directly to the socket, without node.js trying to encode the data
            * over and over again.
            */
            const binData = Buffer.from(dataToSend, 'utf8');
            req.setHeader('content-type', 'application/octet-stream');
            /*
            * Using Buffer.bytelength is not required here because data is
            * binary encoded, data.length would give us the exact byte length
            */
            req.setHeader('content-length', binData.length);
            req.write(binData);
        }

        req.on('response', res => {
            res.on('data', data => {
                dataResponse.push(data);
                dataResponseLength += data.length;
            }).on('error', callback).on('end', () => {
                this._endResponse(res, Buffer.concat(dataResponse,
                    dataResponseLength).toString(), callback);
            });
        }).on('error', error => {
            // covers system errors like ECONNREFUSED, ECONNRESET etc.
            this.logger.error('error sending request to livy', { error });
            return callback(error);
        }).end();
    }

}

module.exports = LivyClient;
