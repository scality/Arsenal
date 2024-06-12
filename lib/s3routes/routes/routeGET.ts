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
    tracer?: any,
    parentSpanFromCloudserver?: any,
) {
    log.debug('routing request', { method: 'routerGET' });

    const { bucketName, objectKey, query } = request as any

    const call = (name: string) => {
        const action = actionMonitoringMapS3[name];
        // @ts-ignore
        parentSpanFromCloudserver.updateName(`${action} API${request.bucketName ? ` with bucket: ${request.bucketName}` : ''}`);
        parentSpanFromCloudserver.setAttribute('aws.request_id', log.getUids()[0]);
        parentSpanFromCloudserver.setAttribute('rpc.method', action);
        api.callApiMethod(name, request, response, log, (err, xml, corsHeaders) => {
            routesUtils.statsReport500(err, statsClient);
            return routesUtils.responseXMLBody(err, xml, response, log, corsHeaders);
        }, tracer);
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
            parentSpanFromCloudserver.updateName(`GetObject API with bucket: ${bucketName}`);
            parentSpanFromCloudserver.setAttribute('aws.request_id', log.getUids()[0]);
            parentSpanFromCloudserver.setAttribute('rpc.method', 'GetObject');
            api.callApiMethod('objectGet', request, response, log,
                (err, dataGetInfo, resMetaHeaders, range, apiSpan) => {
                    let contentLength = 0;
                    if (resMetaHeaders && resMetaHeaders['Content-Length']) {
                        contentLength = resMetaHeaders['Content-Length'];
                    }
                    // TODO ARSN-216 Fix logger
                    apiSpan.addEvent('Fetching data using sproxyd')
                    // @ts-ignore
                    log.end().addDefaultFields({ contentLength });
                    routesUtils.statsReport500(err, statsClient);
                    return routesUtils.responseStreamData(err, query,
                        resMetaHeaders, dataGetInfo, dataRetrievalParams, response,
                        range, log, apiSpan, tracer);
                }, tracer);
        }
    }
}
