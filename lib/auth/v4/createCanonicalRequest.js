'use strict'; // eslint-disable-line strict

const awsURIencode = require('./awsURIencode');
const crypto = require('crypto');
const queryString = require('querystring');

/**
 * createCanonicalRequest - creates V4 canonical request
 * @param {object} params - contains pHttpVerb (request type),
 * pResource (parsed from URL), pQuery (request query),
 * pHeaders (request headers), pSignedHeaders (signed headers from request),
 * payloadChecksum (from request)
 * @returns {string} - canonicalRequest
 */
function createCanonicalRequest(params) {
    const pHttpVerb = params.pHttpVerb;
    const pResource = params.pResource;
    const pQuery = params.pQuery;
    const pHeaders = params.pHeaders;
    const pSignedHeaders = params.pSignedHeaders;
    const service = params.service;

    let payloadChecksum = params.payloadChecksum;

    if (!payloadChecksum) {
        if (pHttpVerb === 'GET') {
            payloadChecksum = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b' +
                '934ca495991b7852b855';
        } else if (pHttpVerb === 'POST') {
            let payload = queryString.stringify(pQuery, null, null, {
                encodeURIComponent: awsURIencode,
            });
            payload = payload.replace(/%20/g, '+');
            payloadChecksum = crypto.createHash('sha256')
                .update(payload, 'binary').digest('hex').toLowerCase();
        }
    }

    const canonicalURI = !!pResource ? awsURIencode(pResource, false) : '/';

    // canonical query string
    let canonicalQueryStr = '';
    if (pQuery && !((service === 'iam' || service === 'ring' ||
        service === 'sts') &&
        pHttpVerb === 'POST')) {
        const sortedQueryParams = Object.keys(pQuery).sort().map(key => {
            const encodedKey = awsURIencode(key);
            const value = pQuery[key] ? awsURIencode(pQuery[key]) : '';
            return `${encodedKey}=${value}`;
        });
        canonicalQueryStr = sortedQueryParams.join('&');
    }

    // signed headers
    const signedHeadersList = pSignedHeaders.split(';');
    signedHeadersList.sort((a, b) => a.localeCompare(b));
    const signedHeaders = signedHeadersList.join(';');

    // canonical headers
    const canonicalHeadersList = signedHeadersList.map(signedHeader => {
        if (pHeaders[signedHeader] !== undefined) {
            const trimmedHeader = pHeaders[signedHeader]
                .trim().replace(/\s+/g, ' ');
            return `${signedHeader}:${trimmedHeader}\n`;
        }
        // nginx will strip the actual expect header so add value of
        // header back here if it was included as a signed header
        if (signedHeader === 'expect') {
            return `${signedHeader}:100-continue\n`;
        }
        // handle case where signed 'header' is actually query param
        return `${signedHeader}:${pQuery[signedHeader]}\n`;
    });

    const canonicalHeaders = canonicalHeadersList.join('');

    const canonicalRequest = `${pHttpVerb}\n${canonicalURI}\n` +
        `${canonicalQueryStr}\n${canonicalHeaders}\n` +
        `${signedHeaders}\n${payloadChecksum}`;
    return canonicalRequest;
}

module.exports = createCanonicalRequest;
