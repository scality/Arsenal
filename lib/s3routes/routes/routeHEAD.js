const errors = require('../../errors');
const routesUtils = require('../routesUtils');

function routeHEAD(request, response, api, log, statsClient) {
    log.debug('routing request', { method: 'routeHEAD' });
    if (request.bucketName === undefined) {
        log.trace('head request without bucketName');
        routesUtils.responseXMLBody(errors.MethodNotAllowed,
            null, response, log);
    } else if (request.objectKey === undefined) {
        // HEAD bucket
        api.callApiMethod('bucketHead', request, response, log,
            (err, corsHeaders) => {
                routesUtils.statsReport500(err, statsClient);
                return routesUtils.responseNoBody(err, corsHeaders, response,
                    200, log);
            });
    } else {
        // HEAD object
        api.callApiMethod('objectHead', request, response, log,
            (err, resHeaders) => {
                routesUtils.statsReport500(err, statsClient);
                return routesUtils.responseContentHeaders(err, {}, resHeaders,
                    response, log);
            });
    }
}

module.exports = routeHEAD;
