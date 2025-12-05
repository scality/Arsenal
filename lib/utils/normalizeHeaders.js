function normalizeHeaderValue(headerValue) {
    if (headerValue === undefined || headerValue === null) {
        return '';
    }

    if (typeof headerValue === 'string') {
        return headerValue;
    }

    return Array.isArray(headerValue)
        ? headerValue.join(',')
        : String(headerValue);
}

function normalizeHeaders(headers, { mutate = false } = {}) {
    if (!headers) {
        return headers;
    }

    const source = headers;
    const target = mutate ? headers : { ...headers };

    for (const headerName of Object.keys(source)) {
        const normalized = normalizeHeaderValue(source[headerName]);
        target[headerName] = normalized;
    }

    return target;
}

function createNormalizeHeadersMiddleware() {
    return next => async args => {
        const headers = args?.request?.headers;
        if (!headers) {
            return next(args);
        }

        normalizeHeaders(headers, { mutate: true });
        return next(args);
    };
}

module.exports = {
    normalizeHeaderValue,
    normalizeHeaders,
    createNormalizeHeadersMiddleware,
};
