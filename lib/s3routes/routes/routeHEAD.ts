import { RequestLogger } from 'werelogs';

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
    dataRetrievalParams?: any,
) {
    const{
        oTel: {
            tracer,
            activeSpan,
            activeTracerContext,
        }
    } = dataRetrievalParams;
    activeSpan.setAttribute('rpc.service', 'S3');
    return tracer.startActiveSpan('Arsenal:: Performing Head API related operations using Cloudserver, Vault and Metadata', undefined, activeTracerContext, cloudserverApiSpan => {
        activeSpan.addEvent('Request validated, routing request using routeHEAD() in arsenal');
        cloudserverApiSpan.setAttributes({
            'code.lineno': 8,
            'code.filename': 'lib/s3routes/routes/routeHEAD.ts',
            'code.function': 'routeHEAD()',
        });
        activeSpan.addEvent('Detecting which API to route to using arsenal routeHEAD()');
        log.debug('routing request', { method: 'routeHEAD' });
        const { bucketName, objectKey } = request as any
        if (bucketName === undefined) {
            log.trace('head request without bucketName');
            activeSpan.recordException(errors.MethodNotAllowed);
            cloudserverApiSpan.end();
            routesUtils.responseXMLBody(errors.MethodNotAllowed,
                null, response, log);
        } else if (objectKey === undefined) {
            activeSpan.updateName(`HeadBucket API${bucketName ? ` with bucket: ${bucketName}` : ''}`);
            activeSpan.addEvent(`Detected HeadBucket API request`);
            activeSpan.setAttribute('aws.request_id', log.getUids()[0]);
            activeSpan.setAttribute('rpc.method', 'HeadBucket');
            // HEAD bucket
            api.callApiMethod('bucketHead', request, response, log,
                (err, corsHeaders) => {
                    activeSpan.addEvent('HeadBucket API operation complete')
                    cloudserverApiSpan.end();
                    if (err?.code === 500) {
                        activeSpan.recordException(err);
                    }
                    routesUtils.statsReport500(err, statsClient);
                    activeSpan.addEvent('Finalizing Response with Content Headers and sending response to client');
                    return routesUtils.responseNoBody(err, corsHeaders, response,
                        200, log);
                }, {
                    cloudserverApiSpan,
                    activeSpan,
                    activeTracerContext,
                    tracer,
                });
            } else {
            // HEAD object
            activeSpan.updateName(`HeadObject API${bucketName ? ` with bucket: ${bucketName}` : ''}`);
            activeSpan.addEvent(`Detected HeadObject API request`);
            activeSpan.setAttribute('aws.request_id', log.getUids()[0]);
            activeSpan.setAttribute('rpc.method', 'HeadObject');
            api.callApiMethod('objectHead', request, response, log,
                (err, resHeaders) => {
                    activeSpan.addEvent('HeadObject API operation complete')
                    cloudserverApiSpan.end();
                    if (err?.code === 500) {
                        activeSpan.recordException(err);
                    }
                    routesUtils.statsReport500(err, statsClient);
                    activeSpan.addEvent('Finalizing Response with Content Headers and sending response to client');
                    return routesUtils.responseContentHeaders(err, {}, resHeaders,
                        response, log);
                }, {
                    cloudserverApiSpan,
                    activeSpan,
                    activeTracerContext,
                    tracer,
                });
        }
    });
}
