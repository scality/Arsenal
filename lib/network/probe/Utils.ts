/**
 * Send a successful HTTP response of 200 OK
 * @param {http.ServerResponse} res - HTTP response for writing
 * @param {werelogs.Logger} log - Werelogs instance for logging if you choose to
 * @param {string} [message] - Message to send as response, defaults to OK
 * @returns {undefined}
 */
export function sendSuccess(res, log, message = 'OK') {
    log.debug('replying with success');
    res.writeHead(200);
    res.end(message);
}

/**
 * Send an Arsenal Error response
 * @param {http.ServerResponse} res - HTTP response for writing
 * @param {werelogs.Logger} log - Werelogs instance for logging if you choose to
 * @param {ArsenalError} error - Error to send back to the user
 * @param {string} [optMessage] - Message to use instead of the errors message
 * @returns {undefined}
 */
export function sendError(res, log, error, optMessage) {
    const message = optMessage || error.description || '';
    log.debug('sending back error response',
        {
            httpCode: error.code,
            errorType: error.message,
            error: message,
        },
    );
    res.writeHead(error.code);
    res.end(JSON.stringify({
        errorType: error.message,
        errorMessage: message,
    }));
}
