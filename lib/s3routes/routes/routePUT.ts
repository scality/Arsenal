import { RequestLogger } from 'werelogs';

import * as routesUtils from '../routesUtils';
import errors from '../../errors';
import * as http from 'http';
import StatsClient from '../../metrics/StatsClient';

export default function routePUT(
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
    return tracer.startActiveSpan('Arsenal:: Performing Put API related operations using Cloudserver, Vault and Metadata', undefined, activeTracerContext, cloudserverApiSpan  => {
        activeSpan.addEvent('Request validated, routing request using routePUT() in arsenal')
        cloudserverApiSpan.setAttributes({
            'code.lineno': 8,
            'code.filename': 'lib/s3routes/routes/routePUT.ts',
            'code.function': 'routePUT()',
        })
        activeSpan.addEvent('Detecting which API to route to using arsenal routePUT()')
        log.debug('routing request', { method: 'routePUT' });

        const { objectKey, query, bucketName, parsedContentLength } = request as any

        if (objectKey === undefined) {
            // PUT bucket - PUT bucket ACL

            // content-length for object is handled separately below
            const contentLength = request.headers['content-length'];
            const len = Number(contentLength);
            if ((contentLength && (Number.isNaN(len) || len < 0)) || contentLength === '') {
                log.debug('invalid content-length header');
                return routesUtils.responseNoBody(
                    errors.BadRequest, null, response, undefined, log);
            }
            // PUT bucket ACL
            if (query.acl !== undefined) {
                activeSpan.updateName('PutBucketAcl API request');
                activeSpan.addEvent('Detected PutBucketAcl API request');
                activeSpan.setAttribute('rpc.method', 'PutBucketAcl');
                return api.callApiMethod('bucketPutACL', request, response, log,
                    (err, corsHeaders) => {
                        cloudserverApiSpan.end();
                        activeSpan.addEvent('PutBucketAcl API operation complete');
                        if (err?.code === 500) {
                            activeSpan.recordException(err);
                        }
                        routesUtils.statsReport500(err, statsClient);
                        activeSpan.addEvent('Finalizing Response with Content Headers and sending response to client');
                        return routesUtils.responseNoBody(err, corsHeaders,
                            response, 200, log);
                    }, {
                        cloudserverApiSpan,
                        activeSpan,
                        activeTracerContext,
                        tracer,
                    });
            } else if (query.versioning !== undefined) {
                activeSpan.updateName('PutBucketVersioning API request');
                activeSpan.addEvent('Detected PutBucketVersioning API request');
                activeSpan.setAttribute('rpc.method', 'PutBucketVersioning');
                return api.callApiMethod('bucketPutVersioning', request, response, log,
                    (err, corsHeaders) => {
                        cloudserverApiSpan.end();
                        activeSpan.addEvent('PutBucketVersioning API operation complete');
                        if (err?.code === 500) {
                            activeSpan.recordException(err);
                        }
                        routesUtils.statsReport500(err, statsClient);
                        activeSpan.addEvent('Finalizing Response with Content Headers and sending response to client');
                        routesUtils.responseNoBody(err, corsHeaders, response, 200,
                            log);
                    }, {
                        cloudserverApiSpan,
                        activeSpan,
                        activeTracerContext,
                        tracer,
                    });
            } else if (query.website !== undefined) {
                activeSpan.updateName('PutBucketWebsite API request');
                activeSpan.addEvent('Detected PutBucketWebsite API request');
                activeSpan.setAttribute('rpc.method', 'PutBucketWebsite');
                return api.callApiMethod('bucketPutWebsite', request, response, log,
                    (err, corsHeaders) => {
                        cloudserverApiSpan.end();
                        activeSpan.addEvent('PutBucketWebsite API operation complete');
                        if (err?.code === 500) {
                            activeSpan.recordException(err);
                        }
                        routesUtils.statsReport500(err, statsClient);
                        activeSpan.addEvent('Finalizing Response with Content Headers and sending response to client');
                        return routesUtils.responseNoBody(err, corsHeaders,
                            response, 200, log);
                    }, {
                        cloudserverApiSpan,
                        activeSpan,
                        activeTracerContext,
                        tracer,
                    });
            } else if (query.tagging !== undefined) {
                activeSpan.updateName('PutBucketTagging API request');
                activeSpan.addEvent('Detected PutBucketTagging API request');
                activeSpan.setAttribute('rpc.method', 'PutBucketTagging');
                return api.callApiMethod('bucketPutTagging', request, response, log,
                    (err, corsHeaders) => {
                        cloudserverApiSpan.end();
                        activeSpan.addEvent('PutBucketTagging API operation complete');
                        if (err?.code === 500) {
                            activeSpan.recordException(err);
                        }
                        routesUtils.statsReport500(err, statsClient);
                        activeSpan.addEvent('Finalizing Response with Content Headers and sending response to client');
                        return routesUtils.responseNoBody(err, corsHeaders,
                            response, 200, log);
                    }, {
                        cloudserverApiSpan,
                        activeSpan,
                        activeTracerContext,
                        tracer,
                    });
            } else if (query.cors !== undefined) {
                activeSpan.updateName('PutBucketCors API request');
                activeSpan.addEvent('Detected PutBucketCors API request');
                activeSpan.setAttribute('rpc.method', 'PutBucketCors');
                return api.callApiMethod('bucketPutCors', request, response, log,
                    (err, corsHeaders) => {
                        cloudserverApiSpan.end();
                        activeSpan.addEvent('PutBucketCors API operation complete');
                        if (err?.code === 500) {
                            activeSpan.recordException(err);
                        }
                        routesUtils.statsReport500(err, statsClient);
                        activeSpan.addEvent('Finalizing Response with Content Headers and sending response to client');
                        return routesUtils.responseNoBody(err, corsHeaders,
                            response, 200, log);
                    }, {
                        cloudserverApiSpan,
                        activeSpan,
                        activeTracerContext,
                        tracer,
                    });
            } else if (query.replication !== undefined) {
                activeSpan.updateName('PutBucketReplication API request');
                activeSpan.addEvent('Detected PutBucketReplication API request');
                activeSpan.setAttribute('rpc.method', 'PutBucketReplication');
                return api.callApiMethod('bucketPutReplication', request, response, log,
                    (err, corsHeaders) => {
                        cloudserverApiSpan.end();
                        activeSpan.addEvent('PutBucketReplication API operation complete');
                        if (err?.code === 500) {
                            activeSpan.recordException(err);
                        }
                        routesUtils.statsReport500(err, statsClient);
                        activeSpan.addEvent('Finalizing Response with Content Headers and sending response to client');
                        routesUtils.responseNoBody(err, corsHeaders, response, 200,
                            log);
                    }, {
                        cloudserverApiSpan,
                        activeSpan,
                        activeTracerContext,
                        tracer,
                    });
            } else if (query.lifecycle !== undefined) {
                activeSpan.updateName('PutBucketLifecycle API request');
                activeSpan.addEvent('Detected PutBucketLifecycle API request');
                activeSpan.setAttribute('rpc.method', 'PutBucketLifecycle');
                return api.callApiMethod('bucketPutLifecycle', request, response, log,
                    (err, corsHeaders) => {
                        cloudserverApiSpan.end();
                        activeSpan.addEvent('PutBucketLifecycle API operation complete');
                        if (err?.code === 500) {
                            activeSpan.recordException(err);
                        }
                        routesUtils.statsReport500(err, statsClient);
                        activeSpan.addEvent('Finalizing Response with Content Headers and sending response to client');
                        routesUtils.responseNoBody(err, corsHeaders, response, 200,
                            log);
                    }, {
                        cloudserverApiSpan,
                        activeSpan,
                        activeTracerContext,
                        tracer,
                    });
            } else if (query.policy !== undefined) {
                activeSpan.updateName('PutBucketPolicy API request');
                activeSpan.addEvent('Detected PutBucketPolicy API request');
                activeSpan.setAttribute('rpc.method', 'PutBucketPolicy');
                return api.callApiMethod('bucketPutPolicy', request, response, log,
                    (err, corsHeaders) => {
                        cloudserverApiSpan.end();
                        activeSpan.addEvent('PutBucketPolicy API operation complete');
                        if (err?.code === 500) {
                            activeSpan.recordException(err);
                        }
                        routesUtils.statsReport500(err, statsClient);
                        activeSpan.addEvent('Finalizing Response with Content Headers and sending response to client');
                        routesUtils.responseNoBody(err, corsHeaders, response, 200,
                            log);
                    }, {
                        cloudserverApiSpan,
                        activeSpan,
                        activeTracerContext,
                        tracer,
                    });
            } else if (query['object-lock'] !== undefined) {
                activeSpan.updateName('PutObjectLockConfiguration API request');
                activeSpan.addEvent('Detected PutObjectLockConfiguration API request');
                activeSpan.setAttribute('rpc.method', 'PutObjectLockConfiguration');
                return api.callApiMethod('bucketPutObjectLock', request, response, log,
                    (err, corsHeaders) => {
                        cloudserverApiSpan.end();
                        activeSpan.addEvent('PutObjectLockConfiguration API operation complete');
                        if (err?.code === 500) {
                            activeSpan.recordException(err);
                        }
                        routesUtils.statsReport500(err, statsClient);
                        activeSpan.addEvent('Finalizing Response with Content Headers and sending response to client');
                        routesUtils.responseNoBody(err, corsHeaders, response, 200,
                            log);
                    }, {
                        cloudserverApiSpan,
                        activeSpan,
                        activeTracerContext,
                        tracer,
                    });
            } else if (query.notification !== undefined) {
                activeSpan.updateName('PutBucketNotificationConfiguration API request');
                activeSpan.addEvent('Detected PutBucketNotificationConfiguration API request');
                activeSpan.setAttribute('rpc.method', 'PutBucketNotificationConfiguration');
                return api.callApiMethod('bucketPutNotification', request, response, log,
                    (err, corsHeaders) => {
                        cloudserverApiSpan.end();
                        activeSpan.addEvent('PutBucketNotificationConfiguration API operation complete');
                        if (err?.code === 500) {
                            activeSpan.recordException(err);
                        }
                        routesUtils.statsReport500(err, statsClient);
                        activeSpan.addEvent('Finalizing Response with Content Headers and sending response to client');
                        routesUtils.responseNoBody(err, corsHeaders, response, 200,
                            log);
                    }, {
                        cloudserverApiSpan,
                        activeSpan,
                        activeTracerContext,
                        tracer,
                    });
            } else if (query.encryption !== undefined) {
                activeSpan.updateName('PutBucketEncryption API request');
                activeSpan.addEvent('Detected PutBucketEncryption API request');
                activeSpan.setAttribute('rpc.method', 'PutBucketEncryption');
                return api.callApiMethod('bucketPutEncryption', request, response, log,
                    (err, corsHeaders) => {
                        cloudserverApiSpan.end();
                        activeSpan.addEvent('PutBucketEncryption API operation complete');
                        if (err?.code === 500) {
                            activeSpan.recordException(err);
                        }
                        routesUtils.statsReport500(err, statsClient);
                        activeSpan.addEvent('Finalizing Response with Content Headers and sending response to client');
                        return routesUtils.responseNoBody(err, corsHeaders,
                            response, 200, log);
                    }, {
                        cloudserverApiSpan,
                        activeSpan,
                        activeTracerContext,
                        tracer,
                    });
            } else {
                // PUT bucket
                activeSpan.updateName('PutBucket API request');
                activeSpan.addEvent('Detected PutBucket API request');
                activeSpan.setAttribute('rpc.method', 'PutBucket');
                return api.callApiMethod('bucketPut', request, response, log,
                    (err, corsHeaders) => {
                        cloudserverApiSpan.end();
                        activeSpan.addEvent('PutBucket API operation complete');
                        if (err?.code === 500) {
                            activeSpan.recordException(err);
                        }
                        routesUtils.statsReport500(err, statsClient);
                        const location = { Location: `/${bucketName}` };
                        const resHeaders = corsHeaders ?
                            Object.assign({}, location, corsHeaders) : location;
                        activeSpan.addEvent('Finalizing Response with Content Headers and sending response to client');
                        return routesUtils.responseNoBody(err, resHeaders,
                            response, 200, log);
                    }, {
                        cloudserverApiSpan,
                        activeSpan,
                        activeTracerContext,
                        tracer,
                    });
            }
        } else {
            // PUT object, PUT object ACL, PUT object multipart,
            // PUT object copy or PUT object legal hold
            // if content-md5 is not present in the headers, try to
            // parse content-md5 from meta headers

            if (request.headers['content-md5'] === '') {
                activeSpan.recordException(errors.InvalidDigest);
                cloudserverApiSpan.end();
                log.debug('empty content-md5 header', {
                    method: 'routePUT',
                });
                return routesUtils
                    .responseNoBody(errors.InvalidDigest, null, response, 200, log);
            }
            if (request.headers['content-md5']) {
                // @ts-ignore
                request.contentMD5 = request.headers['content-md5'];
            } else {
                // @ts-ignore
                request.contentMD5 = routesUtils.parseContentMD5(request.headers);
            }
            // @ts-ignore
            if (request.contentMD5 && request.contentMD5.length !== 32) {
                // @ts-ignore
                request.contentMD5 = Buffer.from(request.contentMD5, 'base64').toString('hex');
                // @ts-ignore
                if (request.contentMD5 && request.contentMD5.length !== 32) {
                    activeSpan.recordException(errors.InvalidDigest);
                    cloudserverApiSpan.end();
                    // @ts-ignore
                    log.debug('invalid md5 digest', { contentMD5: request.contentMD5 });
                    return routesUtils
                        .responseNoBody(errors.InvalidDigest, null, response, 200,
                            log);
                }
            }
            if (query.partNumber) {
                if (request.headers['x-amz-copy-source']) {
                    activeSpan.updateName('UploadPartCopy API request');
                    activeSpan.addEvent('Detected UploadPartCopy API request');
                    activeSpan.setAttribute('rpc.method', 'UploadPartCopy');
                    return api.callApiMethod('objectPutCopyPart', request, response, log,
                        (err, xml, additionalHeaders) => {
                            cloudserverApiSpan.end();
                            activeSpan.addEvent('UploadPartCopy API operation complete');
                            if (err) {
                                activeSpan.recordException(err);
                            }
                            routesUtils.statsReport500(err, statsClient);
                            activeSpan.addEvent('Finalizing Response with Content Headers and sending response to client');
                            return routesUtils.responseXMLBody(err, xml, response, log,
                                additionalHeaders);
                        }, {
                            cloudserverApiSpan,
                            activeSpan,
                            activeTracerContext,
                            tracer,
                        });
                } else {
                    activeSpan.updateName('UploadPart API request');
                    activeSpan.addEvent('Detected UploadPart API request');
                    activeSpan.setAttribute('rpc.method', 'UploadPart');
                    return api.callApiMethod('objectPutPart', request, response, log,
                        (err, calculatedHash, corsHeaders) => {
                            cloudserverApiSpan.end();
                            activeSpan.addEvent('UploadPart API operation complete');
                            if (err) {
                                return routesUtils.responseNoBody(err, corsHeaders,
                                    response, 200, log);
                            }
                            // ETag's hex should always be enclosed in quotes
                            const resMetaHeaders = corsHeaders || {};
                            resMetaHeaders.ETag = `"${calculatedHash}"`;
                            if (err) {
                                activeSpan.recordException(err);
                            }
                            routesUtils.statsReport500(err, statsClient);
                            activeSpan.addEvent('Finalizing Response with Content Headers and sending response to client');
                            return routesUtils.responseNoBody(err, resMetaHeaders,
                                response, 200, log);
                        }, {
                            cloudserverApiSpan,
                            activeSpan,
                            activeTracerContext,
                            tracer,
                        });
                }
            } else if (query.acl !== undefined) {
                activeSpan.updateName('PutObjectAcl API request');
                activeSpan.addEvent('Detected PutObjectAcl API request');
                activeSpan.setAttribute('rpc.method', 'PutObjectAcl');
                return api.callApiMethod('objectPutACL', request, response, log,
                    (err, resHeaders) => {
                        cloudserverApiSpan.end();
                        activeSpan.addEvent('PutObjectAcl API operation complete');
                        if (err?.code === 500) {
                            activeSpan.recordException(err);
                        }
                        routesUtils.statsReport500(err, statsClient);
                        activeSpan.addEvent('Finalizing Response with Content Headers and sending response to client');
                        return routesUtils.responseNoBody(err, resHeaders,
                            response, 200, log);
                    }, {
                        cloudserverApiSpan,
                        activeSpan,
                        activeTracerContext,
                        tracer,
                    });
            } else if (query['legal-hold'] !== undefined) {
                activeSpan.updateName('PutObjectLegalHold API request');
                activeSpan.addEvent('Detected PutObjectLegalHold API request');
                activeSpan.setAttribute('rpc.method', 'PutObjectLegalHold');
                return api.callApiMethod('objectPutLegalHold', request, response, log,
                    (err, resHeaders) => {
                        cloudserverApiSpan.end();
                        activeSpan.addEvent('PutObjectLegalHold API operation complete');
                        if (err?.code === 500) {
                            activeSpan.recordException(err);
                        }
                        routesUtils.statsReport500(err, statsClient);
                        activeSpan.addEvent('Finalizing Response with Content Headers and sending response to client');
                        return routesUtils.responseNoBody(err, resHeaders,
                            response, 200, log);
                    }, {
                        cloudserverApiSpan,
                        activeSpan,
                        activeTracerContext,
                        tracer,
                    });
            } else if (query.tagging !== undefined) {
                activeSpan.updateName('PutObjectTagging API request');
                activeSpan.addEvent('Detected PutObjectTagging API request');
                activeSpan.setAttribute('rpc.method', 'PutObjectTagging');
                return api.callApiMethod('objectPutTagging', request, response, log,
                    (err, resHeaders) => {
                        cloudserverApiSpan.end();
                        activeSpan.addEvent('PutObjectTagging API operation complete');
                        if (err?.code === 500) {
                            activeSpan.recordException(err);
                        }
                        routesUtils.statsReport500(err, statsClient);
                        activeSpan.addEvent('Finalizing Response with Content Headers and sending response to client');
                        return routesUtils.responseNoBody(err, resHeaders,
                            response, 200, log);
                    }, {
                        cloudserverApiSpan,
                        activeSpan,
                        activeTracerContext,
                        tracer,
                    });
            } else if (query.retention !== undefined) {
                activeSpan.updateName('PutObjectRetention API request');
                activeSpan.addEvent('Detected PutObjectRetention API request');
                activeSpan.setAttribute('rpc.method', 'PutObjectRetention');
                return api.callApiMethod('objectPutRetention', request, response, log,
                    (err, resHeaders) => {
                        cloudserverApiSpan.end();
                        activeSpan.addEvent('PutObjectRetention API operation complete');
                        if (err?.code === 500) {
                            activeSpan.recordException(err);
                        }
                        routesUtils.statsReport500(err, statsClient);
                        activeSpan.addEvent('Finalizing Response with Content Headers and sending response to client');
                        return routesUtils.responseNoBody(err, resHeaders,
                            response, 200, log);
                    }, {
                        cloudserverApiSpan,
                        activeSpan,
                        activeTracerContext,
                        tracer,
                    });
            } else if (request.headers['x-amz-copy-source']) {
                activeSpan.updateName('CopyObject API request');
                activeSpan.addEvent('Detected CopyObject API request');
                activeSpan.setAttribute('rpc.method', 'CopyObject');
                return api.callApiMethod('objectCopy', request, response, log,
                    (err, xml, additionalHeaders) => {
                        cloudserverApiSpan.end();
                        activeSpan.addEvent('CopyObject API operation complete');
                        if (err?.code === 500) {
                            activeSpan.recordException(err);
                        }
                        routesUtils.statsReport500(err, statsClient);
                        activeSpan.addEvent('Finalizing Response with Content Headers and sending response to client');
                        routesUtils.responseXMLBody(err, xml, response, log,
                            additionalHeaders);
                    }, {
                        cloudserverApiSpan,
                        activeSpan,
                        activeTracerContext,
                        tracer,
                    });
            } else {
                if (request.headers['content-length'] === undefined &&
                request.headers['x-amz-decoded-content-length'] === undefined) {
                    activeSpan.recordException(errors.MissingContentLength);
                    cloudserverApiSpan.end();
                    return routesUtils.responseNoBody(errors.MissingContentLength,
                        null, response, 411, log);
                }
                if (Number.isNaN(parsedContentLength) || parsedContentLength < 0) {
                    activeSpan.recordException(errors.BadRequest);
                    cloudserverApiSpan.end();
                    return routesUtils.responseNoBody(errors.BadRequest,
                        null, response, 400, log);
                }
                // TODO ARSN-216 What's happening?
                // @ts-ignore
                log.end().addDefaultFields({ contentLength: request.parsedContentLength });
                activeSpan.updateName('PutObject API request');
                activeSpan.addEvent('Detected PutObject API request');
                activeSpan.setAttribute('rpc.method', 'PutObject');
                api.callApiMethod('objectPut', request, response, log,
                    (err, resHeaders) => {
                        cloudserverApiSpan.end();
                        activeSpan.addEvent('PutObject API operation complete');
                        if (err?.code === 500) {
                            activeSpan.recordException(err);
                        }
                        routesUtils.statsReport500(err, statsClient);
                        activeSpan.addEvent('Finalizing Response with Content Headers and sending response to client');
                        return routesUtils.responseNoBody(err, resHeaders,
                            response, 200, log);
                    }, {
                        cloudserverApiSpan,
                        activeSpan,
                        activeTracerContext,
                        tracer,
                    });
            }
        }
        return undefined;
    });
}
