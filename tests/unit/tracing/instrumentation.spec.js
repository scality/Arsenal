'use strict';

const assert = require('assert');
const { trace, context, SpanStatusCode } = require('@opentelemetry/api');
const { AsyncLocalStorageContextManager } = require('@opentelemetry/context-async-hooks');
const {
    BasicTracerProvider,
    InMemorySpanExporter,
    SimpleSpanProcessor,
    AlwaysOnSampler,
} = require('@opentelemetry/sdk-trace-base');

const { instrumentApiMethod, startApiSpan, resetTracer } = require('../../../lib/tracing/instrumentation');

describe('instrumentApiMethod', () => {
    let exporter;
    let provider;

    beforeAll(() => {
        process.env.ENABLE_OTEL = 'true';
        exporter = new InMemorySpanExporter();
        provider = new BasicTracerProvider({
            sampler: new AlwaysOnSampler(),
            spanProcessors: [new SimpleSpanProcessor(exporter)],
        });
        trace.setGlobalTracerProvider(provider);
        // Drop any tracer cached before the provider above was installed.
        resetTracer();
    });

    afterAll(async () => {
        delete process.env.ENABLE_OTEL;
        resetTracer();
        await provider.shutdown();
        trace.disable();
    });

    describe('OTEL on', () => {
        afterEach(() => exporter.reset());

        it('should wrap a callback handler and end span on success', done => {
            const handler = (a, b, cb) => cb(null, 'ok');
            const wrapped = instrumentApiMethod(handler, 'objectGet');

            wrapped('foo', 'bar', (err, value) => {
                assert.strictEqual(err, null);
                assert.strictEqual(value, 'ok');

                const spans = exporter.getFinishedSpans();
                assert.strictEqual(spans.length, 1);
                assert.strictEqual(spans[0].name, 'api.objectGet');
                assert.strictEqual(spans[0].status.code, SpanStatusCode.OK);
                done();
            });
        });

        it("should end span with ERROR when handler's callback fires with err", done => {
            const handler = (a, cb) => cb(Object.assign(new Error('nope'), { code: 'NoSuchBucket' }));
            const wrapped = instrumentApiMethod(handler, 'bucketHead');

            wrapped('foo', err => {
                assert.strictEqual(err.message, 'nope');

                const spans = exporter.getFinishedSpans();
                assert.strictEqual(spans.length, 1);
                assert.strictEqual(spans[0].status.code, SpanStatusCode.ERROR);
                assert.strictEqual(spans[0].attributes['error.type'], 'NoSuchBucket');
                done();
            });
        });

        it('should end span and re-throw on synchronous throw before callback fires', () => {
            const handler = () => {
                throw new Error('sync-boom');
            };
            const wrapped = instrumentApiMethod(handler, 'objectDelete');

            assert.throws(() => wrapped(() => {}), /sync-boom/);

            const spans = exporter.getFinishedSpans();
            assert.strictEqual(spans.length, 1);
            assert.strictEqual(spans[0].status.code, SpanStatusCode.ERROR);
        });

        it('should wrap an async handler and end span on resolution', async () => {
            const handler = async a => `async-${a}`;
            const wrapped = instrumentApiMethod(handler, 'objectGetAsync');

            const value = await wrapped('x');
            assert.strictEqual(value, 'async-x');

            const spans = exporter.getFinishedSpans();
            assert.strictEqual(spans.length, 1);
            assert.strictEqual(spans[0].name, 'api.objectGetAsync');
            assert.strictEqual(spans[0].status.code, SpanStatusCode.OK);
        });

        it('should wrap an async handler and end span with ERROR on rejection', async () => {
            const handler = async () => {
                const err = new Error('async-nope');
                err.code = 'NoSuchKey';
                throw err;
            };
            const wrapped = instrumentApiMethod(handler, 'objectGetAsync');

            await assert.rejects(wrapped(), /async-nope/);

            const spans = exporter.getFinishedSpans();
            assert.strictEqual(spans.length, 1);
            assert.strictEqual(spans[0].status.code, SpanStatusCode.ERROR);
            assert.strictEqual(spans[0].attributes['error.type'], 'NoSuchKey');
        });

        it('should end span on sync return when handler has no callback arg', () => {
            const handler = (a, b) => `${a}-${b}`;
            const wrapped = instrumentApiMethod(handler, 'objectRestore');

            assert.strictEqual(wrapped('x', 'y'), 'x-y');

            const spans = exporter.getFinishedSpans();
            assert.strictEqual(spans.length, 1);
            assert.strictEqual(spans[0].status.code, SpanStatusCode.OK);
        });

        it('should preserve `this` across async cross-calls (static-method shape)', done => {
            // Guards apiMethod.apply(self, args): consumers (e.g. vault's
            // Router.js call to RoleHandler.assumeRole) pass `Class.method.bind(Class)`
            // because the static method invokes other statics via `this` from
            // an async waterfall callback. If apply forgets to thread the
            // receiver, the inner `this.rejectAccessDenied(cb)` crashes.
            class Handler {
                static rejectAccessDenied(cb) {
                    cb(null, 'denied');
                }
                static assumeRole(req, cb) {
                    setImmediate(() => this.rejectAccessDenied(cb));
                }
            }
            const wrapped = instrumentApiMethod(Handler.assumeRole.bind(Handler), 'AssumeRole');
            wrapped({}, (err, value) => {
                assert.strictEqual(err, null);
                assert.strictEqual(value, 'denied');
                done();
            });
        });
    });

    describe('OTEL off', () => {
        afterEach(() => {
            process.env.ENABLE_OTEL = 'true';
        });
        it('should return the original function unchanged', () => {
            process.env.ENABLE_OTEL = 'false';
            const handler = () => 'identity';
            assert.strictEqual(instrumentApiMethod(handler, 'foo'), handler);
        });
    });
});

describe('startApiSpan', () => {
    let exporter;
    let provider;
    let contextManager;

    beforeAll(() => {
        process.env.ENABLE_OTEL = 'true';
        exporter = new InMemorySpanExporter();
        provider = new BasicTracerProvider({
            sampler: new AlwaysOnSampler(),
            spanProcessors: [new SimpleSpanProcessor(exporter)],
        });
        trace.setGlobalTracerProvider(provider);
        // Default ContextManager is a no-op (returns ROOT), so context.with
        // wouldn't actually propagate. Real-world NodeSDK installs one;
        // mirror that for the withContext assertion below.
        contextManager = new AsyncLocalStorageContextManager().enable();
        context.setGlobalContextManager(contextManager);
        resetTracer();
    });

    afterAll(async () => {
        delete process.env.ENABLE_OTEL;
        resetTracer();
        contextManager.disable();
        context.disable();
        await provider.shutdown();
        trace.disable();
    });

    describe('OTEL on', () => {
        afterEach(() => exporter.reset());

        it('should end with status OK on end() with no error', () => {
            const span = startApiSpan('AuthV4');
            span.end();

            const spans = exporter.getFinishedSpans();
            assert.strictEqual(spans.length, 1);
            assert.strictEqual(spans[0].name, 'api.AuthV4');
            assert.strictEqual(spans[0].status.code, SpanStatusCode.OK);
        });

        it('should end with status ERROR + error.type on end(err)', () => {
            const span = startApiSpan('AssumeRole');
            const err = Object.assign(new Error('denied'), { code: 'AccessDenied' });
            span.end(err);

            const spans = exporter.getFinishedSpans();
            assert.strictEqual(spans.length, 1);
            assert.strictEqual(spans[0].status.code, SpanStatusCode.ERROR);
            assert.strictEqual(spans[0].attributes['error.type'], 'AccessDenied');
        });

        it('should set the started span as the active context inside withContext(fn)', () => {
            // Run inside an outer span so the active span is not the same as
            // ours before withContext fires — that's how we tell the inner
            // span is the one that propagated through context.with.
            const outerSpan = trace.getTracer('outer').startSpan('outer');
            context.with(trace.setSpan(context.active(), outerSpan), () => {
                const before = trace.getActiveSpan();
                const span = startApiSpan('CheckPolicies');
                let inside;
                span.withContext(() => {
                    inside = trace.getActiveSpan();
                });
                const after = trace.getActiveSpan();
                span.end();

                assert.strictEqual(before, outerSpan);
                assert.ok(inside, 'expected an active span inside withContext');
                assert.notStrictEqual(inside, outerSpan);
                assert.strictEqual(after, outerSpan);
            });
            outerSpan.end();
        });

        it('should return the value `fn` returns from withContext', () => {
            const span = startApiSpan('GetCallerIdentity');
            const value = span.withContext(() => 42);
            span.end();
            assert.strictEqual(value, 42);
        });
    });

    describe('OTEL off', () => {
        afterEach(() => {
            process.env.ENABLE_OTEL = 'true';
        });

        it('returns a no-op span — end()/end(err)/withContext do not throw', () => {
            process.env.ENABLE_OTEL = 'false';
            const span = startApiSpan('AuthV4');
            assert.doesNotThrow(() => span.end());
            assert.doesNotThrow(() => span.end(new Error('boom')));
            assert.strictEqual(
                span.withContext(() => 'value'),
                'value',
            );
        });
    });
});
