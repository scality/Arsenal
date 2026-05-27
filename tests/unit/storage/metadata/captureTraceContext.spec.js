'use strict';

const assert = require('assert');

// Mock @opentelemetry/api so we can drive stampActiveTraceContext
// without needing a registered SDK or propagator. The api package is a
// runtime dep of arsenal but we can stub the small surface it consumes.
const mockActive = jest.fn();
const mockGetSpan = jest.fn();
const mockInject = jest.fn();

jest.mock('@opentelemetry/api', () => ({
    context: { active: mockActive },
    trace: { getSpan: mockGetSpan },
    propagation: { inject: mockInject },
}));

const { stampActiveTraceContext } = require('../../../../lib/storage/metadata/captureTraceContext');

describe('stampActiveTraceContext', () => {
    beforeEach(() => {
        mockActive.mockReset();
        mockGetSpan.mockReset();
        mockInject.mockReset();
        mockActive.mockReturnValue({ tag: 'mock-active-context' });
    });

    it('clears traceContext when no span is active', () => {
        mockGetSpan.mockReturnValue(undefined);
        const data = { traceContext: { traceparent: 'stale-prior-trace' } };
        stampActiveTraceContext(data);
        assert.strictEqual(data.traceContext, undefined);
        // No injection should be attempted when there is no active span.
        assert.strictEqual(mockInject.mock.calls.length, 0);
    });

    it('is a no-op (no traceContext field added) when no span is active and data had none', () => {
        mockGetSpan.mockReturnValue(undefined);
        const data = { foo: 'bar' };
        stampActiveTraceContext(data);
        assert.strictEqual('traceContext' in data, false);
    });

    it('writes { traceparent } when active span yields a traceparent', () => {
        mockGetSpan.mockReturnValue({
            /* opaque span object */
        });
        mockInject.mockImplementation((ctx, carrier, setter) => {
            setter.set(carrier, 'traceparent', '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
        });

        const data = {};
        stampActiveTraceContext(data);
        assert.deepStrictEqual(data.traceContext, {
            traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
        });

        // Verify inject was given the active context so propagation
        // sees the right state, not a freshly-constructed empty one.
        assert.strictEqual(mockInject.mock.calls.length, 1);
        const [ctxArg, carrierArg] = mockInject.mock.calls[0];
        assert.deepStrictEqual(ctxArg, { tag: 'mock-active-context' });
        assert.strictEqual(typeof carrierArg, 'object');
    });

    it('writes both traceparent and tracestate when both are present', () => {
        mockGetSpan.mockReturnValue({});
        mockInject.mockImplementation((ctx, carrier, setter) => {
            setter.set(carrier, 'traceparent', '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
            setter.set(carrier, 'tracestate', 'rojo=00f067aa0ba902b7');
        });

        const data = {};
        stampActiveTraceContext(data);
        assert.deepStrictEqual(data.traceContext, {
            traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
            tracestate: 'rojo=00f067aa0ba902b7',
        });
    });

    it('clears traceContext when propagation injects no traceparent', () => {
        // Defensive case: a misbehaving propagator that exposes only
        // unrelated headers. We must not write a partial / invalid
        // trace context, and we must clear any stale value.
        mockGetSpan.mockReturnValue({});
        mockInject.mockImplementation((ctx, carrier, setter) => {
            setter.set(carrier, 'baggage', 'unrelated=true');
        });

        const data = { traceContext: { traceparent: 'stale' } };
        stampActiveTraceContext(data);
        assert.strictEqual(data.traceContext, undefined);
    });

    it('overwrites a stale traceContext with the active one', () => {
        mockGetSpan.mockReturnValue({});
        mockInject.mockImplementation((ctx, carrier, setter) => {
            setter.set(carrier, 'traceparent', 'fresh-tp');
        });

        const data = { traceContext: { traceparent: 'stale-tp' } };
        stampActiveTraceContext(data);
        assert.deepStrictEqual(data.traceContext, { traceparent: 'fresh-tp' });
    });

    it('accepts an ObjectMD instance and stamps onto its underlying value', () => {
        mockGetSpan.mockReturnValue({});
        mockInject.mockImplementation((ctx, carrier, setter) => {
            setter.set(carrier, 'traceparent', 'tp-from-objmd');
        });

        // ObjectMD is not mocked (only @opentelemetry/api is), so this is
        // the real class and the `instanceof ObjectMD` branch is exercised.
        const ObjectMD = require('../../../../lib/models/ObjectMD').default;
        const objMd = new ObjectMD();
        stampActiveTraceContext(objMd);
        assert.deepStrictEqual(objMd.getValue().traceContext, {
            traceparent: 'tp-from-objmd',
        });
    });
});
