import * as crypto from 'crypto';

/** hashSignature for v2 Auth
 * @param {string} stringToSign - built string to sign per AWS rules
 * @param {string} secretKey - user's secretKey
 * @param {string} algorithm - either SHA256 or SHA1
 * @return {string} reconstructed signature
 */
export function hashSignature(
    stringToSign: string,
    secretKey: string,
    algorithm: 'SHA256' | 'SHA1'
): string {
    const hmacObject = crypto.createHmac(algorithm, secretKey);
    return hmacObject.update(stringToSign, 'binary').digest('base64');
}

/** calculateSigningKey for v4 Auth
 * @param {string} secretKey - requester's secretKey
 * @param {string} region - region included in request
 * @param {string} scopeDate - scopeDate included in request
 * @param {string} [service] - To specify another service than s3
 * @return {string} signingKey - signingKey to calculate signature
 */
export function calculateSigningKey(
    secretKey: string,
    region: string,
    scopeDate: string,
    service: string
): string {
    const dateKey = crypto.createHmac('sha256', `AWS4${secretKey}`)
        .update(scopeDate, 'binary').digest();
    const dateRegionKey = crypto.createHmac('sha256', dateKey)
        .update(region, 'binary').digest();
    const dateRegionServiceKey = crypto.createHmac('sha256', dateRegionKey)
        .update(service || 's3', 'binary').digest();
    const signingKey = crypto.createHmac('sha256', dateRegionServiceKey)
        .update('aws4_request', 'binary').digest();
    return signingKey;
}
