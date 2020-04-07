const assert = require('assert');
const sinon = require('sinon');

const queryAuthCheck =
    require('../../../../lib/auth/v2/queryAuthCheck').check;
const DummyRequestLogger = require('../../helpers').DummyRequestLogger;

const log = new DummyRequestLogger();

describe('v2: queryAuthCheck', () => {
    [
        { token: undefined, error: false },
        { token: 'invalid-token', error: true },
        { token: 'a'.repeat(128), error: false },
    ].forEach(test => {
        it(`test with token(${test.token})`, () => {
            const request = { method: 'GET' };
            const data = {
                SecurityToken: test.token,
            };
            const res = queryAuthCheck(request, log, data);
            if (test.error) {
                assert.notStrictEqual(res.err, undefined);
                assert.strictEqual(res.err.InvalidToken, true);
            } else {
                assert.notStrictEqual(res.err, undefined);
                assert.strictEqual(res.err.MissingSecurityHeader, true);
            }
        });
    });
});

describe('v2: queryAuthCheck', () => {
    const mockRequest = {
        method: 'GET',
        url: 'mockurl',
        query: {
            Expires: expires
        },
        headers: {
            'Content-MD5': 'c'
        },
    };
    let clock = sinon.useFakeTimers();

    it('URL shouldn\'t expire before 7 days with default expiry', () => {
        const currentTime = Date.now() / 1000;
        const expires = currentTime + 604799;  // in seconds
        const data = {
            Expires: expires,
            AWSAccessKeyId: 'keyId',
            Signature: 'sign'
        };
        const res = queryAuthCheck(mockRequest, log, data);
        assert.notStrictEqual(res.err.AccessDenied, true);
        assert.notStrictEqual(res.err.RequestTimeTooSkewed, true);
    });

    clock.tick(604800000);  // take time 604800000ms (7 days) ahead

    it('URL should expire after 7 days with default preSignUrlExpiry', () => {
        const currentTime = Date.now();
        const request = { method: 'GET', query: { Expires: currentTime } };
        const data = { Expires: currentTime };
        const res = queryAuthCheck(request, log, data);
        assert.notStrictEqual(res.err, undefined);
        assert.strictEqual(res.err.AccessDenied, true);
    });
    it('should raise MissingSecurityHeader with invalid expires param', () => {
        const request = { method: 'GET', query: { Expires: 'a string' } };
        const data = { Expires: 'a string' };
        const res = queryAuthCheck(request, log, data);
        assert.notStrictEqual(res.err, undefined);
        assert.strictEqual(res.err.MissingSecurityHeader, true);
    });
    it('should raise RequestTimeTooSkewed with current time > expiry', () => {
        const request = { method: 'GET', query: { Expires: 0 } };
        const data = { Expires: 0 };
        const res = queryAuthCheck(request, log, data);
        assert.notStrictEqual(res.err, undefined);
        assert.strictEqual(res.err.RequestTimeTooSkewed, true);
    });

    clock.restore();
});
