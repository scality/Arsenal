import assert from 'assert';
import * as http from 'http';
import * as werelogs from 'werelogs';
import * as constants from '../../constants';
import * as utils from './utils';
import errors, { ArsenalError } from '../../errors';
import HttpAgent from 'agentkeepalive';
import * as stream from 'stream';

function setRequestUids(reqHeaders: http.IncomingHttpHeaders, reqUids: string) {
    // inhibit 'assignment to property of function parameter' -
    // this is what we want
    // eslint-disable-next-line
    reqHeaders['X-Scal-Request-Uids'] = reqUids;
}

function setRange(
    reqHeaders: http.IncomingHttpHeaders,
    range: [number | undefined, number | undefined],
) {
    const rangeStart = range[0]?.toString() ?? '';
    const rangeEnd = range[1]?.toString() ?? '';
    // inhibit 'assignment to property of function parameter' -
    // this is what we want
    // eslint-disable-next-line
    reqHeaders['Range'] = `bytes=${rangeStart}-${rangeEnd}`;
}

function setContentType(
    reqHeaders: http.IncomingHttpHeaders,
    contentType: string,
) {
    // inhibit 'assignment to property of function parameter' -
    // this is what we want
    // eslint-disable-next-line
    reqHeaders['Content-Type'] = contentType;
}

function setContentLength(reqHeaders: http.IncomingHttpHeaders, size: number) {
    // inhibit 'assignment to property of function parameter' -
    // this is what we want
    // eslint-disable-next-line
    reqHeaders['Content-Length'] = size.toString();
}

function makeErrorFromHTTPResponse(response: http.IncomingMessage) {
    const rawBody = response.read();
    const body = (rawBody !== null ? rawBody.toString() : '');
    let error : ArsenalError | Error;
    try {
        const fields = JSON.parse(body);
        error = errors[fields.errorType]
            .customizeDescription(fields.errorMessage);
    } catch (err) {
        error = new Error(body);
    }
    // error is always a newly created object, so we can modify its
    // properties
    // @ts-expect-error
    error.remote = true;
    return error;
}


/**
 * @class
 * @classdesc REST Client interface
 *
 * The API is usable when the object is constructed.
 */
export default class RESTClient {
    host: string;
    port: number;
    httpAgent: HttpAgent;
    logging: werelogs.Logger;

    /**
     * Interface to the data file server
     * @constructor
     * @param params - Contains the basic configuration.
     * @param params.host - hostname or ip address of the
     *   RESTServer instance
     * @param params.port - port number that the RESTServer
     *   instance listens to
     * @param [params.logApi] - logging API instance object
     */
    constructor(params: {
        host: string;
        port: number;
        logApi: { Logger: typeof werelogs.Logger };
    }) {
        assert(params.host);
        assert(params.port);

        this.host = params.host;
        this.port = params.port;
        this.logging = new (params.logApi || werelogs).Logger('DataFileRESTClient');
        this.httpAgent = new HttpAgent({
            keepAlive: true,
            freeSocketTimeout: constants.httpClientFreeSocketTimeout,
        });
    }

    /** Destroy the HTTP agent, forcing a close of the remaining open connections */
    destroy() {
        this.httpAgent.destroy();
    }

    createLogger(reqUids?: string) {
        return reqUids ?
            this.logging.newRequestLoggerFromSerializedUids(reqUids) :
            this.logging.newRequestLogger();
    }

    doRequest(
        method: string,
        headers: http.OutgoingHttpHeaders | null,
        key: string | null,
        log: RequestLogger,
        responseCb: (res: http.IncomingMessage) => void,
    ) {
        const reqHeaders = headers || {};
        const urlKey = key || '';
        const reqParams = {
            hostname: this.host,
            port: this.port,
            method,
            path: `${constants.dataFileURL}/${urlKey}`,
            headers: reqHeaders,
            agent: this.httpAgent,
        };
        log.debug(`about to send ${method} request`, {
            hostname: reqParams.hostname,
            port: reqParams.port,
            path: reqParams.path,
            headers: reqParams.headers });
        const request = http.request(reqParams, responseCb);

        // disable nagle algorithm
        request.setNoDelay(true);
        return request;
    }

    /**
     * This sends a PUT request to the the REST server
     * @param stream - Request with the data to send
     * @param stream.contentHash - hash of the data to send
     * @param size - size
     * @param reqUids - The serialized request ids
     * @param callback - callback
     */
    put(
        stream: http.IncomingMessage,
        size: number,
        reqUids: string,
        callback: (error: Error | null, key?: string) => void,
    ) {
        const log = this.createLogger(reqUids);
        const headers = {};
        setRequestUids(headers, reqUids);
        setContentType(headers, 'application/octet-stream');
        setContentLength(headers, size);

        const request = this.doRequest('PUT', headers, null, log, response => {
            response.once('readable', () => {
                // expects '201 Created'
                if (response.statusCode !== 201) {
                    return callback(makeErrorFromHTTPResponse(response));
                }
                // retrieve the key from the Location response header
                // containing the complete URL to the object, like
                // /DataFile/abcdef.
                const location = response.headers.location;
                if (location === undefined) {
                    return callback(new Error(
                        'missing Location header in the response'));
                }
                const locationInfo = utils.explodePath(location);
                if (!locationInfo) {
                    return callback(new Error(
                        `bad Location response header: ${location}`));
                }
                return callback(null, locationInfo.key);
            });
        }).on('finish', () => {
            log.debug('finished sending PUT data to the REST server', {
                component: 'RESTClient',
                method: 'put',
                contentLength: size,
            });
        }).on('error', callback);

        stream.pipe(request);
        stream.on('error', err => {
            log.error('error from readable stream', {
                error: err,
                method: 'put',
                component: 'RESTClient',
            });
            request.end();
        });
    }

    /**
     * send a GET request to the REST server
     * @param key - The key associated to the value
     * @param range - range (if any) a
     *   [start, end] inclusive range specification, as defined in
     *   HTTP/1.1 RFC.
     * @param reqUids - The serialized request ids
     * @param callback - callback
     */
    get(
        key: string,
        range: [number, number] | undefined,
        reqUids: string,
        callback: (error: Error | null, stream?: stream.Readable) => void,
    ) {
        const log = this.createLogger(reqUids);
        const headers = {};
        setRequestUids(headers, reqUids);
        if (range) {
            setRange(headers, range);
        }
        const request = this.doRequest('GET', headers, key, log, response => {
            response.once('readable', () => {
                if (response.statusCode !== 200 &&
                    response.statusCode !== 206) {
                    return callback(makeErrorFromHTTPResponse(response));
                }
                return callback(null, response);
            });
        }).on('error', callback);

        request.end();
    }

    /**
     * Send a GET request to the REST server, for a specific action rather
     * than an object. Response will be truncated at the high watermark for
     * the internal buffer of the stream, which is 16KB.
     *
     * @param action - The action to query
     * @param reqUids - The serialized request ids
     * @param callback - callback
     */
    getAction(
        action: string,
        reqUids: string,
        callback: (error: Error | null, stream?: stream.Readable) => void,
    ) {
        const log = this.createLogger(reqUids);
        const headers = {};
        setRequestUids(headers, reqUids);
        const reqParams = {
            hostname: this.host,
            port: this.port,
            method: 'GET',
            path: `${constants.dataFileURL}?${action}`,
            headers,
            agent: this.httpAgent,
        };
        log.debug('about to send GET request', {
            hostname: reqParams.hostname,
            port: reqParams.port,
            path: reqParams.path,
            headers: reqParams.headers });

        const request = http.request(reqParams, response => {
            response.once('readable', () => {
                if (response.statusCode !== 200 &&
                    response.statusCode !== 206) {
                    return callback(makeErrorFromHTTPResponse(response));
                }
                return callback(null, response.read().toString());
            });
        }).on('error', callback);

        request.end();
    }

    /**
     * send a DELETE request to the REST server
     * @param key - The key associated to the values
     * @param reqUids - The serialized request ids
     * @param callback - callback
     */
    delete(
        key: string,
        reqUids: string,
        callback: (error: Error | null) => void,
    ) {
        const log = this.createLogger(reqUids);
        const headers = {};
        setRequestUids(headers, reqUids);

        const request = this.doRequest(
            'DELETE', headers, key, log, response => {
                response.once('readable', () => {
                    if (response.statusCode !== 200 &&
                        response.statusCode !== 204) {
                        return callback(makeErrorFromHTTPResponse(response));
                    }
                    return callback(null);
                });
            }).on('error', callback);
        request.end();
    }
}
