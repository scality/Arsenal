'use strict';

const assert = require('assert');
const sinon = require('sinon');
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { diag } = require('@opentelemetry/api');
const werelogs = require('werelogs');

const BOOTSTRAP_PATH = '../../../lib/tracing/bootstrap';
const ENDPOINT = 'http://otel-collector.test:4318/v1/traces';

// Under jest, require.cache busting is a no-op, so the bootstrap module is a
// singleton across tests; afterEach close()s it to reset module-level sdk.
function freshTracing() {
    // eslint-disable-next-line global-require
    return require(BOOTSTRAP_PATH);
}

describe('tracing/bootstrap', () => {
    let startStub;
    let shutdownStub;
    const savedEnv = {};

    beforeEach(() => {
        ['ENABLE_OTEL', 'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT', 'OTEL_SAMPLING_RATIO'].forEach(k => {
            savedEnv[k] = process.env[k];
            delete process.env[k];
        });
        startStub = sinon.stub(NodeSDK.prototype, 'start');
        shutdownStub = sinon.stub(NodeSDK.prototype, 'shutdown').resolves();
        // Suppress diag's "logger overwritten" warnings across reloads.
        sinon.stub(diag, 'setLogger');
    });

    afterEach(async () => {
        // Null out any sdk a test left set (shutdown still stubbed) for a clean next test.
        try {
            await require(BOOTSTRAP_PATH).close();
        } catch (e) {
            void e;
        }
        sinon.restore();
        Object.keys(savedEnv).forEach(k => {
            if (savedEnv[k] === undefined) {
                delete process.env[k];
            } else {
                process.env[k] = savedEnv[k];
            }
        });
    });

    describe('isEnabled', () => {
        it('is false unless ENABLE_OTEL === "true"', () => {
            const tracing = freshTracing();
            assert.strictEqual(tracing.isEnabled(), false);
            process.env.ENABLE_OTEL = 'false';
            assert.strictEqual(tracing.isEnabled(), false);
            process.env.ENABLE_OTEL = '1';
            assert.strictEqual(tracing.isEnabled(), false);
            process.env.ENABLE_OTEL = 'true';
            assert.strictEqual(tracing.isEnabled(), true);
        });
    });

    describe('init', () => {
        it('is a no-op when OTEL is disabled — and never calls the instrumentations thunk', () => {
            let thunkCalls = 0;
            const tracing = freshTracing();
            tracing.init({
                serviceName: 'svc',
                instrumentations: () => {
                    thunkCalls += 1;
                    return [];
                },
            });
            assert.strictEqual(startStub.callCount, 0);
            assert.strictEqual(thunkCalls, 0);
        });

        it('throws when enabled without an exporter endpoint (before the thunk runs)', () => {
            process.env.ENABLE_OTEL = 'true';
            let thunkCalls = 0;
            const tracing = freshTracing();
            assert.throws(
                () =>
                    tracing.init({
                        serviceName: 'svc',
                        instrumentations: () => {
                            thunkCalls += 1;
                            return [];
                        },
                    }),
                /OTEL_EXPORTER_OTLP_TRACES_ENDPOINT is unset/,
            );
            assert.strictEqual(startStub.callCount, 0);
            assert.strictEqual(thunkCalls, 0);
        });

        it('throws when enabled without a serviceName', () => {
            process.env.ENABLE_OTEL = 'true';
            process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = ENDPOINT;
            const tracing = freshTracing();
            assert.throws(() => tracing.init({}), /serviceName is required/);
            assert.strictEqual(startStub.callCount, 0);
        });

        it('throws on a non-finite sampling ratio', () => {
            process.env.ENABLE_OTEL = 'true';
            process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = ENDPOINT;
            process.env.OTEL_SAMPLING_RATIO = 'abc';
            const tracing = freshTracing();
            assert.throws(() => tracing.init({ serviceName: 'svc' }), /OTEL_SAMPLING_RATIO/);
        });

        it('throws on a sampling ratio outside [0, 1]', () => {
            process.env.ENABLE_OTEL = 'true';
            process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = ENDPOINT;
            process.env.OTEL_SAMPLING_RATIO = '1.5';
            const tracing = freshTracing();
            assert.throws(() => tracing.init({ serviceName: 'svc' }), /OTEL_SAMPLING_RATIO/);
        });

        it('boots the SDK once, invokes the thunk once, and is idempotent', () => {
            process.env.ENABLE_OTEL = 'true';
            process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = ENDPOINT;
            let thunkCalls = 0;
            const tracing = freshTracing();
            const opts = {
                serviceName: 'svc',
                instrumentations: () => {
                    thunkCalls += 1;
                    return [];
                },
            };
            tracing.init(opts);
            tracing.init(opts);
            assert.strictEqual(startStub.callCount, 1);
            assert.strictEqual(thunkCalls, 1);
        });

        it('works without an instrumentations thunk (empty instrumentation set)', () => {
            process.env.ENABLE_OTEL = 'true';
            process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = ENDPOINT;
            const tracing = freshTracing();
            assert.doesNotThrow(() => tracing.init({ serviceName: 'svc' }));
            assert.strictEqual(startStub.callCount, 1);
        });
    });

    describe('close', () => {
        it('is a no-op when never initialized', async () => {
            const tracing = freshTracing();
            await tracing.close();
            assert.strictEqual(shutdownStub.callCount, 0);
        });

        it('shuts the SDK down exactly once across concurrent close() callers', async () => {
            process.env.ENABLE_OTEL = 'true';
            process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = ENDPOINT;
            const tracing = freshTracing();
            tracing.init({ serviceName: 'svc' });
            await Promise.all([tracing.close(), tracing.close()]);
            assert.strictEqual(shutdownStub.callCount, 1);
        });

        it('resolves (does not throw) when sdk.shutdown rejects', async () => {
            process.env.ENABLE_OTEL = 'true';
            process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = ENDPOINT;
            shutdownStub.rejects(new Error('collector unreachable'));
            // werelogs level methods live on the instance prototype, not Logger.prototype.
            const errStub = sinon.stub(Object.getPrototypeOf(new werelogs.Logger('stub')), 'error');
            const tracing = freshTracing();
            tracing.init({ serviceName: 'svc' });
            await tracing.close();
            assert.strictEqual(shutdownStub.callCount, 1);
            assert(errStub.called);
        });
    });
});

const { _buildSdkConfig } = require('../../../lib/tracing/bootstrap');

// _buildSdkConfig is pure assembly — asserted directly to lock the resource/
// sampler/instrumentation contract handed to NodeSDK.
describe('tracing/bootstrap _buildSdkConfig', () => {
    const SERVICE_ENV = ['OTEL_SERVICE_NAME', 'OTEL_SERVICE_VERSION', 'OTEL_SERVICE_NAMESPACE'];
    const saved = {};
    beforeEach(() =>
        SERVICE_ENV.forEach(k => {
            saved[k] = process.env[k];
            delete process.env[k];
        }),
    );
    afterEach(() =>
        SERVICE_ENV.forEach(k => {
            if (saved[k] === undefined) {
                delete process.env[k];
            } else {
                process.env[k] = saved[k];
            }
        }),
    );

    it('puts service.name/version/namespace on the resource from options + defaults', () => {
        const cfg = _buildSdkConfig({ serviceName: 'cloudserver', serviceVersion: '1.2.3' }, ENDPOINT, 0.5);
        assert.strictEqual(cfg.resource.attributes['service.name'], 'cloudserver');
        assert.strictEqual(cfg.resource.attributes['service.version'], '1.2.3');
        assert.strictEqual(cfg.resource.attributes['service.namespace'], 'scality');
    });

    it('lets OTEL_SERVICE_* env override the options', () => {
        process.env.OTEL_SERVICE_NAME = 'from-env';
        process.env.OTEL_SERVICE_NAMESPACE = 'tenant-x';
        const cfg = _buildSdkConfig({ serviceName: 'cloudserver' }, ENDPOINT, 0.5);
        assert.strictEqual(cfg.resource.attributes['service.name'], 'from-env');
        assert.strictEqual(cfg.resource.attributes['service.namespace'], 'tenant-x');
    });

    it('leaves service.version unset when no serviceVersion/env is given', () => {
        const cfg = _buildSdkConfig({ serviceName: 'svc' }, ENDPOINT, 0.5);
        assert.strictEqual(cfg.resource.attributes['service.version'], undefined);
    });

    it('forwards the consumer instrumentations thunk result', () => {
        const sentinel = [{ id: 'http' }, { id: 'ioredis' }];
        const cfg = _buildSdkConfig({ serviceName: 'svc', instrumentations: () => sentinel }, ENDPOINT, 0.5);
        assert.strictEqual(cfg.instrumentations, sentinel);
    });

    it('defaults to no instrumentations when no thunk is given', () => {
        const cfg = _buildSdkConfig({ serviceName: 'svc' }, ENDPOINT, 0.5);
        assert.deepStrictEqual(cfg.instrumentations, []);
    });

    it('is traces-only with the documented span limits and a ParentBased(TraceIdRatio) sampler', () => {
        const cfg = _buildSdkConfig({ serviceName: 'svc' }, ENDPOINT, 0.5);
        assert.deepStrictEqual(cfg.logRecordProcessors, []);
        assert.deepStrictEqual(cfg.metricReaders, []);
        assert.strictEqual(cfg.spanLimits.attributeValueLengthLimit, 4096);
        assert.match(cfg.sampler.toString(), /ParentBased/);
        assert.match(cfg.sampler.toString(), /TraceIdRatioBased\{0\.5/);
        assert(cfg.traceExporter, 'a trace exporter is configured');
    });
});
