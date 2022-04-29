import * as http from 'http';
import httpServer from '../http/server';
import * as werelogs from 'werelogs';
import errors from '../../errors';

export const DEFAULT_LIVE_ROUTE = '/_/live';
export const DEFAULT_READY_ROUTE = '/_/live';
export const DEFAULT_METRICS_ROUTE = '/_/metrics';

/**
 * ProbeDelegate is used to determine if a probe is successful or
 * if any errors are present.
 * If everything is working as intended, it is a no-op.
 * Otherwise, return a string representing what is failing.
 * @callback ProbeDelegate
 * @param res - HTTP response for writing
 * @param log - Werelogs instance for logging if you choose to
 * @return String representing issues to report. An empty
 * string or undefined is used to represent no issues.
 */

export type ProbeDelegate = (res: http.ServerResponse, log: RequestLogger) => string | void

export type ProbeServerParams = {
    port: number;
    bindAddress?: string;
}

/**
 * ProbeServer is a generic server for handling probe checks or other
 * generic responses.
 */
export class ProbeServer extends httpServer {
    logging: werelogs.Logger;
    _handlers: Map<string, ProbeDelegate>;

    /**
     * Create a new ProbeServer with parameters
     *
     * @param {ProbeServerParams} params - Parameters for server
     */
    constructor(params: ProbeServerParams) {
        const logging = new werelogs.Logger('ProbeServer');
        super(params.port, logging);
        this.logging = logging;
        this.setBindAddress(params.bindAddress || 'localhost');
        // hooking our request processing function by calling the
        // parent's method for that
        this.onRequest(this._onRequest);

        /** Map of routes to callback methods */
        this._handlers = new Map();
    }

    /**
     * Add request handler at the path
     *
     * @example <caption>If service is not connected</caption>
     * addHandler(DEFAULT_LIVE_ROUTE, (res, log) => {
     *     if (!redisConnected) {
     *         return 'Redis is not connected';
     *     }
     *     res.writeHead(200)
     *     res.end()
     * })
     * @param pathOrPaths - URL path(s) for where the request should be handled
     * @param handler - Callback to handle request
     */
    addHandler(pathOrPaths: string | string[], handler: ProbeDelegate) {
        let paths = pathOrPaths;
        if (typeof paths === 'string') {
            paths = [paths];
        }
        for (const p of paths) {
            this._handlers.set(p, handler);
        }
    }

    _onRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        const log = this.logging.newRequestLogger();
        log.debug('request received', { method: req.method, url: req.url });

        if (req.method !== 'GET') {
            errors.MethodNotAllowed.writeResponse(res);
            return;
        }

        if (!this._handlers.has(req.url!)) {
            errors.InvalidURI.writeResponse(res);
            return;
        }

        const probeResponse = this._handlers.get(req.url!)!(res, log);
        if (probeResponse !== undefined && probeResponse !== '') {
            // Return an internal error with the response
            errors.InternalError
                .customizeDescription(probeResponse)
                .writeResponse(res);
        }
    }
}
