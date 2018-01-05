'use strict'; // eslint-disable-line strict

const assert = require('assert');
const http = require('http');
const https = require('https');
const querystring = require('querystring');
const Backoff = require('backo');
// min and max in ms
const defaultGetBackoffParams = { min: 100, max: 200, maxAttempts: 300,
    factor: 1.01 };
const defaultPostBackoffParams = { min: 1000, max: 3000, maxAttempts: 20,
    factor: 1.1 };

class LivyClient {
    /**
     * Constructor for REST client to apache livy
     *
     * @param {object} params - object for all parameters to initialize Livy
     * @return {undefined}
     */
    constructor(params) {
        assert(typeof params.host === 'string' && params.host !== '',
            'host is required');
        assert(params.port === undefined || Number.isInteger(params.port),
            'port must be an integer');
        assert(params.logger === undefined || typeof params.logger === 'object',
            'logger must be an object');
        assert(params.logger === undefined ||
            typeof params.logger.error === 'function',
            'logger must have error method');
        assert(params.logger === undefined ||
            typeof params.logger.info === 'function',
            'logger must have info method');
        assert(params.key === undefined || typeof params.key === 'string',
            'key must be a string');
        assert(params.cert === undefined || typeof params.cert === 'string',
            'cert must be a string');
        assert(params.ca === undefined || typeof params.ca === 'string',
            'ca must be a string');
        assert(params.getBackoffParams === undefined ||
            typeof params.getBackoffParams === 'object',
            'getBackoffParams must be an object');
        assert(params.postBackoffParams === undefined ||
            typeof params.postBackoffParams === 'object',
            'postBackoffParams must be an object');
        assert(params.getBackoffParams === undefined ||
            (Number.isInteger(params.getBackoffParams.min) &&
            Number.isInteger(params.getBackoffParams.max) &&
            Number.isInteger(params.getBackoffParams.maxAttempts) &&
            !isNaN(params.getBackoffParams.factor)),
            'getBackoffParams should have valid numerical values for ' +
            'the min, max, maxAttempts, and factor attributes');
        assert(params.postBackoffParams === undefined ||
            (Number.isInteger(params.postBackoffParams.min) &&
            Number.isInteger(params.postBackoffParams.max) &&
            Number.isInteger(params.postBackoffParams.maxAttempts) &&
            !isNaN(params.postBackoffParams.factor)),
            'postBackoffParams should have valid numerical values for ' +
            'the min, max, maxAttempts, and factor attributes');
        this.serverHost = params.host;
        this.serverPort = params.port !== undefined ? params.port : 8998;
        this.logger = params.logger !== undefined ? params.logger : console;
        this._key = params.key;
        this._cert = params.cert;
        this._ca = params.ca;
        this.getBackoffParams = params.getBackoffParams !== undefined ?
            params.getBackoffParams : defaultGetBackoffParams;
        this.postBackoffParams = params.postBackoffParams !== undefined ?
            params.postBackoffParams : defaultPostBackoffParams;
        this.useHttps = (params.useHttps === true);
        if (this.useHttps) {
            this.transport = https;
            this._agent = new https.Agent({
                ca: params.ca ? [params.ca] : undefined,
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

    /** Return session or batch information by id
     * @param {string} batchOrSession - either 'batch' or 'session'
     * @param {number} id - id of session to get information on
     * @param {funcftion} callback - callback
     * @return {undefined}
     */
    getSessionOrBatch(batchOrSession, id, callback) {
        const pathPrefix = this._inputCheck(batchOrSession, id, callback);
        this._request('GET', `${pathPrefix}/${id}`, null, null, callback);
        return undefined;
    }

    /** Returns interactive sessions or batches
     * @param {string} batchOrSession - either 'batch' or 'session'
     * @param {number} [startIndex] - index to start listing
     * @param {number} [numOfSessionOrBatch] - number of sessions to
     * return
     * @param {function} callback - callback
     * @return {undefined}
     */
    getSessionsOrBatches(batchOrSession, startIndex, numOfSessionOrBatch,
    callback) {
        const pathPrefix = this._inputCheck(batchOrSession, null, callback);
        const params = {};
        if (startIndex) {
            assert(Number.isInteger(startIndex),
            'startIndex must be an integer');
            params.from = startIndex;
        }
        if (numOfSessionOrBatch) {
            assert(Number.isInteger(numOfSessionOrBatch),
            `numOf${batchOrSession} must be an integer`);
            params.size = numOfSessionOrBatch;
        }
        this._request('GET', `${pathPrefix}`,
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
        const pathPrefix = this._inputCheck(batchOrSession, id, callback);
        this._request('GET', `${pathPrefix}/${id}/state`,
            null, null, callback);
        return undefined;
    }

    /** Returns log of batch or session
     * @param {string} batchOrSession - either 'batch' or 'session'
     * @param {number} id - batch or session id
     * @param {function} callback - callback
     * @return {undefined}
     */
    getSessionOrBatchLog(batchOrSession, id, callback) {
        const pathPrefix = this._inputCheck(batchOrSession, id, callback);
        this._request('GET', `${pathPrefix}/${id}/log`, null, null, callback);
        return undefined;
    }

    /** Returns a specified statement within a session
     * @param {number} sessionId - session id
     * @param {number} statementId - statement id
     * @param {function} callback - callback
     * @param {object} [backoff] - backoff instance
     * @return {undefined}
     */
    getStatement(sessionId, statementId, callback, backoff) {
        assert(Number.isInteger(sessionId), 'sessionId must be an integer');
        assert(Number.isInteger(statementId), 'statementId must be an integer');
        const backoffInstance = backoff || new Backoff(this.getBackoffParams);
        if (backoffInstance.attempts >= this.getBackoffParams.maxAttempts) {
            const error = new Error('Attempted to get statement from livy ' +
            'too many times');
            return process.nextTick(() => callback(error));
        }
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
                        callback, backoffInstance);
                }
                // otherwise, error out (status could be error,
                // cancelling or cancelled or possibly other issue)
                const error = new Error('Statement status is: ' +
                `${res.status}. Cannot obtain result`);
                return callback(error);
            });
        return undefined;
    }

    /** Returns all statements within a session
     * @param {number} sessionId - id of session
     * @param {function} callback - callback
     * @return {undefined}
     */
    getStatements(sessionId, callback) {
        assert(typeof callback === 'function', 'callback must be a function');
        assert(Number.isInteger(sessionId), 'sessionId must be an integer');
        this._request('GET', `/sessions/${sessionId}/statements`, null, null,
        callback);
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
        const backoffInstance = backoff || new Backoff(this.postBackoffParams);
        if (backoffInstance.attempts >= this.postBackoffParams.maxAttempts) {
            const error = new Error('Attempted to post statement to livy ' +
            'too many times');
            return process.nextTick(() => callback(error));
        }
        // Need to check status of session
        return this.getSessionOrBatchState('session', sessionId, (err, res) => {
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

    /** cancels a statement
     * @param {number} sessionId - session id
     * @param {number} statementId - id of statement to cancel
     * @param {function} callback - callback
     * @return {undefined}
     */
    cancelStatement(sessionId, statementId, callback) {
        assert(Number.isInteger(sessionId), 'sessionId must be an integer');
        assert(Number.isInteger(statementId), 'statementId must be an integer');
        assert(typeof callback === 'function', 'callback must be a function');
        this._request('POST',
        `/sessions/${sessionId}/statements/${statementId}/cancel`, null, null,
        callback);
    }

    /** Deletes a bath or session
     * @param {number} batchOrSession - either 'batch' or 'session'
     * @param {number} id - id of batch or session
     * @param {function} callback - callback
     * @return {undefined}
     */
    deleteSessionOrBatch(batchOrSession, id, callback) {
        const pathPrefix = this._inputCheck(batchOrSession, id, callback);
        this._request('DELETE', `${pathPrefix}/${id}`,
            null, null, callback);
        return undefined;
    }

    _inputCheck(batchOrSession, id, callback) {
        assert(batchOrSession === 'batch' || batchOrSession === 'session',
            'batchOrSession must be string "batch" or "session"');
        if (id) {
            assert(Number.isInteger(id), 'id must be an integer');
        }
        if (callback) {
            assert(typeof callback === 'function',
            'callback must be a function');
        }
        return batchOrSession === 'batch' ?
            '/batches' : '/sessions';
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
