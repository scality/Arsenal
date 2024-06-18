import { RequestLogger } from 'werelogs';

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
    dataRetrievalFn?: any,
) {
    const {
        oTel: {
            tracer,
            activeSpan,
            activeTracerContext,
        }
    } = dataRetrievalFn;
    return tracer.startActiveSpan('Arsenal:: Performing Website API related operations using Cloudserver, Vault and Metadata', undefined, activeTracerContext, cloudserverApiSpan => {
        activeSpan.addEvent('Request validated, routing request using routerWebsite() in arsenal');
        cloudserverApiSpan.setAttributes({
            'code.lineno': 8,
            'code.filename': 'lib/s3routes/routes/routeWebsite.ts',
            'code.function': 'routerWebsite()',
        });
        activeSpan.addEvent('Detecting which API to route to using arsenal routerWebsite()');
        const { bucketName, query } = request as any
        log.debug('routing request', { method: 'routerWebsite' });
        // website endpoint only supports GET and HEAD and must have a bucket
        // http://docs.aws.amazon.com/AmazonS3/latest/dev/WebsiteEndpoints.html
        if ((request.method !== 'GET' && request.method !== 'HEAD')
            || !bucketName) {
            activeSpan.recordException(errors.MethodNotAllowed);
            cloudserverApiSpan.end();
            return routesUtils.errorHtmlResponse(errors.MethodNotAllowed,
                false, bucketName, response, null, log);
        }
        if (request.method === 'GET') {
            activeSpan.updateName(`GetWebsite API${bucketName ? ` with bucket: ${bucketName}` : ''}`);
            activeSpan.addEvent(`Detected GetWebsite API request`);
            activeSpan.setAttribute('rpc.method', 'GetWebsite');
            return api.callApiMethod('websiteGet', request, response, log,
                (err, userErrorPageFailure, dataGetInfo, resMetaHeaders,
                    redirectInfo, key) => {
                    cloudserverApiSpan.end();
                    activeSpan.addEvent('Located Data')
                    if (err?.code === 500) {
                        activeSpan.recordException(err);
                    }
                    routesUtils.statsReport500(err, statsClient);
                    // request being redirected
                    if (redirectInfo) {
                        if (err && redirectInfo.withError) {
                            activeSpan.recordException(err);
                            return routesUtils.redirectRequestOnError(err,
                                'GET', redirectInfo, dataGetInfo, dataRetrievalFn,
                                response, resMetaHeaders, log)
                        }
                        activeSpan.addEvent('Redirecting request');
                        // note that key might have been modified in websiteGet
                        // api to add index document
                        return routesUtils.redirectRequest(redirectInfo,
                            // TODO ARSN-217 encrypted does not exists in request.connection
                            // @ts-ignore
                            key, request.connection.encrypted,
                            response, request.headers.host!, resMetaHeaders, log);
                    }
                    // user has their own error page
                    if (err && dataGetInfo) {
                        activeSpan.recordException(err);
                        return routesUtils.streamUserErrorPage(err, dataGetInfo,
                            dataRetrievalFn, response, resMetaHeaders, log);
                    }
                    // send default error html response
                    if (err) {
                        activeSpan.recordException(err);
                        return routesUtils.errorHtmlResponse(err,
                            userErrorPageFailure, bucketName,
                            response, resMetaHeaders, log);
                    }
                    // no error, stream data
                    return routesUtils.responseStreamData(null, query,
                        resMetaHeaders, dataGetInfo, dataRetrievalFn, response,
                        undefined, log);
                }, {
                    cloudserverApiSpan,
                    activeSpan,
                    activeTracerContext,
                    tracer,
                });
        }
        if (request.method === 'HEAD') {
            activeSpan.updateName(`HeadWebsite API${bucketName ? ` with bucket: ${bucketName}` : ''}`);
            activeSpan.addEvent(`Detected HeadWebsite API request`);
            activeSpan.setAttribute('rpc.method', 'HeadWebsite');
            return api.callApiMethod('websiteHead', request, response, log,
                (err, resMetaHeaders, redirectInfo, key) => {
                    cloudserverApiSpan.end();
                    activeSpan.addEvent('HeadWebsite API operation complete')
                    if (err?.code === 500) {
                        activeSpan.recordException(err);
                    }
                    routesUtils.statsReport500(err, statsClient);
                    if (redirectInfo) {
                        if (err && redirectInfo.withError) {
                            activeSpan.recordException(err);
                            return routesUtils.redirectRequestOnError(err,
                                'HEAD', redirectInfo, null, dataRetrievalFn,
                                response, resMetaHeaders, log)
                        }
                        activeSpan.addEvent('Redirecting request');
                        return routesUtils.redirectRequest(redirectInfo,
                            // TODO ARSN-217 encrypted does not exists in request.connection
                            // @ts-ignore
                            key, request.connection.encrypted,
                            response, request.headers.host!, resMetaHeaders, log);
                    }
                    // could redirect on err so check for redirectInfo first
                    if (err) {
                        activeSpan.recordException(err);
                        return routesUtils.errorHeaderResponse(err, response,
                            resMetaHeaders, log);
                    }
                    activeSpan.addEvent('Finalizing Response with Content Headers and sending response to client');
                    return routesUtils.responseContentHeaders(err, {}, resMetaHeaders,
                        response, log);
                }, {
                    cloudserverApiSpan,
                    activeSpan,
                    activeTracerContext,
                    tracer,
                });
        }
        return undefined;
    });
    
}
