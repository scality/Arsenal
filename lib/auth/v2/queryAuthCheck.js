'use strict'; // eslint-disable-line strict

const errors = require('../../errors');

const algoCheck = require('./algoCheck');
const constructStringToSign = require('./constructStringToSign');
const checkRequestExpiry = require('./checkRequestExpiry');

const queryAuthCheck = {};

queryAuthCheck.check = (request, log, data) => {
    log.trace('running query auth check');
    if (request.method === 'POST') {
        log.warn('query string auth not supported for post requests');
        return { err: errors.NotImplemented };
    }
    /*
    Check whether request has expired or if
    expires parameter is more than 15 minutes in the future.
    Expires time is provided in seconds so need to
    multiply by 1000 to obtain
    milliseconds to compare to Date.now()
    */
    const expirationTime = parseInt(data.Expires, 10) * 1000;
    if (isNaN(expirationTime)) {
        log.warn('invalid expires parameter',
            { expires: data.Expires });
        return { err: errors.MissingSecurityHeader };
    }
    const timeout = checkRequestExpiry(expirationTime, log);
    if (timeout) {
        return { err: errors.RequestTimeTooSkewed };
    }
    const accessKey = data.AWSAccessKeyId;
    log.addDefaultFields({ accessKey });

    const signatureFromRequest = decodeURIComponent(data.Signature);
    log.trace('signature from request', { signatureFromRequest });
    if (!accessKey || !signatureFromRequest) {
        log.warn('invalid access key/signature parameters');
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
        version: 2,
        data: {
            accessKey,
            signatureFromRequest,
            stringToSign,
            algo,
        },
    };
};

module.exports = queryAuthCheck;
