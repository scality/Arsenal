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
export function check(request: any, log: Logger, data: { [key: string]: string }, oTel: any) {
    const {
        activeSpan,
        activeTracerContext,
        tracer,
    } = oTel;
    activeSpan?.addEvent('Arsenal:: entered Arsenal.auth.v4.queryAuthCheck');
    return tracer.startActiveSpan('Check auth headers with Arsenal', undefined, activeTracerContext, authCheckSpan => {
        authCheckSpan.setAttributes({
            'code.lineno': 15,
            'code.filename': 'lib/auth/v4/queryAuthCheck.ts',
            'code.function': 'check',
            'code.url': 'https://github.com/scality/arsenal/blob/6876861b5dc54de656b164bfdbc908d04555de53/lib/auth/v4/queryAuthCheck.ts'
        });
        activeSpan?.addEvent('Arsenal:: extracting query parameters')
        const authParams = extractQueryParams(data, log);
        activeSpan?.addEvent('Arsenal:: extracting query params');
        if (Object.keys(authParams).length !== 5) {
            activeSpan.recordException(errors.InvalidArgument);
            authCheckSpan.end();
            return { err: errors.InvalidArgument };
        }
    
        // Query params are not specified in AWS documentation as case-insensitive,
        // so we use case-sensitive
        const token = data['X-Amz-Security-Token'];
        if (token && !constants.iamSecurityToken.pattern.test(token)) {
            log.debug('invalid security token', { token });
            activeSpan.recordException(errors.InvalidToken);
            authCheckSpan.end();
            return { err: errors.InvalidToken };
        }
    
        const signedHeaders = authParams.signedHeaders!;
        const signatureFromRequest = authParams.signatureFromRequest!;
        const timestamp = authParams.timestamp!;
        const expiry = authParams.expiry!;
        const credential = authParams.credential!;
    
        if (!areSignedHeadersComplete(signedHeaders, request.headers)) {
            log.debug('signedHeaders are incomplete', { signedHeaders });
            activeSpan.recordException(errors.AccessDenied);
            authCheckSpan.end();
            return { err: errors.AccessDenied };
        }
    
        const validationResult = validateCredentials(credential, timestamp,
          log);
        if (validationResult instanceof Error) {
            log.debug('credentials in improper format', { credential,
                timestamp, validationResult });
            activeSpan.recordException(validationResult);
            authCheckSpan.end();
            return { err: validationResult };
        }
        const accessKey = credential[0];
        const scopeDate = credential[1];
        const region = credential[2];
        const service = credential[3];
        const requestType = credential[4];
    
        const isTimeSkewed = checkTimeSkew(timestamp, expiry, log);
        if (isTimeSkewed) {
            activeSpan.recordException(errors.RequestTimeTooSkewed);
            authCheckSpan.end();
            return { err: errors.RequestTimeTooSkewed };
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
    
        activeSpan?.addEvent('Constructing string to sign');
        const stringToSign = constructStringToSign({
            log,
            request,
            query: queryWithoutSignature,
            signedHeaders,
            payloadChecksum,
            timestamp,
            credentialScope:
                `${scopeDate}/${region}/${service}/${requestType}`,
            awsService: service,
        }, oTel);
        activeSpan?.addEvent('Constructed string to sign4');
        if (stringToSign instanceof Error) {
            activeSpan.recordException(stringToSign);
            authCheckSpan.end();
            return { err: stringToSign };
        }
        log.trace('constructed stringToSign', { stringToSign });
        activeSpan.addEvent('Arsenal:: exiting Arsenal.auth.v4.queryAuthCheck');
        authCheckSpan.end();
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
    });
}
