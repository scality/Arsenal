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
    ].forEach(test => it(`test with token(${test.token})`, () => {
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
    }));
});

describe('v2: queryAuthCheck', () => {
    let clock;

    beforeEach(() => {
        clock = sinon.useFakeTimers();
    });
    afterEach(() => {
        process.env.PRE_SIGN_URL_EXPIRY = 604800000;
        clock.restore();
    });
    it('URL should not expire before 7 days with default expiry', () => {
        const currentTime = Date.now() / 1000;
        const expires = currentTime + 604799; // in seconds
        const mockRequest = {
            method: 'GET',
            url: 'mockurl',
            query: {
                Expires: expires,
            },
            headers: {
                'Content-MD5': 'c',
            },
        };
        const data = {
            Expires: expires,
            AWSAccessKeyId: 'keyId',
            Signature: 'sign',
        };
        const res = queryAuthCheck(mockRequest, log, data);
        assert.notStrictEqual(res.err.AccessDenied, true);
        assert.notStrictEqual(res.err.RequestTimeTooSkewed, true);
    });
    it('URL should expire after 7 days with default expiry', () => {
        clock.tick(604800000); // take time 604800000ms (7 days) ahead
        const currentTime = Date.now();
        const request = { method: 'GET', query: { Expires: currentTime } };
        const data = { Expires: currentTime };
        const res = queryAuthCheck(request, log, data);
        assert.notStrictEqual(res.err, null);
        assert.notStrictEqual(res.err, undefined);
        assert.strictEqual(res.err.AccessDenied, true);
    });
    it('URL should not expire before 7 days with custom expiry', () => {
        process.env.PRE_SIGN_URL_EXPIRY = 31556952000; // in ms (1 year)
        const currentTime = Date.now() / 1000;
        const expires = currentTime + 604799; // in seconds
        const mockRequest = {
            method: 'GET',
            url: 'mockurl',
            query: {
                Expires: expires,
            },
            headers: {
                'Content-MD5': 'c',
            },
        };
        const data = {
            Expires: expires,
            AWSAccessKeyId: 'keyId',
            Signature: 'sign',
        };
        const res = queryAuthCheck(mockRequest, log, data);
        assert.notStrictEqual(res.err.AccessDenied, true);
        assert.notStrictEqual(res.err.RequestTimeTooSkewed, true);
    });
    it('URL should still not expire after 7 days with custom expiry', () => {
        clock.tick(604800000); // take time 604800000ms (7 days) ahead
        process.env.PRE_SIGN_URL_EXPIRY = 31556952000; // in ms (1 year)
        const currentTime = Date.now() / 1000;
        const request = { method: 'GET', query: { Expires: currentTime } };
        const data = { Expires: currentTime };
        const res = queryAuthCheck(request, log, data);
        assert.notStrictEqual(res.err.AccessDenied, true);
    });
    it('should return RequestTimeTooSkewed with current time > expiry', () => {
        clock.tick(123);
        const expires = 0;
        const request = { method: 'GET', query: { Expires: expires } };
        const data = { Expires: expires };
        const res = queryAuthCheck(request, log, data);
        assert.notStrictEqual(res.err, null);
        assert.notStrictEqual(res.err, undefined);
        assert.strictEqual(res.err.RequestTimeTooSkewed, true);
    });
    it('should return MissingSecurityHeader with invalid expires param', () => {
        const request = { method: 'GET', query: { Expires: 'a string' } };
        const data = { Expires: 'a string' };
        const res = queryAuthCheck(request, log, data);
        assert.notStrictEqual(res.err, null);
        assert.notStrictEqual(res.err, undefined);
        assert.strictEqual(res.err.MissingSecurityHeader, true);
    });
});
