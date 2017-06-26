const { statsReport500, responseNoBody } = require('../routesUtils');

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
}

module.exports = BucketController;
