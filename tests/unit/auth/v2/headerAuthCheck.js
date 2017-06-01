const assert = require('assert');

const headerAuthCheck =
    require('../../../../lib/auth/v2/headerAuthCheck').check;
const DummyRequestLogger = require('../../helpers').DummyRequestLogger;

const log = new DummyRequestLogger();

describe('v2: headerAuthCheck', () => {
    [
        { token: undefined, error: false },
        { token: 'invalid-token', error: true },
        { token: 'a'.repeat(128), error: false },
    ].forEach(test => it(`test with token(${test.token})`, () => {
        const request = {
            headers: {
                'x-amz-security-token': test.token,
            },
        };
        const res = headerAuthCheck(request, log, {});
        if (test.error) {
            assert.notStrictEqual(res.err, undefined);
            assert.strictEqual(res.err.InvalidToken, true);
        } else {
            assert.notStrictEqual(res.err, undefined);
            assert.notStrictEqual(res.err.InvalidToken, true);
        }
    }));
});
