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

function checkUnsupportedRoutes(reqMethod, reqQuery, unsupportedQueries, log) {
    const method = routeMap[reqMethod];
    if (!method) {
        return { error: errors.MethodNotAllowed };
    }

    if (routesUtils.isUnsupportedQuery(reqQuery, unsupportedQueries)) {
        log.debug('encountered unsupported query');
        return { error: errors.NotImplemented };
    }

    return { method };
}

function checkBucketAndKey(bucketName, objectKey, method, reqQuery,
    isValidBucketName, log) {
    // if empty name and request not a list Buckets
    if (!bucketName && !(method === 'GET' && !objectKey)) {
        console.log('bucketName:', bucketName);
        console.log('method:', method)
        console.log('objectKey:', objectKey)
        log.debug('empty bucket name', { method: 'routes' });
        return (method !== 'OPTIONS') ?
            errors.MethodNotAllowed : errors.AccessForbidden
               .customizeDescription('CORSResponse: Bucket not found');
    }
    if (bucketName !== undefined &&
        isValidBucketName(bucketName) === false) {
        log.debug('invalid bucket name', { bucketName });
        return errors.InvalidBucketName;
    }
    if ((reqQuery.partNumber || reqQuery.uploadId)
        && objectKey === undefined) {
        return errors.InvalidRequest
            .customizeDescription('A key must be specified');
    }
    return undefined;
}

function routes(req, res, params, logger) {
    const {
        api,
        healthcheckHandler,
        statsClient,
        allEndpoints,
        websiteEndpoints,
        isValidBucketName,
        unsupportedQueries,
        // eslint-disable-next-line
        dataRetrievalFn,
    } = params;

    const clientInfo = {
        clientIP: req.socket.remoteAddress,
        clientPort: req.socket.remotePort,
        httpMethod: req.method,
        httpURL: req.url,
        endpoint: req.endpoint,
    };

    const log = logger.newRequestLogger();
    log.info('received request', clientInfo);

    log.end().addDefaultFields(clientInfo);

    if (req.url === '/_/healthcheck') {
        return healthcheckHandler(clientInfo.clientIP, false, req, res, log,
            statsClient);
    } else if (req.url === '/_/healthcheck/deep') {
        return healthcheckHandler(clientInfo.clientIP, true, req, res, log);
    }
    if (statsClient) {
        // report new request for stats
        statsClient.reportNewRequest();
    }

    try {
        const validHosts = allEndpoints.concat(websiteEndpoints);
        routesUtils.normalizeRequest(req, validHosts);
    } catch (err) {
        console.log('err normalizing request', err);
        log.trace('could not normalize request', { error: err.stack });
        return routesUtils.responseXMLBody(
            errors.InvalidURI, undefined, res, log);
    }

    log.addDefaultFields({
        bucketName: req.bucketName,
        objectKey: req.objectKey,
        bytesReceived: req.parsedContentLength || 0,
        bodyLength: parseInt(req.headers['content-length'], 10) || 0,
    });

    const reqMethod = req.method.toUpperCase();

    const { error, method } = checkUnsupportedRoutes(reqMethod, req.query,
        unsupportedQueries, statsClient, log);

    if (error) {
        log.trace('error validating route or uri params', { error });
        return routesUtils.responseXMLBody(error, null, res, log);
    }

    const bucketOrKeyError = checkBucketAndKey(req.bucketName, req.objectKey,
        reqMethod, req.query, isValidBucketName, log);

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
