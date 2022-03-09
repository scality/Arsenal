import * as crypto from 'crypto';
import * as constants from '../../../constants';

/**
 * Constructs stringToSign for chunk
 * @param timestamp - date parsed from headers in ISO 8601 format: YYYYMMDDTHHMMSSZ
 * @param credentialScope - items from auth header plus the string
 *   'aws4_request' joined with '/':
 * timestamp/region/aws-service/aws4_request
 * @param lastSignature - signature from headers or prior chunk
 * @param justDataChunk - data portion of chunk
 */
export default function constructChunkStringToSign(
    timestamp: string,
    credentialScope: string,
    lastSignature: string,
    justDataChunk: string | Buffer | null
): string {
    let currentChunkHash: string;
    // for last chunk, there will be no data, so use emptyStringHash
    if (!justDataChunk) {
        currentChunkHash = constants.emptyStringHash;
    } else {
        let hash = crypto.createHash('sha256');
        currentChunkHash = (
            typeof justDataChunk === 'string'
                ? hash.update(justDataChunk, 'binary')
                : hash.update(justDataChunk)
        ).digest('hex');
    }
    return (
        `AWS4-HMAC-SHA256-PAYLOAD\n${timestamp}\n` +
        `${credentialScope}\n${lastSignature}\n` +
        `${constants.emptyStringHash}\n${currentChunkHash}`
    );
}
