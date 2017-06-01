const assert = require('assert');

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
