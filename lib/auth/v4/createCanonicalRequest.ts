import * as crypto from 'crypto';
import * as queryString from 'querystring';
import awsURIencode from './awsURIencode';

/**
 * createCanonicalRequest - creates V4 canonical request
 * @param params - contains pHttpVerb (request type),
 * pResource (parsed from URL), pQuery (request query),
 * pHeaders (request headers), pSignedHeaders (signed headers from request),
 * payloadChecksum (from request)
 * @returns - canonicalRequest
 */
export default function createCanonicalRequest(
    params: {
        pHttpVerb: string;
        pResource: string;
        pQuery: { [key: string]: string };
        pHeaders: any;
        pSignedHeaders: any;
        service: string;
        payloadChecksum: string;
    },
    oTel?: any,
) {
    const {
        activeSpan,
        activeTracerContext,
        tracer,
    } = oTel;
    activeSpan?.addEvent('Entered createCanonicalRequest');

    const pHttpVerb = params.pHttpVerb;
    const pResource = params.pResource;
    const pQuery = params.pQuery;
    const pHeaders = params.pHeaders;
    const pSignedHeaders = params.pSignedHeaders;
    const service = params.service;
    let payloadChecksum = params.payloadChecksum;

    const payloadChecksumSpan = tracer.startSpan('ComputePayloadChecksum');
    if (!payloadChecksum) {
        if (pHttpVerb === 'GET') {
            payloadChecksum = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b' +
                '934ca495991b7852b855';
        } else if (pHttpVerb === 'POST') {
            let notEncodeStar = false;
            if (/aws-sdk-java\/[0-9.]+/.test(pHeaders['user-agent'])) {
                notEncodeStar = true;
            }
            let payload = queryString.stringify(pQuery, undefined, undefined, {
                encodeURIComponent: input => awsURIencode(input, true, notEncodeStar),
            });
            payload = payload.replace(/%20/g, '+');
            payloadChecksum = crypto.createHash('sha256')
                .update(payload, 'binary').digest('hex').toLowerCase();
        }
    }
    payloadChecksumSpan.end();

    const canonicalURISpan = tracer.startSpan('ComputeCanonicalURI');
    const canonicalURI = !!pResource ? awsURIencode(pResource, false) : '/';
    canonicalURISpan.end();

    const canonicalQueryStrSpan = tracer.startSpan('ComputeCanonicalQueryStr');
    let canonicalQueryStr = '';
    if (pQuery && !((service === 'iam' || service === 'ring' || service === 'sts') && pHttpVerb === 'POST')) {
        const sortedQueryParams = Object.keys(pQuery).sort().map(key => {
            const encodedKey = awsURIencode(key);
            const value = pQuery[key] ? awsURIencode(pQuery[key]) : '';
            return `${encodedKey}=${value}`;
        });
        canonicalQueryStr = sortedQueryParams.join('&');
    }
    canonicalQueryStrSpan.end();

    const signedHeadersSpan = tracer.startSpan('ComputeSignedHeaders');
    const signedHeadersList = pSignedHeaders.split(';');
    signedHeadersList.sort((a: any, b: any) => a.localeCompare(b));
    const signedHeaders = signedHeadersList.join(';');
    signedHeadersSpan.end();

    const canonicalHeadersListSpan = tracer.startSpan('ComputeCanonicalHeadersList');
    const canonicalHeadersList = signedHeadersList.map((signedHeader: any) => {
        if (pHeaders[signedHeader] !== undefined) {
            const trimmedHeader = pHeaders[signedHeader]
                .trim().replace(/\s+/g, ' ');
            return `${signedHeader}:${trimmedHeader}\n`;
        }
        if (signedHeader === 'expect') {
            return `${signedHeader}:100-continue\n`;
        }
        return `${signedHeader}:${pQuery[signedHeader]}\n`;
    });
    canonicalHeadersListSpan.end();

    const canonicalHeadersSpan = tracer.startSpan('JoinCanonicalHeaders');
    const canonicalHeaders = canonicalHeadersList.join('');
    canonicalHeadersSpan.end();

    const canonicalRequestSpan = tracer.startSpan('ConstructCanonicalRequest');
    const canonicalRequest = `${pHttpVerb}\n${canonicalURI}\n` +
        `${canonicalQueryStr}\n${canonicalHeaders}\n` +
        `${signedHeaders}\n${payloadChecksum}`;
    canonicalRequestSpan.end();
    return canonicalRequest;
}
