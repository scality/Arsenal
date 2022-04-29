import * as http from 'http';
import { ArsenalError } from '../../errors';

/**
 * Send a successful HTTP response of 200 OK
 * @param res - HTTP response for writing
 * @param log - Werelogs instance for logging if you choose to
 * @param [message] - Message to send as response, defaults to OK
 */
export function sendSuccess(
    res: http.ServerResponse,
    log: RequestLogger,
    message = 'OK'
) {
    log.debug('replying with success');
    res.writeHead(200);
    res.end(message);
}

/**
 * Send an Arsenal Error response
 * @param res - HTTP response for writing
 * @param log - Werelogs instance for logging if you choose to
 * @param error - Error to send back to the user
 * @param [optMessage] - Message to use instead of the errors message
 */
export function sendError(
    res: http.ServerResponse,
    log: RequestLogger,
    error: ArsenalError,
    optMessage?: string
) {
    const message = optMessage || error.description || '';
    log.debug('sending back error response', {
        httpCode: error.code,
        errorType: error.message,
        error: message,
    });
    res.writeHead(error.code);
    res.end(
        JSON.stringify({
            errorType: error.message,
            errorMessage: message,
        })
    );
}
