import { RequestLogger } from 'werelogs';

import * as routesUtils from '../routesUtils';
import errors from '../../errors';
import StatsClient from '../../metrics/StatsClient';
import * as http from 'http';
import { actionMonitoringMapS3 } from '../../policyEvaluator/utils/actionMaps';

export default function routeDELETE(
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
        },
    } = dataRetrievalParams;
    return tracer.startActiveSpan('Arsenal:: Performing Delete API related operations using Cloudserver, Vault and Metadata', undefined, activeTracerContext, cloudserverApiSpan  => {
        activeSpan.addEvent('Request validated, routing request using routeDELETE() in arsenal');
        cloudserverApiSpan.setAttributes({
            'code.lineno': 8,
            'code.filename': 'lib/s3routes/routes/routeDELETE.ts',
            'code.function': 'routeDELETE()',
        })
        activeSpan.addEvent('Detecting which API to route to using arsenal routeDELETE()')
        const call = (name: string) => {
            return api.callApiMethod(name, request, response, log, (err, corsHeaders) => {
                cloudserverApiSpan.end();
                const action = actionMonitoringMapS3[name];
                activeSpan.addEvent(`${action} API operation complete`);
                if (err) {
                    activeSpan.recordException(err);
                }
                routesUtils.statsReport500(err, statsClient);
                activeSpan.addEvent('Finalizing Response with Content Headers and sending response to client');
                return routesUtils.responseNoBody(err, corsHeaders, response, 204, log);
            }, {
                cloudserverApiSpan,
                activeSpan,
                activeTracerContext,
                tracer,
            });
        }
        log.debug('routing request', { method: 'routeDELETE' });
    
        const { query, objectKey } = request as any
        if (query?.uploadId) {
            // @ts-ignore
            activeSpan.updateName(`AbortMultipartUpload API${request.bucketName ? ` with bucket: ${request.bucketName}` : ''}`);
            activeSpan.addEvent('Detected AbortMultipartUpload API request');
            activeSpan.setAttribute('rpc.method', 'AbortMultipartUpload');
            if (objectKey === undefined) {
                const message = 'A key must be specified';
                const err = errors.InvalidRequest.customizeDescription(message);
                activeSpan.recordException(err);
                cloudserverApiSpan.end();
                return routesUtils.responseNoBody(err, null, response, 200, log);
            }
            return call('multipartDelete');
        } else if (objectKey === undefined) {
            if (query?.website !== undefined) {
                // @ts-ignore
                activeSpan.updateName(`DeleteBucketWebsite API${request.bucketName ? ` with bucket: ${request.bucketName}` : ''}`);
                activeSpan.addEvent('Detected DeleteBucketWebsite API request');
                activeSpan.setAttribute('rpc.method', 'DeleteBucketWebsite');
                return call('bucketDeleteWebsite');
            } else if (query?.cors !== undefined) {
                // @ts-ignore
                activeSpan.updateName(`DeleteBucketCors API${request.bucketName ? ` with bucket: ${request.bucketName}` : ''}`);
                activeSpan.addEvent('Detected DeleteBucketCors API request');
                activeSpan.setAttribute('rpc.method', 'DeleteBucketCors');
                return call('bucketDeleteCors');
            } else if (query?.replication !== undefined) {
                // @ts-ignore
                activeSpan.updateName(`DeleteBucketReplication API${request.bucketName ? ` with bucket: ${request.bucketName}` : ''}`);
                activeSpan.addEvent('Detected DeleteBucketReplication API request');
                activeSpan.setAttribute('rpc.method', 'DeleteBucketReplication');
                return call('bucketDeleteReplication');
            } else if (query?.lifecycle !== undefined) {
                // @ts-ignore
                activeSpan.updateName(`DeleteBucketLifecycle API${request.bucketName ? ` with bucket: ${request.bucketName}` : ''}`);
                activeSpan.addEvent('Detected DeleteBucketLifecycle API request');
                activeSpan.setAttribute('rpc.method', 'DeleteBucketLifecycle');
                return call('bucketDeleteLifecycle');
            } else if (query?.policy !== undefined) {
                // @ts-ignore
                activeSpan.updateName(`DeleteBucketPolicy API${request.bucketName ? ` with bucket: ${request.bucketName}` : ''}`);
                activeSpan.addEvent('Detected DeleteBucketPolicy API request');
                activeSpan.setAttribute('rpc.method', 'DeleteBucketPolicy');
                return call('bucketDeletePolicy');
            } else if (query?.encryption !== undefined) {
                // @ts-ignore
                activeSpan.updateName(`DeleteBucketEncryption API${request.bucketName ? ` with bucket: ${request.bucketName}` : ''}`);
                activeSpan.addEvent('Detected DeleteBucketEncryption API request');
                activeSpan.setAttribute('rpc.method', 'DeleteBucketEncryption');
                return call('bucketDeleteEncryption');
            } else if (query?.tagging !== undefined) {
                // @ts-ignore
                activeSpan.updateName(`DeleteBucketTagging API${request.bucketName ? ` with bucket: ${request.bucketName}` : ''}`);
                activeSpan.addEvent('Detected DeleteBucketTagging API request');
                activeSpan.setAttribute('rpc.method', 'DeleteBucketTagging');
                return call('bucketDeleteTagging');
            }
            call('bucketDelete');
        } else {
            if (query?.tagging !== undefined) {
                // @ts-ignore
                activeSpan.updateName(`DeleteObjectTagging API${request.bucketName ? ` with bucket: ${request.bucketName}` : ''}`);
                activeSpan.addEvent('Detected DeleteObjectTagging API request');
                activeSpan.setAttribute('rpc.method', 'DeleteObjectTagging');
                return call('objectDeleteTagging');
            }
            // @ts-ignore
            activeSpan.updateName(`DeleteObject API${request.bucketName ? ` with bucket: ${request.bucketName}` : ''}`);
            activeSpan.addEvent('Detected DeleteObject API request');
            activeSpan.setAttribute('rpc.method', 'DeleteObject');
            return api.callApiMethod('objectDelete', request, response, log,
                (err, corsHeaders) => {
                    cloudserverApiSpan.end();
                    activeSpan.addEvent('DeleteObject API operation complete')
                    /*
                  * Since AWS expects a 204 regardless of the existence of
                  the object, the errors NoSuchKey and NoSuchVersion should not
                  * be sent back as a response.
                  */
                    if (err && !err.is.NoSuchKey && !err.is.NoSuchVersion) {
                        activeSpan.recordException(err);
                        cloudserverApiSpan.end();
                        return routesUtils.responseNoBody(err, corsHeaders,
                            response, undefined, log);
                    }
                    if (err?.code === 500) {
                        activeSpan.recordException(err);
                    }
                    routesUtils.statsReport500(err, statsClient);
                    activeSpan.addEvent('Finalizing Response with Content Headers and sending response to client');
                    return routesUtils.responseNoBody(null, corsHeaders, response,
                        204, log);
                }, {
                    cloudserverApiSpan,
                    activeSpan,
                    activeTracerContext,
                    tracer,
                });
        }
    });
}
