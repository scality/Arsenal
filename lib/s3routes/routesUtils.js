const url = require('url');
const ipCheck = require('../ipCheck');
const errors = require('../errors');

/**
 * setCommonResponseHeaders - Set HTTP response headers
 * @param {object} headers - key and value of new headers to add
 * @param {object} response - http response object
 * @param {object} log - Werelogs logger
 * @return {object} response - response object with additional headers
 */
function setCommonResponseHeaders(headers, response, log) {
    if (headers && typeof headers === 'object') {
        log.trace('setting response headers', { headers });
        Object.keys(headers).forEach(key => {
            if (headers[key] !== undefined) {
                try {
                    response.setHeader(key, headers[key]);
                } catch (e) {
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
 * @param {object} headers - key and value of new headers to add
 * @param {object} response - http response object
 * @param {number} httpCode -- http response code
 * @param {object} log - Werelogs logger
 * @return {object} response - response object with additional headers
 */
function okHeaderResponse(headers, response, httpCode, log) {
    log.trace('sending success header response');
    setCommonResponseHeaders(headers, response, log);
    log.debug('response http code', { httpCode });
    response.writeHead(httpCode);
    return response.end(() => {
        log.end().info('responded to request', {
            httpCode: response.statusCode,
        });
    });
}

const XMLResponseBackend = {

    /**
     * okXMLResponse - Response with XML body
     * @param {string} xml - XML body as string
     * @param {object} response - http response object
     * @param {object} log - Werelogs logger
     * @param {object} additionalHeaders -- additional headers to add
     *   to response
     * @return {object} response - response object with additional headers
     */
    okResponse: function okXMLResponse(xml, response, log,
                                       additionalHeaders) {
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
            log.end().info('responded with XML', {
                httpCode: response.statusCode,
            });
        });
    },

    errorResponse: function errorXMLResponse(errCode, response, log,
                                             corsHeaders) {
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
        const xml = [];
        xml.push(
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<Error>',
            `<Code>${errCode.message}</Code>`,
            `<Message>${errCode.description}</Message>`,
            '<Resource></Resource>',
            `<RequestId>${log.getSerializedUids()}</RequestId>`,
            '</Error>'
        );
        const xmlStr = xml.join('');
        const bytesSent = Buffer.byteLength(xmlStr);
        log.addDefaultFields({
            bytesSent,
        });
        setCommonResponseHeaders(corsHeaders, response, log);
        response.writeHead(errCode.code,
            { 'Content-Type': 'application/xml',
                'Content-Length': bytesSent });
        return response.end(xmlStr, 'utf8', () => {
            log.end().info('responded with error XML', {
                httpCode: response.statusCode,
            });
        });
    },
};

const JSONResponseBackend = {

    /**
     * okJSONResponse - Response with JSON body
     * @param {string} json - JSON body as string
     * @param {object} response - http response object
     * @param {object} log - Werelogs logger
     * @param {object} additionalHeaders -- additional headers to add
     *   to response
     * @return {object} response - response object with additional headers
     */
    okResponse: function okJSONResponse(json, response, log,
                                        additionalHeaders) {
        const bytesSent = Buffer.byteLength(json);
        log.trace('sending success json response');
        log.addDefaultFields({
            bytesSent,
        });
        setCommonResponseHeaders(additionalHeaders, response, log);
        response.writeHead(200, { 'Content-type': 'application/json' });
        log.debug('response http code', { httpCode: 200 });
        log.trace('json response', { json });
        return response.end(json, 'utf8', () => {
            log.end().info('responded with JSON', {
                httpCode: response.statusCode,
            });
        });
    },

    errorResponse: function errorJSONResponse(errCode, response, log,
                                              corsHeaders) {
        log.trace('sending error json response', { errCode });
        /*
         {
             "code": "NoSuchKey",
             "message": "The resource you requested does not exist",
             "resource": "/mybucket/myfoto.jpg",
             "requestId": "4442587FB7D0A2F9"
         }
         */
        const jsonStr =
                  `{"code":"${errCode.message}",` +
                  `"message":"${errCode.description}",` +
                  '"resource":null,' +
                  `"requestId":"${log.getSerializedUids()}"}`;
        const bytesSent = Buffer.byteLength(jsonStr);
        log.addDefaultFields({
            bytesSent,
        });
        setCommonResponseHeaders(corsHeaders, response, log);
        response.writeHead(errCode.code,
            { 'Content-Type': 'application/json',
                'Content-Length': bytesSent });
        return response.end(jsonStr, 'utf8', () => {
            log.end().info('responded with error JSON', {
                httpCode: response.statusCode,
            });
        });
    },
};


/**
 * Modify response headers for an objectGet or objectHead request
 * @param {object} overrideParams - parameters in this object override common
 * headers. These are extracted from the request's query object
 * @param {object} resHeaders - object with common response headers
 * @param {object} response - router's response object
 * @param {array | undefined} range  - range in form of [start, end]
 * or undefined if no range header
 * @param {object} log - Werelogs logger
 * @return {object} response - modified response object
 */
function okContentHeadersResponse(overrideParams, resHeaders,
    response, range, log) {
    const addHeaders = {};
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

function retrieveData(locations, dataRetrievalFn,
    response, logger, errorHandlerFn) {
    if (locations.length === 0) {
        return response.end();
    }
    if (errorHandlerFn === undefined) {
        // eslint-disable-next-line
        errorHandlerFn = () => { response.connection.destroy(); };
    }
    const current = locations.shift();
    if (current.azureStreamingOptions) {
        // pipe data directly from source to response
        response.on('error', err => {
            logger.error('error piping data from source');
            errorHandlerFn(err);
        });
        return dataRetrievalFn(current, response, logger, err => {
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
    return dataRetrievalFn(current, response, logger,
        (err, readable) => {
            if (err) {
                logger.error('failed to get object', {
                    error: err,
                    method: 'retrieveData',
                });
                return errorHandlerFn(err);
            }
            readable.on('error', err => {
                logger.error('error piping data from source');
                errorHandlerFn(err);
            });
            readable.on('end', () => {
                process.nextTick(retrieveData,
                locations, dataRetrievalFn, response, logger);
            });
            readable.pipe(response, { end: false });
            return undefined;
        });
}

function _responseBody(responseBackend, errCode, payload, response, log,
                       additionalHeaders) {
    if (errCode && !response.headersSent) {
        return responseBackend.errorResponse(errCode, response, log,
                                             additionalHeaders);
    }
    if (!response.headersSent) {
        return responseBackend.okResponse(payload, response, log,
                                          additionalHeaders);
    }
    return undefined;
}

function _contentLengthMatchesLocations(contentLength, dataLocations) {
    const sumSizes = dataLocations.reduce(
        (sum, location) => (sum !== undefined && location.size ?
                            sum + Number.parseInt(location.size, 10) :
                            undefined), 0);
    return sumSizes === undefined ||
        sumSizes === Number.parseInt(contentLength, 10);
}

const routesUtils = {
    /**
     * @param {string} errCode - S3 error Code
     * @param {string} xml - xml body as string conforming to S3's spec.
     * @param {object} response - router's response object
     * @param {object} log - Werelogs logger
     * @param {object} [additionalHeaders] - additionalHeaders to add
     * to response
     * @return {function} - error or success response utility
     */
    responseXMLBody(errCode, xml, response, log, additionalHeaders) {
        return _responseBody(XMLResponseBackend, errCode, xml, response,
                             log, additionalHeaders);
    },

    /**
     * @param {string} errCode - S3 error Code
     * @param {string} json - JSON body as string conforming to S3's spec.
     * @param {object} response - router's response object
     * @param {object} log - Werelogs logger
     * @param {object} [additionalHeaders] - additionalHeaders to add
     * to response
     * @return {function} - error or success response utility
     */
    responseJSONBody(errCode, json, response, log, additionalHeaders) {
        return _responseBody(JSONResponseBackend, errCode, json, response,
                             log, additionalHeaders);
    },

    /**
     * @param {string} errCode - S3 error Code
     * @param {string} resHeaders - headers to be set for the response
     * @param {object} response - router's response object
     * @param {number} httpCode - httpCode to set in response
     *   If none provided, defaults to 200.
     * @param {object} log - Werelogs logger
     * @return {function} - error or success response utility
     */
    responseNoBody(errCode, resHeaders, response, httpCode = 200, log) {
        if (errCode && !response.headersSent) {
            return XMLResponseBackend.errorResponse(errCode, response, log,
                                                    resHeaders);
        }
        if (!response.headersSent) {
            return okHeaderResponse(resHeaders, response, httpCode, log);
        }
        return undefined;
    },

    /**
     * @param {string} errCode - S3 error Code
     * @param {object} overrideParams - parameters in this object override
     * common headers. These are extracted from the request's query object
     * @param {string} resHeaders - headers to be set for the response
     * @param {object} response - router's response object
     * @param {object} log - Werelogs logger
     * @return {object} - router's response object
     */
    responseContentHeaders(errCode, overrideParams, resHeaders, response,
                           log) {
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
            log.end().info('responded with content headers', {
                httpCode: response.statusCode,
            });
        });
    },

    /**
     * @param {string} errCode - S3 error Code
     * @param {object} overrideParams - parameters in this object override
     * common headers. These are extracted from the request's query object
     * @param {string} resHeaders - headers to be set for the response
     * @param {array | null} dataLocations --
     *   - array of locations to get streams from sproxyd
     *   - null if no data for object and only metadata
     * @param {function} dataRetrievalFn - function to handle streaming data
     * @param {http.ServerResponse} response - response sent to the client
     * @param {array | undefined} range - range in format of [start, end]
     * if range header contained in request or undefined if not
     * @param {object} log - Werelogs logger
     * @return {undefined}
     */
    responseStreamData(errCode, overrideParams, resHeaders, dataLocations,
        dataRetrievalFn, response, range, log) {
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
        if (dataLocations === null) {
            return response.end(() => {
                log.end().info('responded with only metadata', {
                    httpCode: response.statusCode,
                });
            });
        }
        response.on('finish', () => {
            log.end().info('responded with streamed content', {
                httpCode: response.statusCode,
            });
        });
        return retrieveData(dataLocations, dataRetrievalFn, response, log);
    },

    /**
     * @param {object} err -- arsenal error object
     * @param {array} dataLocations --
     *   - array of locations to get streams from backend
     * @param {function} dataRetrievalFn - function to handle streaming data
     * @param {http.ServerResponse} response - response sent to the client
     * @param {object} corsHeaders - CORS-related response headers
     * @param {object} log - Werelogs logger
     * @return {undefined}
     */
    streamUserErrorPage(err, dataLocations, dataRetrievalFn, response,
        corsHeaders, log) {
        setCommonResponseHeaders(corsHeaders, response, log);
        response.writeHead(err.code, { 'Content-type': 'text/html' });
        response.on('finish', () => {
            log.end().info('responded with streamed content', {
                httpCode: response.statusCode,
            });
        });
        return retrieveData(dataLocations, dataRetrievalFn, response, log);
    },

    /**
     * @param {object} err - arsenal error object
     * @param {boolean} userErrorPageFailure - whether there was a failure
     * retrieving the user's error page
     * @param {string} bucketName - bucketName from request
     * @param {http.ServerResponse} response - response sent to the client
     * @param {object} corsHeaders - CORS-related response headers
     * @param {object} log - Werelogs logger
     * @return {undefined}
     */
    errorHtmlResponse(err, userErrorPageFailure, bucketName, response,
        corsHeaders, log) {
        log.trace('sending generic html error page',
            { err });
        setCommonResponseHeaders(corsHeaders, response, log);
        response.writeHead(err.code, { 'Content-type': 'text/html' });
        const html = [];
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
            `<li>Message: ${err.description}</li>`
        );

        if (!userErrorPageFailure && bucketName) {
            html.push(`<li>BucketName: ${bucketName}</li>`);
        }
        html.push(
            `<li>RequestId: ${log.getSerializedUids()}</li>`,
            // AWS response contains HostId here.
            // TODO: consider adding
            '</ul>'
        );
        if (userErrorPageFailure) {
            html.push(
                '<h3>An Error Occurred While Attempting ',
                'to Retrieve a Custom ',
                'Error Document</h3>',
                '<ul>',
                `<li>Code: ${err.message}</li>`,
                `<li>Message: ${err.description}</li>`,
                '</ul>'
            );
        }
        html.push(
            '<hr/>',
            '</body>',
            '</html>'
        );

        return response.end(html.join(''), 'utf8', () => {
            log.end().info('responded with error html', {
                httpCode: response.statusCode,
            });
        });
    },

    /**
     * @param {object} err - arsenal error object
     * @param {http.ServerResponse} response - response sent to the client
     * @param {object} corsHeaders - CORS-related response headers
     * @param {object} log - Werelogs logger
     * @return {undefined}
     */
    errorHeaderResponse(err, response, corsHeaders, log) {
        log.trace('sending error header response',
            { err });
        setCommonResponseHeaders(corsHeaders, response, log);
        response.setHeader('x-amz-error-code', err.message);
        response.setHeader('x-amz-error-message', err.description);
        response.writeHead(err.code);
        return response.end(() => {
            log.end().info('responded with error headers', {
                httpCode: response.statusCode,
            });
        });
    },

    /**
     * redirectRequest - redirectRequest based on rule
     * @param {object} routingInfo - info for routing
     * @param {string} [routingInfo.hostName] - redirect host
     * @param {string} [routingInfo.protocol] - protocol for redirect
     * (http or https)
     * @param {number} [routingInfo.httpRedirectCode] - redirect http code
     * @param {string} [routingInfo.replaceKeyPrefixWith] - repalcement prefix
     * @param {string} [routingInfo.replaceKeyWith] - replacement key
     * @param {string} [routingInfo.prefixFromRule] - key prefix to be replaced
     * @param {boolean} [routingInfo.justPath] - whether to just send the
     * path as the redirect location header rather than full protocol plus
     * hostname plus path (AWS only sends path when redirect is based on
     * x-amz-website-redirect-location header and redirect is to key in
     * same bucket)
     * @param {boolean} [routingInfo.redirectLocationHeader] - whether redirect
     * rule came from an x-amz-website-redirect-location header
     * @param {string} objectKey - key name (may have been modified in
     * websiteGet api to include index document)
     * @param {boolean} encrypted - whether request was https
     * @param {object} response - response object
     * @param {string} hostHeader - host sent in original request.headers
     * @param {object} corsHeaders - CORS-related response headers
     * @param {object} log - Werelogs instance
     * @return {undefined}
     */
    redirectRequest(routingInfo, objectKey, encrypted, response, hostHeader,
        corsHeaders, log) {
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
        log.end().info('redirecting request', {
            httpCode: redirectCode,
            redirectLocation: hostName,
        });
        response.writeHead(redirectCode, {
            Location: redirectLocation,
        });
        response.end();
        return undefined;
    },

    /**
     * Get bucket name and object name from the request
     * @param {object} request - http request object
     * @param {string} pathname - http request path parsed from request url
     * @param {string[]} validHosts - all region endpoints + websiteEndpoints
     * @returns {object} result - returns object containing bucket
     * name and objectKey as key
     */
    getResourceNames(request, pathname, validHosts) {
        return this.getNamesFromReq(request, pathname,
            routesUtils.getBucketNameFromHost(request, validHosts));
    },

    /**
     * Get bucket name and/or object name from the path of a request
     * @param {object} request - http request object
     * @param {string} pathname - http request path parsed from request url
     * @param {string} bucketNameFromHost - name of bucket from host name
     * @returns {object} resources - returns object w. bucket and object as keys
     */
    getNamesFromReq(request, pathname,
        bucketNameFromHost) {
        const resources = {
            bucket: undefined,
            object: undefined,
            host: undefined,
            gotBucketNameFromHost: undefined,
            path: undefined,
        };
        // If there are spaces in a key name, s3cmd sends them as "+"s.
        // Actual "+"s are uri encoded as "%2B" so by switching "+"s to
        // spaces here, you still retain any "+"s in the final decoded path
        const pathWithSpacesInsteadOfPluses = pathname.replace(/\+/g, ' ');
        const path = decodeURIComponent(pathWithSpacesInsteadOfPluses);
        resources.path = path;

        let fullHost;
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
            resources.host = fullHost.slice(bucketNameLength + 1);
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
    },

    /**
     * Get bucket name from the request of a virtually hosted bucket
     * @param {object} request - HTTP request object
     * @return {string|undefined} - returns bucket name if dns-style query
     *                              returns undefined if path-style query
     * @param {string[]} validHosts - all region endpoints + websiteEndpoints
     * @throws {Error} in case the type of query could not be infered
     */
    getBucketNameFromHost(request, validHosts) {
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

        let bucketName;
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
            `bad request: hostname ${host} is not in valid endpoints`
        );
    },

    /**
     * Modify http request object
     * @param {object} request - http request object
     * @param {string[]} validHosts - all region endpoints + websiteEndpoints
     * @return {object} request object with additional attributes
     */
    normalizeRequest(request, validHosts) {
        /* eslint-disable no-param-reassign */
        const parsedUrl = url.parse(request.url, true);
        request.query = parsedUrl.query;
        // TODO: make the namespace come from a config variable.
        request.namespace = 'default';
        // Parse bucket and/or object names from request
        const resources = this.getResourceNames(request, parsedUrl.pathname,
            validHosts);
        request.gotBucketNameFromHost = resources.gotBucketNameFromHost;
        request.bucketName = resources.bucket;
        request.objectKey = resources.object;
        request.parsedHost = resources.host;
        request.path = resources.path;
        // For streaming v4 auth, the total body content length
        // without the chunk metadata is sent as
        // the x-amz-decoded-content-length
        const contentLength = request.headers['x-amz-decoded-content-length'] ?
            request.headers['x-amz-decoded-content-length'] :
            request.headers['content-length'];
        request.parsedContentLength =
            Number.parseInt(contentLength, 10);

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
    },

    /**
     * Validate object key per naming rules and restrictions
     * @param {string} objectKey - object key
     * @param {string[]} prefixBlacklist - prefixes reserved for internal use
     * @return {object} - object containing true/false result and invalidPrefix
     *  if false
     */
    isValidObjectKey(objectKey, prefixBlacklist) {
        const invalidPrefix = prefixBlacklist.find(prefix =>
            objectKey.startsWith(prefix));
        if (invalidPrefix) {
            return { isValid: false, invalidPrefix };
        }
        return { isValid: true };
    },

    /**
     * Validate bucket name per naming rules and restrictions
     * @param {string} bucketname - name of the bucket to be created
     * @param {string[]} prefixBlacklist - prefixes reserved for internal use
     * @return {boolean} - returns true/false by testing
     * bucket name against validation rules
     */
    isValidBucketName(bucketname, prefixBlacklist) {
        const ipAddressRegex = new RegExp(/^(\d+\.){3}\d+$/);
        // eslint-disable-next-line no-useless-escape
        const dnsRegex = new RegExp(/^[a-z0-9]+([\.\-]{1}[a-z0-9]+)*$/);
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
        // Must be dns compatible
        return !!bucketname.match(dnsRegex);
    },

    /**
     * Parse content-md5 from meta headers
     * @param {string} headers - request headers
     * @return {string} - returns content-md5 string
     */
    parseContentMD5(headers) {
        if (headers['x-amz-meta-s3cmd-attrs']) {
            const metaHeadersArr = headers['x-amz-meta-s3cmd-attrs'].split('/');
            for (let i = 0; i < metaHeadersArr.length; i++) {
                const tmpArr = metaHeadersArr[i].split(':');
                if (tmpArr[0] === 'md5') {
                    return tmpArr[1];
                }
            }
        }
        return '';
    },

    /**
    * Report 500 to stats when an Internal Error occurs
    * @param {object} err - Arsenal error
    * @param {object} statsClient - StatsClient instance
    * @returns {undefined}
    */
    statsReport500(err, statsClient) {
        if (statsClient && err && err.code === 500) {
            statsClient.report500('s3');
        }
        return undefined;
    },
};

module.exports = routesUtils;
