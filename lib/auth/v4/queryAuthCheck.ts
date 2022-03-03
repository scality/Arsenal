import { Logger } from 'werelogs';
import * as constants from '../../constants';
import errors from '../../errors';

import constructStringToSign from './constructStringToSign';
import { checkTimeSkew, convertAmzTimeToMs } from './timeUtils';
import { validateCredentials, extractQueryParams } from './validateInputs';
import { areSignedHeadersComplete } from './validateInputs';

/**
 * V4 query auth check
 * @param request - HTTP request object
 * @param log - logging object
 * @param data - Contain authentification params (GET or POST data)
 */
export function check(request: any, log: Logger, data: { [key: string]: string }) {
    const authParams = extractQueryParams(data, log);

    if (Object.keys(authParams).length !== 5) {
        return { err: errors.InvalidArgument };
    }

    // Query params are not specified in AWS documentation as case-insensitive,
    // so we use case-sensitive
    const token = data['X-Amz-Security-Token'];
    if (token && !constants.iamSecurityToken.pattern.test(token)) {
        log.debug('invalid security token', { token });
        return { err: errors.InvalidToken };
    }

    const signedHeaders = authParams.signedHeaders!;
    const signatureFromRequest = authParams.signatureFromRequest!;
    const timestamp = authParams.timestamp!;
    const expiry = authParams.expiry!;
    const credential = authParams.credential!;

    if (!areSignedHeadersComplete(signedHeaders, request.headers)) {
        log.debug('signedHeaders are incomplete', { signedHeaders });
        return { err: errors.AccessDenied };
    }

    const validationResult = validateCredentials(credential, timestamp, log);
    if (validationResult instanceof Error) {
        log.debug('credentials in improper format', {
            credential,
            timestamp,
            validationResult,
        });
        return { err: validationResult };
    }
    const accessKey = credential[0];
    const scopeDate = credential[1];
    const region = credential[2];
    const service = credential[3];
    const requestType = credential[4];

    const isTimeSkewed = checkTimeSkew(timestamp, expiry, log);
    if (isTimeSkewed) {
        return { err: errors.RequestTimeTooSkewed };
    }

    let proxyPath: string | null = null;
    if (request.headers.proxy_path) {
        try {
            proxyPath = decodeURIComponent(request.headers.proxy_path);
        } catch (err) {
            log.debug('invalid proxy_path header', { proxyPath });
            return {
                err: errors.InvalidArgument.customizeDescription(
                    'invalid proxy_path header'
                ),
            };
        }
    }

    // In query v4 auth, the canonical request needs
    // to include the query params OTHER THAN
    // the signature so create a
    // copy of the query object and remove
    // the X-Amz-Signature property.
    const queryWithoutSignature = Object.assign({}, data);
    delete queryWithoutSignature['X-Amz-Signature'];

    // For query auth, instead of a
    // checksum of the contents, the
    // string 'UNSIGNED-PAYLOAD' should be
    // added to the canonicalRequest in
    // building string to sign
    const payloadChecksum = 'UNSIGNED-PAYLOAD';

    const stringToSign = constructStringToSign({
        log,
        request,
        query: queryWithoutSignature,
        signedHeaders,
        payloadChecksum,
        timestamp,
        credentialScope: `${scopeDate}/${region}/${service}/${requestType}`,
        awsService: service,
        proxyPath: proxyPath!,
    });
    // TODO Why?
    // @ts-ignore
    if (stringToSign instanceof Error) {
        return { err: stringToSign };
    }
    log.trace('constructed stringToSign', { stringToSign });
    return {
        err: null,
        params: {
            version: 4,
            data: {
                accessKey,
                signatureFromRequest,
                region,
                scopeDate,
                stringToSign,
                authType: 'REST-QUERY-STRING',
                signatureVersion: 'AWS4-HMAC-SHA256',
                signatureAge: Date.now() - convertAmzTimeToMs(timestamp),
                securityToken: token,
            },
        },
    };
}
