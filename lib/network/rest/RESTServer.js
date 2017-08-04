'use strict'; // eslint-disable-line

const assert = require('assert');
const url = require('url');

const werelogs = require('werelogs');

const httpServer = require('../http/server');
const constants = require('../../constants');
const utils = require('./utils');
const httpUtils = require('../http/utils');
const errors = require('../../errors');

function setContentLength(response, contentLength) {
    response.setHeader('Content-Length', contentLength.toString());
}

function setContentRange(response, byteRange, objectSize) {
    const [start, end] = byteRange;
    assert(start !== undefined && end !== undefined);
    response.setHeader('Content-Range',
                       `bytes ${start}-${end}/${objectSize}`);
}

function sendError(res, log, error, optMessage) {
    res.writeHead(error.code);
    let message;
    if (optMessage) {
        message = optMessage;
    } else {
        message = error.description || '';
    }
    log.debug('sending back error response', { httpCode: error.code,
                                               errorType: error.message,
                                               error: message });
    res.end(`${JSON.stringify({ errorType: error.message,
                                errorMessage: message })}\n`);
}

/**
 * Parse the given url and return a pathInfo object. Sanity checks are
 * performed.
 *
 * @param {String} urlStr - URL to parse
 * @param {Boolean} expectKey - whether the command expects to see a
 *   key in the URL
 * @return {Object} a pathInfo object with URL items containing the
 * following attributes:
 *   - pathInfo.service {String} - The name of REST service ("DataFile")
 *   - pathInfo.key {String} - The requested key
 */
function parseURL(urlStr, expectKey) {
    const urlObj = url.parse(urlStr);
    const pathInfo = utils.explodePath(urlObj.path);
    if (pathInfo.service !== constants.dataFileURL) {
        throw errors.InvalidAction.customizeDescription(
            `unsupported service '${pathInfo.service}'`);
    }
    if (expectKey && pathInfo.key === undefined) {
        throw errors.MissingParameter.customizeDescription(
            'URL is missing key');
    }
    if (!expectKey && pathInfo.key !== undefined) {
        // note: we may implement rewrite functionality by allowing a
        // key in the URL, though we may still provide the new key in
        // the Location header to keep immutability property and
        // atomicity of the update (we would just remove the old
        // object when the new one has been written entirely in this
        // case, saving a request over an equivalent PUT + DELETE).
        throw errors.InvalidURI.customizeDescription(
            'PUT url cannot contain a key');
    }
    return pathInfo;
}

/**
 * @class
 * @classdesc REST Server interface
 *
 * You have to call setup() to initialize the storage backend, then
 * start() to start listening to the configured port.
 */
class RESTServer extends httpServer {

    /**
     * @constructor
     * @param {Object} params - constructor params
     * @param {Number} params.port - TCP port where the server listens to
     * @param {arsenal.storage.data.file.Store} params.dataStore -
     *   data store object
     * @param {Number} [params.bindAddress='localhost'] - address
     * bound to the socket
     * @param {Object} [params.log] - logger configuration
     */
    constructor(params) {
        assert(params.port);

        werelogs.configure({
            level: params.log.logLevel,
            dump: params.log.dumpLevel,
        });
        const logging = new werelogs.Logger('DataFileRESTServer');
        super(params.port, logging);
        this.logging = logging;
        this.dataStore = params.dataStore;
        this.setBindAddress(params.bindAddress || 'localhost');

        // hooking our request processing function by calling the
        // parent's method for that
        this.onRequest(this._onRequest);
        this.reqMethods = {
            PUT: this._onPut.bind(this),
            GET: this._onGet.bind(this),
            DELETE: this._onDelete.bind(this),
        };
    }

    /**
     * Setup the storage backend
     *
     * @param {function} callback - called when finished
     * @return {undefined}
     */
    setup(callback) {
        this.dataStore.setup(callback);
    }

    /**
     * Create a new request logger object
     *
     * @param {String} reqUids - serialized request UIDs (as received in
     * the X-Scal-Request-Uids header)
     * @return {werelogs.RequestLogger} new request logger
     */
    createLogger(reqUids) {
        return reqUids ?
            this.logging.newRequestLoggerFromSerializedUids(reqUids) :
            this.logging.newRequestLogger();
    }

    /**
     * Main incoming request handler, dispatches to method-specific
     * handlers
     *
     * @param {http.IncomingMessage} req - HTTP request object
     * @param {http.ServerResponse} res - HTTP response object
     * @return {undefined}
     */
    _onRequest(req, res) {
        const reqUids = req.headers['x-scal-request-uids'];
        const log = this.createLogger(reqUids);
        log.debug('request received', { method: req.method,
                                        url: req.url });
        if (req.method in this.reqMethods) {
            this.reqMethods[req.method](req, res, log);
        } else {
            // Method Not Allowed
            sendError(res, log, errors.MethodNotAllowed);
        }
    }

    /**
     * Handler for PUT requests
     *
     * @param {http.IncomingMessage} req - HTTP request object
     * @param {http.ServerResponse} res - HTTP response object
     * @param {werelogs.RequestLogger} log - logger object
     * @return {undefined}
     */
    _onPut(req, res, log) {
        let size;
        try {
            parseURL(req.url, false);
            const contentLength = req.headers['content-length'];
            if (contentLength === undefined) {
                throw errors.MissingContentLength;
            }
            size = Number.parseInt(contentLength, 10);
            if (isNaN(size)) {
                throw errors.InvalidInput.customizeDescription(
                    'bad Content-Length');
            }
        } catch (err) {
            return sendError(res, log, err);
        }
        this.dataStore.put(req, size, log, (err, key) => {
            if (err) {
                return sendError(res, log, err);
            }
            log.debug('sending back 201 response to PUT', { key });
            res.setHeader('Location', `${constants.dataFileURL}/${key}`);
            setContentLength(res, 0);
            res.writeHead(201);
            return res.end(() => {
                log.debug('PUT response sent', { key });
            });
        });
        return undefined;
    }

    /**
     * Handler for GET requests
     *
     * @param {http.IncomingMessage} req - HTTP request object
     * @param {http.ServerResponse} res - HTTP response object
     * @param {werelogs.RequestLogger} log - logger object
     * @return {undefined}
     */
    _onGet(req, res, log) {
        let pathInfo;
        let rangeSpec = undefined;

        // Get request on the toplevel endpoint with ?action
        if (req.url.startsWith(`${constants.dataFileURL}?`)) {
            const queryParam = url.parse(req.url).query;
            if (queryParam === 'diskUsage') {
                this.dataStore.getDiskUsage((err, result) => {
                    if (err) {
                        return sendError(res, log, err);
                    }
                    res.writeHead(200);
                    res.end(JSON.stringify(result));
                    return undefined;
                });
            }
        }

        // Get request on an actual object
        try {
            pathInfo = parseURL(req.url, true);
            const rangeHeader = req.headers.range;
            if (rangeHeader !== undefined) {
                rangeSpec = httpUtils.parseRangeSpec(rangeHeader);
                if (rangeSpec.error) {
                    // ignore header if syntax is invalid
                    rangeSpec = undefined;
                }
            }
        } catch (err) {
            return sendError(res, log, err);
        }
        this.dataStore.stat(pathInfo.key, log, (err, info) => {
            if (err) {
                return sendError(res, log, err);
            }
            let byteRange;
            let contentLength;
            if (rangeSpec) {
                const { range, error } = httpUtils.getByteRangeFromSpec(
                    rangeSpec, info.objectSize);
                if (error) {
                    return sendError(res, log, error);
                }
                byteRange = range;
            }
            if (byteRange) {
                contentLength = byteRange[1] - byteRange[0] + 1;
            } else {
                contentLength = info.objectSize;
            }
            this.dataStore.get(pathInfo.key, byteRange, log, (err, rs) => {
                if (err) {
                    return sendError(res, log, err);
                }
                log.debug('sending back 200/206 response with contents',
                          { key: pathInfo.key });
                setContentLength(res, contentLength);
                res.setHeader('Accept-Ranges', 'bytes');
                if (byteRange) {
                    // data is immutable, so objectSize is still correct
                    setContentRange(res, byteRange, info.objectSize);
                    res.writeHead(206);
                } else {
                    res.writeHead(200);
                }
                rs.pipe(res);
                return undefined;
            });
            return undefined;
        });
        return undefined;
    }

    /**
     * Handler for DELETE requests
     *
     * @param {http.IncomingMessage} req - HTTP request object
     * @param {http.ServerResponse} res - HTTP response object
     * @param {werelogs.RequestLogger} log - logger object
     * @return {undefined}
     */
    _onDelete(req, res, log) {
        let pathInfo;
        try {
            pathInfo = parseURL(req.url, true);
        } catch (err) {
            return sendError(res, log, err);
        }
        this.dataStore.delete(pathInfo.key, log, err => {
            if (err) {
                return sendError(res, log, err);
            }
            log.debug('sending back 204 response to DELETE',
                      { key: pathInfo.key });
            res.writeHead(204);
            return res.end(() => {
                log.debug('DELETE response sent', { key: pathInfo.key });
            });
        });
        return undefined;
    }
}

module.exports = RESTServer;
