import * as url from 'url';
import * as ipCheck from '../ipCheck';
import errors, { ArsenalError } from '../errors';
import * as constants from '../constants';
import { eachSeries } from 'async';
import DataWrapper from '../storage/data/DataWrapper';
import * as http from 'http';
import StatsClient from '../metrics/StatsClient';

export type CallApiMethod = (
    methodName: string,
    request: http.IncomingMessage,
    response: http.ServerResponse,
    log: RequestLogger,
    callback: (err: ArsenalError | null, ...data: any[]) => void,
) => void;

/**
 * setCommonResponseHeaders - Set HTTP response headers
 * @param headers - key and value of new headers to add
 * @param response - http response object
 * @param log - Werelogs logger
 * @return response - response object with additional headers
 */
function setCommonResponseHeaders(
    headers: { [key: string]: string } | undefined | null,
    response: http.ServerResponse,
    log: RequestLogger,
) {
    if (headers && typeof headers === 'object') {
        log.trace('setting response headers', { headers });
        Object.keys(headers).forEach(key => {
            if (headers[key] !== undefined) {
                try {
                    response.setHeader(key, headers[key]);
                } catch (e: any) {
                    log.debug('header can not be added ' +
                      'to the response', { header: headers[key],
                        error: e.stack, method: 'setCommonResponseHeaders' });
                }
            }
        });
    }
    response.setHeader('server', 'S3 Server');
    // to be expanded in further implementation of logging of requests
    response.setHeader('x-amz-id-2', log.getSerializedUids());
    response.setHeader('x-amz-request-id', log.getSerializedUids());
    return response;
}
/**
 * okHeaderResponse - Response with only headers, no body
 * @param headers - key and value of new headers to add
 * @param response - http response object
 * @param httpCode -- http response code
 * @param log - Werelogs logger
 * @return response - response object with additional headers
 */
function okHeaderResponse(
    headers: { [key: string]: string } | undefined | null,
    response: http.ServerResponse,
    httpCode: number,
    log: RequestLogger,
) {
    log.trace('sending success header response');
    setCommonResponseHeaders(headers, response, log);
    log.debug('response http code', { httpCode });
    response.writeHead(httpCode);
    return response.end(() => {
        // TODO What's happening ?
        // @ts-expect-error
        log.end().info('responded to request', {
            httpCode: response.statusCode,
        });
    });
}

const XMLResponseBackend = {

    /**
     * okXMLResponse - Response with XML body
     * @param xml - XML body as string
     * @param response - http response object
     * @param log - Werelogs logger
     * @param additionalHeaders -- additional headers to add
     *   to response
     * @return response - response object with additional headers
     */
    okResponse: function okXMLResponse(
        xml: string,
        response: http.ServerResponse,
        log: RequestLogger,
        additionalHeaders?: { [key: string]: string } | null,
    ) {
        const bytesSent = Buffer.byteLength(xml);
        log.trace('sending success xml response');
        log.addDefaultFields({
            bytesSent,
        });
        setCommonResponseHeaders(additionalHeaders, response, log);
        response.writeHead(200, { 'Content-type': 'application/xml' });
        log.debug('response http code', { httpCode: 200 });
        log.trace('xml response', { xml });
        return response.end(xml, 'utf8', () => {
            // TODO What's happening ?
            // @ts-expect-error
            log.end().info('responded with XML', {
                httpCode: response.statusCode,
            });
        });
    },

    errorResponse: function errorXMLResponse(
        errCode: ArsenalError,
        response: http.ServerResponse,
        log: RequestLogger,
        corsHeaders?: { [key: string]: string } | null,
    ) {
        setCommonResponseHeaders(corsHeaders, response, log);
        // early return to avoid extra headers and XML data
        if (errCode.code === 304) {
            response.writeHead(errCode.code);
            return response.end('', 'utf8', () => {
                // TODO What's happening ?
                // @ts-expect-error
                log.end().info('responded with empty body', {
                    httpCode: response.statusCode,
                });
            });
        }

        log.trace('sending error xml response', { errCode });
        /*
         <?xml version="1.0" encoding="UTF-8"?>
         <Error>
            <Code>NoSuchKey</Code>
            <Message>The resource you requested does not exist</Message>
            <Resource>/mybucket/myfoto.jpg</Resource>
            <RequestId>4442587FB7D0A2F9</RequestId>
         </Error>
        */
        const xml: string[] = [];
        xml.push(
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<Error>',
                `<Code>${errCode.message}</Code>`,
                `<Message>${errCode.description}</Message>`,
                '<Resource></Resource>',
                `<RequestId>${log.getSerializedUids()}</RequestId>`,
            '</Error>',
        );
        const xmlStr = xml.join('');
        const bytesSent = Buffer.byteLength(xmlStr);
        log.addDefaultFields({ bytesSent });
        response.writeHead(errCode.code, {
            'Content-Type': 'application/xml',
            'Content-Length': bytesSent ,
        });
        return response.end(xmlStr, 'utf8', () => {
            // TODO What's happening ?
            // @ts-expect-error
            log.end().info('responded with error XML', {
                httpCode: response.statusCode,
            });
        });
    },
};

const JSONResponseBackend = {

    /**
     * okJSONResponse - Response with JSON body
     * @param json - JSON body as string
     * @param response - http response object
     * @param log - Werelogs logger
     * @param additionalHeaders -- additional headers to add
     *   to response
     * @return response - response object with additional headers
     */
    okResponse: function okJSONResponse(
        json: string,
        response: http.ServerResponse,
        log: RequestLogger,
        additionalHeaders?: { [key: string]: string } | null,
    ) {
        const bytesSent = Buffer.byteLength(json);
        log.trace('sending success json response');
        log.addDefaultFields({ bytesSent });
        setCommonResponseHeaders(additionalHeaders, response, log);
        response.writeHead(200, { 'Content-type': 'application/json' });
        log.debug('response http code', { httpCode: 200 });
        log.trace('json response', { json });
        return response.end(json, 'utf8', () => {
            // TODO What's happening ?
            // @ts-expect-error
            log.end().info('responded with JSON', {
                httpCode: response.statusCode,
            });
        });
    },

    errorResponse: function errorJSONResponse(
        errCode: ArsenalError,
        response: http.ServerResponse,
        log: RequestLogger,
        corsHeaders?: { [key: string]: string } | null,
    ) {
        log.trace('sending error json response', { errCode });
        /*
        {
            "code": "NoSuchKey",
            "message": "The resource you requested does not exist",
            "resource": "/mybucket/myfoto.jpg",
            "requestId": "4442587FB7D0A2F9"
        }
        */
        const data = JSON.stringify({
            code: errCode.message,
            message: errCode.description,
            resource: null,
            requestId: log.getSerializedUids(),
        });
        const bytesSent = Buffer.byteLength(data);
        log.addDefaultFields({ bytesSent });
        setCommonResponseHeaders(corsHeaders, response, log);
        response.writeHead(errCode.code, {
            'Content-Type': 'application/json',
            'Content-Length': bytesSent,
        });
        return response.end(data, 'utf8', () => {
            // TODO What's happening ?
            // @ts-expect-error
            log.end().info('responded with error JSON', {
                httpCode: response.statusCode,
            });
        });
    },
};


/**
 * Modify response headers for an objectGet or objectHead request
 * @param overrideParams - parameters in this object override common
 * headers. These are extracted from the request's query object
 * @param resHeaders - object with common response headers
 * @param response - router's response object
 * @param range  - range in form of [start, end]
 * or undefined if no range header
 * @param log - Werelogs logger
 * @return response - modified response object
 */
function okContentHeadersResponse(
    overrideParams: { [key: string]: string },
    resHeaders: { [key: string]: string },
    response: http.ServerResponse,
    range: [number, number] | undefined,
    log: RequestLogger,
) {
    const addHeaders: { [key: string]: string } = {};
    if (process.env.ALLOW_INVALID_META_HEADERS) {
        const headersArr = Object.keys(resHeaders);
        const length = headersArr.length;
        for (let i = 0; i < length; i++) {
            const headerName = headersArr[i];
            if (headerName.startsWith('x-amz-')) {
                const translatedHeaderName = headerName.replace(/\//g, '|+2f');
                // eslint-disable-next-line no-param-reassign
                resHeaders[translatedHeaderName] =
                    resHeaders[headerName];
                if (translatedHeaderName !== headerName) {
                    // eslint-disable-next-line no-param-reassign
                    delete resHeaders[headerName];
                }
            }
        }
    }

    Object.assign(addHeaders, resHeaders);

    if (overrideParams['response-content-type']) {
        addHeaders['Content-Type'] = overrideParams['response-content-type'];
    }
    if (overrideParams['response-content-language']) {
        addHeaders['Content-Language'] =
            overrideParams['response-content-language'];
    }
    if (overrideParams['response-expires']) {
        addHeaders.Expires = overrideParams['response-expires'];
    }
    if (overrideParams['response-cache-control']) {
        addHeaders['Cache-Control'] = overrideParams['response-cache-control'];
    }
    if (overrideParams['response-content-disposition']) {
        addHeaders['Content-Disposition'] =
        overrideParams['response-content-disposition'];
    }
    if (overrideParams['response-content-encoding']) {
        addHeaders['Content-Encoding'] =
            overrideParams['response-content-encoding'];
    }
    setCommonResponseHeaders(addHeaders, response, log);
    const httpCode = range ? 206 : 200;
    log.debug('response http code', { httpCode });
    response.writeHead(httpCode);
    return response;
}

function retrieveDataAzure(
    locations: unknown[],
    // TODO type check here
    retrieveDataParams: any,
    response: http.ServerResponse,
    logger: RequestLogger,
) {
    const errorHandlerFn = (_: any) => { response.socket?.destroy(); };
    const current = locations.shift();

    response.on('error', err => {
        logger.error('error piping data from source');
        errorHandlerFn(err);
    });
    const {
        client,
        implName,
        config,
        kms,
        metadata,
        locStorageCheckFn,
        vault,
    } = retrieveDataParams;
    const data = new DataWrapper(
        client, implName, config, kms, metadata, locStorageCheckFn, vault);
    return data.get(current, response, logger, (err: Error | null) => {
        if (err) {
            logger.error('failed to get object from source', {
                error: err,
                method: 'retrieveData',
                backend: 'Azure',
            });
            return errorHandlerFn(err);
        }
        return undefined;
    });
}

function retrieveData(
    locations: any[],
    retrieveDataParams: any,
    response: http.ServerResponse,
    log: RequestLogger,
) {
    if (locations.length === 0) {
        return response.end();
    }
    if (locations[0].azureStreamingOptions) {
        return retrieveDataAzure(locations, retrieveDataParams, response, log);
    }
    // response is of type http.ServerResponse
    let responseDestroyed = false;
    let currentStream: http.IncomingMessage | null = null; // reference to the stream we are reading from
    const _destroyResponse = () => {
        // destroys the socket if available
        response.destroy();
        responseDestroyed = true;
    };
    // the S3-client might close the connection while we are processing it
    response.once('close', () => {
        responseDestroyed = true;
        if (currentStream) {
            currentStream.destroy();
        }
    });

    const {
        client,
        implName,
        config,
        kms,
        metadata,
        locStorageCheckFn,
        vault,
    } = retrieveDataParams;
    const data = new DataWrapper(
        client, implName, config, kms, metadata, locStorageCheckFn, vault);
    return eachSeries(locations,
        (current, next) => data.get(current, response, log,
            (err: any, readable: http.IncomingMessage) => {
                // NB: readable is of IncomingMessage type
                if (err) {
                    log.error('failed to get object', {
                        error: err,
                        method: 'retrieveData',
                    });
                    _destroyResponse();
                    return next(err);
                }
                // response.isclosed is set by the S3 server. Might happen if
                // the S3-client closes the connection before the first request
                // to the backend is started.
                // @ts-expect-error
                if (responseDestroyed || response.isclosed) {
                    log.debug(
                        'response destroyed before readable could stream');
                    readable.destroy();
                    const responseErr = new Error();
                    // @ts-ignore
                    responseErr.code = 'ResponseError';
                    responseErr.message = 'response closed by client request before all data sent';
                    return next(responseErr);
                }
                // readable stream successfully consumed
                readable.on('end', () => {
                    currentStream = null;
                    log.debug('readable stream end reached');
                    return next();
                });
                // errors on server side with readable stream
                readable.on('error', err => {
                    log.error('error piping data from source');
                    _destroyResponse();
                    return next(err);
                });
                currentStream = readable;
                return readable.pipe(response, { end: false });
            }), err => {
            currentStream = null;
            if (err) {
                log.debug('abort response due to error', {
                    // @ts-expect-error
                    error: err.code, errMsg: err.message });
            }
            // call end for all cases (error/success) per node.js docs
            // recommendation
            response.end();
        },
    );
}

function _responseBody(
    responseBackend: typeof XMLResponseBackend,
    errCode: ArsenalError | null | undefined,
    payload: string | null,
    response: http.ServerResponse,
    log: RequestLogger,
    additionalHeaders?: { [key: string]: string } | null,
) {
    if (errCode && !response.headersSent) {
        return responseBackend.errorResponse(errCode, response, log,
            additionalHeaders);
    }
    if (!response.headersSent && payload) {
        return responseBackend.okResponse(payload, response, log,
            additionalHeaders);
    }
    return undefined;
}

function _computeContentLengthFromLocation(
    dataLocations: { size: string | number }[],
) {
    return dataLocations.reduce<number | undefined>((sum, location) => {
        if (sum !== undefined) {
            if (typeof location.size === 'number') {
                return sum + location.size;
            } else if (typeof location.size === 'string') {
                return sum + parseInt(location.size, 10);
            }
        }
    }, 0);
}

function _contentLengthMatchesLocations(
    contentLength: string,
    dataLocations: { size: string | number }[],
) {
    const sumSizes = _computeContentLengthFromLocation(dataLocations);
    return sumSizes === undefined ||
        sumSizes === Number.parseInt(contentLength, 10);
}

/**
 * @param errCode - S3 error Code
 * @param xml - xml body as string conforming to S3's spec.
 * @param response - router's response object
 * @param log - Werelogs logger
 * @param [additionalHeaders] - additionalHeaders to add
 * to response
 * @return - error or success response utility
 */
export function responseXMLBody(
    errCode: ArsenalError | null | undefined,
    xml: string | null,
    response: http.ServerResponse,
    log: RequestLogger,
    additionalHeaders?: { [key: string]: string },
) {
    return _responseBody(XMLResponseBackend, errCode, xml, response,
        log, additionalHeaders);
}

/**
 * @param errCode - S3 error Code
 * @param json - JSON body as string conforming to S3's spec.
 * @param response - router's response object
 * @param log - Werelogs logger
 * @param [additionalHeaders] - additionalHeaders to add
 * to response
 * @return - error or success response utility
 */
export function responseJSONBody(
    errCode: null | undefined,
    json: string,
    response: http.ServerResponse,
    log: RequestLogger,
    additionalHeaders?: { [key: string]: string },
) : http.ServerResponse | undefined;
export function responseJSONBody(
    errCode: ArsenalError,
    json: null,
    response: http.ServerResponse,
    log: RequestLogger,
    additionalHeaders?: { [key: string]: string },
) : http.ServerResponse | undefined;
export function responseJSONBody(
    errCode: ArsenalError | null | undefined,
    json: string | null,
    response: http.ServerResponse,
    log: RequestLogger,
    additionalHeaders?: { [key: string]: string } | null,
) {
    return _responseBody(JSONResponseBackend, errCode, json, response,
        log, additionalHeaders);
}

/**
 * @param errCode - S3 error Code
 * @param resHeaders - headers to be set for the response
 * @param response - router's response object
 * @param httpCode - httpCode to set in response
 *   If none provided, defaults to 200.
 * @param log - Werelogs logger
 * @return - error or success response utility
 */
export function responseNoBody(
    errCode: ArsenalError | null,
    resHeaders: { [key: string]: string } | null,
    response: http.ServerResponse,
    httpCode = 200,
    log: RequestLogger,
) {
    if (errCode && !response.headersSent) {
        return XMLResponseBackend.errorResponse(errCode, response, log,
            resHeaders);
    }
    if (!response.headersSent) {
        return okHeaderResponse(resHeaders, response, httpCode, log);
    }
    return undefined;
}

/**
 * @param errCode - S3 error Code
 * @param overrideParams - parameters in this object override
 * common headers. These are extracted from the request's query object
 * @param resHeaders - headers to be set for the response
 * @param response - router's response object
 * @param log - Werelogs logger
 * @return - router's response object
 */
export function responseContentHeaders(
    errCode: ArsenalError | null,
    overrideParams: { [key: string]: string },
    resHeaders: { [key: string]: string },
    response: http.ServerResponse,
    log: RequestLogger,
) {
    if (errCode && !response.headersSent) {
        return XMLResponseBackend.errorResponse(errCode, response, log,
            resHeaders);
    }
    if (!response.headersSent) {
        // Undefined added as an argument since need to send range to
        // okContentHeadersResponse in responseStreamData
        okContentHeadersResponse(overrideParams, resHeaders, response,
            undefined, log);
    }
    return response.end(() => {
        // TODO What's happening ?
        // @ts-expect-error
        log.end().info('responded with content headers', {
            httpCode: response.statusCode,
        });
    });
}

/**
 * @param errCode - S3 error Code
 * @param overrideParams - parameters in this object override
 * common headers. These are extracted from the request's query object
 * @param resHeaders - headers to be set for the response
 * @param dataLocations --
 *   - array of locations to get streams from sproxyd
 *   - null if no data for object and only metadata
 * @param retrieveDataParams - params to create instance of data
 * retrieval function
 * @param response - response sent to the client
 * @param range - range in format of [start, end]
 * if range header contained in request or undefined if not
 * @param log - Werelogs logger
 */
export function responseStreamData(
    errCode: ArsenalError | null,
    overrideParams: { [key: string]: string },
    resHeaders: { [key: string]: string },
    dataLocations: { size: string | number }[],
    retrieveDataParams: any,
    response: http.ServerResponse,
    range: [number, number] | undefined,
    log: RequestLogger,
) {
    if (errCode && !response.headersSent) {
        return XMLResponseBackend.errorResponse(errCode, response, log,
            resHeaders);
    }
    if (dataLocations !== null && !response.headersSent) {
        // sanity check of content length against individual data
        // locations to fetch
        const contentLength = resHeaders && resHeaders['Content-Length'];
        if (contentLength !== undefined &&
            !_contentLengthMatchesLocations(contentLength,
                dataLocations)) {
            log.error('logic error: total length of fetched data ' +
                      'locations does not match returned content-length',
            { contentLength, dataLocations });
            return XMLResponseBackend.errorResponse(errors.InternalError,
                response, log,
                resHeaders);
        }
    }
    if (!response.headersSent) {
        okContentHeadersResponse(overrideParams, resHeaders, response,
            range, log);
    }
    if (dataLocations === null || _computeContentLengthFromLocation(dataLocations) === 0) {
        return response.end(() => {
            // TODO What's happening ?
            // @ts-expect-error
            log.end().info('responded with only metadata', {
                httpCode: response.statusCode,
            });
        });
    }
    response.on('finish', () => {
        // TODO What's happening ?
        // @ts-expect-error
        log.end().info('responded with streamed content', {
            httpCode: response.statusCode,
        });
    });
    return retrieveData(dataLocations, retrieveDataParams, response, log);
}

/**
 * @param err -- arsenal error object
 * @param dataLocations --
 *   - array of locations to get streams from backend
 * @param retrieveDataParams - params to create instance of
 * data retrieval function
 * @param response - response sent to the client
 * @param corsHeaders - CORS-related response headers
 * @param log - Werelogs logger
 */
export function streamUserErrorPage(
    err: ArsenalError,
    dataLocations: { size: string | number }[],
    retrieveDataParams: any,
    response: http.ServerResponse,
    corsHeaders: { [key: string]: string },
    log: RequestLogger,
) {
    setCommonResponseHeaders(corsHeaders, response, log);
    response.writeHead(err.code, { 'Content-type': 'text/html' });
    response.on('finish', () => {
        // TODO What's happening ?
        // @ts-expect-error
        log.end().info('responded with streamed content', {
            httpCode: response.statusCode,
        });
    });
    return retrieveData(dataLocations, retrieveDataParams, response, log);
}

/**
 * @param err - arsenal error object
 * @param userErrorPageFailure - whether there was a failure
 * retrieving the user's error page
 * @param bucketName - bucketName from request
 * @param response - response sent to the client
 * @param corsHeaders - CORS-related response headers
 * @param log - Werelogs logger
g */
export function errorHtmlResponse(
    err: ArsenalError,
    userErrorPageFailure: boolean,
    bucketName: string,
    response: http.ServerResponse,
    corsHeaders: { [key: string]: string } | null,
    log: RequestLogger,
) {
    log.trace('sending generic html error page',
        { err });
    setCommonResponseHeaders(corsHeaders, response, log);
    response.writeHead(err.code, { 'Content-type': 'text/html' });
    const html: string[] = [];
    // response.statusMessage will provide standard message for status
    // code so much set response status code before creating html
    html.push(
        '<html>',
        '<head>',
        `<title>${err.code} ${response.statusMessage}</title>`,
        '</head>',
        '<body>',
        `<h1>${err.code} ${response.statusMessage}</h1>`,
        '<ul>',
        `<li>Code: ${err.message}</li>`,
        `<li>Message: ${err.description}</li>`,
    );

    if (!userErrorPageFailure && bucketName) {
        html.push(`<li>BucketName: ${bucketName}</li>`);
    }
    html.push(
        `<li>RequestId: ${log.getSerializedUids()}</li>`,
        // AWS response contains HostId here.
        // TODO: consider adding
        '</ul>',
    );
    if (userErrorPageFailure) {
        html.push(
            '<h3>An Error Occurred While Attempting ',
            'to Retrieve a Custom ',
            'Error Document</h3>',
            '<ul>',
            `<li>Code: ${err.message}</li>`,
            `<li>Message: ${err.description}</li>`,
            '</ul>',
        );
    }
    html.push(
        '<hr/>',
        '</body>',
        '</html>',
    );

    return response.end(html.join(''), 'utf8', () => {
        // TODO What's happening ?
        // @ts-expect-error
        log.end().info('responded with error html', {
            httpCode: response.statusCode,
        });
    });
}

/**
 * @param err - arsenal error object
 * @param response - response sent to the client
 * @param corsHeaders - CORS-related response headers
 * @param log - Werelogs logger
 */
export function errorHeaderResponse(
    err: ArsenalError,
    response: http.ServerResponse,
    corsHeaders: { [key: string]: string },
    log: RequestLogger,
) {
    log.trace('sending error header response',
        { err });
    setCommonResponseHeaders(corsHeaders, response, log);
    response.setHeader('x-amz-error-code', err.message);
    response.setHeader('x-amz-error-message', err.description);
    response.writeHead(err.code);
    return response.end(() => {
        // TODO What's happening ?
        // @ts-expect-error
        log.end().info('responded with error headers', {
            httpCode: response.statusCode,
        });
    });
}

/**
 * redirectRequest - redirectRequest based on rule
 * @param routingInfo - info for routing
 * @param [routingInfo.hostName] - redirect host
 * @param [routingInfo.protocol] - protocol for redirect
 * (http or https)
 * @param [routingInfo.httpRedirectCode] - redirect http code
 * @param [routingInfo.replaceKeyPrefixWith] - repalcement prefix
 * @param [routingInfo.replaceKeyWith] - replacement key
 * @param [routingInfo.prefixFromRule] - key prefix to be replaced
 * @param [routingInfo.justPath] - whether to just send the
 * path as the redirect location header rather than full protocol plus
 * hostname plus path (AWS only sends path when redirect is based on
 * x-amz-website-redirect-location header and redirect is to key in
 * same bucket)
 * @param [routingInfo.redirectLocationHeader] - whether redirect
 * rule came from an x-amz-website-redirect-location header
 * @param objectKey - key name (may have been modified in
 * websiteGet api to include index document)
 * @param encrypted - whether request was https
 * @param response - response object
 * @param hostHeader - host sent in original request.headers
 * @param corsHeaders - CORS-related response headers
 * @param log - Werelogs instance
 */
export function redirectRequest(
    routingInfo: {
        hostName?: string;
        protocol?: string;
        httpRedirectCode?: number;
        replaceKeyPrefixWith?: string;
        replaceKeyWith?: string;
        prefixFromRule?: string;
        justPath?: boolean;
        redirectLocationHeader?: boolean;
    },
    objectKey: string,
    encrypted: boolean,
    response: http.ServerResponse,
    hostHeader: string,
    corsHeaders: { [key: string]: string },
    log: RequestLogger,
) {
    const { justPath, redirectLocationHeader, hostName, protocol,
        httpRedirectCode, replaceKeyPrefixWith,
        replaceKeyWith, prefixFromRule } = routingInfo;

    const redirectProtocol = protocol || encrypted ? 'https' : 'http';
    const redirectCode = httpRedirectCode || 301;
    const redirectHostName = hostName || hostHeader;

    setCommonResponseHeaders(corsHeaders, response, log);

    let redirectKey = objectKey;
    // will only have either replaceKeyWith defined or replaceKeyPrefixWith
    // defined.  not both and might have neither
    if (replaceKeyWith !== undefined) {
        redirectKey = replaceKeyWith;
    }
    if (replaceKeyPrefixWith !== undefined) {
        if (prefixFromRule !== undefined) {
            // if here with prefixFromRule defined, means that
            // passed condition
            // and objectKey starts with this prefix.  replace just first
            // instance in objectKey with the replaceKeyPrefixWith value
            redirectKey = objectKey.replace(prefixFromRule,
                replaceKeyPrefixWith);
        } else {
            redirectKey = replaceKeyPrefixWith + objectKey;
        }
    }
    let redirectLocation = justPath ? `/${redirectKey}` :
        `${redirectProtocol}://${redirectHostName}/${redirectKey}`;
    if (!redirectKey && redirectLocationHeader) {
        // remove hanging slash
        redirectLocation = redirectLocation.slice(0, -1);
    }
    // TODO What's happening ?
    // @ts-expect-error
    log.end().info('redirecting request', {
        httpCode: redirectCode,
        redirectLocation: hostName,
    });
    response.writeHead(redirectCode, {
        Location: redirectLocation,
    });
    response.end();
    return undefined;
}

/**
 * Get bucket name and object name from the request
 * @param request - http request object
 * @param pathname - http request path parsed from request url
 * @param validHosts - all region endpoints + websiteEndpoints
 * @returns result - returns object containing bucket
 * name and objectKey as key
 */
export function getResourceNames(
    request: http.IncomingMessage,
    pathname: string,
    validHosts: string[],
) {
    return getNamesFromReq(request, pathname,
        getBucketNameFromHost(request, validHosts)!);
}

/**
 * Get bucket name and/or object name from the path of a request
 * @param request - http request object
 * @param pathname - http request path parsed from request url
 * @param bucketNameFromHost - name of bucket from host name
 * @returns resources - returns object w. bucket and object as keys
 */
export function getNamesFromReq(
    request: http.IncomingMessage,
    pathname: string,
    bucketNameFromHost: string,
) {
    const resources = {
        bucket: undefined as string | undefined,
        object: undefined as string | undefined,
        host: undefined as string | undefined,
        gotBucketNameFromHost: undefined as boolean | undefined,
        path: undefined as string | undefined,
    };
    // If there are spaces in a key name, s3cmd sends them as "+"s.
    // Actual "+"s are uri encoded as "%2B" so by switching "+"s to
    // spaces here, you still retain any "+"s in the final decoded path
    const pathWithSpacesInsteadOfPluses = pathname.replace(/\+/g, ' ');
    const path = decodeURIComponent(pathWithSpacesInsteadOfPluses);
    resources.path = path;

    let fullHost: string | undefined;
    if (request.headers && request.headers.host) {
        const reqHost = request.headers.host;
        const bracketIndex = reqHost.indexOf(']');
        const colonIndex = reqHost.lastIndexOf(':');
        const hostLength = colonIndex > bracketIndex ?
            colonIndex : reqHost.length;
        fullHost = reqHost.slice(0, hostLength);
    } else {
        fullHost = undefined;
    }

    if (bucketNameFromHost) {
        resources.bucket = bucketNameFromHost;
        const bucketNameLength = bucketNameFromHost.length;
        resources.host = fullHost?.slice(bucketNameLength + 1);
        // Slice off leading '/'
        resources.object = path.slice(1);
        resources.gotBucketNameFromHost = true;
    } else {
        resources.host = fullHost;
        const urlArr = path.split('/');
        if (urlArr.length > 1) {
            resources.bucket = urlArr[1];
            resources.object = urlArr.slice(2).join('/');
        } else if (urlArr.length === 1) {
            resources.bucket = urlArr[0];
        }
    }
    // remove any empty strings or nulls
    if (resources.bucket === '' || resources.bucket === null) {
        resources.bucket = undefined;
    }
    if (resources.object === '' || resources.object === null) {
        resources.object = undefined;
    }
    return resources;
}

/**
 * Get bucket name from the request of a virtually hosted bucket
 * @param request - HTTP request object
 * @return - returns bucket name if dns-style query
 *                              returns undefined if path-style query
 * @param validHosts - all region endpoints + websiteEndpoints
 * @throws in case the type of query could not be infered
 */
export function getBucketNameFromHost(
    request: http.IncomingMessage,
    validHosts: string[],
) {
    const headers = request.headers;
    if (headers === undefined || headers.host === undefined) {
        throw new Error('bad request: no host in headers');
    }
    const reqHost = headers.host;
    const bracketIndex = reqHost.indexOf(']');
    const colonIndex = reqHost.lastIndexOf(':');

    const hostLength = colonIndex > bracketIndex ?
        colonIndex : reqHost.length;
    // If request is made using IPv6 (indicated by presence of brackets),
    // surrounding brackets should not be included in host var
    const host = bracketIndex > -1 ?
        reqHost.slice(1, hostLength - 1) : reqHost.slice(0, hostLength);
    // parseIp returns empty object if host is not valid IP
    // If host is an IP address, it's path-style
    if (Object.keys(ipCheck.parseIp(host)).length !== 0) {
        return undefined;
    }

    let bucketName: string | undefined;
    for (let i = 0; i < validHosts.length; ++i) {
        if (host === validHosts[i]) {
            // It's path-style
            return undefined;
        } else if (host.endsWith(`.${validHosts[i]}`)) {
            const potentialBucketName = host.split(`.${validHosts[i]}`)[0];
            if (!bucketName) {
                bucketName = potentialBucketName;
            } else {
                // bucketName should be shortest so that takes into account
                // most specific potential hostname
                bucketName =
                    potentialBucketName.length < bucketName.length ?
                        potentialBucketName : bucketName;
            }
        }
    }
    if (bucketName) {
        return bucketName;
    }
    throw new Error(
        `bad request: hostname ${host} is not in valid endpoints`,
    );
}

/**
 * Modify http request object
 * @param request - http request object
 * @param validHosts - all region endpoints + websiteEndpoints
 * @return request object with additional attributes
 */
export function normalizeRequest(
    request: http.IncomingMessage,
    validHosts: string[],
) {
    /* eslint-disable no-param-reassign */
    const parsedUrl = url.parse(request.url!, true);
    // @ts-expect-error
    request.query = parsedUrl.query;
    // TODO: make the namespace come from a config variable.
    // @ts-expect-error
    request.namespace = 'default';
    // Parse bucket and/or object names from request
    const resources = getResourceNames(request, parsedUrl.pathname!,
        validHosts);
        // @ts-expect-error
    request.gotBucketNameFromHost = resources.gotBucketNameFromHost;
    // @ts-expect-error
    request.bucketName = resources.bucket;
    // @ts-expect-error
    request.objectKey = resources.object;
    // @ts-expect-error
    request.parsedHost = resources.host;
    // @ts-expect-error
    request.path = resources.path;
    // For streaming v4 auth, the total body content length
    // without the chunk metadata is sent as
    // the x-amz-decoded-content-length
    const contentLength = request.headers['x-amz-decoded-content-length'] ?
        request.headers['x-amz-decoded-content-length'] :
        request.headers['content-length'];
        // @ts-expect-error
    request.parsedContentLength =
        Number.parseInt(contentLength!.toString(), 10);

    if (process.env.ALLOW_INVALID_META_HEADERS) {
        const headersArr = Object.keys(request.headers);
        const length = headersArr.length;
        if (headersArr.indexOf('x-invalid-metadata') > 1) {
            for (let i = 0; i < length; i++) {
                const headerName = headersArr[i];
                if (headerName.startsWith('x-amz-')) {
                    const translatedHeaderName =
                        headerName.replace(/\|\+2f/g, '/');
                    request.headers[translatedHeaderName] =
                        request.headers[headerName];
                    if (translatedHeaderName !== headerName) {
                        delete request.headers[headerName];
                    }
                }
            }
        }
    }
    return request;
}

/**
 * Validate object key per naming rules and restrictions
 * @param objectKey - object key
 * @param prefixBlacklist - prefixes reserved for internal use
 * @return - object containing true/false result and invalidPrefix
 *  if false
 */
export function isValidObjectKey(objectKey: string, prefixBlacklist: string[]) {
    const invalidPrefix = prefixBlacklist.find(prefix =>
        objectKey.startsWith(prefix));
    if (invalidPrefix) {
        return { isValid: false, invalidPrefix };
    }
    return { isValid: true };
}

/**
 * Validate bucket name per naming rules and restrictions
 * @param bucketname - name of the bucket to be created
 * @param prefixBlacklist - prefixes reserved for internal use
 * @return - returns true/false by testing bucket name against validation rules
 */
export function isValidBucketName(
    bucketname: string,
    prefixBlacklist: string[],
) {
    if (constants.permittedCapitalizedBuckets[bucketname]) {
        return true;
    }
    const ipAddressRegex = new RegExp(/^(\d+\.){3}\d+$/);
    // eslint-disable-next-line no-useless-escape
    const dnsRegex = new RegExp(/^[a-z0-9]+((\.|\-+)[a-z0-9]+)*$/);
    // Must be at least 3 and no more than 63 characters long.
    if (bucketname.length < 3 || bucketname.length > 63) {
        return false;
    }
    // Certain prefixes may be reserved, for example for shadow buckets
    // used for multipart uploads
    if (prefixBlacklist.some(prefix => bucketname.startsWith(prefix))) {
        return false;
    }
    // Must not contain more than one consecutive period
    if (bucketname.indexOf('..') > 1) {
        return false;
    }
    // Must not be an ip address
    if (bucketname.match(ipAddressRegex)) {
        return false;
    }
    // Must be dns compatible (excludes capitalized letters)
    return !!bucketname.match(dnsRegex);
}

/**
 * Parse content-md5 from meta headers
 * @param headers - request headers
 * @return - returns content-md5 string
 */
export function parseContentMD5(headers: http.IncomingHttpHeaders) {
    const attrs = headers['x-amz-meta-s3cmd-attrs'];
    if (attrs) {
        const metaHeadersArr = attrs.toString().split('/');
        for (let i = 0; i < metaHeadersArr.length; i++) {
            const tmpArr = metaHeadersArr[i].split(':');
            if (tmpArr[0] === 'md5') {
                return tmpArr[1];
            }
        }
    }
    return '';
}

/**
* Report 500 to stats when an Internal Error occurs
* @param err - Arsenal error
* @param statsClient - StatsClient instance
*/
export function statsReport500(err?: ArsenalError | null, statsClient?: StatsClient | null) {
    if (statsClient && err && err.code === 500) {
        statsClient.report500('s3');
    }
    return undefined;
}
