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
        // .process pares v6 as v6 and parses mapped v4 addresses as IPv4
        //  (unmapped)
        return ipaddr.process(ip);
    }
    // not valid ip address according to module, so return empty object
    // which will obviously not match a given condition range
    return {};
}

module.exports = {
    checkIPinRangeOrMatch,
    parseIp,
};
