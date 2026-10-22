import { Logger } from 'werelogs';
import * as constants from '../../constants';
import errors from '../../errors';
import { convertAmzTimeToMs } from './timeUtils';
import { validateCredentials } from './validateInputs';

/**
 * V4 query auth check
 * @param request - HTTP request object
 * @param log - logging object
 * @param data - Contain authentification params (GET or POST data)
 */
export function check(request: any, log: Logger, data: { [key: string]: string }) {
    let signatureFromRequest;
    let timestamp;
    let expiration;
    let credential;

    if (data['x-amz-algorithm'] !== 'AWS4-HMAC-SHA256') {
        log.debug('algorithm param incorrect', { algo: data['X-Amz-Algorithm'] });
        return { err: errors.InvalidArgument };
    }

    signatureFromRequest = data['x-amz-signature'];
    if (!signatureFromRequest) {
        log.debug('missing signature');
        return { err: errors.InvalidArgument };
    }

    timestamp = data['x-amz-date'];
    if (!timestamp || timestamp.length !== 16) {
        log.debug('missing or invalid timestamp', { timestamp: data['x-amz-date'] });
        return { err: errors.InvalidArgument };
    }

    const policy = data['policy'];
    if (policy && policy.length > 0) {
        const decryptedPolicy = Buffer.from(policy, 'base64').toString('utf8');
        const policyObj = JSON.parse(decryptedPolicy);
        expiration = policyObj.expiration;
    } else {
        log.debug('missing or invalid policy', { policy: data['policy'] });
        return { err: errors.InvalidArgument };
    }

    credential = data['x-amz-credential'];
    if (credential && credential.length > 28 && credential.indexOf('/') > -1) {
        // @ts-ignore
        credential = credential.split('/');
        const validationResult = validateCredentials(credential, timestamp,
            log);
          if (validationResult instanceof Error) {
              log.debug('credentials in improper format', { credential,
                  timestamp, validationResult });
              return { err: validationResult };
          }
    } else {
        log.debug('invalid credential param', { credential: data['X-Amz-Credential'] });
        return { err: errors.InvalidArgument };
    }

    const token = data['x-amz-security-token'];
    if (token && !constants.iamSecurityToken.pattern.test(token)) {
        log.debug('invalid security token', { token });
        return { err: errors.InvalidToken };
    }

    // check if the expiration date is past the current time
    if (Date.parse(expiration) < Date.now()) {
        return { err: errors.AccessDenied.customizeDescription('Invalid according to Policy: Policy expired.') };
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
