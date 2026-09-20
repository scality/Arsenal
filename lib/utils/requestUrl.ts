/**
 * An S3 object key is an opaque byte string, and almost every character is
 * valid in one. Request targets are therefore split without being normalized:
 * the key a request addresses has to come out exactly as the client wrote it.
 *
 * This is why `new URL()` is not used. WHATWG parsing collapses `.` and `..`
 * segments, reads a leading `//` as an authority and percent-encodes
 * non-ASCII, each of which names a different object than the request did:
 * `//bucket/key` loses its bucket, `/bucket/a/../b` becomes `/bucket/b`. On
 * the v2 auth path it also changes the string being signed, so a request
 * would be verified against a resource it never addressed.
 *
 * The input is always read as a path, never as an absolute URL: no scheme or
 * host is resolved. Callers handling client-supplied references such as
 * `x-amz-copy-source` therefore see `http://host/x` as a whole key, and can
 * reject it rather than silently reading it as `/x`.
 */

/** Whitespace and zero-width characters stripped from either end of a target. */
function isTrimmable(code: number): boolean {
    return code < 33 || code === 0xa0 || code === 0xfeff;
}

/**
 * Targets matching this are taken verbatim; anything else is percent-escaped.
 * A leading `///`, a `#`, or a `@` ahead of the query also force escaping.
 */
const VERBATIM = /^(\/\/?(?!\/)[^?\s]*)(\?[^\s]*)?$/;

const ESCAPES: Record<string, string> = {
    '\t': '%09',
    '\n': '%0A',
    '\r': '%0D',
    ' ': '%20',
    '"': '%22',
    "'": '%27',
    '<': '%3C',
    '>': '%3E',
    '\\': '%5C',
    '^': '%5E',
    '`': '%60',
    '{': '%7B',
    '|': '%7C',
    '}': '%7D',
};

function escapeDelimiters(part: string): string {
    return part.replace(/[\t\n\r "'<>\\^`{|}]/g, ch => ESCAPES[ch]);
}

export interface ParsedRequestTarget {
    /** Query and fragment removed, and `\` folded to `/`. */
    pathname: string;
    /** Query without its leading `?`, or null when the target carries none. */
    query: string | null;
    /** `pathname` followed by the query, ready to route on. */
    path: string;
}

/**
 * Splits a request target into its path and query, without normalizing either.
 *
 * @param requestUrl - origin-form request target, e.g. `/bucket/key?acl`
 * @returns the path and query, with delimiters escaped where the target is not
 *   already a plain path
 *
 * @example
 * parseRequestTarget('/bucket/key?acl')
 * // => { pathname: '/bucket/key', query: 'acl', path: '/bucket/key?acl' }
 * @example
 * parseRequestTarget('/bucket/my key')
 * // => { pathname: '/bucket/my%20key', query: null, path: '/bucket/my%20key' }
 * @example
 * parseRequestTarget('/bucket/a/../b')
 * // dot segments are kept as-is, unlike `new URL()`:
 * // => { pathname: '/bucket/a/../b', query: null, path: '/bucket/a/../b' }
 */
export function parseRequestTarget(requestUrl: string): ParsedRequestTarget {
    let start = 0;
    let end = requestUrl.length;
    while (start < end && isTrimmable(requestUrl.charCodeAt(start))) {
        start += 1;
    }
    while (end > start && isTrimmable(requestUrl.charCodeAt(end - 1))) {
        end -= 1;
    }
    const target = requestUrl.slice(start, end);

    // A '?' sitting after a '#' belongs to the fragment, so cut the fragment first.
    const hashIndex = target.indexOf('#');
    const beforeHash = hashIndex === -1 ? target : target.slice(0, hashIndex);
    const queryIndex = beforeHash.indexOf('?');

    // Backslashes count as separators in the path, but stay literal in the query.
    const rawPath = (queryIndex === -1 ? beforeHash : beforeHash.slice(0, queryIndex)).replace(/\\/g, '/');
    const rawQuery = queryIndex === -1 ? null : beforeHash.slice(queryIndex + 1);

    const candidate = rawQuery === null ? rawPath : `${rawPath}?${rawQuery}`;
    const verbatim = hashIndex === -1 && !rawPath.includes('@') && VERBATIM.test(candidate);
    const encode = verbatim ? (part: string) => part : escapeDelimiters;

    const pathname = encode(rawPath);
    const query = rawQuery === null ? null : encode(rawQuery);

    return {
        pathname,
        query,
        path: query === null ? pathname : `${pathname}?${query}`,
    };
}
