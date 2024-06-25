import { RequestLogger } from 'werelogs';

import * as routesUtils from '../routesUtils';
import errors from '../../errors';
import * as http from 'http';
import StatsClient from '../../metrics/StatsClient';

export default function routeOPTIONS(
    request: http.IncomingMessage,
    response: http.ServerResponse,
    api: { callApiMethod: routesUtils.CallApiMethod },
    log: RequestLogger,
    statsClient?: StatsClient,
    dataRetrievalParams?: any,
) {
    const {
        oTel: {
            tracer,
            activeSpan,
            activeTracerContext,
        }
    } = dataRetrievalParams;
    return tracer.startActiveSpan('Arsenal:: Performing corsPreflight API related operations using Cloudserver, Vault and Metadata', undefined, activeTracerContext, cloudserverApiSpan => {
        activeSpan.addEvent('Request validated, routing request using routeOPTIONS() in arsenal');
        cloudserverApiSpan.setAttributes({
            'code.lineno': 8,
            'code.filename': 'lib/s3routes/routes/routeOPTIONS.ts',
            'code.function': 'routeOPTIONS()',
        });
        activeSpan.addEvent('Detecting which API to route to using arsenal routeOPTIONS()');
        log.debug('routing request', { method: 'routeOPTION' });

        const corsMethod = request.headers['access-control-request-method'] || null;

        if (!request.headers.origin) {
            const msg = 'Insufficient information. Origin request header needed.';
            const err = errors.BadRequest.customizeDescription(msg);
            activeSpan.recordException(err);
            cloudserverApiSpan.end();
            log.debug('missing origin', { method: 'routeOPTIONS', error: err });
            return routesUtils.responseXMLBody(err, null, response, log);
        }
        if (['GET', 'PUT', 'HEAD', 'POST', 'DELETE'].indexOf(corsMethod ?? '') < 0) {
            const msg = `Invalid Access-Control-Request-Method: ${corsMethod}`;
            const err = errors.BadRequest.customizeDescription(msg);
            activeSpan.recordException(err);
            cloudserverApiSpan.end();
            log.debug('invalid Access-Control-Request-Method',
                { method: 'routeOPTIONS', error: err });
            return routesUtils.responseXMLBody(err, null, response, log);
        }
        // @ts-ignore
        activeSpan.updateName('corsPreflight API request');
        activeSpan.addEvent(`Detected corsPreflight API request`);
        activeSpan.setAttribute('rpc.method', 'corsPreflight');
        return api.callApiMethod('corsPreflight', request, response, log,
            (err, resHeaders) => {
                activeSpan.addEvent('corsPreflight API operation complete');
                cloudserverApiSpan.end();
                if (err) {
                    activeSpan.recordException(err);
                }
                routesUtils.statsReport500(err, statsClient);
                activeSpan.addEvent('Finalizing Response with Content Headers and sending response to client');
                return routesUtils.responseNoBody(err, resHeaders, response, 200,
                    log);
            }, {
                cloudserverApiSpan,
                activeSpan,
                activeTracerContext,
                tracer,
            });
    });
}
