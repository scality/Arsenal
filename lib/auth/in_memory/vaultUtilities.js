'use strict'; // eslint-disable-line strict

const crypto = require('crypto');

/** hashSignature for v2 Auth
 * @param {string} stringToSign - built string to sign per AWS rules
 * @param {string} secretKey - user's secretKey
 * @param {string} algorithm - either SHA256 or SHA1
 * @return {string} reconstructed signature
 */
function hashSignature(stringToSign, secretKey, algorithm) {
    const hmacObject = crypto.createHmac(algorithm, secretKey);
    return hmacObject.update(stringToSign).digest('base64');
}

/** calculateSigningKey for v4 Auth
 * @param {string} secretKey - requester's secretKey
 * @param {string} region - region included in request
 * @param {string} scopeDate - scopeDate included in request
 * @param {string} [service] - To specify another service than s3
 * @return {string} signingKey - signingKey to calculate signature
 */
function calculateSigningKey(secretKey, region, scopeDate, service) {
    const dateKey = crypto.createHmac('sha256', `AWS4${secretKey}`)
        .update(scopeDate).digest('binary');
    const dateRegionKey = crypto.createHmac('sha256', dateKey)
        .update(region).digest('binary');
    const dateRegionServiceKey = crypto.createHmac('sha256', dateRegionKey)
        .update(service || 's3').digest('binary');
    const signingKey = crypto.createHmac('sha256', dateRegionServiceKey)
        .update('aws4_request').digest('binary');
    return signingKey;
}

module.exports = { hashSignature, calculateSigningKey };
