'use strict';

const assert = require('assert');

// No jest.mock here: this spec deliberately drives the REAL
// @opentelemetry/api with no SDK / propagator registered — the
// "arsenal bumped into a consumer that never initialized OTEL" case.
// With no SDK, trace.getSpan(context.active()) returns undefined, so
// stampActiveTraceContext must be a safe no-op: clear any stale
// traceContext and never throw.
const { stampActiveTraceContext } = require('../../../../lib/storage/metadata/captureTraceContext');

describe('stampActiveTraceContext (no OTEL SDK registered)', () => {
    it('is a safe no-op and clears a stale traceContext', () => {
        const data = { foo: 'bar', traceContext: { traceparent: 'stale' } };
        assert.doesNotThrow(() => stampActiveTraceContext(data));
        assert.strictEqual('traceContext' in data, false);
    });

    it('adds no traceContext field when none existed', () => {
        const data = { foo: 'bar' };
        assert.doesNotThrow(() => stampActiveTraceContext(data));
        assert.strictEqual('traceContext' in data, false);
    });
});
