import * as http from 'http';
import httpServer from '../http/server';
import * as werelogs from 'werelogs';
import errors from '../../errors';
import ZenkoMetrics from '../../metrics/ZenkoMetrics';
import { sendSuccess, sendError } from './Utils';

function checkStub(_log: any) {
    // eslint-disable-line
    return true;
}

export default class HealthProbeServer extends httpServer {
    logging: werelogs.Logger;
    _reqHandlers: { [key: string]: any };
    _livenessCheck: (log: any) => boolean;
    _readinessCheck: (log: any) => boolean;

    constructor(params: {
        port: number;
        bindAddress: string;
        livenessCheck?: (log: any) => boolean;
        readinessCheck?: (log: any) => boolean;
    }) {
        const logging = new werelogs.Logger('HealthProbeServer');
        super(params.port, logging);
        this.logging = logging;
        this.setBindAddress(params.bindAddress || 'localhost');
        // hooking our request processing function by calling the
        // parent's method for that
        this.onRequest(this._onRequest);
        this._reqHandlers = {
            '/_/health/liveness': this._onLiveness.bind(this),
            '/_/health/readiness': this._onReadiness.bind(this),
            '/_/monitoring/metrics': this._onMetrics.bind(this),
        };
        this._livenessCheck = params.livenessCheck || checkStub;
        this._readinessCheck = params.readinessCheck || checkStub;
    }

    onLiveCheck(f: (log: any) => boolean) {
        this._livenessCheck = f;
    }

    onReadyCheck(f: (log: any) => boolean) {
        this._readinessCheck = f;
    }

    _onRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        const log = this.logging.newRequestLogger();
        log.debug('request received', { method: req.method, url: req.url });

        if (req.method !== 'GET') {
            sendError(res, log, errors.MethodNotAllowed);
        } else if (req.url && req.url in this._reqHandlers) {
            this._reqHandlers[req.url](req, res, log);
        } else {
            sendError(res, log, errors.InvalidURI);
        }
    }

    _onLiveness(
        _req: http.IncomingMessage,
        res: http.ServerResponse,
        log: RequestLogger,
    ) {
        if (this._livenessCheck(log)) {
            sendSuccess(res, log);
        } else {
            sendError(res, log, errors.ServiceUnavailable);
        }
    }

    _onReadiness(
        _req: http.IncomingMessage,
        res: http.ServerResponse,
        log: RequestLogger,
    ) {
        if (this._readinessCheck(log)) {
            sendSuccess(res, log);
        } else {
            sendError(res, log, errors.ServiceUnavailable);
        }
    }

    // expose metrics to Prometheus
    async _onMetrics(_req: http.IncomingMessage, res: http.ServerResponse) {
        const metrics = await ZenkoMetrics.asPrometheus();
        res.writeHead(200, {
            'Content-Type': ZenkoMetrics.asPrometheusContentType(),
        });
        res.end(metrics);
    }
}
