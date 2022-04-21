import ipaddr from 'ipaddr.js';

/**
 * checkIPinRangeOrMatch checks whether a given ip address is in an ip address
 * range or matches the given ip address
 * @param cidr - ip address range or ip address
 * @param ip - parsed ip address
 * @return true if in range, false if not
 */
export function checkIPinRangeOrMatch(
    cidr: string,
    ip: ipaddr.IPv4 | ipaddr.IPv6,
): boolean {
    // If there is an exact match of the ip address, no need to check ranges
    if (ip.toString() === cidr) {
        return true;
    }
    try {
        if (ip instanceof ipaddr.IPv6) {
            const range = ipaddr.IPv6.parseCIDR(cidr);
            return ip.match(range);
        } else {
            const range = ipaddr.IPv4.parseCIDR(cidr);
            return ip.match(range);
        }
    } catch (error) {
        return false;
    }
}

/**
 * Parse IP address into object representation
 * @param ip - IPV4/IPV6/IPV4-mapped IPV6 address
 * @return parsedIp - Object representation of parsed IP
 */
export function parseIp(ip: string): ipaddr.IPv4 | ipaddr.IPv6 | {} {
    if (ipaddr.IPv4.isValid(ip)) {
        return ipaddr.parse(ip);
    }
    if (ipaddr.IPv6.isValid(ip)) {
        // also parses IPv6 mapped IPv4 addresses into IPv4 representation
        return ipaddr.process(ip);
    }
    return {};
}

/**
 * Checks if an IP adress matches a given list of CIDR ranges
 * @param cidrList - List of CIDR ranges
 * @param ip - IP address
 * @return - true if there is match or false for no match
 */
export function ipMatchCidrList(cidrList: string[], ip: string): boolean {
    const parsedIp = parseIp(ip);
    return cidrList.some((item) => {
        let cidr: string | undefined;
        // patch the cidr if range is not specified
        if (item.indexOf('/') === -1) {
            if (item.startsWith('127.')) {
                cidr = `${item}/8`;
            } else if (ipaddr.IPv4.isValid(item)) {
                cidr = `${item}/32`;
            }
        }
        return (
            (parsedIp instanceof ipaddr.IPv4 ||
                parsedIp instanceof ipaddr.IPv6) &&
            checkIPinRangeOrMatch(cidr || item, parsedIp)
        );
    });
}
