'use strict'; // eslint-disable-line strict

const errors = require('../../../index').errors;

const constructStringToSign = require('./constructStringToSign');
const checkTimeSkew = require('./timeUtils').checkTimeSkew;
const validateCredentials = require('./validateInputs').validateCredentials;
const extractQueryParams = require('./validateInputs').extractQueryParams;

let vault = require('../vault');

const queryAuthCheck = {};

queryAuthCheck.setAuthHandler = handler => {
    vault = handler;
    return queryAuthCheck;
};

/**
 * V4 query auth check
 * @param {object} request - HTTP request object
 * @param {object} log - logging object
 * @param {function} callback - callback to auth checking function
 * @return {callback} calls callback
 */
queryAuthCheck.check = (request, log, callback) => {
    const authParams = extractQueryParams(request.query, log);

    if (Object.keys(authParams).length !== 5) {
        return callback(errors.InvalidArgument);
    }
    const signedHeaders = authParams.signedHeaders;
    const signatureFromRequest = authParams.signatureFromRequest;
    const timestamp = authParams.timestamp;
    const expiry = authParams.expiry;
    const credential = authParams.credential;

    if (!validateCredentials(credential, timestamp, log)) {
        log.warn('credential param format incorrect', { credential });
        return callback(errors.InvalidArgument);
    }
    const accessKey = credential[0];
    const scopeDate = credential[1];
    const region = credential[2];
    const service = credential[3];
    const requestType = credential[4];

    const isTimeSkewed = checkTimeSkew(timestamp, expiry, log);
    if (isTimeSkewed) {
        return callback(errors.RequestTimeTooSkewed);
    }

    // In query v4 auth, the canonical request needs
    // to include the query params OTHER THAN
    // the signature so create a
    // copy of the query object and remove
    // the X-Amz-Signature property.
    const queryWithoutSignature = Object.assign({}, request.query);
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
    });
    if (stringToSign instanceof Error) {
        return callback(stringToSign);
    }
    log.trace('constructed stringToSign', { stringToSign });
    const vaultParams = {
        accessKey,
        signatureFromRequest,
        region,
        scopeDate,
        stringToSign,
        log,
    };
    return vault.authenticateV4Request(vaultParams, callback);
};

module.exports = queryAuthCheck;
