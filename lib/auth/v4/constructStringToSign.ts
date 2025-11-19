import * as crypto from 'crypto';
import type { RequestLogger } from 'werelogs';
import createCanonicalRequest from './createCanonicalRequest';
import { type ArsenalRequest, ArsenalClientRequest } from '../../types/ArsenalRequest';

/**
 * constructStringToSign - creates V4 stringToSign
 * @param {object} params - params object
 * @returns {string} - stringToSign
 */
export default function constructStringToSign(params: {
    request: ArsenalRequest | ArsenalClientRequest;
    signedHeaders: any;
    payloadChecksum: any;
    credentialScope: string;
    timestamp: string;
    query: Record<string, string>;
    log?: RequestLogger;
    proxyPath?: string;
    awsService: string;
}): string {
    const {
        request,
        signedHeaders,
        payloadChecksum,
        credentialScope,
        timestamp,
        query,
        log,
        proxyPath,
    } = params;
    const path = proxyPath || request.path;

    console.log("FFFFF 611", request)
    console.log("FFFFF 612", request.path)
    console.log("FFFFF 613", signedHeaders)
    console.log("FFFFF 614", payloadChecksum)
    console.log("FFFFF 615", credentialScope)
    console.log("FFFFF 616", timestamp)
    console.log("FFFFF 617", query)
    console.log("FFFFF 618", proxyPath)
    console.log("FFFFF 619", request.method)
    console.log("FFFFF 620", params.awsService)

    const canonicalReqResult = createCanonicalRequest({
        pHttpVerb: request.method!,
        pResource: path,
        pQuery: query,
        pHeaders: request.headers,
        pSignedHeaders: signedHeaders,
        payloadChecksum,
        service: params.awsService,
    });

    if (log) {
        log.debug('constructed canonicalRequest', { canonicalReqResult });
    }
    console.log("FFFFF 640", canonicalReqResult)

    const sha256 = crypto.createHash('sha256');
    const canonicalHex = sha256.update(canonicalReqResult, 'binary')
        .digest('hex');
    console.log("FFFFF 641", canonicalHex)
    const stringToSign = `AWS4-HMAC-SHA256\n${timestamp}\n` +
    `${credentialScope}\n${canonicalHex}`;
    console.log("FFFFF 642", stringToSign)
    return stringToSign;
}
