import * as routesUtils from '../routesUtils';
import errors from '../../errors';
import * as http from 'http';
import StatsClient from '../../metrics/StatsClient';

export default function routerWebsite(
    request: http.IncomingMessage,
    response: http.ServerResponse,
    api: { callApiMethod: routesUtils.CallApiMethod },
    log: RequestLogger,
    statsClient?: StatsClient,
    dataRetrievalParams?: any,
) {
    const { bucketName, query } = request as any
    log.debug('routing request', { method: 'routerWebsite' });
    // website endpoint only supports GET and HEAD and must have a bucket
    // http://docs.aws.amazon.com/AmazonS3/latest/dev/WebsiteEndpoints.html
    if ((request.method !== 'GET' && request.method !== 'HEAD')
        || !bucketName) {
        return routesUtils.errorHtmlResponse(errors.MethodNotAllowed,
            false, bucketName, response, null, log);
    }
    if (request.method === 'GET') {
        return api.callApiMethod('websiteGet', request, response, log,
            (err, userErrorPageFailure, dataGetInfo, resMetaHeaders,
                redirectInfo, key) => {
                routesUtils.statsReport500(err, statsClient);
                // request being redirected
                if (redirectInfo) {
                    // note that key might have been modified in websiteGet
                    // api to add index document
                    return routesUtils.redirectRequest(redirectInfo,
                        // TODO Fix this
                        // @ts-ignore
                        key, request.connection.encrypted,
                        response, request.headers.host!, resMetaHeaders, log);
                }
                // user has their own error page
                if (err && dataGetInfo) {
                    return routesUtils.streamUserErrorPage(err, dataGetInfo,
                        dataRetrievalParams, response, resMetaHeaders, log);
                }
                // send default error html response
                if (err) {
                    return routesUtils.errorHtmlResponse(err,
                        userErrorPageFailure, bucketName,
                        response, resMetaHeaders, log);
                }
                // no error, stream data
                return routesUtils.responseStreamData(null, query,
                    resMetaHeaders, dataGetInfo, dataRetrievalParams, response,
                    undefined, log);
            });
    }
    if (request.method === 'HEAD') {
        return api.callApiMethod('websiteHead', request, response, log,
            (err, resMetaHeaders, redirectInfo, key) => {
                routesUtils.statsReport500(err, statsClient);
                if (redirectInfo) {
                    return routesUtils.redirectRequest(redirectInfo,
                        // TODO Fix this
                        // @ts-ignore
                        key, request.connection.encrypted,
                        response, request.headers.host!, resMetaHeaders, log);
                }
                // could redirect on err so check for redirectInfo first
                if (err) {
                    return routesUtils.errorHeaderResponse(err, response,
                        resMetaHeaders, log);
                }
                return routesUtils.responseContentHeaders(err, {}, resMetaHeaders,
                    response, log);
            });
    }
    return undefined;
}
