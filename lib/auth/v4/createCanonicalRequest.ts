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

    const signedHeadersSpan = tracer.startSpan('SortSignedHeadersAlphabetically');
    activeSpan?.addEvent('Splitting signed headers using deliminator: ;');
    const signedHeadersList = pSignedHeaders.split(';');
    activeSpan?.addEvent('Split signed headers using ; as deliminator');
    activeSpan?.addEvent('Sorting signed headers alphabetically');
    signedHeadersList.sort((a: any, b: any) => a.localeCompare(b));
    activeSpan?.addEvent('Sorted signed headers alphabetically');
    activeSpan?.addEvent('Joining signed headers using deliminator: ;');
    const signedHeaders = signedHeadersList.join(';');
    activeSpan?.addEvent('Joined signed headers using ; as deliminator');
    activeSpan.setAttributes({
        'signedHeaders.request': pSignedHeaders,
        'signedHeaders.request.authv4': signedHeaders,
    });
    signedHeadersSpan.setAttributes({
        'signedHeaders.request': pSignedHeaders,
        'signedHeaders.request.authv4': signedHeaders,
        'code.url': 'https://github.com/scality/arsenal/blob/c6bb489adeb7419fdbcdf01db2b46a593747530d/lib/auth/v4/createCanonicalRequest.ts#L76',
        'code.function': 'createCanonicalRequest',
        'code.lineno': 76,
        'code.filename': 'lib/auth/v4/createCanonicalRequest.ts',
    });
    signedHeadersSpan.end();

    const canonicalHeadersListSpan = tracer.startSpan('FormatHeadersToMatch CanonicalHeadersList');
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

    const canonicalHeadersSpan = tracer.startSpan('JoinAllCanonicalHeaders using no deliminator');
    const canonicalHeaders = canonicalHeadersList.join('');
    canonicalHeadersSpan.end();

    const canonicalRequestSpan = tracer.startSpan('ConstructCanonicalRequest');
    const canonicalRequest = `${pHttpVerb}\n${canonicalURI}\n` +
        `${canonicalQueryStr}\n${canonicalHeaders}\n` +
        `${signedHeaders}\n${payloadChecksum}`;
    canonicalRequestSpan.end();
    return canonicalRequest;
}
