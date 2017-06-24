const { responseNoBody, responseXMLBody, parseContentMD5 } =
    require('../routesUtils');
const errors = require('../../errors');
const BucketController = require('../controller/BucketController');

class Router {

    constructor(routes) {
        this._routes = routes;
        this._controllers = { BucketController };
        return this;
    }

    _matchRoute(route, req) {
        const query = route.query || [];
        const headers = route.headers || [];
        return req.method === route.method &&
            Boolean(req.bucketName) === Boolean(route.bucket) &&
            Boolean(req.objectKey) === Boolean(route.object) &&
            query.every(q => q in req.query) &&
            headers.every(h => h in req.headers);
    }

    _handleResponse(req, res, api, log) {
        if (req.method === 'PUT' && req.objectKey === undefined) {
            // content-length for object is handled separately below
            const contentLength = req.headers['content-length'];
            if ((contentLength &&
                (isNaN(contentLength) || contentLength < 0)) ||
                contentLength === '') {
                log.debug('invalid content-length header');
                return responseNoBody(errors.BadRequest, null, res, null, log);
            }
        }
        /* eslint-disable no-param-reassign */
        if (req.method === 'PUT' && req.objectKey !== undefined) {
            // PUT object, PUT object ACL, PUT object multipart or
            // PUT object copy
            // if content-md5 is not present in the headers, try to
            // parse content-md5 from meta headers

            if (req.headers['content-md5'] === '') {
                log.debug('empty content-md5 header', {
                    method: 'routePUT',
                });
                return responseNoBody(errors.InvalidDigest, null, res, 200,
                    log);
            }
            if (req.headers['content-md5']) {
                req.contentMD5 = req.headers['content-md5'];
            } else {
                req.contentMD5 = parseContentMD5(req.headers);
            }
            if (req.contentMD5 && req.contentMD5.length !== 32) {
                req.contentMD5 = Buffer.from(req.contentMD5, 'base64')
                    .toString('hex');
                if (req.contentMD5 && req.contentMD5.length !== 32) {
                    log.debug('invalid md5 digest', {
                        contentMD5: req.contentMD5,
                    });
                    return responseNoBody(errors.InvalidDigest, null, res, 200,
                                        log);
                }
            }
            const encryptionHeaders = [
                'x-amz-server-side-encryption',
                'x-amz-server-side-encryption-customer-algorithm',
                'x-amz-server-side-encryption-aws-kms-key-id',
                'x-amz-server-side-encryption-context',
                'x-amz-server-side-encryption-customer-key',
                'x-amz-server-side-encryption-customer-key-md5',
            ];
            // object level encryption
            if (encryptionHeaders.some(i => req.headers[i] !== undefined)) {
                return responseXMLBody(errors.NotImplemented, null, res, log);
            }
        }

        if ((req.method === 'PUT' && req.objectKey !== undefined) &&
        !req.query.partNumber &&
        req.query.acl === undefined &&
        req.query.tagging === undefined &&
        !req.headers['x-amz-copy-source']) {
            if (req.headers['content-length'] === undefined &&
            req.headers['x-amz-decoded-content-length'] === undefined) {
                return responseNoBody(errors.MissingContentLength, null, res,
                    411, log);
            }
            if (Number.isNaN(req.parsedContentLength) ||
            req.parsedContentLength < 0) {
                return responseNoBody(errors.BadRequest, null, res, 400, log);
            }
            log.end().addDefaultFields({
                contentLength: req.parsedContentLength,
            });
        }

        return undefined;
    }

    exec(req, res, api, log, statsClient) {
        const route = this._routes.find(r => this._matchRoute(r, req));
        const response = this._handleResponse(req, res, api, log);
        if (response !== undefined) {
            return response;
        }
        const { controller, action } = route;
        const routeMethod = this._controllers[controller][action];
        return routeMethod(action, req, res, api, log, statsClient);
    }
}

module.exports = Router;
