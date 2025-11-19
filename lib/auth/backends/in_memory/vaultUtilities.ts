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

const sha256Digest = (key: string | Buffer, data: string) => 
    crypto.createHmac('sha256', key).update(data, 'binary').digest();

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
    console.log("AA 1", dateKey)
    const dateRegionKey = sha256Digest(dateKey, region);
    console.log("AA 2", dateRegionKey)
    const dateRegionServiceKey = sha256Digest(dateRegionKey, service || 's3');
    console.log("AA 3", dateRegionServiceKey)
    const signingKey = sha256Digest(dateRegionServiceKey, 'aws4_request');
    console.log("AA 4", signingKey)

    // const s = `AWS4-HMAC-SHA256\n20251120T005912Z\n20251120/us-east-1/s3/aws4_request\nf2adc12c6f12f0709ee37345c030a02f6371255d925b8345319e6c9406a5a87e`


    // const reconstructedSig = crypto.createHmac('sha256', signingKey)
                // .update(s, 'binary').digest('hex');
    // console.log("AA 5", reconstructedSig)
    return signingKey;
}

// calculateSigningKey(
//     "DJ7MI3CYCGxhbaLYToO/pwJVlboD6HXMlKPxEcyf",
//     "us-east-1",
//     "20251120",
// )


// AA 1 <Buffer 91 f9 5e 46 4f 16 6a 97 ff 6b 69 fe 82 e2 cb 57 ce cf cc 77 2a 03 54 e4 cf 94 47 ad 89 41 2d c8>
// AA 2 <Buffer 06 89 14 e8 89 a9 e4 ed 1a e6 26 7e 11 91 ef 3a 91 9c 63 7c ee 85 52 4d 3e 10 e0 51 63 4d f4 71>
// AA 3 <Buffer eb 6f 8e cb 01 fb 83 69 bf bd b4 5f e5 68 50 a5 93 53 97 d7 e8 13 a0 eb 22 a5 f8 fc 7a 82 fc 2d>
// AA 4 <Buffer 92 93 22 18 fa d6 c7 c7 37 4f 77 47 ad 8d e8 e1 02 81 c5 26 b3 26 ce 17 b9 7c c9 58 24 ff 35 ca>
// AA 5 c000d8d6134baa8faa838e9735309da90aa270631d30335b5b9bfe4698131708
// oui