const { statsReport500, responseNoBody, responseXMLBody } =
    require('../routesUtils');

class BucketController {
    static bucketPutACL(action, req, res, api, log, statsClient) {
        return api.callApiMethod(action, req, res, log, (err, corsHeaders) => {
            statsReport500(err, statsClient);
            return responseNoBody(err, corsHeaders, res, 200, log);
        });
    }

    static bucketPutVersioning(action, req, res, api, log, statsClient) {
        return api.callApiMethod(action, req, res, log, (err, corsHeaders) => {
            statsReport500(err, statsClient);
            return responseNoBody(err, corsHeaders, res, 200, log);
        });
    }

    static bucketPutWebsite(action, req, res, api, log, statsClient) {
        return api.callApiMethod(action, req, res, log, (err, corsHeaders) => {
            statsReport500(err, statsClient);
            return responseNoBody(err, corsHeaders, res, 200, log);
        });
    }

    static bucketPutCors(action, req, res, api, log, statsClient) {
        return api.callApiMethod(action, req, res, log, (err, corsHeaders) => {
            statsReport500(err, statsClient);
            return responseNoBody(err, corsHeaders, res, 200, log);
        });
    }

    static bucketPutReplication(action, req, res, api, log, statsClient) {
        return api.callApiMethod(action, req, res, log, (err, corsHeaders) => {
            statsReport500(err, statsClient);
            return responseNoBody(err, corsHeaders, res, 200, log);
        });
    }

    static bucketPut(action, req, res, api, log, statsClient) {
        return api.callApiMethod(action, req, res, log, (err, corsHeaders) => {
            statsReport500(err, statsClient);
            const location = { Location: `/${req.bucketName}` };
            const resHeaders = corsHeaders ?
                Object.assign({}, location, corsHeaders) : location;
            return responseNoBody(err, resHeaders, res, 200, log);
        });
    }

    static objectPutCopyPart(action, req, res, api, log, statsClient) {
        return api.callApiMethod(action, req, res, log,
            (err, xml, additionalHeaders) => {
                statsReport500(err, statsClient);
                return responseXMLBody(err, xml, res, log, additionalHeaders);
            });
    }

    static objectPutPart(action, req, res, api, log, statsClient) {
        return api.callApiMethod(action, req, res, log,
            (err, calculatedHash, corsHeaders) => {
                if (err) {
                    return responseNoBody(err, corsHeaders, res, 200, log);
                }
                const resMetaHeaders = corsHeaders || {};
                // ETag's hex should always be enclosed in quotes
                resMetaHeaders.ETag = `"${calculatedHash}"`;
                statsReport500(err, statsClient);
                return responseNoBody(err, resMetaHeaders, res, 200, log);
            });
    }

    static objectPutACL(action, req, res, api, log, statsClient) {
        return api.callApiMethod(action, req, res, log, (err, resHeaders) => {
            statsReport500(err, statsClient);
            return responseNoBody(err, resHeaders, res, 200, log);
        });
    }

    static objectPutTagging(action, req, res, api, log, statsClient) {
        return api.callApiMethod(action, req, res, log, (err, resHeaders) => {
            statsReport500(err, statsClient);
            return responseNoBody(err, resHeaders, res, 200, log);
        });
    }

    static objectCopy(action, req, res, api, log, statsClient) {
        return api.callApiMethod(action, req, res, log,
        (err, xml, additionalHeaders) => {
            statsReport500(err, statsClient);
            responseXMLBody(err, xml, res, log, additionalHeaders);
        });
    }

    static objectPut(action, req, res, api, log, statsClient) {
        return api.callApiMethod(action, req, res, log, (err, resHeaders) => {
            statsReport500(err, statsClient);
            return responseNoBody(err, resHeaders, res, 200, log);
        });
    }
}

module.exports = BucketController;
