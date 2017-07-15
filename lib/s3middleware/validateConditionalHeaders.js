const errors = require('../errors');

function _matchesETag(item, contentMD5) {
    return (item === contentMD5 || item === '*' || item === `"${contentMD5}"`);
}

function _checkEtagMatch(ifETagMatch, contentMD5) {
    const res = { present: false, error: null };
    if (ifETagMatch) {
        res.present = true;
        if (ifETagMatch.includes(',')) {
            const items = ifETagMatch.split(',');
            const anyMatch = items.some(item =>
                _matchesETag(item, contentMD5));
            if (!anyMatch) {
                res.error = errors.PreconditionFailed;
            }
        } else if (!_matchesETag(ifETagMatch, contentMD5)) {
            res.error = errors.PreconditionFailed;
        }
    }
    return res;
}

function _checkEtagNoneMatch(ifETagNoneMatch, contentMD5) {
    const res = { present: false, error: null };
    if (ifETagNoneMatch) {
        res.present = true;
        if (ifETagNoneMatch.includes(',')) {
            const items = ifETagNoneMatch.split(',');
            const anyMatch = items.some(item =>
                _matchesETag(item, contentMD5));
            if (anyMatch) {
                res.error = errors.NotModified;
            }
        } else if (_matchesETag(ifETagNoneMatch, contentMD5)) {
            res.error = errors.NotModified;
        }
    }
    return res;
}

function _checkModifiedSince(ifModifiedSinceTime, lastModified) {
    const res = { present: false, error: null };
    if (ifModifiedSinceTime) {
        res.present = true;
        const checkWith = (new Date(ifModifiedSinceTime)).getTime();
        if (isNaN(checkWith)) {
            res.error = errors.InvalidArgument;
        } else if (lastModified <= checkWith) {
            res.error = errors.NotModified;
        }
    }
    return res;
}

function _checkUnmodifiedSince(ifUnmodifiedSinceTime, lastModified) {
    const res = { present: false, error: null };
    if (ifUnmodifiedSinceTime) {
        res.present = true;
        const checkWith = (new Date(ifUnmodifiedSinceTime)).getTime();
        if (isNaN(checkWith)) {
            res.error = errors.InvalidArgument;
        } else if (lastModified > checkWith) {
            res.error = errors.PreconditionFailed;
        }
    }
    return res;
}

/**
 * validateConditionalHeaders - validates 'if-modified-since',
 * 'if-unmodified-since', 'if-match' or 'if-none-match' headers if included in
 * request against last-modified date of object and/or ETag.
 * @param {object} headers - headers from request object
 * @param {string} lastModified - last modified date of object
 * @param {object} contentMD5 - content MD5 of object
 * @return {object} object with error as key and arsenal error as value or
 * empty object if no error
 */
function validateConditionalHeaders(headers, lastModified, contentMD5) {
    let lastModifiedDate = new Date(lastModified);
    lastModifiedDate.setMilliseconds(0);
    lastModifiedDate = lastModifiedDate.getTime();
    const ifMatchHeader = headers['if-match'] ||
        headers['x-amz-copy-source-if-match'];
    const ifNoneMatchHeader = headers['if-none-match'] ||
        headers['x-amz-copy-source-if-none-match'];
    const ifModifiedSinceHeader = headers['if-modified-since'] ||
        headers['x-amz-copy-source-if-modified-since'];
    const ifUnmodifiedSinceHeader = headers['if-unmodified-since'] ||
        headers['x-amz-copy-source-if-unmodified-since'];
    const etagMatchRes = _checkEtagMatch(ifMatchHeader, contentMD5);
    const etagNoneMatchRes = _checkEtagNoneMatch(ifNoneMatchHeader, contentMD5);
    const modifiedSinceRes = _checkModifiedSince(ifModifiedSinceHeader,
        lastModifiedDate);
    const unmodifiedSinceRes = _checkUnmodifiedSince(ifUnmodifiedSinceHeader,
        lastModifiedDate);
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

module.exports = {
    _checkEtagMatch,
    _checkEtagNoneMatch,
    _checkModifiedSince,
    _checkUnmodifiedSince,
    validateConditionalHeaders,
};
