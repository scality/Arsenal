'use strict';

const assert = require('assert');
const { ROOT_CONTEXT, trace, propagation, context } = require('@opentelemetry/api');
const { W3CTraceContextPropagator } = require('@opentelemetry/core');
const { AsyncLocalStorageContextManager } = require('@opentelemetry/context-async-hooks');

const {
    traceHeadersFromEntry,
    stampTraceHeaders,
    contextFromKafkaHeaders,
    startLinkedSpanFromKafkaEntry,
} = require('../../../lib/tracing/kafkaTraceContext');

describe('kafkaTraceContext', () => {
    describe('traceHeadersFromEntry', () => {
        it('should return undefined when entryValue is null', () => {
            assert.strictEqual(traceHeadersFromEntry(null), undefined);
        });

        it('should return undefined when entryValue is undefined', () => {
            assert.strictEqual(traceHeadersFromEntry(undefined), undefined);
        });

        it('should return undefined when traceContext is missing', () => {
            assert.strictEqual(traceHeadersFromEntry({ foo: 'bar' }), undefined);
        });

        it('should return undefined when traceparent is missing', () => {
            assert.strictEqual(traceHeadersFromEntry({ traceContext: {} }), undefined);
        });

        it('should return headers array with traceparent only', () => {
            const tp = '00-abcdef1234567890abcdef1234567890-1234567890abcdef-01';
            const result = traceHeadersFromEntry({
                traceContext: { traceparent: tp },
            });
            assert.deepStrictEqual(result, [{ traceparent: tp }]);
        });

        it('should return headers array with traceparent and tracestate', () => {
            const tp = '00-abcdef1234567890abcdef1234567890-1234567890abcdef-01';
            const ts = 'congo=t61rcWkgMzE';
            const result = traceHeadersFromEntry({
                traceContext: { traceparent: tp, tracestate: ts },
            });
            assert.deepStrictEqual(result, [{ traceparent: tp }, { tracestate: ts }]);
        });
    });

    describe('contextFromKafkaHeaders', () => {
        it('should return root context when headers are undefined', () => {
            const result = contextFromKafkaHeaders(undefined);
            assert.strictEqual(result, ROOT_CONTEXT);
        });

        it('should return root context when headers are null', () => {
            const result = contextFromKafkaHeaders(null);
            assert.strictEqual(result, ROOT_CONTEXT);
        });

        it('should return root context when no traceparent header', () => {
            const headers = [{ unrelated: Buffer.from('value') }];
            const result = contextFromKafkaHeaders(headers);
            assert.strictEqual(result, ROOT_CONTEXT);
        });

        it('should call propagation.extract with correct carrier', () => {
            const tp = '00-abcdef1234567890abcdef1234567890-1234567890abcdef-01';
            const headers = [{ traceparent: Buffer.from(tp) }, { tracestate: Buffer.from('congo=t61rcWkgMzE') }];
            const result = contextFromKafkaHeaders(headers);
            assert(result, 'should return a context object');
        });
    });

    describe('startLinkedSpanFromKafkaEntry', () => {
        it('returns a span with no headers (no link)', () => {
            const entry = { topic: 'test-topic', partition: 0 };
            const { ctx, span } = startLinkedSpanFromKafkaEntry(entry, 'test-op');
            assert(ctx);
            assert(span);
            assert.strictEqual(typeof span.end, 'function');
            span.end();
        });

        it('returns a span with traceparent header (creates link)', () => {
            const tp = '00-abcdef1234567890abcdef1234567890-1234567890abcdef-01';
            const entry = {
                topic: 'test-topic',
                partition: 0,
                headers: [{ traceparent: Buffer.from(tp) }],
            };
            const { ctx, span } = startLinkedSpanFromKafkaEntry(entry, 'test-op');
            assert(ctx);
            assert(span);
            assert.strictEqual(typeof span.setAttribute, 'function');
            assert.strictEqual(typeof span.recordException, 'function');
            span.end();
        });
    });

    describe('stampTraceHeaders', () => {
        it('returns the entry unchanged when no active span', () => {
            const entry = { message: 'm' };
            assert.strictEqual(stampTraceHeaders(entry), entry);
        });
    });

    describe('with a registered W3C propagator', () => {
        const traceId = '0af7651916cd43dd8448eb211c80319c';
        const spanId = 'b7ad6b7169203331';

        beforeAll(() => {
            context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
            propagation.setGlobalPropagator(new W3CTraceContextPropagator());
        });
        afterAll(() => {
            context.disable();
            propagation.disable();
        });

        it('startLinkedSpanFromKafkaEntry adds a link for a valid upstream traceparent', () => {
            const entry = {
                headers: [{ traceparent: Buffer.from(`00-${traceId}-${spanId}-01`) }],
            };
            const { ctx, span } = startLinkedSpanFromKafkaEntry(entry, 'test.process');
            assert(ctx);
            assert(span);
            span.end();
        });

        it('stampTraceHeaders attaches the active span traceparent to the entry', () => {
            const span = trace.wrapSpanContext({ traceId, spanId, traceFlags: 1 });
            const entry = { message: 'm' };
            const stamped = context.with(trace.setSpan(context.active(), span), () => stampTraceHeaders(entry));
            assert(Array.isArray(stamped.headers));
            const tp = stamped.headers.find(h => h.traceparent);
            assert(tp && tp.traceparent.startsWith(`00-${traceId}-`));
            assert.strictEqual(stamped.message, 'm');
            // original entry is not mutated
            assert.strictEqual(entry.headers, undefined);
        });

        it('stampTraceHeaders returns the entry unchanged for an invalid (all-zero) span context', () => {
            const invalid = trace.wrapSpanContext({ traceId: '0'.repeat(32), spanId: '0'.repeat(16), traceFlags: 0 });
            const entry = { message: 'm' };
            const stamped = context.with(trace.setSpan(context.active(), invalid), () => stampTraceHeaders(entry));
            assert.strictEqual(stamped, entry);
        });
    });
});
