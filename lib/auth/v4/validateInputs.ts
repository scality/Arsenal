import { Logger } from 'werelogs';
import errors from '../../../lib/errors';

/**
 * Validate Credentials
 * @param credentials - contains accessKey, scopeDate,
 * region, service, requestType
 * @param timestamp - timestamp from request in
 * the format of ISO 8601: YYYYMMDDTHHMMSSZ
 * @param log - logging object
 */
export function validateCredentials(
    credentials: [string, string, string, string, string],
    timestamp: string,
    log: Logger
): Error | {} {
    if (!Array.isArray(credentials) || credentials.length !== 5) {
        log.warn('credentials in improper format', { credentials });
        return errors.InvalidArgument;
    }
    // credentials[2] (region) is not read intentionally
    const accessKey = credentials[0];
    const scopeDate = credentials[1];
    const service = credentials[3];
    const requestType = credentials[4];
    if (accessKey.length < 1) {
        log.warn('accessKey provided is wrong format', { accessKey });
        return errors.InvalidArgument;
    }
     // The scope date (format YYYYMMDD) must be same date as the timestamp
     // on the request from the x-amz-date param (if queryAuthCheck)
     // or from the x-amz-date header or date header (if headerAuthCheck)
     // Format of timestamp is ISO 8601: YYYYMMDDTHHMMSSZ.
     // http://docs.aws.amazon.com/AmazonS3/latest/API/
     // sigv4-query-string-auth.html
     // http://docs.aws.amazon.com/general/latest/gr/
     // sigv4-date-handling.html

     // convert timestamp to format of scopeDate YYYYMMDD
    const timestampDate = timestamp.split('T')[0];
    if (scopeDate.length !== 8 || scopeDate !== timestampDate) {
        log.warn('scope date must be the same date as the timestamp date',
           { scopeDate, timestampDate });
        return errors.RequestTimeTooSkewed;
    }
    if (service !== 's3' && service !== 'iam' && service !== 'ring' &&
        service !== 'sts') {
        log.warn('service in credentials is not one of s3/iam/ring/sts', {
            service,
        });
        return errors.InvalidArgument;
    }
    if (requestType !== 'aws4_request') {
        log.warn('requestType contained in params is not aws4_request',
           { requestType });
        return errors.InvalidArgument;
    }
    return {};
}

/**
 * Extract and validate components from query object
 * @param  queryObj - query object from request
 * @param log - logging object
 * @return object containing extracted query params for authV4
 */
export function extractQueryParams(
    queryObj: { [key: string]: string | undefined },
    log: Logger
) {
    const authParams: {
        signedHeaders?: string;
        signatureFromRequest?: string;
        timestamp?: string;
        expiry?: number;
        credential?: [string, string, string, string, string];
    } = {};

    // Do not need the algorithm sent back
    if (queryObj['X-Amz-Algorithm'] !== 'AWS4-HMAC-SHA256') {
        log.warn('algorithm param incorrect',
        { algo: queryObj['X-Amz-Algorithm'] });
        return authParams;
    }

    const signedHeaders = queryObj['X-Amz-SignedHeaders'];
    // At least "host" must be included in signed headers
    if (signedHeaders && signedHeaders.length > 3) {
        authParams.signedHeaders = signedHeaders;
    } else {
        log.warn('missing signedHeaders');
        return authParams;
    }


    const signature = queryObj['X-Amz-Signature'];
    if (signature && signature.length === 64) {
        authParams.signatureFromRequest = signature;
    } else {
        log.warn('missing signature');
        return authParams;
    }

    const timestamp = queryObj['X-Amz-Date'];
    if (timestamp && timestamp.length === 16) {
        authParams.timestamp = timestamp;
    } else {
        log.warn('missing or invalid timestamp',
            { timestamp: queryObj['X-Amz-Date'] });
        return authParams;
    }

    const expiry = Number.parseInt(queryObj['X-Amz-Expires'] ?? 'nope', 10);
    const sevenDays = 604800;
    if (expiry && (expiry > 0 && expiry <= sevenDays)) {
        authParams.expiry = expiry;
    } else {
        log.warn('invalid expiry', { expiry });
        return authParams;
    }

    const credential = queryObj['X-Amz-Credential'];
    if (credential && credential.length > 28 && credential.indexOf('/') > -1) {
        // @ts-ignore
        authParams.credential = credential.split('/');
    } else {
        log.warn('invalid credential param', { credential });
        return authParams;
    }
    return authParams;
}


/**
 * Extract and validate components from formData object
 * @param  formObj - formData object from request
 * @param log - logging object
 * @return object containing extracted query params for authV4
 */
export function extractFormParams(
    formObj: { [key: string]: string | undefined },
    log: Logger
) {
    const authParams: {
        signedHeaders?: string;
        signatureFromRequest?: string;
        timestamp?: string;
        expiry?: number;
        credential?: [string, string, string, string, string];
    } = {};

    // Do not need the algorithm sent back
    if (formObj['X-Amz-Algorithm'] !== 'AWS4-HMAC-SHA256') {
        log.warn('algorithm param incorrect',
        { algo: formObj['X-Amz-Algorithm'] });
        return authParams;
    }

    // adding placeholder for signedHeaders to satisfy Vault
    // as this is not required for form auth
    authParams.signedHeaders = 'content-type;host;x-amz-date;x-amz-security-token';

    const signature = formObj['X-Amz-Signature'];
    if (signature && signature.length === 64) {
        authParams.signatureFromRequest = signature;
    } else {
        log.warn('missing signature');
        return authParams;
    }

    const timestamp = formObj['X-Amz-Date'];
    if (timestamp && timestamp.length === 16) {
        authParams.timestamp = timestamp;
    } else {
        log.warn('missing or invalid timestamp',
            { timestamp: formObj['X-Amz-Date'] });
        return authParams;
    }

    // TODO? ARSN-414 Does not seem to be required for form auth
    // const expiry = Number.parseInt(formObj['X-Amz-Expires'] ?? 'nope', 10);
    // const sevenDays = 604800;
    // if (expiry && (expiry > 0 && expiry <= sevenDays)) {
    //     authParams.expiry = expiry;
    // } else {
    //     log.warn('invalid expiry', { expiry });
    //     return authParams;
    // }

    const credential = formObj['X-Amz-Credential'];
    if (credential && credential.length > 28 && credential.indexOf('/') > -1) {
        // @ts-ignore
        authParams.credential = credential.split('/');
    } else {
        log.warn('invalid credential param', { credential });
        return authParams;
    }
    return authParams;
}

/**
 * Extract and validate components from auth header
 * @param authHeader - authorization header from request
 * @param log - logging object
 * @return object containing extracted auth header items for authV4
 */
export function extractAuthItems(authHeader: string, log: Logger) {
    const authItems: {
        credentialsArr?: [string, string, string, string, string];
        signedHeaders?: string;
        signatureFromRequest?: string;
    } = {};
    const authArray = authHeader.replace('AWS4-HMAC-SHA256 ', '').split(',');

    if (authArray.length < 3) {
        return authItems;
    }
    // extract authorization components
    const credentialStr = authArray[0];
    const signedHeadersStr = authArray[1];
    const signatureStr = authArray[2];
    log.trace('credentials from request', { credentialStr });
    if (
        credentialStr &&
        credentialStr.trim().startsWith('Credential=') &&
        credentialStr.indexOf('/') > -1
    ) {
        // @ts-ignore
        authItems.credentialsArr = credentialStr
            .trim().replace('Credential=', '').split('/');
    } else {
        log.warn('missing credentials');
    }
    log.trace('signed headers from request', { signedHeadersStr });
    if (signedHeadersStr && signedHeadersStr.trim()
        .startsWith('SignedHeaders=')) {
        authItems.signedHeaders = signedHeadersStr
            .trim().replace('SignedHeaders=', '');
    } else {
        log.warn('missing signed headers');
    }
    log.trace('signature from request', { signatureStr });
    if (signatureStr && signatureStr.trim().startsWith('Signature=')) {
        authItems.signatureFromRequest = signatureStr
            .trim().replace('Signature=', '');
    } else {
        log.warn('missing signature');
    }
    return authItems;
}

/**
 * Checks whether the signed headers include the host header
 * and all x-amz- and x-scal- headers in request
 * @param signedHeaders - signed headers sent with request
 * @param allHeaders - request.headers
 * @return true if all x-amz-headers included and false if not
 */
export function areSignedHeadersComplete(signedHeaders: string, allHeaders: Headers) {
    const signedHeadersList = signedHeaders.split(';');
    if (signedHeadersList.indexOf('host') === -1) {
        return false;
    }
    const headers = Object.keys(allHeaders);
    for (let i = 0; i < headers.length; i++) {
        if ((headers[i].startsWith('x-amz-')
        || headers[i].startsWith('x-scal-'))
        && signedHeadersList.indexOf(headers[i]) === -1) {
            return false;
        }
    }
    return true;
}
