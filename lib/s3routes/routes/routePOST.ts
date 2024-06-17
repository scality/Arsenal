import { RequestLogger } from 'werelogs';

import * as routesUtils from '../routesUtils';
import errors from '../../errors';
import * as http from 'http';
import StatsClient from '../../metrics/StatsClient';

/* eslint-disable no-param-reassign */
export default function routePOST(
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
    activeSpan.setAttribute('rpc.service', 'S3');
    return tracer.startActiveSpan('Arsenal:: Performing Post API related operations using Cloudserver, Vault and Metadata', undefined, activeTracerContext, cloudserverApiSpan => {
        activeSpan.addEvent('Request validated, routing request using routePOST() in arsenal');
        cloudserverApiSpan.setAttributes({
            'code.lineno': 9,
            'code.filename': 'lib/s3routes/routes/routePOST.ts',
            'code.function': 'routePOST()',
        });
        activeSpan.addEvent('Detecting which API to route to using arsenal routePOST()');
        log.debug('routing request', { method: 'routePOST' });

        const { query, bucketName, objectKey } = request as any

        const invalidMultiObjectDelReq = query.delete !== undefined
            && bucketName === undefined;
        if (invalidMultiObjectDelReq) {
            activeSpan.recordException(errors.MethodNotAllowed);
            cloudserverApiSpan.end();
            return routesUtils.responseNoBody(errors.MethodNotAllowed, null,
                response, undefined, log);
        }

        // @ts-ignore
        request.post = '';

        const invalidInitiateMpuReq = query.uploads !== undefined
            && objectKey === undefined;
        const invalidCompleteMpuReq = query.uploadId !== undefined
            && objectKey === undefined;
        if (invalidInitiateMpuReq || invalidCompleteMpuReq) {
            activeSpan.recordException(errors.InvalidURI);
            cloudserverApiSpan.end();
            return routesUtils.responseNoBody(errors.InvalidURI, null,
                response, undefined, log);
        }

        // POST initiate multipart upload
        if (query.uploads !== undefined) {
            activeSpan.updateName(`CreateMultipartUpload API${bucketName ? ` with bucket: ${bucketName}` : ''}`);
            activeSpan.addEvent(`Detected CreateMultipartUpload API request`);
            activeSpan.setAttribute('aws.request_id', log.getUids()[0]);
            activeSpan.setAttribute('rpc.method', 'CreateMultipartUpload');
            return api.callApiMethod('initiateMultipartUpload', request,
                response, log, (err, result, corsHeaders) => {
                    cloudserverApiSpan.end();
                    activeSpan.addEvent('CreateMultipartUpload API operation complete');
                    activeSpan.addEvent('Finalizing Response with Content Headers and sending response to client');
                    routesUtils.responseXMLBody(err, result, response, log,
                        corsHeaders)
            }, {
                cloudserverApiSpan,
                activeSpan,
                activeTracerContext,
                tracer,
            });
        }

        // POST complete multipart upload
        if (query.uploadId !== undefined) {
            activeSpan.updateName(`CompleteMultipartUpload API${bucketName ? ` with bucket: ${bucketName}` : ''}`);
            activeSpan.addEvent(`Detected CompleteMultipartUpload API request`);
            activeSpan.setAttribute('aws.request_id', log.getUids()[0]);
            activeSpan.setAttribute('rpc.method', 'CompleteMultipartUpload');
            return api.callApiMethod('completeMultipartUpload', request,
                response, log, (err, result, resHeaders) => {
                    cloudserverApiSpan.end();
                    activeSpan.addEvent('CompleteMultipartUpload API operation complete');
                    activeSpan.addEvent('Finalizing Response with Content Headers and sending response to client');
                    routesUtils.responseXMLBody(err, result, response, log,
                        resHeaders)
            }, {
                cloudserverApiSpan,
                activeSpan,
                activeTracerContext,
                tracer,
            });
        }

        // POST multiObjectDelete
        if (query.delete !== undefined) {
            activeSpan.updateName(`AbortMultipartUpload API${bucketName ? ` with bucket: ${bucketName}` : ''}`);
            activeSpan.addEvent(`Detected AbortMultipartUpload API request`);
            activeSpan.setAttribute('aws.request_id', log.getUids()[0]);
            activeSpan.setAttribute('rpc.method', 'AbortMultipartUpload');
            return api.callApiMethod('multiObjectDelete', request, response,
                log, (err, xml, corsHeaders) => {
                    cloudserverApiSpan.end();
                    activeSpan.addEvent('AbortMultipartUpload API operation complete');
                    activeSpan.addEvent('Finalizing Response with Content Headers and sending response to client');
                    routesUtils.responseXMLBody(err, xml, response, log,
                        corsHeaders)
            }, {
                cloudserverApiSpan,
                activeSpan,
                activeTracerContext,
                tracer,
            });
        }
        activeSpan.recordException(errors.NotImplemented);
        cloudserverApiSpan.end();
        activeSpan.addEvent('Finalizing Response with Content Headers and sending response to client');
        return routesUtils.responseNoBody(errors.NotImplemented, null, response,
            200, log);
    });
    
}
