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

    describe('with a forwarded-for header from a trusted proxy', () => {
        const untrustedClientIp = '10.20.30.40';
        const forgedIp = '10.0.0.1';
        const trustedLoadBalancerIp = '192.168.101.10';

        const getClientIpFromHeader = header => {
            const request = new DummyRequest({
                headers: {
                    'x-forwarded-for': header,
                },
                url: '/',
                parsedHost: 'localhost',
                socket: {
                    remoteAddress: testProxyIp,
                },
            });
            return requestUtils.getClientIp(request, configWithProxy);
        };

        it('should ignore an address forged by the client left of its own address', () => {
            const result = getClientIpFromHeader(`${forgedIp}, ${untrustedClientIp}`);
            assert.strictEqual(result, untrustedClientIp);
        });

        it('should skip trusted proxies right of the client address', () => {
            const result = getClientIpFromHeader(
                `${forgedIp}, ${untrustedClientIp}, ${trustedLoadBalancerIp}`);
            assert.strictEqual(result, untrustedClientIp);
        });

        it('should return the left-most address if every address is a trusted proxy', () => {
            const result = getClientIpFromHeader(`${testClientIp1}, ${trustedLoadBalancerIp}`);
            assert.strictEqual(result, testClientIp1);
        });

        it('should return the last trusted hop if an entry is not a valid address', () => {
            const result = getClientIpFromHeader(`${forgedIp}, unknown, ${trustedLoadBalancerIp}`);
            assert.strictEqual(result, trustedLoadBalancerIp);
        });

        it('should return the socket peer if the right-most entry is not a valid address', () => {
            const result = getClientIpFromHeader(`${forgedIp}, ${untrustedClientIp}:5678`);
            assert.strictEqual(result, testProxyIp);
        });
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

    it('should check TLS when request not from trusted proxy with http', () => {
        const request = new DummyRequest({
            headers: {
                'x-forwarded-proto': 'http',
            },
            socket: new TLSSocket(null),
        });
        request.socket.encrypted = true;
        const result = requestUtils.getHttpProtocolSecurity(request, configWithoutProxy);
        assert.strictEqual(result, true);
    });

    it('should return false for non-TLS socket', () => {
        const request = new DummyRequest({
            headers: {
                'x-forwarded-proto': 'https',
            },
            socket: {
                remoteAddress: testClientIp,
            },
        });
        const result = requestUtils.getHttpProtocolSecurity(request, configWithoutProxy);
        assert.strictEqual(result, false);
    });
});

describe('requestUtils.computeIpAndHttpProtocolSecurity', () => {
    const configWithProxy = require('../../utils/dummyS3ConfigProxy.json');
    const configWithoutProxy = require('../../utils/dummyS3Config.json');
    const testClientIp1 = '192.168.100.1';
    const testClientIp2 = '192.168.104.0';
    const testProxyIp = '192.168.100.2';

    it('should return both IP and security info from headers when request comes via trusted proxy', () => {
        const request = new DummyRequest({
            headers: {
                'x-forwarded-for': [testClientIp1, testProxyIp].join(','),
                'x-forwarded-proto': 'https',
            },
            url: '/',
            parsedHost: 'localhost',
            socket: {
                remoteAddress: testProxyIp,
            },
        });
        requestUtils.computeIpAndHttpProtocolSecurity(request, configWithProxy);
        assert.strictEqual(request.clientIp, testClientIp1);
        assert.strictEqual(request.isSecure, true);
    });

    it('should return IP from header and http security when proxy sends http protocol', () => {
        const request = new DummyRequest({
            headers: {
                'x-forwarded-for': [testClientIp1, testProxyIp].join(','),
                'x-forwarded-proto': 'http',
            },
            url: '/',
            parsedHost: 'localhost',
            socket: {
                remoteAddress: testProxyIp,
            },
        });
        requestUtils.computeIpAndHttpProtocolSecurity(request, configWithProxy);
        assert.strictEqual(request.clientIp, testClientIp1);
        assert.strictEqual(request.isSecure, false);
    });

    it('should return socket IP and TLS security when not using proxy', () => {
        // Create a mock TLS socket that allows property assignment
        const mockTLSSocket = {
            remoteAddress: testClientIp2,
            encrypted: true
        };
        // Make it pass instanceof check
        Object.setPrototypeOf(mockTLSSocket, TLSSocket.prototype);
        
        const request = new DummyRequest({
            headers: {},
            url: '/',
            parsedHost: 'localhost',
            socket: mockTLSSocket,
        });
        
        requestUtils.computeIpAndHttpProtocolSecurity(request, configWithoutProxy);
        assert.strictEqual(request.clientIp, testClientIp2);
        assert.strictEqual(request.isSecure, true);
    });

    it('should return socket IP and false security for non-TLS socket', () => {
        const request = new DummyRequest({
            headers: {},
            url: '/',
            parsedHost: 'localhost',
            socket: {
                remoteAddress: testClientIp2,
            },
        });
        requestUtils.computeIpAndHttpProtocolSecurity(request, configWithoutProxy);
        assert.strictEqual(request.clientIp, testClientIp2);
        assert.strictEqual(request.isSecure, false);
    });

    it('should work when individual functions are called first', () => {
        const request = new DummyRequest({
            headers: {
                'x-forwarded-for': [testClientIp1, testProxyIp].join(','),
                'x-forwarded-proto': 'https',
            },
            url: '/',
            parsedHost: 'localhost',
            socket: {
                remoteAddress: testProxyIp,
            },
        });
        
        // Call individual functions first
        const ip = requestUtils.getClientIp(request, configWithProxy);
        const isSecure = requestUtils.getHttpProtocolSecurity(request, configWithProxy);
        
        // Combined function should return cached result
        requestUtils.computeIpAndHttpProtocolSecurity(request, configWithProxy);
        assert.strictEqual(request.clientIp, testClientIp1);
        assert.strictEqual(request.isSecure, true);
        assert.strictEqual(ip, testClientIp1);
        assert.strictEqual(isSecure, true);
    });

    it('should work without s3config', () => {
        const request = new DummyRequest({
            headers: {},
            url: '/',
            parsedHost: 'localhost',
            socket: {
                remoteAddress: testClientIp2,
            },
        });
        requestUtils.computeIpAndHttpProtocolSecurity(request, configWithoutProxy);
        assert.strictEqual(request.clientIp, testClientIp2);
        assert.strictEqual(request.isSecure, false);
    });
});
