import { Logger } from 'werelogs';
import errors from '../../../lib/errors';
import * as constants from '../../constants';
import constructStringToSign from './constructStringToSign';
import {
    checkTimeSkew,
    convertUTCtoISO8601,
    convertAmzTimeToMs,
} from './timeUtils';
import {
    extractAuthItems,
    validateCredentials,
    areSignedHeadersComplete,
} from './validateInputs';

/**
 * V4 header auth check
 * @param request - HTTP request object
 * @param log - logging object
 * @param data - Parameters from queryString parsing or body of
 *      POST request
 * @param awsService - Aws service ('iam' or 's3')
 */
export function check(
    request: any,
    log: Logger,
    data: { [key: string]: string },
    awsService: string
) {
    log.trace('running header auth check');

    const token = request.headers['x-amz-security-token'];
    if (token && !constants.iamSecurityToken.pattern.test(token)) {
        log.debug('invalid security token', { token });
        return { err: errors.InvalidToken };
    }

    // authorization header
    const authHeader = request.headers.authorization;
    if (!authHeader) {
        log.debug('missing authorization header');
        return { err: errors.MissingSecurityHeader };
    }

    const authHeaderItems = extractAuthItems(authHeader, log);
    if (Object.keys(authHeaderItems).length < 3) {
        log.debug('invalid authorization header', { authHeader });
        return { err: errors.InvalidArgument };
    }

    const payloadChecksum = request.headers['x-amz-content-sha256'];
    if (!payloadChecksum && awsService !== 'iam') {
        log.debug('missing payload checksum');
        return { err: errors.MissingSecurityHeader };
    }
    if (payloadChecksum === 'STREAMING-AWS4-HMAC-SHA256-PAYLOAD') {
        log.trace('requesting streaming v4 auth');
        if (request.method !== 'PUT') {
            log.debug('streaming v4 auth for put only', {
                method: 'auth/v4/headerAuthCheck.check',
            });
            return { err: errors.InvalidArgument };
        }
        if (!request.headers['x-amz-decoded-content-length']) {
            return { err: errors.MissingSecurityHeader };
        }
    }

    log.trace('authorization header from request', { authHeader });

    const signatureFromRequest = authHeaderItems.signatureFromRequest!;
    const credentialsArr = authHeaderItems.credentialsArr!;
    const signedHeaders = authHeaderItems.signedHeaders!;

    if (!areSignedHeadersComplete(signedHeaders, request.headers)) {
        log.debug('signedHeaders are incomplete', { signedHeaders });
        return { err: errors.AccessDenied };
    }

    let timestamp: string | undefined;
    // check request timestamp
    const xAmzDate = request.headers['x-amz-date'];
    if (xAmzDate) {
        const xAmzDateArr = xAmzDate.split('T');
        // check that x-amz- date has the correct format and after epochTime
        if (
            xAmzDateArr.length === 2 &&
            xAmzDateArr[0].length === 8 &&
            xAmzDateArr[1].length === 7 &&
            Number.parseInt(xAmzDateArr[0], 10) > 19700101
        ) {
            // format of x-amz- date is ISO 8601: YYYYMMDDTHHMMSSZ
            timestamp = request.headers['x-amz-date'];
        }
    } else if (request.headers.date) {
        timestamp = convertUTCtoISO8601(request.headers.date);
    }
    if (!timestamp) {
        log.debug('missing or invalid date header', {
            method: 'auth/v4/headerAuthCheck.check',
        });
        return {
            err: errors.AccessDenied.customizeDescription(
                'Authentication requires a valid Date or ' + 'x-amz-date header'
            ),
        };
    }

    const validationResult = validateCredentials(
        credentialsArr,
        timestamp,
        log
    );
    if (validationResult instanceof Error) {
        log.debug('credentials in improper format', {
            credentialsArr,
            timestamp,
            validationResult,
        });
        return { err: validationResult };
    }
    // credentialsArr is [accessKey, date, region, aws-service, aws4_request]
    const scopeDate = credentialsArr[1];
    const region = credentialsArr[2];
    const service = credentialsArr[3];
    const accessKey = credentialsArr.shift();
    const credentialScope = credentialsArr.join('/');

    // In AWS Signature Version 4, the signing key is valid for up to seven days
    // (see Introduction to Signing Requests.
    // Therefore, a signature is also valid for up to seven days or
    // less if specified by a bucket policy.
    // Since policies are not yet implemented, we will have a 15
    // minute default like in v2 Auth.
    // See http://docs.aws.amazon.com/AmazonS3/latest/API/
    // bucket-policy-s3-sigv4-conditions.html
    // TODO: When implementing bucket policies,
    // note that expiration can be shortened so
    // expiry is as set out in the policy.

    // 15 minutes in seconds
    const expiry = 15 * 60;
    const isTimeSkewed = checkTimeSkew(timestamp, expiry, log);
    if (isTimeSkewed) {
        return { err: errors.RequestTimeTooSkewed };
    }

    let proxyPath: string | null = null;
    if (request.headers.proxy_path) {
        try {
            proxyPath = decodeURIComponent(request.headers.proxy_path);
        } catch (err) {
            log.debug('invalid proxy_path header', { proxyPath, err });
            return {
                err: errors.InvalidArgument.customizeDescription(
                    'invalid proxy_path header'
                ),
            };
        }
    }

    const stringToSign = constructStringToSign({
        log,
        request,
        query: data,
        signedHeaders,
        credentialScope,
        timestamp,
        payloadChecksum,
        awsService: service,
        proxyPath: proxyPath!,
    });
    log.trace('constructed stringToSign', { stringToSign });
    // TODO Why?
    // @ts-ignore
    if (stringToSign instanceof Error) {
        return { err: stringToSign };
    }

    return {
        err: null,
        params: {
            version: 4,
            data: {
                accessKey,
                signatureFromRequest,
                region,
                service,
                scopeDate,
                stringToSign,
                authType: 'REST-HEADER',
                signatureVersion: 'AWS4-HMAC-SHA256',
                signatureAge: Date.now() - convertAmzTimeToMs(timestamp),
                // credentialScope and timestamp needed for streaming V4
                // chunk evaluation
                credentialScope,
                timestamp,
                securityToken: token,
            },
        },
    };
}
