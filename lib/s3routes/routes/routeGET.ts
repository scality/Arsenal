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
    const {
        oTel: {
            tracer,
            activeSpan,
            activeTracerContext,
        }
    } = dataRetrievalParams;
    activeSpan.setAttribute('rpc.service', 'S3');
    return tracer.startActiveSpan('Arsenal:: Performing Get API related operations using Cloudserver, Vault and Metadata', undefined, activeTracerContext, cloudserverApiSpan => {
        activeSpan.addEvent('Request validated, routing request using routeGET() in arsenal');
        cloudserverApiSpan.setAttributes({
            'code.lineno': 9,
            'code.filename': 'lib/s3routes/routes/routeGET.ts',
            'code.function': 'routerGET()',
        })
        activeSpan.addEvent('Detecting which API to route to using arsenal routeGET()')
        log.debug('routing request', { method: 'routerGET' });

        const { bucketName, objectKey, query } = request as any

        const call = (name: string) => {
            const action = actionMonitoringMapS3[name];
            // @ts-ignore
            activeSpan.updateName(`${action} API${bucketName ? ` with bucket: ${bucketName}` : ''}`);
            activeSpan.addEvent(`Detected ${action} API request`);
            activeSpan.setAttribute('aws.request_id', log.getUids()[0]);
            activeSpan.setAttribute('rpc.method', action);
            return api.callApiMethod(name, request, response, log, (err, xml, corsHeaders) => {
                cloudserverApiSpan.end();
                activeSpan.addEvent(`${action} API operation complete`);
                if (err) {
                    activeSpan.recordException(err);
                }
                routesUtils.statsReport500(err, statsClient);
                activeSpan.addEvent('Finalizing Response with Content Headers and sending response to client');
                return routesUtils.responseXMLBody(err, xml, response, log, corsHeaders);
            }, {
                cloudserverApiSpan,
                activeSpan,
                activeTracerContext,
                tracer,
            });
        }

        if (bucketName === undefined && objectKey !== undefined) {
            activeSpan.recordException(errors.NoSuchBucket);
            cloudserverApiSpan.end();
            return routesUtils.responseXMLBody(errors.NoSuchBucket, null, response, log);
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
                activeSpan.addEvent('Detected GetObject API request');
                activeSpan.setAttribute('aws.request_id', log.getUids()[0]);
                activeSpan.setAttribute('rpc.method', 'GetObject');
                return api.callApiMethod('objectGet', request, response, log,
                    (err, dataGetInfo, resMetaHeaders, range) => {
                        cloudserverApiSpan.end();
                        activeSpan.addEvent('Located Data')
                        let contentLength = 0;
                        if (resMetaHeaders && resMetaHeaders['Content-Length']) {
                            contentLength = resMetaHeaders['Content-Length'];
                        }
                        // TODO ARSN-216 Fix logger
                        // @ts-ignore
                        log.end().addDefaultFields({ contentLength });
                        if (err?.code === 500) {
                            activeSpan.recordException(err);
                        }
                        routesUtils.statsReport500(err, statsClient);
                        return routesUtils.responseStreamData(err, query,
                            resMetaHeaders, dataGetInfo, dataRetrievalParams, response,
                            range, log);
                    }, {
                        cloudserverApiSpan,
                        activeSpan,
                        activeTracerContext,
                        tracer,
                    });
            }
        }
    });
}
