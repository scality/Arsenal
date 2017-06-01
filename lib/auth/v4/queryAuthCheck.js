'use strict'; // eslint-disable-line strict

const constants = require('../../constants');
const errors = require('../../errors');

const constructStringToSign = require('./constructStringToSign');
const checkTimeSkew = require('./timeUtils').checkTimeSkew;
const convertAmzTimeToMs = require('./timeUtils').convertAmzTimeToMs;
const validateCredentials = require('./validateInputs').validateCredentials;
const extractQueryParams = require('./validateInputs').extractQueryParams;
const areSignedHeadersComplete =
    require('./validateInputs').areSignedHeadersComplete;

/**
 * V4 query auth check
 * @param {object} request - HTTP request object
 * @param {object} log - logging object
 * @param {object} data - Contain authentification params (GET or POST data)
 * @return {callback} calls callback
 */
function check(request, log, data) {
    const authParams = extractQueryParams(data, log);

    if (Object.keys(authParams).length !== 5) {
        return { err: errors.InvalidArgument };
    }

    // Query params are not specified in AWS documentation as case-insensitive,
    // so we use case-sensitive
    const token = data['X-Amz-Security-Token'];
    if (token && !constants.iamSecurityToken.pattern.test(token)) {
        log.debug('invalid security token', { token });
        return { err: errors.InvalidToken };
    }

    const signedHeaders = authParams.signedHeaders;
    const signatureFromRequest = authParams.signatureFromRequest;
    const timestamp = authParams.timestamp;
    const expiry = authParams.expiry;
    const credential = authParams.credential;

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
}

module.exports = { check };
