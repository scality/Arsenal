import type { RequestLogger } from 'werelogs';

import * as routesUtils from '../routesUtils';
import errors, { errorInstances } from '../../errors';
import * as http from 'http';
import StatsClient from '../../metrics/StatsClient';
import { type ArsenalRequest } from '../../types/ArsenalRequest';

const noBodyCalls: Record<string, { apiMethod: string; httpCode: number }> = {
    PUT: { apiMethod: 'notificationDestinationCreate', httpCode: 200 },
    POST: { apiMethod: 'notificationDestinationUpdate', httpCode: 200 },
    DELETE: { apiMethod: 'notificationDestinationDelete', httpCode: 204 },
};

/**
 * Routes a bucket notification destination request: a request at the service
 * root with the notification-destination query, where the name query parameter
 * addresses the destination. routes() calls it only when its caller sets
 * params.notificationDestinationRoutes, so a caller that does not opt in keeps
 * today's routing.
 *
 * A request that also names a bucket or a key gets MethodNotAllowed: the
 * bucket and object routes ignore a query they do not know, so such a request
 * would otherwise reach a call like bucketDelete. Whether a bucket-style host
 * name may carry these calls is still an open decision, and rejecting them now
 * leaves room to accept them later without breaking a client.
 *
 * A missing or empty name gets InvalidArgument before authorization, except
 * for a GET with no name, which lists the destinations. The name is the address
 * of the destination, as the bucket is the address of a path, so no call but
 * the list is authorized on the wildcard resource built when no name is given.
 * The name grammar is checked by the API handler: a literal '*' name builds the
 * same resource, but grants nothing that a policy on every destination of the
 * account does not already grant.
 */
export default function routeNotificationDestination(
    request: ArsenalRequest,
    response: http.ServerResponse,
    api: { callApiMethod: routesUtils.CallApiMethod },
    log: RequestLogger,
    statsClient?: StatsClient,
) {
    log.debug('routing request', { method: 'routeNotificationDestination' });

    const { bucketName, objectKey, query, method } = request;
    if (bucketName !== undefined || objectKey !== undefined) {
        return routesUtils.responseXMLBody(errors.MethodNotAllowed, null, response, log);
    }
    const noBodyCall = noBodyCalls[method];
    if (method !== 'GET' && noBodyCall === undefined) {
        return routesUtils.responseXMLBody(errors.MethodNotAllowed, null, response, log);
    }

    const name: unknown = query.name;
    if (method === 'GET' && name === undefined) {
        return api.callApiMethod('notificationDestinationList', request, response, log, (err, xml, corsHeaders) => {
            routesUtils.statsReport500(err, statsClient);
            return routesUtils.responseXMLBody(err, xml, response, log, corsHeaders);
        });
    }
    if (typeof name !== 'string' || name === '') {
        const err = errorInstances.InvalidArgument.customizeDescription(
            'A bucket notification destination name must be specified.',
        );
        return routesUtils.responseXMLBody(err, null, response, log);
    }

    if (method === 'GET') {
        return api.callApiMethod('notificationDestinationGet', request, response, log, (err, xml, corsHeaders) => {
            routesUtils.statsReport500(err, statsClient);
            return routesUtils.responseXMLBody(err, xml, response, log, corsHeaders);
        });
    }
    return api.callApiMethod(noBodyCall.apiMethod, request, response, log, (err, corsHeaders) => {
        routesUtils.statsReport500(err, statsClient);
        return routesUtils.responseNoBody(err, corsHeaders, response, noBodyCall.httpCode, log);
    });
}
