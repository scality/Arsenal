import { Logger } from 'werelogs';
import errors from '../../errors';
import * as constants from '../../constants';
import constructStringToSign from './constructStringToSign';
import checkRequestExpiry from './checkRequestExpiry';
import algoCheck from './algoCheck';

export function check(request: any, log: Logger, data: { [key: string]: string }, oTel: any) {
    const { activeSpan, activeTracerContext, tracer } = oTel;
    activeSpan?.addEvent('Entered V2 header auth check');
    return tracer.startActiveSpan('Check auth headers with Arsenal', undefined, activeTracerContext, authCheckSpan => {
        authCheckSpan.setAttributes({
            'code.lineno': 8,
            'code.filename': 'lib/auth/v2/headerAuthCheck.ts',
            'code.function': 'check',
            'code.url': 'https://github.com/scality/arsenal/blob/6876861b5dc54de656b164bfdbc908d04555de53/lib/auth/v2/headerAuthCheck.ts'
        });
        log.trace('running header auth check');
        activeSpan?.addEvent('Running header auth check');

        const headers = request.headers;

        activeSpan?.addEvent('Extracting security token');
        const token = headers['x-amz-security-token'];
        if (token && !constants.iamSecurityToken.pattern.test(token)) {
            log.debug('invalid security token', { token });
            activeSpan.recordException(errors.InvalidToken);
            authCheckSpan.end();
            return { err: errors.InvalidToken };
        }
        activeSpan?.addEvent('Extracted security token');

        activeSpan?.addEvent('Checking timestamp');
        // Check to make sure timestamp is within 15 minutes of current time
        let timestamp = headers['x-amz-date'] ? headers['x-amz-date'] : headers.date;
        timestamp = Date.parse(timestamp);
        if (!timestamp) {
            log.debug('missing or invalid date header', { method: 'auth/v2/headerAuthCheck.check' });
            activeSpan.recordException(errors.AccessDenied.customizeDescription('Authentication requires a valid Date or x-amz-date header'));
            authCheckSpan.end();
            return { err: errors.AccessDenied.customizeDescription('Authentication requires a valid Date or x-amz-date header') };
        }
        activeSpan?.addEvent('Checked timestamp');

        activeSpan?.addEvent('Checking request expiry');
        const err = checkRequestExpiry(timestamp, log);
        if (err) {
            activeSpan.recordException(err);
            authCheckSpan.end();
            return { err };
        }
        activeSpan?.addEvent('Checked request expiry');

        activeSpan?.addEvent('Extracting authorization header');
        // Authorization Header should be in the format of 'AWS AccessKey:Signature'
        const authInfo = headers.authorization;
        activeSpan?.addEvent('Extracted authorization header');

        if (!authInfo) {
            log.debug('missing authorization security header');
            activeSpan.recordException(errors.MissingSecurityHeader);
            authCheckSpan.end();
            return { err: errors.MissingSecurityHeader };
        }
        const semicolonIndex = authInfo.indexOf(':');
        if (semicolonIndex < 0) {
            log.debug('invalid authorization header', { authInfo });
            activeSpan.recordException(errors.InvalidArgument);
            authCheckSpan.end();
            return { err: errors.InvalidArgument };
        }
        const accessKey = semicolonIndex > 4 ? authInfo.substring(4, semicolonIndex).trim() : undefined;
        if (typeof accessKey !== 'string' || accessKey.length === 0) {
            log.trace('invalid authorization header', { authInfo });
            activeSpan.recordException(errors.MissingSecurityHeader);
            authCheckSpan.end();
            return { err: errors.MissingSecurityHeader };
        }
        // @ts-ignore
        log.addDefaultFields({ accessKey });

        const signatureFromRequest = authInfo.substring(semicolonIndex + 1).trim();
        log.trace('signature from request', { signatureFromRequest });
        activeSpan?.addEvent('Extracting signature from request');

        activeSpan?.addEvent('Constructing string to sign');
        const stringToSign = constructStringToSign(request, data, log);
        log.trace('constructed string to sign', { stringToSign });
        activeSpan?.addEvent('Constructed string to sign1');

        const algo = algoCheck(signatureFromRequest.length);
        log.trace('algo for calculating signature', { algo });
        activeSpan?.addEvent('Checked algorithm for calculating signature');

        if (algo === undefined) {
            activeSpan.recordException(errors.InvalidArgument);
            authCheckSpan.end();
            return { err: errors.InvalidArgument };
        }

        activeSpan?.addEvent('Exiting V2 header auth check');
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
                    authType: 'REST-HEADER',
                    signatureVersion: 'AWS',
                    signatureAge: Date.now() - timestamp,
                    securityToken: token,
                },
            },
        };
    });
}

