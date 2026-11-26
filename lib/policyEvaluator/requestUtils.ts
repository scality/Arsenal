import ipaddr from 'ipaddr.js';
import * as ipCheck from '../ipCheck';
import { TLSSocket } from 'tls';
import { type ArsenalRequest } from '../types/ArsenalRequest';

export interface S3Config {
    requests: {
        trustedProxyCIDRs: string[];
        extractClientIPFromHeader: string;
        extractProtocolFromHeader: string;
    };
}

/**
 * resolveClientIpFromHeader - Find the client address in a forwarded-for header
 *
 * Each proxy appends the address of the peer it received the request from, so
 * the right-most entries are the ones written by our own proxies, and anything
 * left of the first untrusted entry was written by the client and can be
 * forged. Walk the entries from the right, skip the trusted proxies, and return
 * the first untrusted one.
 *
 * If every entry is a trusted proxy, return the left-most one. If an entry is
 * not a valid IP address, stop and return the last trusted hop seen to its
 * right, which is the socket peer when no entry was trusted yet.
 *
 * @param header - value of the forwarded-for header
 * @param trustedProxyCIDRs - addresses or ranges of the trusted proxies
 * @param peerIp - address of the socket peer, a trusted proxy
 * @return - the client address
 */
function resolveClientIpFromHeader(header: string, trustedProxyCIDRs: string[], peerIp: string): string {
    const hops = header.split(',').map(hop => hop.trim());
    let lastTrustedHop = peerIp;
    for (let i = hops.length - 1; i >= 0; i--) {
        const hop = hops[i];
        if (!ipaddr.isValid(hop)) {
            return lastTrustedHop;
        }
        if (!ipCheck.ipMatchCidrList(trustedProxyCIDRs, hop)) {
            return hop;
        }
        lastTrustedHop = hop;
    }
    return lastTrustedHop;
}

/**
 * computeIpAndHttpProtocolSecurity - Compute the client IP and protocol security info from the request
 * and set the clientIp and isSecure properties on the request object
 * @param request - http request object
 * @param s3config - s3 config
 * @return - returns undefined
 */
export function computeIpAndHttpProtocolSecurity(request: ArsenalRequest, s3config?: S3Config) {
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
            const ipFromHeader = request.headers[extractClientIPFromHeader]?.toString();
            let finalIp = clientIp;
            if (ipFromHeader && ipFromHeader.trim().length) {
                finalIp = resolveClientIpFromHeader(ipFromHeader, trustedProxyCIDRs, clientIp);
            }
            let isSecure = false;
            if (extractProtocolFromHeader) {
                isSecure = request.headers[extractProtocolFromHeader] === 'https';
            } else {
                isSecure = request.socket instanceof TLSSocket && request.socket.encrypted;
            }
            request.clientIp = finalIp;
            request.isSecure = isSecure;
            return;
        }
    }

    request.clientIp = clientIp;
    request.isSecure = request.socket instanceof TLSSocket && request.socket.encrypted;
    return;
}

/**
 * getClientIp - Gets the client IP from the request
 * @param request - http request object
 * @param s3config - s3 config
 * @return - returns client IP from the request object
 */
export function getClientIp(request: ArsenalRequest, s3config?: S3Config): string {
    if (request.clientIp !== undefined) {
        return request.clientIp;
    }
    computeIpAndHttpProtocolSecurity(request, s3config);
    return request.clientIp;
}

/**
 * getHttpProtocolSecurity - Determines if the request is secure
 * @param request - http request object
 * @param s3config - s3 config
 * @return - returns true if the request is secure
 */
export function getHttpProtocolSecurity(request: ArsenalRequest, s3config?: S3Config): boolean {
    if (request.isSecure !== undefined) {
        return request.isSecure;
    }
    computeIpAndHttpProtocolSecurity(request, s3config);
    return request.isSecure;
}
