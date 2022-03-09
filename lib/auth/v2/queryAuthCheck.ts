import { Logger } from 'werelogs';
import errors from '../../errors';
import * as constants from '../../constants';
import algoCheck from './algoCheck';
import constructStringToSign from './constructStringToSign';

export function check(request: any, log: Logger, data: { [key: string]: string }) {
    log.trace('running query auth check');
    if (request.method === 'POST') {
        log.debug('query string auth not supported for post requests');
        return { err: errors.NotImplemented };
    }

    const token = data.SecurityToken;
    if (token && !constants.iamSecurityToken.pattern.test(token)) {
        log.debug('invalid security token', { token });
        return { err: errors.InvalidToken };
    }

    /*
    Check whether request has expired or if
    expires parameter is more than 604800000 milliseconds
    (7 days) in the future.
    Expires time is provided in seconds so need to
    multiply by 1000 to obtain
    milliseconds to compare to Date.now()
    */
    const expirationTime = parseInt(data.Expires, 10) * 1000;
    if (Number.isNaN(expirationTime)) {
        log.debug('invalid expires parameter',
            { expires: data.Expires });
        return { err: errors.MissingSecurityHeader };
    }

    const currentTime = Date.now();

    const preSignedURLExpiry = process.env.PRE_SIGN_URL_EXPIRY
        && !Number.isNaN(process.env.PRE_SIGN_URL_EXPIRY)
        ? Number.parseInt(process.env.PRE_SIGN_URL_EXPIRY, 10)
        : constants.defaultPreSignedURLExpiry * 1000;

    if (expirationTime > currentTime + preSignedURLExpiry) {
        log.debug('expires parameter too far in future',
            { expires: request.query.Expires });
        return { err: errors.AccessDenied };
    }
    if (currentTime > expirationTime) {
        log.debug('current time exceeds expires time',
            { expires: request.query.Expires });
        return { err: errors.RequestTimeTooSkewed };
    }
    const accessKey = data.AWSAccessKeyId;
    // @ts-ignore
    log.addDefaultFields({ accessKey });

    const signatureFromRequest = decodeURIComponent(data.Signature);
    log.trace('signature from request', { signatureFromRequest });
    if (!accessKey || !signatureFromRequest) {
        log.debug('invalid access key/signature parameters');
        return { err: errors.MissingSecurityHeader };
    }
    const stringToSign = constructStringToSign(request, data, log);
    log.trace('constructed string to sign', { stringToSign });
    const algo = algoCheck(signatureFromRequest.length);
    log.trace('algo for calculating signature', { algo });
    if (algo === undefined) {
        return { err: errors.InvalidArgument };
    }
    return {
        err: null,
        params: {
            version: 2,
            data: {
                accessKey,
                signatureFromRequest,
                stringToSign,
                algo,
                authType: 'REST-QUERY-STRING',
                signatureVersion: 'AWS',
                securityToken: token,
            },
        },
    };
}
