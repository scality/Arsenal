import { Logger } from 'werelogs';
import * as constants from '../../constants';
import errors from '../../errors';
import constructStringToSign from './constructStringToSign';
import { checkTimeSkew, convertAmzTimeToMs } from './timeUtils';
import { validateCredentials, extractFormParams } from './validateInputs';
import { areSignedHeadersComplete } from './validateInputs';

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
    //const expiry = authParams.expiry!;
    const credential = authParams.credential!;

    if (!areSignedHeadersComplete(signedHeaders, request.headers)) {
        log.debug('signedHeaders are incomplete', { signedHeaders });
        return { err: errors.AccessDenied };
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
    const requestType = credential[4];

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

    // string to sign is the policy
    const stringToSign = data['Policy'];
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
                authType: 'REST-QUERY-STRING',
                signatureVersion: 'AWS4-HMAC-SHA256',
                signatureAge: Date.now() - convertAmzTimeToMs(timestamp),
                securityToken: token,
            },
        },
    };
}

// /**
//  * V4 form auth check for POST Object request
//  * @param request - HTTP request object containing form data
//  * @param log - logging object
//  */
// export function check(request: any, log: Logger, formData: { [key: string]: string }) {
//     // Assume form data is already parsed and attached to request.body

//     // Extract authentication parameters from formData
//     const algorithm = formData['X-Amz-Algorithm'];
//     const credentials = formData['X-Amz-Credential'];
//     const date = formData['X-Amz-Date'];
//     const securityToken = formData['X-Amz-Security-Token'];
//     const signature = formData['X-Amz-Signature'];

//     let splitCredentials : [string, string, string, string, string];
//     if (credentials && credentials.length > 28 && credentials.indexOf('/') > -1) {
//         // @ts-ignore
//         splitCredentials = credentials.split('/');
//     } else {
//         log.debug('invalid credential param', { credentials,
//             date });
//         return { err: errors.InvalidArgument };
//     }

//     if (!algorithm || !splitCredentials || !date || !signature) {
//         return { err: errors.InvalidArgument };
//     }

//     // Validate the token if present
//     if (securityToken && !constants.iamSecurityToken.pattern.test(securityToken)) {
//         log.debug('invalid security token', { token: securityToken });
//         return { err: errors.InvalidToken };
//     }

//     // Checking credential format
//     const validationResult = validateCredentials(splitCredentials, date,
//         log);
//       if (validationResult instanceof Error) {
//           log.debug('credentials in improper format', { splitCredentials,
//               date, validationResult });
//           return { err: validationResult };
//       }

//     const accessKey = splitCredentials[0];
//     const scopeDate = splitCredentials[1];
//     const region = splitCredentials[2];
//     const service = splitCredentials[3];
//     const requestType = splitCredentials[4];

//     // Verifying the timestamp and potential expiration
//     const isTimeSkewed = checkTimeSkew(date, request.expiry, log);
//     if (isTimeSkewed) {
//         return { err: errors.RequestTimeTooSkewed };
//     }

//     // Extract signed headers
//     const signedHeaders = Object.keys(request.headers).map(key => key.toLowerCase()).sort().join(';');


//     const stringToSign = constructStringToSign({
//         request,
//         signedHeaders,
//         payloadChecksum: null,
//         credentialScope:
//             `${scopeDate}/${region}/${service}/${requestType}`,
//         timestamp: date,
//         query: formData,
//         log,
//         awsService: service,
//     });
//     if (stringToSign instanceof Error) {
//         return { err: stringToSign };
//     }
//     log.trace('constructed stringToSign', { stringToSign });

//     // If all checks are successful
//     return {
//         err: null,
//         params: {
//             version: 4,
//             data: {
//                 accessKey: accessKey,
//                 signatureFromRequest: signature,
//                 date: date,
//                 region: region,
//                 scopeDate: scopeDate,
//                 stringToSign: stringToSign,
//                 authType: 'POST-OBJECT',
//                 signatureVersion: 'AWS4-HMAC-SHA256',
//                 signatureAge: Date.now() - convertAmzTimeToMs(date),
//                 securityToken: securityToken,
//             }
//         }
//     };
// }
