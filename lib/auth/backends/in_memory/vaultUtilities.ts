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

const sha256Digest = (key: string | Buffer, data: string) => {
    return crypto.createHmac('sha256', key).update(data, 'binary').digest();
};

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
    service?: string
): Buffer {
    const dateKey = sha256Digest(`AWS4${secretKey}`, scopeDate);
    const dateRegionKey = sha256Digest(dateKey, region);
    const dateRegionServiceKey = sha256Digest(dateRegionKey, service || 's3');
    const signingKey = sha256Digest(dateRegionServiceKey, 'aws4_request');
    return signingKey;
}
