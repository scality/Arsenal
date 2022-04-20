'use strict'; // eslint-disable-line strict

const ipaddr = require('ipaddr.js');

/**
 * checkIPinRangeOrMatch checks whether a given ip address is in an ip address
 * range or matches the given ip address
 * @param {string} cidr - ip address range or ip address
 * @param {object} ip - parsed ip address
 * @return {boolean} true if in range, false if not
 */
function checkIPinRangeOrMatch(cidr, ip) {
    // If there is an exact match of the ip address, no need to check ranges
    if (ip.toString() === cidr) {
        return true;
    }
    let range;

    try {
        range = ipaddr.IPv4.parseCIDR(cidr);
    } catch (err) {
        try {
        // not ipv4 so try ipv6
            range = ipaddr.IPv6.parseCIDR(cidr);
        } catch (err) {
            // range is not valid ipv4 or ipv6
            return false;
        }
    }
    try {
        return ip.match(range);
    } catch (err) {
        return false;
    }
}

/**
* Parse IP address into object representation
* @param {string} ip - IPV4/IPV6/IPV4-mapped IPV6 address
* @return {object} parsedIp - Object representation of parsed IP
*/
function parseIp(ip) {
    if (ipaddr.IPv4.isValid(ip)) {
        return ipaddr.parse(ip);
    }
    if (ipaddr.IPv6.isValid(ip)) {
        // also parses IPv6 mapped IPv4 addresses into IPv4 representation
        return ipaddr.process(ip);
    }
    // not valid ip address according to module, so return empty object
    // which will obviously not match a range of ip addresses that the parsedIp
    // is being tested against
    return {};
}


/**
* Checks if an IP adress matches a given list of CIDR ranges
* @param {string[]} cidrList - List of CIDR ranges
* @param {string} ip - IP address
* @return {boolean} - true if there is match or false for no match
*/
function ipMatchCidrList(cidrList, ip) {
    const parsedIp = parseIp(ip);
    return cidrList.some(item => {
        let cidr;
        // patch the cidr if range is not specified
        if (item.indexOf('/') === -1) {
            if (item.startsWith('127.')) {
                cidr = `${item}/8`;
            } else if (ipaddr.IPv4.isValid(item)) {
                cidr = `${item}/32`;
            }
        }
        return checkIPinRangeOrMatch(cidr || item, parsedIp);
    });
}

module.exports = {
    checkIPinRangeOrMatch,
    ipMatchCidrList,
    parseIp,
};
