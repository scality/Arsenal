import * as ipCheck from '../ipCheck'
import { IncomingMessage } from 'http'

export interface S3Config {
    requests: {
        trustedProxyCIDRs: string[],
        extractClientIPFromHeader: string
    }
}

// TODO
//   I'm not sure about this behavior.
//   Should it returns string | string[] | undefined or string ?
/**
 * getClientIp - Gets the client IP from the request
 * @param request - http request object
 * @param s3config - s3 config
 * @return - returns client IP from the request
 */
export function getClientIp(request: IncomingMessage, s3config?: S3Config): string {
    const requestConfig = s3config?.requests;
    const remoteAddress = request.socket.remoteAddress;
    // TODO What to do if clientIp === undefined ?
    const clientIp = (requestConfig ? remoteAddress : request.headers['x-forwarded-for'] || remoteAddress)?.toString() ?? '';
    if (requestConfig) {
        const { trustedProxyCIDRs, extractClientIPFromHeader } = requestConfig;
        /**
         * if requests are configured to come via proxy,
         * check from config which proxies are to be trusted and
         * which header to be used to extract client IP
         */
        if (ipCheck.ipMatchCidrList(trustedProxyCIDRs, clientIp)) {
            const ipFromHeader = request.headers[extractClientIPFromHeader]?.toString();
            if (ipFromHeader && ipFromHeader.trim().length) {
                return ipFromHeader.split(',')[0].trim();
            }
        }
    }
    return clientIp?.toString() ?? '';
}
