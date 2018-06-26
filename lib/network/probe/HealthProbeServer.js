const httpServer = require('../http/server');
const werelogs = require('werelogs');
const errors = require('../../errors');

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

function sendSuccess(res, log, msg) {
    res.writeHead(200);
    log.debug('replying with success');
    const message = msg || 'OK';
    res.end(message);
}

function constructEndpoints(ns, path) {
    return `/${ns}/${path}`;
}

function checkStub(log) { // eslint-disable-line
    return true;
}

class HealthProbeServer extends httpServer {
    constructor(params) {
        const logging = new werelogs.Logger('HealthProbeServer');
        super(params.port, logging);
        this.logging = logging;
        this.setBindAddress(params.bindAddress || 'localhost');
        this._namespace = params.namespace || '_/health';
        const livenessURI = constructEndpoints(this._namespace,
            params.livenessURI || 'liveness');
        const readinessURI = constructEndpoints(this._namespace,
            params.readinessURI || 'readiness');
        // hooking our request processing function by calling the
        // parent's method for that
        this.onRequest(this._onRequest);
        this._reqHandlers = {};
        this._reqHandlers[livenessURI] = this._onLiveness.bind(this);
        this._reqHandlers[readinessURI] = this._onReadiness.bind(this);
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
        }
        if (req.url.startsWith(`/${this._namespace}`) &&
            req.url in this._reqHandlers) {
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

}

module.exports = HealthProbeServer;
