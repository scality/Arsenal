const { statsReport500, responseNoBody, responseXMLBody } =
    require('../routesUtils');

class ObjectController {
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

module.exports = ObjectController;
