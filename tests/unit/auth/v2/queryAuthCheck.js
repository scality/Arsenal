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
    ].forEach(t => test(`test with token(${t.token})`, () => {
        const request = { method: 'GET' };
        const data = {
            SecurityToken: t.token,
        };
        const res = queryAuthCheck(request, log, data);
        if (t.error) {
            assert.notStrictEqual(res.err, undefined);
            assert.strictEqual(res.err.InvalidToken, true);
        } else {
            assert.notStrictEqual(res.err, undefined);
            assert.strictEqual(res.err.MissingSecurityHeader, true);
        }
    }));
});
