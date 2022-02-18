'use strict'; // eslint-disable-line strict

const assert = require('assert');
const ipCheck = require('../../lib/ipCheck');
const ipaddr = require('ipaddr.js');

function parseValidIpCheck(ip, sup) {
    const actualRes = ipCheck.parseIp(ip);
    assert(actualRes instanceof sup);
}

function parseInvalidIpCheck(ip) {
    const actualRes = ipCheck.parseIp(ip);
    assert.deepStrictEqual(actualRes, {});
}

function cidrMatchCheck(cidr, ip, expectedRes) {
    const actualRes = ipCheck.checkIPinRangeOrMatch(cidr,
        ipCheck.parseIp(ip));
    assert.strictEqual(actualRes, expectedRes);
}

function cidrListMatchCheck(cidrList, ip, expectedRes) {
    const actualRes = ipCheck.ipMatchCidrList(cidrList, ip);
    assert.strictEqual(actualRes, expectedRes);
}

describe('Parse IP address', () => {
    it('should parse IPv4 address',
        () => parseValidIpCheck('192.168.1.1', ipaddr.IPv4));

    it('should parse IPv6 address',
        () => parseValidIpCheck('2001:cdba::3257:9652', ipaddr.IPv6));

    it('should parse IPv4 mapped IPv6 address',
        // ::ffff:c0a8:101 mapped for 192.168.1.1
        () => parseValidIpCheck('::ffff:c0a8:101', ipaddr.IPv4));

    ['260.384.2.1', 'INVALID', '', null, undefined].forEach(item => {
        it(`should return empty object for invalid IP address: (${item})`,
            () => parseInvalidIpCheck(item));
    });
});

describe('Check IP matches CIDR range', () => {
    it('should match IP in a range',
        () => cidrMatchCheck('192.168.1.0/24', '192.168.1.1', true));

    it('should not match IP not in a range',
        () => cidrMatchCheck('192.168.1.0/24', '127.0.0.1', false));

    it('should match if range equals IP',
        () => cidrMatchCheck('192.168.1.1', '192.168.1.1', true));


    ['260.384.2.1', 'INVALID', '', null, undefined].forEach(item => {
        it(`should not match for invalid IP: (${item})`,
            () => cidrMatchCheck('192.168.1.0/24', item, false));
    });
});

describe('Check IP matches a list of CIDR ranges', () => {
    it('should match IP in a valid range',
        () => cidrListMatchCheck(['192.168.1.0/24', '192.168.100.14/24',
            '2001:db8::'], '192.168.100.1', true));

    [
        [['127.0.0.1'], '127.0.0.2'],
        [['192.168.1.1'], '192.168.1.1'],
    ].forEach(item =>
        it(`should match IP ${item[0][0]} without CIDR range`,
            () => cidrListMatchCheck(item[0], item[1], true))
    );

    it('should not range match if CIDR range is not provided',
        () => cidrListMatchCheck(['192.168.1.1'], '192.168.1.3', false));
});
