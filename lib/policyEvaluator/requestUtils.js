const ipCheck = require('../ipCheck');

/**
 * Extracts the ip from the header, returns the
 * first ip when there are multiple ip addresses
 * @param {string} values - comma separated ip addresses
 * @return {string} - ip address
 */
function _extractIpFromHeader(values) {
    return values.split(',')[0].trim();
}

/**
 * getClientIp - Gets the client IP from the request
 * @param {object} request - http request object
 * @param {object} s3config - s3 config
 * @return {string} - returns client IP from the request
 */
function getClientIp(request, s3config) {
    const clientIp = request.socket.remoteAddress;
    const requestConfig = s3config ? s3config.requests : {};
    if (requestConfig && requestConfig.viaProxy) {
        /**
         * if requests are configured to come via proxy,
         * check from config which proxies are to be trusted and
         * which header to be used to extract client IP
         */
        if (ipCheck.ipMatchCidrList(requestConfig.trustedProxyCIDRs,
            clientIp)) {
            const ipFromHeader
                = request.headers[requestConfig.extractClientIPFromHeader];
            if (ipFromHeader && ipFromHeader.trim().length) {
                return _extractIpFromHeader(ipFromHeader);
            }
        }
    } else {
        const ipFromHeader = request.headers['x-forwarded-for'];
        if (ipFromHeader && ipFromHeader.trim().length) {
            return _extractIpFromHeader(ipFromHeader);
        }
    }
    return clientIp;
}

module.exports = {
    getClientIp,
};
