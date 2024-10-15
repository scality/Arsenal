import { RequestLogger } from 'werelogs';

import * as routesUtils from '../routesUtils';
import errors from '../../errors';
import * as http from 'http';

/* eslint-disable no-param-reassign */
/* eslint-disable @typescript-eslint/no-explicit-any */
export default function routePOST(
    request: http.IncomingMessage,
    response: http.ServerResponse,
    api: { callApiMethod: routesUtils.CallApiMethod },
    log: RequestLogger,
) {
    log.debug('routing request', { method: 'routePOST' });

    const { query, bucketName, objectKey } = request as any;

    const invalidMultiObjectDelReq = query.delete !== undefined
        && bucketName === undefined;
    if (invalidMultiObjectDelReq) {
        return routesUtils.responseNoBody(errors.MethodNotAllowed, null,
            response, undefined, log);
    }

    // @ts-expect-error Property 'post' does not exist on type 'IncomingMessage'
    request.post = '';

    const invalidInitiateMpuReq = query.uploads !== undefined
        && objectKey === undefined;
    const invalidCompleteMpuReq = query.uploadId !== undefined
        && objectKey === undefined;
    if (invalidInitiateMpuReq || invalidCompleteMpuReq) {
        return routesUtils.responseNoBody(errors.InvalidURI, null,
            response, undefined, log);
    }

    // POST initiate multipart upload
    if (query.uploads !== undefined) {
        return api.callApiMethod('initiateMultipartUpload', request,
            response, log, (err, result, corsHeaders) =>
                routesUtils.responseXMLBody(err, result, response, log,
                    corsHeaders));
    }

    // POST complete multipart upload
    if (query.uploadId !== undefined) {
        return api.callApiMethod('completeMultipartUpload', request,
            response, log, (err, result, resHeaders) =>
                routesUtils.responseXMLBody(err, result, response, log,
                    resHeaders));
    }

    // POST multiObjectDelete
    if (query.delete !== undefined) {
        return api.callApiMethod('multiObjectDelete', request, response,
            log, (err, xml, corsHeaders) =>
                routesUtils.responseXMLBody(err, xml, response, log,
                    corsHeaders));
    }

    return routesUtils.responseNoBody(errors.NotImplemented, null, response,
        200, log);
}
