import * as routesUtils from '../routesUtils';
import errors from '../../errors';
import StatsClient from '../../metrics/StatsClient';
import * as http from 'http';

export default function routeHEAD(
    request: http.IncomingMessage,
    response: http.ServerResponse,
    api: { callApiMethod: routesUtils.CallApiMethod },
    log: RequestLogger,
    statsClient?: StatsClient,
) {
    log.debug('routing request', { method: 'routeHEAD' });
    const { bucketName, objectKey } = request as any
    if (bucketName === undefined) {
        log.trace('head request without bucketName');
        routesUtils.responseXMLBody(errors.MethodNotAllowed,
            null, response, log);
    } else if (objectKey === undefined) {
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
