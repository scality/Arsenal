import * as routesUtils from '../routesUtils';
import errors from '../../errors';
import StatsClient from '../../metrics/StatsClient';
import * as http from 'http';

export default function routeDELETE(
    request: http.IncomingMessage,
    response: http.ServerResponse,
    api: { callApiMethod: routesUtils.CallApiMethod },
    log: RequestLogger,
    statsClient?: StatsClient,
) {
    const call = (name: string) => {
        return api.callApiMethod(name, request, response, log, (err, corsHeaders) => {
            routesUtils.statsReport500(err, statsClient);
            return routesUtils.responseNoBody(err, corsHeaders, response, 204, log);
        });
    }
    log.debug('routing request', { method: 'routeDELETE' });

    const { query, objectKey } = request as any
    if (query?.uploadId) {
        if (objectKey === undefined) {
            const message = 'A key must be specified';
            const err = errors.InvalidRequest.customizeDescription(message);
            return routesUtils.responseNoBody(err, null, response, 200, log);
        }
        return call('multipartDelete');
    } else if (objectKey === undefined) {
        if (query?.website !== undefined) {
            return call('bucketDeleteWebsite');
        } else if (query?.cors !== undefined) {
            return call('bucketDeleteCors');
        } else if (query?.replication !== undefined) {
            return call('bucketDeleteReplication');
        } else if (query?.lifecycle !== undefined) {
            return call('bucketDeleteLifecycle');
        } else if (query?.policy !== undefined) {
            return call('bucketDeletePolicy');
        } else if (query?.encryption !== undefined) {
            return call('bucketDeleteEncryption');
        } else if (query?.tagging !== undefined) {
            return call('bucketDeleteTagging');
        }
        call('bucketDelete');
    } else {
        if (query?.tagging !== undefined) {
            return call('objectDeleteTagging');
        }
        api.callApiMethod('objectDelete', request, response, log,
            (err, corsHeaders) => {
                /*
              * Since AWS expects a 204 regardless of the existence of
              the object, the errors NoSuchKey and NoSuchVersion should not
              * be sent back as a response.
              */
                if (err && !err.is.NoSuchKey && !err.is.NoSuchVersion) {
                    return routesUtils.responseNoBody(err, corsHeaders,
                        response, undefined, log);
                }
                routesUtils.statsReport500(err, statsClient);
                return routesUtils.responseNoBody(null, corsHeaders, response,
                    204, log);
            });
    }
}
