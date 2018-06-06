const url = require('url');
const querystring = require('querystring');
const errors = require('../../../errors');

/**
 * Extracts components from URI.
 * @param {string} uri - uri part of the received request
 * @param {werelogs.Logger} logger -
 * @return {object} ret - contains up to 4 string properties,
 * @return {string} ret.namespace
 * @return {string} ret.context
 * @return {string} ret.bucketName
 * @return {string} ret.objectName
 */
function getURIComponents(uri, logger) {
    try {
        if (uri.charAt(0) !== '/') {
            return {};
        }

        const { pathname, query } = url.parse(uri);
        const options = query ? querystring.parse(query) : {};
        const typeIndex = pathname.indexOf('/', 1);
        const bucketIndex = pathname.indexOf('/', typeIndex + 1);
        const objectIndex = pathname.indexOf('/', bucketIndex + 1);

        if (typeIndex === -1 || typeIndex === pathname.length - 1) {
            return {};
        }
        if (bucketIndex === -1) {
            return {
                namespace: pathname.substring(1, typeIndex),
                context: pathname.substring(typeIndex + 1),
            };
        }
        if (bucketIndex === pathname.length - 1) {
            return {
                namespace: pathname.substring(1, typeIndex),
                context: pathname.substring(typeIndex + 1, bucketIndex),
            };
        }
        if (objectIndex === -1) {
            return {
                namespace: pathname.substring(1, typeIndex),
                context: pathname.substring(typeIndex + 1, bucketIndex),
                bucketName: pathname.substring(bucketIndex + 1),
                options,
            };
        }
        if (objectIndex === pathname.length - 1) {
            return {
                namespace: pathname.substring(1, typeIndex),
                context: pathname.substring(typeIndex + 1, bucketIndex),
                bucketName: pathname.substring(bucketIndex + 1, objectIndex),
                options,
            };
        }
        return {
            namespace: pathname.substring(1, typeIndex),
            context: pathname.substring(typeIndex + 1, bucketIndex),
            bucketName: pathname.substring(bucketIndex + 1, objectIndex),
            objectName: decodeURIComponent(pathname.substring(objectIndex + 1)),
            options,
        };
    } catch (ex) {
        logger.error('Invalid URI: failed to parse',
                     { uri, error: ex, errorStack: ex.stack });
        return null;
    }
}

/**
 * Extracts the body of the request through a callback
 * @param {http.IncomingMessage} request - request received from bucketclient
 * @param {Function} cb - function which has an interest in the request body.
 *                        The first parameter is err and may be falsey
 *                        The second parameter is the body of the request
 * @return {undefined}
 */
function getRequestBody(request, cb) {
    const body = [];
    let bodyLen = 0;
    request.on('data', data => {
        body.push(data);
        bodyLen += data.length;
    }).on('error', cb).on('end', () => {
        cb(null, Buffer.concat(body, bodyLen).toString());
    });
}

/**
 * Emit a log entry corresponding to the end of the request
 *
 * @param {werelogs.Logger} logger - instance of the logger that will emit the
 *                                   log entry
 * @param {http.IncomingMessage} req - request being processed
 * @param {object} statusCode - HTTP status code sent back to the client
 * @param {object} statusMessage - HTTP status message sent back to the client
 * @return {undefined}
 */
function _logRequestEnd(logger, req, statusCode, statusMessage) {
    const info = {
        clientIp: req.socket.remoteAddress,
        clientPort: req.socket.remotePort,
        httpMethod: req.method,
        httpURL: req.url,
        httpCode: statusCode,
        httpMessage: statusMessage,
    };
    logger.end('finished handling request', info);
}

/**
 * Request processing exit point, sends back to the client the specified data
 * and/or error code
 *
 * @param {http.IncomingMessage} req - request being processed
 * @param {http.OutgoingMessage} res - response associated to the request
 * @param {werelogs.Logger} log - instance of the logger to use
 * @param {Arsenal.Error} err - if not null, defines the HTTP status
 *                              code and message
 * @param {string} data - if not null, used as the response body. If `data'
 *                        isn't a string, it's considered as a JSON object and
 *                        it's content get serialized before being sent.
 * @return {undefined}
 */
function sendResponse(req, res, log, err, data) {
    let statusCode;
    let statusMessage;
    if (err) {
        statusCode = err.code;
        statusMessage = err.message;
    } else {
        statusCode = errors.ok.code;
        statusMessage = errors.ok.message;
    }

    if (data) {
        let resData = data;
        if (typeof resData === 'object') {
            resData = JSON.stringify(data);
        } else if (typeof resData === 'number') {
            resData = resData.toString();
        }
        /*
        * Encoding data to binary provides a hot path to write data
        * directly to the socket, without node.js trying to encode the data
        * over and over again.
        */
        const rawData = Buffer.from(resData, 'utf8');
        /*
        * Using Buffer.bytelength is not required here because data is binary
        * encoded, data.length would give us the exact byte length
        */
        res.writeHead(statusCode, statusMessage, {
            'content-length': rawData.length,
        });
        res.write(rawData);
    } else {
        res.writeHead(statusCode, statusMessage, { 'content-length': 0 });
    }
    return res.end(() => {
        _logRequestEnd(log, req, statusCode, statusMessage);
    });
}

module.exports = {
    getURIComponents,
    getRequestBody,
    sendResponse,
};
