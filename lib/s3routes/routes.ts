import assert from 'assert';
import errors from '../errors';
import routeGET from './routes/routeGET';
import routePUT from './routes/routePUT';
import routeDELETE from './routes/routeDELETE';
import routeHEAD from './routes/routeHEAD';
import routePOST from './routes/routePOST';
import routeOPTIONS from './routes/routeOPTIONS';
import * as routesUtils from './routesUtils';
import routeWebsite from './routes/routeWebsite';
import * as http from 'http';
import StatsClient from '../metrics/StatsClient';
import { objectKeyByteLimit } from '../constants';
import * as requestUtils from '../../lib/policyEvaluator/requestUtils';

const routeMap = {
    GET: routeGET,
    PUT: routePUT,
    POST: routePOST,
    DELETE: routeDELETE,
    HEAD: routeHEAD,
    OPTIONS: routeOPTIONS,
};

function isValidReqUids(reqUids: string | string[]) {
    // baseline check, to avoid the risk of running into issues if
    // users craft a large x-scal-request-uids header
    return reqUids.length < 128;
}

function checkUnsupportedRoutes(reqMethod: keyof typeof routeMap) {
    const method = routeMap[reqMethod];
    if (!method) {
        return { error: errors.MethodNotAllowed };
    }
    return { method };
}

function checkBucketAndKey(
    bucketName: string,
    objectKey: string,
    method: keyof typeof routeMap,
    reqQuery: any,
    blacklistedPrefixes: any,
    log: RequestLogger,
) {
    // if empty name and request not a List Buckets
    if (!bucketName && !(method === 'GET' && !objectKey)) {
        log.debug('empty bucket name', { method: 'routes' });
        return (method !== 'OPTIONS') ?
            errors.MethodNotAllowed : errors.AccessForbidden
                .customizeDescription('CORSResponse: Bucket not found');
    }
    if (bucketName !== undefined && routesUtils.isValidBucketName(bucketName,
        blacklistedPrefixes.bucket) === false) {
        log.debug('invalid bucket name', { bucketName });
        if (method === 'DELETE') {
            return errors.NoSuchBucket;
        }
        return errors.InvalidBucketName;
    }
    if (objectKey !== undefined) {
        const result = routesUtils.isValidObjectKey(objectKey,
            blacklistedPrefixes.object);
        if (!result.isValid) {
            log.debug('invalid object key', { objectKey });
            if (result.invalidPrefix) {
                return errors.InvalidArgument.customizeDescription('Invalid ' +
                    'prefix - object key cannot start with ' +
                    `"${result.invalidPrefix}".`);
            }
            return errors.KeyTooLong.customizeDescription('Object key is too ' +
                'long. Maximum number of bytes allowed in keys is ' +
                `${objectKeyByteLimit}.`);
        }
    }
    if ((reqQuery.partNumber || reqQuery.uploadId)
        && objectKey === undefined) {
        return errors.InvalidRequest
            .customizeDescription('A key must be specified');
    }
    return undefined;
}

// TODO: ARSN-59 remove assertions or restrict it to dev environment only.
function checkTypes(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    params: Params,
    logger: RequestLogger,
    s3config?: any,
) {
    assert.strictEqual(typeof req, 'object',
        'bad routes param: req must be an object');
    assert.strictEqual(typeof res, 'object',
        'bad routes param: res must be an object');
    assert.strictEqual(typeof logger, 'object',
        'bad routes param: logger must be an object');
    assert.strictEqual(typeof params.api, 'object',
        'bad routes param: api must be an object');
    assert.strictEqual(typeof params.api.callApiMethod, 'function',
        'bad routes param: api.callApiMethod must be a defined function');
    assert.strictEqual(typeof params.internalHandlers, 'object',
        'bad routes param: internalHandlers must be an object');
    if (params.statsClient) {
        assert.strictEqual(typeof params.statsClient, 'object',
            'bad routes param: statsClient must be an object');
    }
    assert(Array.isArray(params.allEndpoints),
        'bad routes param: allEndpoints must be an array');
    assert(params.allEndpoints.length > 0,
        'bad routes param: allEndpoints must have at least one endpoint');
    params.allEndpoints.forEach(endpoint => {
        assert.strictEqual(typeof endpoint, 'string',
            'bad routes param: each item in allEndpoints must be a string');
    });
    assert(Array.isArray(params.websiteEndpoints),
        'bad routes param: allEndpoints must be an array');
    params.websiteEndpoints.forEach(endpoint => {
        assert.strictEqual(typeof endpoint, 'string',
            'bad routes param: each item in websiteEndpoints must be a string');
    });
    assert.strictEqual(typeof params.blacklistedPrefixes, 'object',
        'bad routes param: blacklistedPrefixes must be an object');
    assert(Array.isArray(params.blacklistedPrefixes.bucket),
        'bad routes param: blacklistedPrefixes.bucket must be an array');
    params.blacklistedPrefixes.bucket.forEach(pre => {
        assert.strictEqual(typeof pre, 'string',
            'bad routes param: each blacklisted bucket prefix must be a string');
    });
    assert(Array.isArray(params.blacklistedPrefixes.object),
        'bad routes param: blacklistedPrefixes.object must be an array');
    params.blacklistedPrefixes.object.forEach(pre => {
        assert.strictEqual(typeof pre, 'string',
            'bad routes param: each blacklisted object prefix must be a string');
    });
    assert.strictEqual(typeof params.dataRetrievalParams, 'object',
        'bad routes param: dataRetrievalParams must be a defined object');
    if (s3config) {
        assert.strictEqual(typeof s3config, 'object', 'bad routes param: s3config must be an object');
    }
}

export type Params = {
    allEndpoints: string[];
    statsClient?: StatsClient;
    internalHandlers: any;
    websiteEndpoints: string[];
    dataRetrievalParams: any;
    blacklistedPrefixes: {
        bucket: string[];
        object: string[];
    };
    unsupportedQueries: any;
    api: { callApiMethod: routesUtils.CallApiMethod };
}

/** routes - route request to appropriate method
 * @param req - http request object
 * @param res - http response sent to the client
 * @param params - additional routing parameters
 * @param params.api - all api methods and method to call an api method
 *  i.e. api.callApiMethod(methodName, request, response, log, callback)
 * @param params.internalHandlers - internal handlers API object
 *  for queries beginning with '/_/'
 * @param [params.statsClient] - client to report stats to Redis
 * @param params.allEndpoints - all accepted REST endpoints
 * @param params.websiteEndpoints - all accepted website endpoints
 * @param params.blacklistedPrefixes - blacklisted prefixes
 * @param params.blacklistedPrefixes.bucket - bucket prefixes
 * @param params.blacklistedPrefixes.object - object prefixes
 * @param params.unsupportedQueries - object containing true/false
 *  values for whether queries are supported
 * @param params.dataRetrievalParams - params to create instance of
 * data retrieval function
 * @param logger - werelogs logger instance
 * @param [s3config] - s3 configuration
 */
export default function routes(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    params: Params,
    logger: RequestLogger,
    s3config?: any,
) {
    checkTypes(req, res, params, logger);

    const {
        api,
        internalHandlers,
        statsClient,
        allEndpoints,
        websiteEndpoints,
        blacklistedPrefixes,
        dataRetrievalParams,
    } = params;

    const clientInfo = {
        clientIP: requestUtils.getClientIp(req, s3config),
        clientPort: req.socket.remotePort,
        httpMethod: req.method,
        httpURL: req.url,
        // @ts-ignore
        endpoint: req.endpoint,
    };

    let reqUids = req.headers['x-scal-request-uids'];
    if (reqUids !== undefined && !isValidReqUids(reqUids)) {
        // simply ignore invalid id (any user can provide an
        // invalid request ID through a crafted header)
        reqUids = undefined;
    }
    const log = (reqUids !== undefined ?
        // @ts-ignore
        logger.newRequestLoggerFromSerializedUids(reqUids) :
        // @ts-ignore
        logger.newRequestLogger());

    if (!req.url!.startsWith('/_/healthcheck') &&
        !req.url!.startsWith('/_/report')) {
        log.info('received request', clientInfo);
    }

    log.end().addDefaultFields(clientInfo);

    if (req.url!.startsWith('/_/')) {
        let internalServiceName = req.url!.slice(3);
        const serviceDelim = internalServiceName.indexOf('/');
        if (serviceDelim !== -1) {
            internalServiceName = internalServiceName.slice(0, serviceDelim);
        }
        if (internalHandlers[internalServiceName] === undefined) {
            return routesUtils.responseXMLBody(
                errors.InvalidURI, null, res, log);
        }
        return internalHandlers[internalServiceName](
            clientInfo.clientIP, req, res, log, statsClient);
    }

    if (statsClient) {
        // report new request for stats
        statsClient.reportNewRequest('s3');
    }

    try {
        const validHosts = allEndpoints.concat(websiteEndpoints);
        routesUtils.normalizeRequest(req, validHosts);
    } catch (err: any) {
        log.debug('could not normalize request', { error: err.stack });
        return routesUtils.responseXMLBody(
            errors.InvalidURI.customizeDescription('Could not parse the ' +
                'specified URI. Check your restEndpoints configuration.'),
            null, res, log);
    }

    log.addDefaultFields({
        // @ts-ignore
        bucketName: req.bucketName,
        // @ts-ignore
        objectKey: req.objectKey,
        // @ts-ignore
        bytesReceived: req.parsedContentLength || 0,
        // @ts-ignore
        bodyLength: parseInt(req.headers['content-length'], 10) || 0,
    });

    // @ts-ignore
    const { error, method } = checkUnsupportedRoutes(req.method, req.query);

    if (error) {
        log.trace('error validating route or uri params', { error });
        // @ts-ignore
        return routesUtils.responseXMLBody(error, '', res, log);
    }

    // @ts-ignore
    const bucketOrKeyError = checkBucketAndKey(req.bucketName, req.objectKey,
        // @ts-ignore
        req.method, req.query, blacklistedPrefixes, log);

    if (bucketOrKeyError) {
        log.trace('error with bucket or key value',
            { error: bucketOrKeyError });
        return routesUtils.responseXMLBody(bucketOrKeyError, null, res, log);
    }

    // bucket website request
    // @ts-ignore
    if (websiteEndpoints && websiteEndpoints.indexOf(req.parsedHost) > -1) {
        return routeWebsite(req, res, api, log, statsClient, dataRetrievalParams);
    }

    return method(req, res, api, log, statsClient, dataRetrievalParams);
}
