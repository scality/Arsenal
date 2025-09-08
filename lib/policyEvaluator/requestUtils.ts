import * as ipCheck from '../ipCheck';
import { TLSSocket } from 'tls';
import { type ArsenalRequest } from '../types/ArsenalRequest';

export interface S3Config {
    requests: {
        trustedProxyCIDRs: string[],
        extractClientIPFromHeader: string,
        extractProtocolFromHeader: string,
    }
}

/**
 * getIpAndHttpProtocolSecurity - Gets the client IP and protocol security info from the request
 * @param request - http request object
 * @param s3config - s3 config
 * @return - returns object with client IP and security status
 */
export function getIpAndHttpProtocolSecurity(request: ArsenalRequest, s3config?: S3Config): 
    { ip: string, isSecure: boolean } {
    const requestConfig = s3config?.requests;
    const remoteAddress = request.socket.remoteAddress;
    const clientIp = remoteAddress?.toString() ?? '';
    if (requestConfig) {
        const { trustedProxyCIDRs, extractClientIPFromHeader, extractProtocolFromHeader } = requestConfig;
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
            let finalIp = clientIp;
            if (ipFromHeader && ipFromHeader.trim().length) {
                finalIp = ipFromHeader.split(',')[0].trim();
            }
            let isSecure = false;
            if (extractProtocolFromHeader) {
                isSecure = request.headers[extractProtocolFromHeader.toLowerCase()] === 'https';
            } else {
                isSecure = request.socket instanceof TLSSocket && request.socket.encrypted;
            }
            return { 
                ip: finalIp,
                isSecure
            };
        }
    }
    
    return { 
        ip: clientIp, 
        isSecure: request.socket instanceof TLSSocket && request.socket.encrypted 
    };
}

/**
 * getClientIp - Gets the client IP from the request
 * @param request - http request object
 * @param s3config - s3 config
 * @return - returns client IP from the request
 */
export function getClientIp(request: ArsenalRequest, s3config?: S3Config): string {
    if (request.clientIp) {
        return request.clientIp;
    }
    return getIpAndHttpProtocolSecurity(request, s3config).ip;
}

/**
 * getHttpProtocolSecurity - Determines if the request is secure
 * @param request - http request object
 * @param s3config - s3 config
 * @return {boolean} - returns true if the request is secure
 */
export function getHttpProtocolSecurity(request: ArsenalRequest, s3config?: S3Config): boolean {
    if (request.isSecure) {
        return request.isSecure;
    }
    return getIpAndHttpProtocolSecurity(request, s3config).isSecure;
}
