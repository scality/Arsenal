import * as http from 'http';
import * as constants from '../constants';
import errors from '../errors';

/**
 * Pull user provided meta headers from request headers
 * @param headers - headers attached to the http request (lowercased)
 * @return all user meta headers or MetadataTooLarge
 */
export function getMetaHeaders(headers: http.IncomingHttpHeaders) {
    const rawHeaders = Object.entries(headers);
    const filtered = rawHeaders.filter(([k]) => k.startsWith('x-amz-meta-'));
    const totalLength = filtered.reduce((length, [k, v]) => {
        if (!v) return length;
        return length + k.length + v.toString().length;
    }, 0);
    if (totalLength < constants.maximumMetaHeadersSize) {
        return Object.fromEntries(filtered);
    } else {
        return errors.MetadataTooLarge;
    }
}
