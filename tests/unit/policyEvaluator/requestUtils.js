const assert = require('assert');
const DummyRequest = require('../../utils/DummyRequest');
const requestUtils = require('../../../lib/policyEvaluator/requestUtils');

describe('requestUtils.getClientIp', () => {
    // s3 config with 'requests.viaProxy` enabled
    const configWithProxy
        = require('../../utils/dummyS3ConfigProxy.json');
    // s3 config with 'requests.viaProxy` disabled
    const configWithoutProxy = require('../../utils/dummyS3Config.json');
    const testClientIp1 = '192.168.100.1';
    const testClientIp2 = '192.168.104.0';
    const testProxyIp = '192.168.100.2';

    it('should return client Ip address from header ' +
        'if the request comes via proxies', () => {
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

    it('should not return client Ip address from header ' +
        'if the request is not forwarded from proxies or ' +
        'fails ip check', () => {
        const request = new DummyRequest({
            headers: {
                'x-forwarded-for': [testClientIp1, testProxyIp].join(','),
            },
            url: '/',
            parsedHost: 'localhost',
            socket: {
                remoteAddress: testClientIp2,
            },
        });
        const result = requestUtils.getClientIp(request, configWithoutProxy);
        assert.strictEqual(result, testClientIp2);
    });

    it('should not return client Ip address from header ' +
        'if the request is forwarded from proxies, but the request ' +
        'has no expected header or the header value is empty', () => {
        const request = new DummyRequest({
            headers: {
                'x-forwarded-for': ' ',
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
});
