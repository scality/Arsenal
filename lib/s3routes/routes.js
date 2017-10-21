const assert = require('assert');

const errors = require('../errors');
const routeGET = require('./routes/routeGET');
const routePUT = require('./routes/routePUT');
const routeDELETE = require('./routes/routeDELETE');
const routeHEAD = require('./routes/routeHEAD');
const routePOST = require('./routes/routePOST');
const routeOPTIONS = require('./routes/routeOPTIONS');
const routesUtils = require('./routesUtils');
const routeWebsite = require('./routes/routeWebsite');

const routeMap = {
    GET: routeGET,
    PUT: routePUT,
    POST: routePOST,
    DELETE: routeDELETE,
    HEAD: routeHEAD,
    OPTIONS: routeOPTIONS,
};

function isValidReqUids(reqUids) {
    // baseline check, to avoid the risk of running into issues if
    // users craft a large x-scal-request-uids header
    return reqUids.length < 128;
}

function checkUnsupportedRoutes(reqMethod) {
    const method = routeMap[reqMethod];
    if (!method) {
        return { error: errors.MethodNotAllowed };
    }
    return { method };
}

function checkBucketAndKey(bucketName, objectKey, method, reqQuery,
    blacklistedPrefixes, log) {
    // bucketName should also be undefined, but is checked below anyway
    const getServiceCall = (method === 'GET' && !objectKey);
    // if empty name and request not a list Buckets or preflight request
    if (!bucketName && !(getServiceCall || method === 'OPTIONS')) {
        log.debug('empty bucket name', { method: 'routes' });
        return errors.MethodNotAllowed;
    }
    if (bucketName !== undefined && routesUtils.isValidBucketName(bucketName,
        blacklistedPrefixes.bucket) === false) {
        log.debug('invalid bucket name', { bucketName });
        return errors.InvalidBucketName;
    }
    if (objectKey !== undefined) {
        const result = routesUtils.isValidObjectKey(objectKey,
            blacklistedPrefixes.object);
        if (!result.isValid) {
            log.debug('invalid object key', { objectKey });
            return errors.InvalidArgument.customizeDescription('Object key ' +
            `must not start with "${result.invalidPrefix}".`);
        }
    }
    if ((reqQuery.partNumber || reqQuery.uploadId)
        && objectKey === undefined) {
        return errors.InvalidRequest
            .customizeDescription('A key must be specified');
    }
    return undefined;
}

function checkTypes(req, res, params, logger) {
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
    assert.strictEqual(typeof params.dataRetrievalFn, 'function',
        'bad routes param: dataRetrievalFn must be a defined function');
}

/** routes - route request to appropriate method
 * @param {Http.Request} req - http request object
 * @param {Http.ServerResponse} res - http response sent to the client
 * @param {object} params - additional routing parameters
 * @param {object} params.api - all api methods and method to call an api method
 *  i.e. api.callApiMethod(methodName, request, response, log, callback)
 * @param {function} params.internalHandlers - internal handlers API object
 *  for queries beginning with '/_/'
 * @param {StatsClient} [params.statsClient] - client to report stats to Redis
 * @param {string[]} params.allEndpoints - all accepted REST endpoints
 * @param {string[]} params.websiteEndpoints - all accepted website endpoints
 * @param {object} params.blacklistedPrefixes - blacklisted prefixes
 * @param {string[]} params.blacklistedPrefixes.bucket - bucket prefixes
 * @param {string[]} params.blacklistedPrefixes.object - object prefixes
 * @param {object} params.unsupportedQueries - object containing true/false
 *  values for whether queries are supported
 * @param {function} params.dataRetrievalFn - function to retrieve data
 * @param {RequestLogger} logger - werelogs logger instance
 * @returns {undefined}
 */
function routes(req, res, params, logger) {
    checkTypes(req, res, params, logger);

    const {
        api,
        internalHandlers,
        statsClient,
        allEndpoints,
        websiteEndpoints,
        blacklistedPrefixes,
        dataRetrievalFn,
    } = params;

    const clientInfo = {
        clientIP: req.socket.remoteAddress,
        clientPort: req.socket.remotePort,
        httpMethod: req.method,
        httpURL: req.url,
        endpoint: req.endpoint,
    };

    let reqUids = req.headers['x-scal-request-uids'];
    if (reqUids !== undefined && !isValidReqUids(reqUids)) {
        // simply ignore invalid id (any user can provide an
        // invalid request ID through a crafted header)
        reqUids = undefined;
    }
    const log = (reqUids !== undefined ?
                 logger.newRequestLoggerFromSerializedUids(reqUids) :
                 logger.newRequestLogger());

    if (!req.url.startsWith('/_/healthcheck')) {
        log.info('received request', clientInfo);
    }

    log.end().addDefaultFields(clientInfo);

    if (req.url.startsWith('/_/')) {
        let internalServiceName = req.url.slice(3);
        const serviceDelim = internalServiceName.indexOf('/');
        if (serviceDelim !== -1) {
            internalServiceName = internalServiceName.slice(0, serviceDelim);
        }
        if (internalHandlers[internalServiceName] === undefined) {
            return routesUtils.responseXMLBody(
                errors.InvalidURI, undefined, res, log);
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
    } catch (err) {
        log.debug('could not normalize request', { error: err.stack });
        return routesUtils.responseXMLBody(
            errors.InvalidURI.customizeDescription('Could not parse the ' +
                'specified URI. Check your restEndpoints configuration.'),
                undefined, res, log);
    }

    log.addDefaultFields({
        bucketName: req.bucketName,
        objectKey: req.objectKey,
        bytesReceived: req.parsedContentLength || 0,
        bodyLength: parseInt(req.headers['content-length'], 10) || 0,
    });

    const { error, method } = checkUnsupportedRoutes(req.method, req.query);

    if (error) {
        log.trace('error validating route or uri params', { error });
        return routesUtils.responseXMLBody(error, null, res, log);
    }

    const bucketOrKeyError = checkBucketAndKey(req.bucketName, req.objectKey,
        req.method, req.query, blacklistedPrefixes, log);

    if (bucketOrKeyError) {
        log.trace('error with bucket or key value',
        { error: bucketOrKeyError });
        return routesUtils.responseXMLBody(bucketOrKeyError, null, res, log);
    }

    // bucket website request
    if (websiteEndpoints && websiteEndpoints.indexOf(req.parsedHost) > -1) {
        return routeWebsite(req, res, api, log, statsClient, dataRetrievalFn);
    }

    return method(req, res, api, log, statsClient, dataRetrievalFn);
}

module.exports = routes;
