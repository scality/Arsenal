const { responseNoBody, parseContentMD5, responseXMLBody } =
    require('../routesUtils');
const errors = require('../../errors');

class AuthController {
    static bucketPut(req, res, log) {
        // content-length for object is handled separately below
        const contentLength = req.headers['content-length'];
        if ((contentLength && (isNaN(contentLength) || contentLength < 0)) ||
            contentLength === '') {
            log.debug('invalid content-length header');
            return responseNoBody(errors.BadRequest, null, res, null, log);
        }
        return undefined;
    }

    /* eslint-disable no-param-reassign */
    static objectPutAction(req, res, log) {
        // PUT object, PUT object ACL, PUT object multipart or
        // PUT object copy
        // if content-md5 is not present in the headers, try to
        // parse content-md5 from meta headers

        if (req.headers['content-md5'] === '') {
            log.debug('empty content-md5 header', {
                method: 'routePUT',
            });
            return responseNoBody(errors.InvalidDigest, null, res, 200, log);
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
                log.debug('invalid md5 digest', { contentMD5: req.contentMD5 });
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
        return undefined;
    }

    static objectPut(req, res, log) {
        if (req.headers['content-length'] === undefined &&
        req.headers['x-amz-decoded-content-length'] === undefined) {
            return responseNoBody(errors.MissingContentLength, null, res, 411,
                log);
        }
        if (Number.isNaN(req.parsedContentLength) ||
        req.parsedContentLength < 0) {
            return responseNoBody(errors.BadRequest, null, res, 400, log);
        }
        log.end().addDefaultFields({ contentLength: req.parsedContentLength });
        return undefined;
    }
}

module.exports = AuthController;
