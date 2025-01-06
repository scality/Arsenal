const assert = require('assert');
const DummyRequest = require('../../utils/DummyRequest');
const requestUtils = require('../../../lib/policyEvaluator/requestUtils');
const { TLSSocket } = require('tls');

describe('requestUtils.getClientIp', () => {
    // s3 config with 'requests.viaProxy` enabled
    const configWithProxy
        = require('../../utils/dummyS3ConfigProxy.json');
    // s3 config with 'requests.viaProxy` disabled
    const configWithoutProxy = require('../../utils/dummyS3Config.json');
    const testClientIp1 = '192.168.100.1';
    const testClientIp2 = '192.168.104.0';
    const testProxyIp = '192.168.100.2';

    it('should return client Ip address from header if the request comes via proxies', () => {
        const request = new DummyRequest({
            headers: {
                'x-forwarded-for': [testClientIp1, testProxyIp].join(','),
            },
            url: '/',
            parsedHost: 'localhost',
            socket: {
                remoteAddress: testProxyIp,
            },
        });
        const result = requestUtils.getClientIp(request, configWithProxy);
        assert.strictEqual(result, testClientIp1);
    });

    it('should return client Ip address in the proxy case when the header has uppercases', () => {
        const request = new DummyRequest({
            headers: {
                'x-forwarded-for': [testClientIp1, testProxyIp].join(','),
            },
            url: '/',
            parsedHost: 'localhost',
            socket: {
                remoteAddress: testProxyIp,
            },
        });
        const result = requestUtils.getClientIp(request, {
            requests: {
                viaProxy: true,
                trustedProxyCIDRs: ['192.168.100.0/22'],
                extractClientIPFromHeader: 'X-Forwarded-For',
            },
        });
        assert.strictEqual(result, testClientIp1);
    });

    it('should return client Ip address from socket info if the request is not forwarded from proxies', () => {
        const request = new DummyRequest({
            headers: {},
            url: '/',
            parsedHost: 'localhost',
            socket: {
                remoteAddress: testClientIp2,
            },
        });
        const result = requestUtils.getClientIp(request, configWithoutProxy);
        assert.strictEqual(result, testClientIp2);
    });

    it('should not return client Ip address from header if the request is forwarded from proxies, but the request ' +
        'has no expected header or the header value is empty', () => {
        const request = new DummyRequest({
            headers: {
                'x-forwarded-for': '',
            },
            url: '/',
            parsedHost: 'localhost',
            socket: {
                remoteAddress: testClientIp2,
            },
        });
        const result = requestUtils.getClientIp(request, configWithProxy);
        assert.strictEqual(result, testClientIp2);
    });

    it('should not return client Ip address from header if the request comes via proxies and ' +
        'no request config is available as the proxy is not trusted', () => {
        const request = new DummyRequest({
            headers: {
                'x-forwarded-for': testClientIp1,
            },
            url: '/',
            parsedHost: 'localhost',
            socket: {
                remoteAddress: testProxyIp,
            },
        });
        const result = requestUtils.getClientIp(request, configWithoutProxy);
        assert.strictEqual(result, testProxyIp);
    });

    it('should return client Ip address from socket info if the request comes via proxies and ' +
        'request config is available and ip check fails', () => {
        const dummyRemoteIP = '221.10.221.10';
        const request = new DummyRequest({
            headers: {
                'x-forwarded-for': testClientIp1,
            },
            url: '/',
            parsedHost: 'localhost',
            socket: {
                remoteAddress: dummyRemoteIP,
            },
        });
        const result = requestUtils.getClientIp(request, configWithProxy);
        assert.strictEqual(result, dummyRemoteIP);
    });
});

describe('requestUtils.getHttpProtocolSecurity', () => {
    const configWithProxy = require('../../utils/dummyS3ConfigProxy.json');
    const configWithoutProxy = require('../../utils/dummyS3Config.json');
    const testClientIp = '192.168.100.1';
    const testProxyIp = '192.168.100.2';

    it('should return true if request comes via trusted proxy with https proto header', () => {
        const request = new DummyRequest({
            headers: {
                'x-forwarded-proto': 'https',
            },
            socket: {
                remoteAddress: testProxyIp,
            },
        });
        const result = requestUtils.getHttpProtocolSecurity(request, configWithProxy);
        assert.strictEqual(result, true);
    });

    it('should return false if request comes via trusted proxy with http proto header', () => {
        const request = new DummyRequest({
            headers: {
                'x-forwarded-proto': 'http',
            },
            socket: {
                remoteAddress: testProxyIp,
            },
        });
        const result = requestUtils.getHttpProtocolSecurity(request, configWithProxy);
        assert.strictEqual(result, false);
    });

    it('should check TLS when request not from trusted proxy', () => {
        const request = new DummyRequest({
            headers: {
                'x-forwarded-proto': 'https',
            },
            socket: new TLSSocket(null),
        });
        request.socket.encrypted = true;
        const result = requestUtils.getHttpProtocolSecurity(request, configWithoutProxy);
        assert.strictEqual(result, true);
    });

    it('should return false for non-TLS socket', () => {
        const request = new DummyRequest({
            headers: {},
            socket: {
                remoteAddress: testClientIp,
            },
        });
        const result = requestUtils.getHttpProtocolSecurity(request, configWithoutProxy);
        assert.strictEqual(result, false);
    });

    it('should handle configured headers with uppercases', () => {
        const request = new DummyRequest({
            headers: {
                'x-forwarded-proto': 'https',
            },
            socket: {
                remoteAddress: testProxyIp,
            },
        });
        const result = requestUtils.getHttpProtocolSecurity(request, {
            requests: {
                viaProxy: true,
                trustedProxyCIDRs: ['192.168.100.0/22'],
                extractClientIPFromHeader: 'X-Forwarded-For',
                extractProtocolFromHeader: 'X-Forwarded-Proto',
            },
        });
        assert.strictEqual(result, true);
    });
});
