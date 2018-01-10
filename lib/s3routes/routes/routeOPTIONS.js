const routesUtils = require('../routesUtils');

function routeOPTIONS(request, response, api, log) {
    log.info('routing request', { method: 'routeOPTIONS',
                                  headers: request.rawHeaders });
    const resHeaders = {
        'Access-Control-Allow-Methods': 'GET,PUT,POST,HEAD,DELETE',
        'Access-Control-Expose-Headers': 'x-amz-request-id',
        'Access-Control-Allow-Headers':
            'authorization,x-amz-date,x-amz-user-agent,Content-Type,' +
            'X-Amz-Content-Sha256,x-amz-acl,content-md5',
    };
    return routesUtils.responseNoBody(null, resHeaders, response, 200,
        log);
}

// const errors = require('../../errors');
// const routesUtils = require('../routesUtils');
//
// function routeOPTIONS(request, response, api, log, statsClient) {
//     log.debug('routing request', { method: 'routeOPTION' });
//
//     const corsMethod = request.headers['access-control-request-method'] || null;
//
//     if (!request.headers.origin) {
//         const msg = 'Insufficient information. Origin request header needed.';
//         const err = errors.BadRequest.customizeDescription(msg);
//         log.debug('missing origin', { method: 'routeOPTIONS', error: err });
//         return routesUtils.responseXMLBody(err, undefined, response, log);
//     }
//     if (['GET', 'PUT', 'HEAD', 'POST', 'DELETE'].indexOf(corsMethod) < 0) {
//         const msg = `Invalid Access-Control-Request-Method: ${corsMethod}`;
//         const err = errors.BadRequest.customizeDescription(msg);
//         log.debug('invalid Access-Control-Request-Method',
//             { method: 'routeOPTIONS', error: err });
//         return routesUtils.responseXMLBody(err, undefined, response, log);
//     }
//
//     return api.callApiMethod('corsPreflight', request, response, log,
//     (err, resHeaders) => {
//         routesUtils.statsReport500(err, statsClient);
//         return routesUtils.responseNoBody(err, resHeaders, response, 200,
//             log);
//     });
// }

module.exports = routeOPTIONS;
