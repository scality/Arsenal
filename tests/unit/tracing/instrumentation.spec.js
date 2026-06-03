'use strict';

const assert = require('assert');
const { trace, SpanStatusCode } = require('@opentelemetry/api');
const {
    BasicTracerProvider,
    InMemorySpanExporter,
    SimpleSpanProcessor,
    AlwaysOnSampler,
} = require('@opentelemetry/sdk-trace-base');

const { instrumentApiMethod, resetTracer } = require('../../../lib/tracing/instrumentation');

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
