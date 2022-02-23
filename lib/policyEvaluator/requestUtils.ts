import * as ipCheck from '../ipCheck';

/**
 * getClientIp - Gets the client IP from the request
 * @param {object} request - http request object
 * @param {object} s3config - s3 config
 * @return {string} - returns client IP from the request
 */
export function getClientIp(request, s3config) {
    const requestConfig = s3config ? s3config.requests : {};
    const remoteAddress = request.socket.remoteAddress;
    const clientIp = requestConfig ? remoteAddress : request.headers['x-forwarded-for'] || remoteAddress;
    if (requestConfig) {
        const { trustedProxyCIDRs, extractClientIPFromHeader } = requestConfig;
        /**
         * if requests are configured to come via proxy,
         * check from config which proxies are to be trusted and
         * which header to be used to extract client IP
         */
        if (ipCheck.ipMatchCidrList(trustedProxyCIDRs, clientIp)) {
            const ipFromHeader = request.headers[extractClientIPFromHeader];
            if (ipFromHeader && ipFromHeader.trim().length) {
                return ipFromHeader.split(',')[0].trim();
            }
        }
    }
    return clientIp;
}
