'use strict'; // eslint-disable-line strict

const crypto = require('crypto');

const createCanonicalRequest = require('./createCanonicalRequest');

/**
 * constructStringToSign - creates V4 stringToSign
 * @param {object} params - params object
 * @returns {string} - stringToSign
 */
function constructStringToSign(params) {
    const { request, signedHeaders, payloadChecksum, credentialScope, timestamp,
        query, log, proxyPath } = params;
    const path = proxyPath || request.path;

    const canonicalReqResult = createCanonicalRequest({
        pHttpVerb: request.method,
        pResource: path,
        pQuery: query,
        pHeaders: request.headers,
        pSignedHeaders: signedHeaders,
        payloadChecksum,
        service: params.awsService,
    });

    if (canonicalReqResult instanceof Error) {
        if (log) {
            log.error('error creating canonicalRequest');
        }
        return canonicalReqResult;
    }
    if (log) {
        log.debug('constructed canonicalRequest', { canonicalReqResult });
    }
    const sha256 = crypto.createHash('sha256');
    const canonicalHex = sha256.update(canonicalReqResult, 'binary')
        .digest('hex');
    const stringToSign = `AWS4-HMAC-SHA256\n${timestamp}\n` +
    `${credentialScope}\n${canonicalHex}`;
    return stringToSign;
}

module.exports = constructStringToSign;
