'use strict'; // eslint-disable-line strict

const errors = require('../../../index').errors;

const constructStringToSign = require('./constructStringToSign');
const checkTimeSkew = require('./timeUtils').checkTimeSkew;
const convertAmzTimeToMs = require('./timeUtils').convertAmzTimeToMs;
const validateCredentials = require('./validateInputs').validateCredentials;
const extractQueryParams = require('./validateInputs').extractQueryParams;
const areSignedHeadersComplete =
    require('./validateInputs').areSignedHeadersComplete;

const queryAuthCheck = {};

/**
 * V4 query auth check
 * @param {object} request - HTTP request object
 * @param {object} log - logging object
 * @param {object} data - Contain authentification params (GET or POST data)
 * @return {callback} calls callback
 */
queryAuthCheck.check = (request, log, data) => {
    const authParams = extractQueryParams(data, log);

    if (Object.keys(authParams).length !== 5) {
        return { err: errors.InvalidArgument };
    }
    const signedHeaders = authParams.signedHeaders;
    const signatureFromRequest = authParams.signatureFromRequest;
    const timestamp = authParams.timestamp;
    const expiry = authParams.expiry;
    const credential = authParams.credential;

    if (!areSignedHeadersComplete(signedHeaders, request.headers)) {
        log.debug('signedHeaders are incomplete');
        return { err: errors.AccessDenied };
    }

    if (!validateCredentials(credential, timestamp, log)) {
        log.debug('credential param format incorrect', { credential });
        return { err: errors.InvalidArgument };
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
        credentialScope:
            `${scopeDate}/${region}/${service}/${requestType}`,
        awsService: service,
    });
    if (stringToSign instanceof Error) {
        return { err: stringToSign };
    }
    log.trace('constructed stringToSign', { stringToSign });
    return {
        err: null,
        version: 4,
        signatureAge: Date.now() - convertAmzTimeToMs(timestamp),
        data: {
            accessKey,
            signatureFromRequest,
            region,
            scopeDate,
            stringToSign,
            authType: 'REST-QUERY-STRING',
            signatureVersion: 'AWS4-HMAC-SHA256',
        },
    };
};

module.exports = queryAuthCheck;
