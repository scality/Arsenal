import { Logger } from 'werelogs';
import errors from '../../errors';
import * as constants from '../../constants';
import algoCheck from './algoCheck';
import constructStringToSign from './constructStringToSign';

export function check(request: any, log: Logger, data: { [key: string]: string }, oTel: any) {
    const { activeSpan, activeTracerContext, tracer } = oTel;
    activeSpan?.addEvent('Entered query auth check');
    return tracer.startActiveSpan('Query Auth Check', undefined, activeTracerContext, authCheckSpan => {
        authCheckSpan.setAttributes({
            'code.lineno': 7,
            'code.filename': 'lib/auth/v2/queryAuthCheck.ts',
            'code.function': 'check',
            'code.url': 'https://github.com/scality/arsenal/blob/6876861b5dc54de656b164bfdbc908d04555de53/lib/auth/v2/queryAuthCheck.ts',
        });
        log.trace('running query auth check');
        activeSpan?.addEvent('Running query auth check');

        if (request.method === 'POST') {
            log.debug('query string auth not supported for post requests');
            activeSpan.recordException(errors.NotImplemented);
            authCheckSpan.end();
            return { err: errors.NotImplemented };
        }

        const token = data.SecurityToken;
        activeSpan?.addEvent('Extracting security token');
        if (token && !constants.iamSecurityToken.pattern.test(token)) {
            log.debug('invalid security token', { token });
            activeSpan.recordException(errors.InvalidToken);
            authCheckSpan.end();
            return { err: errors.InvalidToken };
        }
        activeSpan?.addEvent('Extracted security token');

        /*
        Check whether request has expired or if
        expires parameter is more than 604800000 milliseconds
        (7 days) in the future.
        Expires time is provided in seconds so need to
        multiply by 1000 to obtain
        milliseconds to compare to Date.now()
        */
        activeSpan?.addEvent('Checking expiration time');
        const expirationTime = parseInt(data.Expires, 10) * 1000;
        if (Number.isNaN(expirationTime)) {
            log.debug('invalid expires parameter', { expires: data.Expires });
            activeSpan.recordException(errors.MissingSecurityHeader);
            authCheckSpan.end();
            return { err: errors.MissingSecurityHeader };
        }
        activeSpan?.addEvent('Checked expiration time');

        const currentTime = Date.now();

        const preSignedURLExpiry = process.env.PRE_SIGN_URL_EXPIRY
            && !Number.isNaN(process.env.PRE_SIGN_URL_EXPIRY)
            ? Number.parseInt(process.env.PRE_SIGN_URL_EXPIRY, 10)
            : constants.defaultPreSignedURLExpiry * 1000;

        if (expirationTime > currentTime + preSignedURLExpiry) {
            log.debug('expires parameter too far in future', { expires: request.query.Expires });
            activeSpan.recordException(errors.AccessDenied);
            authCheckSpan.end();
            return { err: errors.AccessDenied };
        }
        if (currentTime > expirationTime) {
            log.debug('current time exceeds expires time', { expires: request.query.Expires });
            activeSpan.recordException(errors.RequestTimeTooSkewed);
            authCheckSpan.end();
            return { err: errors.RequestTimeTooSkewed };
        }

        const accessKey = data.AWSAccessKeyId;
        // @ts-ignore
        log.addDefaultFields({ accessKey });

        const signatureFromRequest = decodeURIComponent(data.Signature);
        log.trace('signature from request', { signatureFromRequest });
        activeSpan?.addEvent('Extracting signature from request');

        if (!accessKey || !signatureFromRequest) {
            log.debug('invalid access key/signature parameters');
            activeSpan.recordException(errors.MissingSecurityHeader);
            authCheckSpan.end();
            return { err: errors.MissingSecurityHeader };
        }

        const stringToSign = constructStringToSign(request, data, log);
        log.trace('constructed string to sign', { stringToSign });
        activeSpan?.addEvent('Constructed string to sign2');

        const algo = algoCheck(signatureFromRequest.length);
        log.trace('algo for calculating signature', { algo });
        activeSpan?.addEvent('Checked algorithm for calculating signature');

        if (algo === undefined) {
            activeSpan.recordException(errors.InvalidArgument);
            authCheckSpan.end();
            return { err: errors.InvalidArgument };
        }

        activeSpan?.addEvent('Exiting query auth check');
        authCheckSpan.end();
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
    });
}

