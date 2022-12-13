import assert from 'assert';
import * as url from 'url';
import * as werelogs from 'werelogs';
import * as http from 'http';
import httpServer from '../http/server';
import * as constants from '../../constants';
import { parseURL } from './utils';
import * as httpUtils from '../http/utils';
import errors, { ArsenalError } from '../../errors';

function setContentLength(response: http.ServerResponse, contentLength: number) {
    response.setHeader('Content-Length', contentLength.toString());
}

function setContentRange(
    response: http.ServerResponse,
    byteRange: [number | undefined, number | undefined],
    objectSize: number,
) {
    const [start, end] = byteRange;
    assert(start !== undefined && end !== undefined);
    response.setHeader('Content-Range',
        `bytes ${start}-${end}/${objectSize}`);
}

function sendError(
    res: http.ServerResponse,
    log: RequestLogger,
    error: ArsenalError,
    optMessage?: string,
) {
    res.writeHead(error.code);
    const message = optMessage ?? error.description ?? '';
    log.debug('sending back error response', { httpCode: error.code,
        errorType: error.message,
        error: message });
    res.end(`${JSON.stringify({ errorType: error.message,
        errorMessage: message })}\n`);
}

/**
 * @class
 * @classdesc REST Server interface
 *
 * You have to call setup() to initialize the storage backend, then
 * start() to start listening to the configured port.
 */
export default class RESTServer extends httpServer {
    logging: werelogs.Logger;
    dataStore: any;
    reqMethods: { [key: string]: any };

    /**
     * @constructor
     * @param params - constructor params
     * @param params.port - TCP port where the server listens to
     * @param {arsenal.storage.data.file.Store} params.dataStore -
     *   data store object
     * @param [params.bindAddress='localhost'] - address
     * bound to the socket
     * @param [params.log] - logger configuration
     */
    constructor(params: {
        port: number;
        dataStore: any;
        bindAddress?: string;
        log: { logLevel: any; dumpLevel: any; };
    }) {
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
        this.setKeepAliveTimeout(constants.httpServerKeepAliveTimeout);
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
     * @param callback - called when finished
     */
    setup(callback: any) {
        this.dataStore.setup(callback);
    }

    /**
     * Create a new request logger object
     *
     * @param reqUids - serialized request UIDs (as received in
     * the X-Scal-Request-Uids header)
     * @return new request logger
     */
    createLogger(reqUids?: string) {
        return reqUids ?
            this.logging.newRequestLoggerFromSerializedUids(reqUids) :
            this.logging.newRequestLogger();
    }

    /**
     * Main incoming request handler, dispatches to method-specific
     * handlers
     *
     * @param req - HTTP request object
     * @param res - HTTP response object
     */
    _onRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        const reqUids = req.headers['x-scal-request-uids'];
        const log = this.createLogger(reqUids as string);
        log.debug('request received', { method: req.method,
            url: req.url });
        const method = req.method ?? '';
        if (method in this.reqMethods) {
            this.reqMethods[method](req, res, log);
        } else {
            // Method Not Allowed
            sendError(res, log, errors.MethodNotAllowed);
        }
    }

    /**
     * Handler for PUT requests
     *
     * @param req - HTTP request object
     * @param res - HTTP response object
     * @param log - logger object
     */
    _onPut(
        req: http.IncomingMessage,
        res: http.ServerResponse,
        log: RequestLogger,
    ) {
        let size: number;
        try {
            parseURL(req.url ?? '', false);
            const contentLength = req.headers['content-length'];
            if (contentLength === undefined) {
                throw errors.MissingContentLength;
            }
            size = Number.parseInt(contentLength, 10);
            if (Number.isNaN(size)) {
                throw errors.InvalidInput.customizeDescription(
                    'bad Content-Length');
            }
        } catch (err: any) {
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
     * @param req - HTTP request object
     * @param res - HTTP response object
     * @param log - logger object
     */
    _onGet(
        req: http.IncomingMessage,
        res: http.ServerResponse,
        log: RequestLogger,
    ) {
        let pathInfo: ReturnType<typeof parseURL>;
        let rangeSpec: ReturnType<typeof httpUtils.parseRangeSpec> | undefined =
            undefined;

        // Get request on the toplevel endpoint with ?action
        if (req.url?.startsWith(`${constants.dataFileURL}?`)) {
            const queryParam = url.parse(req.url).query;
            if (queryParam === 'diskUsage') {
                return this.dataStore.getDiskUsage((err, result) => {
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
            pathInfo = parseURL(req.url ?? '', true);
            const rangeHeader = req.headers.range;
            if (rangeHeader !== undefined) {
                rangeSpec = httpUtils.parseRangeSpec(rangeHeader);
            }
        } catch (err: any) {
            return sendError(res, log, err);
        }
        this.dataStore.stat(pathInfo.key, log, (err, info) => {
            if (err) {
                return sendError(res, log, err);
            }
            let byteRange: [number, number] | undefined;
            let contentLength: number;
            if (rangeSpec && !('error' in rangeSpec)) {
                const result = httpUtils.getByteRangeFromSpec(rangeSpec, info.objectSize);
                if ('error' in result) {
                    return sendError(res, log, result.error);
                } else if ('range' in result) {
                    byteRange = result.range;
                }
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
     * @param req - HTTP request object
     * @param res - HTTP response object
     * @param log - logger object
     */
    _onDelete(
        req: http.IncomingMessage,
        res: http.ServerResponse,
        log: RequestLogger,
    ) {
        let pathInfo: ReturnType<typeof parseURL>;
        try {
            pathInfo = parseURL(req.url ?? '', true);
        } catch (err: any) {
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
