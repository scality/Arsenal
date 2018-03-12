const errors = require('../../errors');
const routesUtils = require('../routesUtils');

/* eslint-disable no-param-reassign */
function routePUT(request, response, api, log, statsClient) {
    log.debug('routing request', { method: 'routePUT' });

    if (request.objectKey === undefined) {
        // PUT bucket - PUT bucket ACL

        // content-length for object is handled separately below
        const contentLength = request.headers['content-length'];
        if ((contentLength && (Number.isNaN(Number(contentLength))
        || contentLength < 0)) || contentLength === '') {
            log.debug('invalid content-length header');
            return routesUtils.responseNoBody(
              errors.BadRequest, null, response, null, log);
        }

        // PUT bucket ACL
        if (request.query.acl !== undefined) {
            api.callApiMethod('bucketPutACL', request, response, log,
            (err, corsHeaders) => {
                routesUtils.statsReport500(err, statsClient);
                return routesUtils.responseNoBody(err, corsHeaders,
                    response, 200, log);
            });
        } else if (request.query.versioning !== undefined) {
            api.callApiMethod('bucketPutVersioning', request, response, log,
                (err, corsHeaders) => {
                    routesUtils.statsReport500(err, statsClient);
                    routesUtils.responseNoBody(err, corsHeaders, response, 200,
                        log);
                });
        } else if (request.query.website !== undefined) {
            api.callApiMethod('bucketPutWebsite', request, response, log,
                (err, corsHeaders) => {
                    routesUtils.statsReport500(err, statsClient);
                    return routesUtils.responseNoBody(err, corsHeaders,
                        response, 200, log);
                });
        } else if (request.query.cors !== undefined) {
            api.callApiMethod('bucketPutCors', request, response, log,
                (err, corsHeaders) => {
                    routesUtils.statsReport500(err, statsClient);
                    return routesUtils.responseNoBody(err, corsHeaders,
                        response, 200, log);
                });
        } else if (request.query.replication !== undefined) {
            api.callApiMethod('bucketPutReplication', request, response, log,
                (err, corsHeaders) => {
                    routesUtils.statsReport500(err, statsClient);
                    routesUtils.responseNoBody(err, corsHeaders, response, 200,
                        log);
                });
        } else if (request.query.lifecycle !== undefined) {
            api.callApiMethod('bucketPutLifecycle', request, response, log,
                (err, corsHeaders) => {
                    routesUtils.statsReport500(err, statsClient);
                    routesUtils.responseNoBody(err, corsHeaders, response, 200,
                        log);
                });
        } else {
            // PUT bucket
            return api.callApiMethod('bucketPut', request, response, log,
                (err, corsHeaders) => {
                    routesUtils.statsReport500(err, statsClient);
                    const location = { Location: `/${request.bucketName}` };
                    const resHeaders = corsHeaders ?
                        Object.assign({}, location, corsHeaders) : location;
                    return routesUtils.responseNoBody(err, resHeaders,
                        response, 200, log);
                });
        }
    } else {
        // PUT object, PUT object ACL, PUT object multipart or
        // PUT object copy
        // if content-md5 is not present in the headers, try to
        // parse content-md5 from meta headers

        if (request.headers['content-md5'] === '') {
            log.debug('empty content-md5 header', {
                method: 'routePUT',
            });
            return routesUtils
            .responseNoBody(errors.InvalidDigest, null, response, 200, log);
        }
        if (request.headers['content-md5']) {
            request.contentMD5 = request.headers['content-md5'];
        } else {
            request.contentMD5 = routesUtils.parseContentMD5(request.headers);
        }
        if (request.contentMD5 && request.contentMD5.length !== 32) {
            request.contentMD5 = Buffer.from(request.contentMD5, 'base64')
                .toString('hex');
            if (request.contentMD5 && request.contentMD5.length !== 32) {
                log.debug('invalid md5 digest', {
                    contentMD5: request.contentMD5,
                });
                return routesUtils
                    .responseNoBody(errors.InvalidDigest, null, response, 200,
                                    log);
            }
        }
        if (request.query.partNumber) {
            if (request.headers['x-amz-copy-source']) {
                api.callApiMethod('objectPutCopyPart', request, response, log,
                (err, xml, additionalHeaders) => {
                    routesUtils.statsReport500(err, statsClient);
                    return routesUtils.responseXMLBody(err, xml, response, log,
                            additionalHeaders);
                });
            } else {
                api.callApiMethod('objectPutPart', request, response, log,
                    (err, calculatedHash, corsHeaders) => {
                        if (err) {
                            return routesUtils.responseNoBody(err, corsHeaders,
                                response, 200, log);
                        }
                        // ETag's hex should always be enclosed in quotes
                        const resMetaHeaders = corsHeaders || {};
                        resMetaHeaders.ETag = `"${calculatedHash}"`;
                        routesUtils.statsReport500(err, statsClient);
                        return routesUtils.responseNoBody(err, resMetaHeaders,
                            response, 200, log);
                    });
            }
        } else if (request.query.acl !== undefined) {
            api.callApiMethod('objectPutACL', request, response, log,
                (err, resHeaders) => {
                    routesUtils.statsReport500(err, statsClient);
                    return routesUtils.responseNoBody(err, resHeaders,
                        response, 200, log);
                });
        } else if (request.query.tagging !== undefined) {
            api.callApiMethod('objectPutTagging', request, response, log,
                (err, resHeaders) => {
                    routesUtils.statsReport500(err, statsClient);
                    return routesUtils.responseNoBody(err, resHeaders,
                        response, 200, log);
                });
        } else if (request.headers['x-amz-copy-source']) {
            return api.callApiMethod('objectCopy', request, response, log,
                (err, xml, additionalHeaders) => {
                    routesUtils.statsReport500(err, statsClient);
                    routesUtils.responseXMLBody(err, xml, response, log,
                        additionalHeaders);
                });
        } else {
            if (request.headers['content-length'] === undefined &&
            request.headers['x-amz-decoded-content-length'] === undefined) {
                return routesUtils.responseNoBody(errors.MissingContentLength,
                    null, response, 411, log);
            }
            if (Number.isNaN(request.parsedContentLength) ||
            request.parsedContentLength < 0) {
                return routesUtils.responseNoBody(errors.BadRequest,
                    null, response, 400, log);
            }
            log.end().addDefaultFields({
                contentLength: request.parsedContentLength,
            });

            api.callApiMethod('objectPut', request, response, log,
            (err, resHeaders) => {
                routesUtils.statsReport500(err, statsClient);
                return routesUtils.responseNoBody(err, resHeaders,
                    response, 200, log);
            });
        }
    }
    return undefined;
}
/* eslint-enable no-param-reassign */
module.exports = routePUT;
