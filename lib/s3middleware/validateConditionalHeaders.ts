import * as http from 'http';
import errors, { ArsenalError } from '../errors';

function _matchesETag(item: string, contentMD5: string) {
    return (item === contentMD5 || item === '*' || item === `"${contentMD5}"`);
}

export function _checkEtagMatch(
    ifETagMatch: string | undefined,
    contentMD5: string,
) {
    if (ifETagMatch) {
        if (ifETagMatch.includes(',')) {
            const items = ifETagMatch.split(',');
            const anyMatch = items.some(item =>
                _matchesETag(item, contentMD5));
            if (!anyMatch) {
                return { present: true, error: errors.PreconditionFailed };
            }
        } else if (!_matchesETag(ifETagMatch, contentMD5)) {
            return { present: true, error: errors.PreconditionFailed };
        }
        return { present: true, error: null };
    }
    return { present: false, error: null };
}

export function _checkEtagNoneMatch(
    ifETagNoneMatch: string | undefined,
    contentMD5: string,
) {
    if (ifETagNoneMatch) {
        if (ifETagNoneMatch.includes(',')) {
            const items = ifETagNoneMatch.split(',');
            const anyMatch = items.some(item =>
                _matchesETag(item, contentMD5));
            if (anyMatch) {
                return { present: true, error: errors.NotModified };
            }
        } else if (_matchesETag(ifETagNoneMatch, contentMD5)) {
            return { present: true, error: errors.NotModified };
        }
        return { present: true, error: null };
    }
    return { present: false, error: null };
}

export function _checkModifiedSince(
    ifModifiedSinceTime: string | undefined,
    lastModified: number,
) {
    if (ifModifiedSinceTime) {
        const checkWith = (new Date(ifModifiedSinceTime)).getTime();
        if (Number.isNaN(Number(checkWith))) {
            return { present: true, error: errors.InvalidArgument };
        } else if (lastModified <= checkWith) {
            return { present: true, error: errors.NotModified };
        }
        return { present: true, error: null };
    }
    return { present: false, error: null };
}

export function _checkUnmodifiedSince(
    ifUnmodifiedSinceTime: string | undefined,
    lastModified: number,
) {
    if (ifUnmodifiedSinceTime) {
        const checkWith = (new Date(ifUnmodifiedSinceTime)).getTime();
        if (Number.isNaN(Number(checkWith))) {
            return { present: true, error: errors.InvalidArgument };
        } else if (lastModified > checkWith) {
            return { present: true, error: errors.PreconditionFailed };
        }
        return { present: true, error: null };
    }
    return { present: false, error: null };
}

/**
 * checks 'if-modified-since' and 'if-unmodified-since' headers if included in
 * request against last-modified date of object
 * @param headers - headers from request object
 * @param lastModified - last modified date of object
 * @return contains modifiedSince and unmodifiedSince res objects
 */
export function checkDateModifiedHeaders(
    headers: http.IncomingHttpHeaders,
    lastModified: string,
) {
    const lastModifiedDate = new Date(lastModified);
    lastModifiedDate.setMilliseconds(0);
    const millis = lastModifiedDate.getTime();

    const ifModifiedSinceHeader = headers['if-modified-since'] ||
        headers['x-amz-copy-source-if-modified-since'];
    const ifUnmodifiedSinceHeader = headers['if-unmodified-since'] ||
        headers['x-amz-copy-source-if-unmodified-since'];

    const modifiedSinceRes = _checkModifiedSince(ifModifiedSinceHeader?.toString(),
        millis);
    const unmodifiedSinceRes = _checkUnmodifiedSince(ifUnmodifiedSinceHeader?.toString(),
        millis);

    return { modifiedSinceRes, unmodifiedSinceRes };
}

/**
 * validateConditionalHeaders - validates 'if-modified-since',
 * 'if-unmodified-since', 'if-match' or 'if-none-match' headers if included in
 * request against last-modified date of object and/or ETag.
 * @param headers - headers from request object
 * @param lastModified - last modified date of object
 * @param contentMD5 - content MD5 of object
 * @return object with error as key and arsenal error as value or
 * empty object if no error
 */
export function validateConditionalHeaders(
    headers: http.IncomingHttpHeaders,
    lastModified: string,
    contentMD5: string,
): {} | { present: boolean; error: ArsenalError } {
    const ifMatchHeader = headers['if-match'] ||
        headers['x-amz-copy-source-if-match'];
    const ifNoneMatchHeader = headers['if-none-match'] ||
        headers['x-amz-copy-source-if-none-match'];
    const etagMatchRes = _checkEtagMatch(ifMatchHeader?.toString(), contentMD5);
    const etagNoneMatchRes = _checkEtagNoneMatch(ifNoneMatchHeader?.toString(), contentMD5);
    const { modifiedSinceRes, unmodifiedSinceRes } =
        checkDateModifiedHeaders(headers, lastModified);
    // If-Unmodified-Since condition evaluates to false and If-Match
    // is not present, then return the error. Otherwise, If-Unmodified-Since is
    // silent when If-Match match, and when If-Match does not match, it's the
    // same error, so each case are covered.
    if (!etagMatchRes.present && unmodifiedSinceRes.error) {
        return unmodifiedSinceRes;
    }
    if (etagMatchRes.present && etagMatchRes.error) {
        return etagMatchRes;
    }
    if (etagNoneMatchRes.present && etagNoneMatchRes.error) {
        return etagNoneMatchRes;
    }
    if (modifiedSinceRes.present && modifiedSinceRes.error) {
        return modifiedSinceRes;
    }
    return {};
}
