'use strict';

const assert = require('assert');

const Backoff = require('../../../lib/utils/Backoff').default;

describe('Backoff', () => {
    it('should apply defaults when no options are given', () => {
        const backoff = new Backoff();
        assert.strictEqual(backoff.ms, 100);
        assert.strictEqual(backoff.max, 10000);
        assert.strictEqual(backoff.factor, 2);
        assert.strictEqual(backoff.jitter, 0);
    });

    it('should grow the duration exponentially without jitter', () => {
        const backoff = new Backoff({ min: 100, factor: 2, jitter: 0 });
        assert.strictEqual(backoff.duration(), 100);
        assert.strictEqual(backoff.duration(), 200);
        assert.strictEqual(backoff.duration(), 400);
    });

    it('should cap the duration at max', () => {
        const backoff = new Backoff({ min: 1000, max: 3000, factor: 2, jitter: 0 });
        backoff.duration(); // 1000
        backoff.duration(); // 2000
        assert.strictEqual(backoff.duration(), 3000);
        assert.strictEqual(backoff.duration(), 3000);
    });

    it('should reset the attempt counter', () => {
        const backoff = new Backoff({ min: 100, factor: 2, jitter: 0 });
        backoff.duration();
        backoff.duration();
        backoff.reset();
        assert.strictEqual(backoff.duration(), 100);
    });

    it('should keep jittered durations within [0, max]', () => {
        const backoff = new Backoff({ min: 1000, max: 5000, factor: 1.5, jitter: 0.5 });
        for (let i = 0; i < 20; i++) {
            const duration = backoff.duration();
            assert(duration >= 0, `duration ${duration} should be >= 0`);
            assert(duration <= 5000, `duration ${duration} should be <= max`);
        }
    });

    it('should ignore an out-of-range jitter value', () => {
        const backoff = new Backoff({ min: 100, factor: 2, jitter: 1.5 });
        assert.strictEqual(backoff.jitter, 0);
        assert.strictEqual(backoff.duration(), 100);
    });
});
