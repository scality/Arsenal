'use strict'; // eslint-disable-line strict

const utf8 = require('utf8');

const getCanonicalizedAmzHeaders = require('./getCanonicalizedAmzHeaders');
const getCanonicalizedResource = require('./getCanonicalizedResource');

function constructStringToSign(request, data, log) {
    /*
    Build signature per AWS requirements:
    StringToSign = HTTP-Verb + '\n' +
    Content-MD5 + '\n' +
    Content-Type + '\n' +
    Date (or Expiration for query Auth) + '\n' +
    CanonicalizedAmzHeaders +
    CanonicalizedResource;
    */
    log.trace('constructing string to sign');

    let stringToSign = `${request.method}\n`;
    const headers = request.headers;
    const query = data;

    const contentMD5 = headers['content-md5'] ?
        headers['content-md5'] : query['Content-MD5'];
    stringToSign += (contentMD5 ? `${contentMD5}\n` : '\n');

    const contentType = headers['content-type'] ?
        headers['content-type'] : query['Content-Type'];
    stringToSign += (contentType ? `${contentType}\n` : '\n');

    /*
    AWS docs are conflicting on whether to include x-amz-date header here
    if present in request.
    s3cmd includes x-amz-date in amzHeaders rather
    than here in stringToSign so we have replicated that.
    */
    const date = query.Expires ? query.Expires : headers.date;
    const combinedQueryHeaders = Object.assign({}, headers, query);
    stringToSign += (date ? `${date}\n` : '\n')
        + getCanonicalizedAmzHeaders(combinedQueryHeaders)
        + getCanonicalizedResource(request);
    return utf8.encode(stringToSign);
}

module.exports = constructStringToSign;
