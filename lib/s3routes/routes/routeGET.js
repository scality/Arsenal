const errors = require('../../errors').default;
const routesUtils = require('../routesUtils');

function routerGET(request, response, api, log, statsClient,
    dataRetrievalParams) {
    log.debug('routing request', { method: 'routerGET' });
    if (request.bucketName === undefined && request.objectKey !== undefined) {
        routesUtils.responseXMLBody(errors.NoSuchBucket, null, response, log);
    } else if (request.bucketName === undefined
        && request.objectKey === undefined) {
        // GET service
        api.callApiMethod('serviceGet', request, response, log, (err, xml) => {
            routesUtils.statsReport500(err, statsClient);
            return routesUtils.responseXMLBody(err, xml, response, log);
        });
    } else if (request.objectKey === undefined) {
        // GET bucket ACL
        if (request.query.acl !== undefined) {
            api.callApiMethod('bucketGetACL', request, response, log,
                (err, xml, corsHeaders) => {
                    routesUtils.statsReport500(err, statsClient);
                    return routesUtils.responseXMLBody(err, xml, response, log,
                        corsHeaders);
                });
        } else if (request.query.replication !== undefined) {
            api.callApiMethod('bucketGetReplication', request, response, log,
                (err, xml, corsHeaders) => {
                    routesUtils.statsReport500(err, statsClient);
                    return routesUtils.responseXMLBody(err, xml, response, log,
                        corsHeaders);
                });
        } else if (request.query.cors !== undefined) {
            api.callApiMethod('bucketGetCors', request, response, log,
                (err, xml, corsHeaders) => {
                    routesUtils.statsReport500(err, statsClient);
                    routesUtils.responseXMLBody(err, xml, response, log,
                        corsHeaders);
                });
        } else if (request.query.versioning !== undefined) {
            api.callApiMethod('bucketGetVersioning', request, response, log,
                (err, xml, corsHeaders) => {
                    routesUtils.statsReport500(err, statsClient);
                    routesUtils.responseXMLBody(err, xml, response, log,
                        corsHeaders);
                });
        } else if (request.query.website !== undefined) {
            api.callApiMethod('bucketGetWebsite', request, response, log,
                (err, xml, corsHeaders) => {
                    routesUtils.statsReport500(err, statsClient);
                    routesUtils.responseXMLBody(err, xml, response, log,
                        corsHeaders);
                });
        } else if (request.query.tagging !== undefined) {
            api.callApiMethod('bucketGetTagging', request, response, log,
                (err, xml, corsHeaders) => {
                    routesUtils.statsReport500(err, statsClient);
                    routesUtils.responseXMLBody(err, xml, response, log,
                        corsHeaders);
                });
        } else if (request.query.lifecycle !== undefined) {
            api.callApiMethod('bucketGetLifecycle', request, response, log,
                (err, xml, corsHeaders) => {
                    routesUtils.statsReport500(err, statsClient);
                    routesUtils.responseXMLBody(err, xml, response, log,
                        corsHeaders);
                });
        } else if (request.query.uploads !== undefined) {
            // List MultipartUploads
            api.callApiMethod('listMultipartUploads', request, response, log,
                (err, xml, corsHeaders) => {
                    routesUtils.statsReport500(err, statsClient);
                    return routesUtils.responseXMLBody(err, xml, response, log,
                        corsHeaders);
                });
        } else if (request.query.location !== undefined) {
            api.callApiMethod('bucketGetLocation', request, response, log,
                (err, xml, corsHeaders) => {
                    routesUtils.statsReport500(err, statsClient);
                    return routesUtils.responseXMLBody(err, xml, response, log,
                        corsHeaders);
                });
        } else if (request.query.policy !== undefined) {
            api.callApiMethod('bucketGetPolicy', request, response, log,
                (err, xml, corsHeaders) => {
                    routesUtils.statsReport500(err, statsClient);
                    return routesUtils.responseXMLBody(err, xml, response,
                        log, corsHeaders);
                });
        } else if (request.query['object-lock'] !== undefined) {
            api.callApiMethod('bucketGetObjectLock', request, response, log,
                (err, xml, corsHeaders) => {
                    routesUtils.statsReport500(err, statsClient);
                    return routesUtils.responseXMLBody(err, xml, response,
                        log, corsHeaders);
                });
        } else if (request.query.notification !== undefined) {
            api.callApiMethod('bucketGetNotification', request, response, log,
                (err, xml, corsHeaders) => {
                    routesUtils.statsReport500(err, statsClient);
                    return routesUtils.responseXMLBody(err, xml, response,
                        log, corsHeaders);
                });
        } else if (request.query.encryption !== undefined) {
            api.callApiMethod('bucketGetEncryption', request, response, log,
                (err, xml, corsHeaders) => {
                    routesUtils.statsReport500(err, statsClient);
                    return routesUtils.responseXMLBody(err, xml, response,
                        log, corsHeaders);
                });
        } else if (request.query.search !== undefined) {
            api.callApiMethod('metadataSearch', request, response, log,
                (err, xml, corsHeaders) => {
                    routesUtils.statsReport500(err, statsClient);
                    return routesUtils.responseXMLBody(err, xml, response,
                        log, corsHeaders);
                });
        } else {
            // GET bucket
            api.callApiMethod('bucketGet', request, response, log,
                (err, xml, corsHeaders) => {
                    routesUtils.statsReport500(err, statsClient);
                    return routesUtils.responseXMLBody(err, xml, response, log,
                        corsHeaders);
                });
        }
    } else {
        if (request.query.acl !== undefined) {
            // GET object ACL
            api.callApiMethod('objectGetACL', request, response, log,
                (err, xml, corsHeaders) => {
                    routesUtils.statsReport500(err, statsClient);
                    return routesUtils.responseXMLBody(err, xml, response, log,
                        corsHeaders);
                });
        } else if (request.query['legal-hold'] !== undefined) {
            api.callApiMethod('objectGetLegalHold', request, response, log,
                (err, xml, corsHeaders) => {
                    routesUtils.statsReport500(err, statsClient);
                    return routesUtils.responseXMLBody(err, xml, response, log,
                        corsHeaders);
                });
        } else if (request.query.tagging !== undefined) {
            api.callApiMethod('objectGetTagging', request, response, log,
                (err, xml, corsHeaders) => {
                    routesUtils.statsReport500(err, statsClient);
                    return routesUtils.responseXMLBody(err, xml, response, log,
                        corsHeaders);
                });
            // List parts of an open multipart upload
        } else if (request.query.uploadId !== undefined) {
            api.callApiMethod('listParts', request, response, log,
                (err, xml, corsHeaders) => {
                    routesUtils.statsReport500(err, statsClient);
                    return routesUtils.responseXMLBody(err, xml, response, log,
                        corsHeaders);
                });
        } else if (request.query.retention !== undefined) {
            api.callApiMethod('objectGetRetention', request, response, log,
                (err, xml, corsHeaders) => {
                    routesUtils.statsReport500(err, statsClient);
                    return routesUtils.responseXMLBody(err, xml, response, log,
                        corsHeaders);
                });
        } else {
            // GET object
            api.callApiMethod('objectGet', request, response, log,
                (err, dataGetInfo, resMetaHeaders, range) => {
                    let contentLength = 0;
                    if (resMetaHeaders && resMetaHeaders['Content-Length']) {
                        contentLength = resMetaHeaders['Content-Length'];
                    }
                    log.end().addDefaultFields({ contentLength });
                    routesUtils.statsReport500(err, statsClient);
                    return routesUtils.responseStreamData(err, request.query,
                        resMetaHeaders, dataGetInfo, dataRetrievalParams,
                        response, range, log);
                });
        }
    }
}

module.exports = routerGET;
