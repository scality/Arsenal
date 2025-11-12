import assert from 'assert';

import RateLimitConfiguration from '../../../lib/models/RateLimitConfiguration';

describe('Test RateLimitConfiguration', () => {
    it('should create an empty RateLimitConfiguration', () => {
        const rlc = new RateLimitConfiguration({});
        assert.deepStrictEqual(rlc.getData(), {});
    });

    it('should create a RateLimitConfiguration with a RequestsPerSecond limit', () => {
        const rlc = new RateLimitConfiguration({
            RequestsPerSecond: {
                Limit: 1000,
            },
        });
        assert.deepStrictEqual(rlc.getData(), {
            RequestsPerSecond: {
                Limit: 1000,
            },
        });
    });

    it('should return RequestsPerSecond.Limit if set', () => {
        const rlc = new RateLimitConfiguration({
            RequestsPerSecond: {
                Limit: 1000,
            },
        });
        assert.strictEqual(rlc.getRequestsPerSecondLimit(), 1000);
    });

    it('should return undefined if RequestsPerSecond.Limit is not set', () => {
        const rlc = new RateLimitConfiguration({});
        assert.strictEqual(rlc.getRequestsPerSecondLimit(), undefined);
    });

    it('should set RequestsPerSecond.Limit', () => {
        const rlc = new RateLimitConfiguration({});
        assert.strictEqual(rlc.getRequestsPerSecondLimit(), undefined);
        rlc.setRequestsPerSecondLimit(1000);
        assert.strictEqual(rlc.getRequestsPerSecondLimit(), 1000);
    });

    it('should remove RequestsPerSecond.Limit', () => {
        const rlc = new RateLimitConfiguration({
            RequestsPerSecond: {
                Limit: 1000,
            },
        });
        assert.strictEqual(rlc.getRequestsPerSecondLimit(), 1000);
        rlc.removeRequestsPerSecondLimit();
        assert.strictEqual(rlc.getRequestsPerSecondLimit(), undefined);
    });
});
