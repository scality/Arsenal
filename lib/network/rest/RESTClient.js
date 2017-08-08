'use strict'; // eslint-disable-line

const assert = require('assert');
const http = require('http');
const werelogs = require('werelogs');

const constants = require('../../constants');
const utils = require('./utils');
const errors = require('../../errors');

function setRequestUids(reqHeaders, reqUids) {
    // inhibit 'assignment to property of function parameter' -
    // this is what we want
    // eslint-disable-next-line
    reqHeaders['X-Scal-Request-Uids'] = reqUids;
}

function setRange(reqHeaders, range) {
    const rangeStart = range[0] !== undefined ? range[0].toString() : '';
    const rangeEnd = range[1] !== undefined ? range[1].toString() : '';
    // inhibit 'assignment to property of function parameter' -
    // this is what we want
    // eslint-disable-next-line
    reqHeaders['Range'] = `bytes=${rangeStart}-${rangeEnd}`;
}

function setContentType(reqHeaders, contentType) {
    // inhibit 'assignment to property of function parameter' -
    // this is what we want
    // eslint-disable-next-line
    reqHeaders['Content-Type'] = contentType;
}

function setContentLength(reqHeaders, size) {
    // inhibit 'assignment to property of function parameter' -
    // this is what we want
    // eslint-disable-next-line
    reqHeaders['Content-Length'] = size.toString();
}

function makeErrorFromHTTPResponse(response) {
    const rawBody = response.read();
    const body = (rawBody !== null ? rawBody.toString() : '');
    let error;
    try {
        const fields = JSON.parse(body);
        error = errors[fields.errorType]
            .customizeDescription(fields.errorMessage);
    } catch (err) {
        error = new Error(body);
    }
    // error is always a newly created object, so we can modify its
    // properties
    error.remote = true;
    return error;
}


/**
 * @class
 * @classdesc REST Client interface
 *
 * The API is usable when the object is constructed.
 */
class RESTClient {
    /**
     * Interface to the data file server
     * @constructor
     * @param {Object} params - Contains the basic configuration.
     * @param {String} params.host - hostname or ip address of the
     *   RESTServer instance
     * @param {Number} params.port - port number that the RESTServer
     *   instance listens to
     * @param {Werelogs.API} [params.logApi] - logging API instance object
     */
    constructor(params) {
        assert(params.host);
        assert(params.port);

        this.host = params.host;
        this.port = params.port;
        this.setupLogging(params.logApi);
        this.httpAgent = new http.Agent({ keepAlive: true });
    }

    /*
     * Create a dedicated logger for RESTClient, from the provided werelogs API
     * instance.
     *
     * @param {werelogs.API} logApi - object providing a constructor function
     *                                for the Logger object
     * @return {undefined}
     */
    setupLogging(logApi) {
        this.logging = new (logApi || werelogs).Logger('DataFileRESTClient');
    }

    createLogger(reqUids) {
        return reqUids ?
            this.logging.newRequestLoggerFromSerializedUids(reqUids) :
            this.logging.newRequestLogger();
    }

    doRequest(method, headers, key, log, responseCb) {
        const reqHeaders = headers || {};
        const urlKey = key || '';
        const reqParams = {
            hostname: this.host,
            port: this.port,
            method,
            path: `${constants.dataFileURL}/${urlKey}`,
            headers: reqHeaders,
            agent: this.httpAgent,
        };
        log.debug(`about to send ${method} request`, {
            hostname: reqParams.hostname,
            port: reqParams.port,
            path: reqParams.path,
            headers: reqParams.headers });
        const request = http.request(reqParams, responseCb);

        // disable nagle algorithm
        request.setNoDelay(true);
        return request;
    }

    /**
     * This sends a PUT request to the the REST server
     * @param {http.IncomingMessage} stream - Request with the data to send
     * @param {string} stream.contentHash - hash of the data to send
     * @param {integer} size - size
     * @param {string} reqUids - The serialized request ids
     * @param {RESTClient~putCallback} callback - callback
     * @returns {undefined}
     */
    put(stream, size, reqUids, callback) {
        const log = this.createLogger(reqUids);
        const headers = {};
        setRequestUids(headers, reqUids);
        setContentType(headers, 'application/octet-stream');
        setContentLength(headers, size);

        const request = this.doRequest('PUT', headers, null, log, response => {
            response.once('readable', () => {
                // expects '201 Created'
                if (response.statusCode !== 201) {
                    return callback(makeErrorFromHTTPResponse(response));
                }
                // retrieve the key from the Location response header
                // containing the complete URL to the object, like
                // /DataFile/abcdef.
                const location = response.headers.location;
                if (location === undefined) {
                    return callback(new Error(
                        'missing Location header in the response'));
                }
                const locationInfo = utils.explodePath(location);
                if (!locationInfo) {
                    return callback(new Error(
                        `bad Location response header: ${location}`));
                }
                return callback(null, locationInfo.key);
            });
        }).on('finish', () => {
            log.debug('finished sending PUT data to the REST server', {
                component: 'RESTClient',
                method: 'put',
                contentLength: size,
            });
        }).on('error', callback);

        stream.pipe(request);
        stream.on('error', err => {
            log.error('error from readable stream', {
                error: err,
                method: 'put',
                component: 'RESTClient',
            });
            request.end();
        });
    }

    /**
     * send a GET request to the REST server
     * @param {String} key - The key associated to the value
     * @param { Number [] | Undefined} range - range (if any) a
     *   [start, end] inclusive range specification, as defined in
     *   HTTP/1.1 RFC.
     * @param {String} reqUids - The serialized request ids
     * @param {RESTClient~getCallback} callback - callback
     * @returns {undefined}
     */
    get(key, range, reqUids, callback) {
        const log = this.createLogger(reqUids);
        const headers = {};
        setRequestUids(headers, reqUids);
        if (range) {
            setRange(headers, range);
        }
        const request = this.doRequest('GET', headers, key, log, response => {
            response.once('readable', () => {
                if (response.statusCode !== 200 &&
                    response.statusCode !== 206) {
                    return callback(makeErrorFromHTTPResponse(response));
                }
                return callback(null, response);
            });
        }).on('error', callback);

        request.end();
    }

    /**
     * Send a GET request to the REST server, for a specific action rather
     * than an object. Response will be truncated at the high watermark for
     * the internal buffer of the stream, which is 16KB.
     *
     * @param {String} action - The action to query
     * @param {String} reqUids - The serialized request ids
     * @param {RESTClient~getCallback} callback - callback
     * @returns {undefined}
     */
    getAction(action, reqUids, callback) {
        const log = this.createLogger(reqUids);
        const headers = {};
        setRequestUids(headers, reqUids);
        const reqParams = {
            hostname: this.host,
            port: this.port,
            method: 'GET',
            path: `${constants.dataFileURL}?${action}`,
            headers,
            agent: this.httpAgent,
        };
        log.debug('about to send GET request', {
            hostname: reqParams.hostname,
            port: reqParams.port,
            path: reqParams.path,
            headers: reqParams.headers });

        const request = http.request(reqParams, response => {
            response.once('readable', () => {
                if (response.statusCode !== 200 &&
                    response.statusCode !== 206) {
                    return callback(makeErrorFromHTTPResponse(response));
                }
                return callback(null, response.read().toString());
            });
        }).on('error', callback);

        request.end();
    }

    /**
     * send a DELETE request to the REST server
     * @param {String} key - The key associated to the values
     * @param {String} reqUids - The serialized request ids
     * @param {RESTClient~deleteCallback} callback - callback
     * @returns {undefined}
     */
    delete(key, reqUids, callback) {
        const log = this.createLogger(reqUids);
        const headers = {};
        setRequestUids(headers, reqUids);

        const request = this.doRequest(
            'DELETE', headers, key, log, response => {
                response.once('readable', () => {
                    if (response.statusCode !== 200 &&
                        response.statusCode !== 204) {
                        return callback(makeErrorFromHTTPResponse(response));
                    }
                    return callback(null);
                });
            }).on('error', callback);
        request.end();
    }
}

/**
 * @callback RESTClient~putCallback
 * @param {Error} - The encountered error
 * @param {String} key - The key to access the data
 */

/**
 * @callback RESTClient~getCallback
 * @param {Error} - The encountered error
 * @param {stream.Readable} stream - The stream of values fetched
 */

/**
 * @callback RESTClient~deleteCallback
 * @param {Error} - The encountered error
 */

module.exports = RESTClient;
