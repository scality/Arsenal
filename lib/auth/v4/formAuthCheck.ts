import { Logger } from 'werelogs';
import * as constants from '../../constants';
import errors from '../../errors';
import { convertAmzTimeToMs } from './timeUtils';
import { validateCredentials, extractFormParams } from './validateInputs';

/**
 * V4 query auth check
 * @param request - HTTP request object
 * @param log - logging object
 * @param data - Contain authentification params (GET or POST data)
 */
export function check(request: any, log: Logger, data: { [key: string]: string }) {
    const authParams = extractFormParams(data, log);

    if (Object.keys(authParams).length !== 4) {
        return { err: errors.InvalidArgument };
    }

    const token = data['x-amz-security-token'];
    if (token && !constants.iamSecurityToken.pattern.test(token)) {
        log.debug('invalid security token', { token });
        return { err: errors.InvalidToken };
    }

    // const signedHeaders = authParams.signedHeaders!;
    const signatureFromRequest = authParams.signatureFromRequest!;
    const timestamp = authParams.timestamp!;
    const expiration = authParams.expiration!;
    const credential = authParams.credential!;

    // check if the expiration date is passed the current time
    if (Date.parse(expiration) < Date.now()) {
        return { err: errors.RequestExpired };
    }

    const validationResult = validateCredentials(credential, timestamp,
      log);
    if (validationResult instanceof Error) {
        log.debug('credentials in improper format', { credential,
            timestamp, validationResult });
        return { err: validationResult };
    }
    const accessKey = credential[0];
    const scopeDate = credential[1];
    const region = credential[2];
    const service = credential[3];

    // string to sign is the policy for form requests
    const stringToSign = data['policy'];

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
                service,
                authType: 'REST-FORM-DATA',
                signatureVersion: 'AWS4-HMAC-SHA256',
                signatureAge: Date.now() - convertAmzTimeToMs(timestamp),
                timestamp,
                securityToken: token,
            },
        },
    };
}
