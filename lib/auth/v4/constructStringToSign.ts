import * as crypto from 'crypto';
import { Logger } from 'werelogs';
import createCanonicalRequest from './createCanonicalRequest';

/**
 * constructStringToSign - creates V4 stringToSign
 * @param {object} params - params object
 * @returns {string} - stringToSign
 */
export default function constructStringToSign(params: {
    request: any;
    signedHeaders: any;
    payloadChecksum: any;
    credentialScope: string;
    timestamp: string;
    query: { [key: string]: string };
    log?: Logger;
    proxyPath?: string;
    awsService: string;
}): string | Error {
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

    const canonicalReqResult = createCanonicalRequest({
        pHttpVerb: request.method,
        pResource: path,
        pQuery: query,
        pHeaders: request.headers,
        pSignedHeaders: signedHeaders,
        payloadChecksum,
        service: params.awsService,
    });

    // TODO Why that line?
    // @ts-ignore
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
