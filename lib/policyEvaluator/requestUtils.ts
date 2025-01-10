import * as ipCheck from '../ipCheck'
import { IncomingMessage } from 'http'
import { TLSSocket } from 'tls'

export interface S3Config {
    requests: {
        trustedProxyCIDRs: string[],
        extractClientIPFromHeader: string,
        extractProtocolFromHeader: string,
    }
}

/**
 * getClientIp - Gets the client IP from the request
 * @param request - http request object
 * @param s3config - s3 config
 * @return - returns client IP from the request
 */
export function getClientIp(request: IncomingMessage, s3config?: S3Config): string {
    const requestConfig = s3config?.requests;
    const remoteAddress = request.socket.remoteAddress;
    const clientIp = remoteAddress?.toString() ?? '';
    if (requestConfig) {
        const { trustedProxyCIDRs, extractClientIPFromHeader } = requestConfig;
        /**
         * if requests are configured to come via proxy,
         * check from config which proxies are to be trusted and
         * which header to be used to extract client IP
         */
        if (ipCheck.ipMatchCidrList(trustedProxyCIDRs, clientIp)) {
            // Request headers in nodejs are lower-cased, so we should not
            // be case-sentive when looking for the header, as http headers
            // are case-insensitive.
            const ipFromHeader = request.headers[extractClientIPFromHeader.toLowerCase()]?.toString();
            if (ipFromHeader && ipFromHeader.trim().length) {
                return ipFromHeader.split(',')[0].trim();
            }
        }
    }
    return clientIp;
}

/**
 * getHttpProtocolSecurity - Dete²object
 * @param s3config - s3 config
 * @return {boolean} - returns true if the request is secure
 */
export function getHttpProtocolSecurity(request: IncomingMessage, s3config?: S3Config): boolean {
    const requestConfig = s3config?.requests;
    if (requestConfig) {
        const { trustedProxyCIDRs } = requestConfig;
        const clientIp = request.socket.remoteAddress?.toString() ?? '';
        if (ipCheck.ipMatchCidrList(trustedProxyCIDRs, clientIp)) {
            return request.headers[requestConfig.extractProtocolFromHeader.toLowerCase()] === 'https';
        }
    }
    return request.socket instanceof TLSSocket && request.socket.encrypted;
}
