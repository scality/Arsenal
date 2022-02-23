import httpServer from '../http/server';
import werelogs from 'werelogs';
import errors from '../../errors';
import ZenkoMetrics from '../../metrics/ZenkoMetrics';
import { sendSuccess, sendError } from './Utils';

function checkStub(log) { // eslint-disable-line
    return true;
}

export default class HealthProbeServer extends httpServer {
    constructor(params) {
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

    onLiveCheck(f) {
        this._livenessCheck = f;
    }

    onReadyCheck(f) {
        this._readinessCheck = f;
    }

    _onRequest(req, res) {
        const log = this.logging.newRequestLogger();
        log.debug('request received', { method: req.method,
            url: req.url });

        if (req.method !== 'GET') {
            sendError(res, log, errors.MethodNotAllowed);
        } else if (req.url in this._reqHandlers) {
            this._reqHandlers[req.url](req, res, log);
        } else {
            sendError(res, log, errors.InvalidURI);
        }
    }

    _onLiveness(req, res, log) {
        if (this._livenessCheck(log)) {
            sendSuccess(res, log);
        } else {
            sendError(res, log, errors.ServiceUnavailable);
        }
    }

    _onReadiness(req, res, log) {
        if (this._readinessCheck(log)) {
            sendSuccess(res, log);
        } else {
            sendError(res, log, errors.ServiceUnavailable);
        }
    }

    // expose metrics to Prometheus
    _onMetrics(req, res) {
        res.writeHead(200, {
            'Content-Type': ZenkoMetrics.asPrometheusContentType(),
        });
        res.end(ZenkoMetrics.asPrometheus());
    }
}
