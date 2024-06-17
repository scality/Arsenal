import { RequestLogger } from 'werelogs';

import * as routesUtils from '../routesUtils';
import errors from '../../errors';
import * as http from 'http';
import StatsClient from '../../metrics/StatsClient';
import { actionMonitoringMapS3 } from '../../policyEvaluator/utils/actionMaps';

export default function routerGET(
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
    activeSpan.addEvent('Request validated, routing request using routeGet()in arsenal')
    log.debug('routing request', { method: 'routerGET' });

    const { bucketName, objectKey, query } = request as any

    const call = (name: string) => {
        const action = actionMonitoringMapS3[name];
        // @ts-ignore
        activeSpan.updateName(`${action} API${request.bucketName ? ` with bucket: ${request.bucketName}` : ''}`);
        activeSpan.setAttribute('aws.request_id', log.getUids()[0]);
        return tracer.startActiveSpan('Cloudserver, Vault, Metadata and internal API operations', undefined, activeTracerContext, cloudserverApiSpan => {
            cloudserverApiSpan.setAttributes({
                'code.lineno': 37,
                'code.filename': 'lib/s3routes/routes/routeGET.ts',
                'code.funtion': 'routerGET()',
            })
            return api.callApiMethod(name, request, response, log, (err, xml, corsHeaders) => {
                activeSpan.addEvent('Sending response to client')
                cloudserverApiSpan.end();
                routesUtils.statsReport500(err, statsClient);
                return routesUtils.responseXMLBody(err, xml, response, log, corsHeaders);
            }, cloudserverApiSpan, activeSpan, activeTracerContext, tracer);
        });
    }

    if (bucketName === undefined && objectKey !== undefined) {
        routesUtils.responseXMLBody(errors.NoSuchBucket, null, response, log);
    } else if (bucketName === undefined && objectKey === undefined) {
        // GET service
        call('serviceGet');
    } else if (objectKey === undefined) {
        // GET bucket ACL
        if (query.acl !== undefined) {
            call('bucketGetACL');
        } else if (query.replication !== undefined) {
            call('bucketGetReplication');
        } else if (query.cors !== undefined) {
            call('bucketGetCors');
        } else if (query.versioning !== undefined) {
            call('bucketGetVersioning');
        } else if (query.website !== undefined) {
            call('bucketGetWebsite');
        } else if (query.tagging !== undefined) {
            call('bucketGetTagging');
        } else if (query.lifecycle !== undefined) {
            call('bucketGetLifecycle');
        } else if (query.uploads !== undefined) {
            // List MultipartUploads
            call('listMultipartUploads');
        } else if (query.location !== undefined) {
            call('bucketGetLocation');
        } else if (query.policy !== undefined) {
            call('bucketGetPolicy');
        } else if (query['object-lock'] !== undefined) {
            call('bucketGetObjectLock');
        } else if (query.notification !== undefined) {
            call('bucketGetNotification');
        } else if (query.encryption !== undefined) {
            call('bucketGetEncryption');
        } else {
            // GET bucket
            call('bucketGet');
        }
    } else {
        if (query.acl !== undefined) {
            // GET object ACL
            call('objectGetACL');
        } else if (query['legal-hold'] !== undefined) {
            call('objectGetLegalHold');
        } else if (query.tagging !== undefined) {
            call('objectGetTagging');
            // List parts of an open multipart upload
        } else if (query.uploadId !== undefined) {
            call('listParts');
        } else if (query.retention !== undefined) {
            call('objectGetRetention');
        } else {
            // GET object
            activeSpan.updateName(`GetObject API with bucket: ${bucketName}`);
            activeSpan.setAttribute('aws.request_id', log.getUids()[0]);
            activeSpan.setAttribute('rpc.method', 'GetObject');
            return tracer.startActiveSpan('Arsenal:: Cloudserver, Vault, Metadata and internal API operations', undefined, activeTracerContext, cloudserverApiSpan => {
                api.callApiMethod('objectGet', request, response, log,
                    (err, dataGetInfo, resMetaHeaders, range) => {
                        cloudserverApiSpan.setAttributes({
                            'code.lineno': 104,
                            'code.filename': 'lib/s3routes/routes/routeGET.ts',
                            'code.funtion': 'Arsenal:: routerGET()',
                        });
                        activeSpan.addEvent('Located Data')
                        cloudserverApiSpan.end();
                        let contentLength = 0;
                        if (resMetaHeaders && resMetaHeaders['Content-Length']) {
                            contentLength = resMetaHeaders['Content-Length'];
                        }
                        // TODO ARSN-216 Fix logger
                        // @ts-ignore
                        log.end().addDefaultFields({ contentLength });
                        routesUtils.statsReport500(err, statsClient);
                        return routesUtils.responseStreamData(err, query,
                            resMetaHeaders, dataGetInfo, dataRetrievalParams, response,
                            range, log);
                    }, cloudserverApiSpan, activeSpan, activeTracerContext, tracer);
            });
        }
    }
}
