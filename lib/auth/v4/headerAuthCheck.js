'use strict'; // eslint-disable-line strict

const errors = require('../../../lib/errors');

const constructStringToSign = require('./constructStringToSign');
const checkTimeSkew = require('./timeUtils').checkTimeSkew;
const convertUTCtoISO8601 = require('./timeUtils').convertUTCtoISO8601;
const convertAmzTimeToMs = require('./timeUtils').convertAmzTimeToMs;
const extractAuthItems = require('./validateInputs').extractAuthItems;
const validateCredentials = require('./validateInputs').validateCredentials;
const areSignedHeadersComplete =
    require('./validateInputs').areSignedHeadersComplete;

const headerAuthCheck = {};

/**
 * V4 header auth check
 * @param {object} request - HTTP request object
 * @param {object} log - logging object
 * @param {object} data - Parameters from queryString parsing or body of
 *      POST request
 * @param {string} awsService - Aws service ('iam' or 's3')
 * @return {callback} calls callback
 */
headerAuthCheck.check = (request, log, data, awsService) => {
    log.trace('running header auth check');
    // authorization header
    const authHeader = request.headers.authorization;
    if (!authHeader) {
        log.debug('missing authorization header');
        return { err: errors.MissingSecurityHeader };
    }

    const payloadChecksum = request.headers['x-amz-content-sha256'];
    if (!payloadChecksum && awsService !== 'iam') {
        log.debug('missing payload checksum');
        return { err: errors.MissingSecurityHeader };
    }
    if (payloadChecksum === 'STREAMING-AWS4-HMAC-SHA256-PAYLOAD') {
        log.trace('requesting streaming v4 auth');
        // TODO: Implement this option
        return { err: errors.NotImplemented };
    }

    log.trace('authorization header from request', { authHeader });

    const authHeaderItems = extractAuthItems(authHeader, log);
    if (Object.keys(authHeaderItems).length < 3) {
        return { err: errors.MissingSecurityHeader };
    }
    const signatureFromRequest = authHeaderItems.signatureFromRequest;
    const credentialsArr = authHeaderItems.credentialsArr;
    const signedHeaders = authHeaderItems.signedHeaders;

    if (!areSignedHeadersComplete(signedHeaders, request.headers)) {
        log.debug('signedHeaders are incomplete');
        return { err: errors.AccessDenied };
    }

    let timestamp;
    // check request timestamp
    if (request.headers['x-amz-date']) {
        // format of x-amz- date is ISO 8601: YYYYMMDDTHHMMSSZ
        timestamp = request.headers['x-amz-date'];
    } else if (request.headers.date) {
        timestamp = convertUTCtoISO8601(request.headers.date);
    }
    if (!timestamp) {
        log.debug('missing date header');
        return { err: errors.MissingSecurityHeader };
    }

    if (!validateCredentials(credentialsArr, timestamp, log)) {
        log.debug('credentials in improper format', { credentialsArr });
        return { err: errors.InvalidArgument };
    }
    // credentialsArr is [accessKey, date, region, aws-service, aws4_request]
    const scopeDate = credentialsArr[1];
    const region = credentialsArr[2];
    const accessKey = credentialsArr.shift();
    const credentialScope = credentialsArr.join('/');


    // In AWS Signature Version 4, the signing key is valid for up to seven days
    // (see Introduction to Signing Requests.
    // Therefore, a signature is also valid for up to seven days or
    // less if specified by a bucket policy.
    // Since policies are not yet implemented, we will have a 15
    // minute default like in v2 Auth.
    // See http://docs.aws.amazon.com/AmazonS3/latest/API/
    // bucket-policy-s3-sigv4-conditions.html
    // TODO: When implementing bucket policies,
    // note that expiration can be shortened so
    // expiry is as set out in the policy.

    // 15 minutes in seconds
    const expiry = (15 * 60);
    const isTimeSkewed = checkTimeSkew(timestamp, expiry, log);
    if (isTimeSkewed) {
        return { err: errors.RequestTimeTooSkewed };
    }

    const stringToSign = constructStringToSign({
        log,
        request,
        query: data,
        signedHeaders,
        credentialScope,
        timestamp,
        payloadChecksum,
        awsService,
    });
    log.trace('constructed stringToSign', { stringToSign });
    if (stringToSign instanceof Error) {
        return { err: stringToSign };
    }


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
            authType: 'REST-HEADER',
            signatureVersion: 'AWS4-HMAC-SHA256',
        },
    };
};

module.exports = headerAuthCheck;
