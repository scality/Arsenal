'use strict';

const assert = require('assert');
const {
    loadTrustedHosts,
    makeTrustedHostsHook,
    isHealthPath,
    makeHttpInstrumentationConfig,
} = require('../../../lib/tracing/httpHooks');

describe('tracing/httpHooks', () => {
    const savedEnv = process.env.OTEL_TRUSTED_HOSTS;

    afterEach(() => {
        if (savedEnv === undefined) {
            delete process.env.OTEL_TRUSTED_HOSTS;
        } else {
            process.env.OTEL_TRUSTED_HOSTS = savedEnv;
        }
    });

    describe('loadTrustedHosts', () => {
        it('trusts only loopback when OTEL_TRUSTED_HOSTS is unset', () => {
            delete process.env.OTEL_TRUSTED_HOSTS;
            const hosts = loadTrustedHosts();
            assert(hosts.has('localhost'));
            assert(hosts.has('127.0.0.1'));
            assert(hosts.has('::1'));
            assert.strictEqual(hosts.size, 3);
        });

        it('adds each comma-separated host, lowercased, plus loopback', () => {
            process.env.OTEL_TRUSTED_HOSTS = 'cloudserver.backend,Kafka-0,mongo-primary';
            const hosts = loadTrustedHosts();
            assert(hosts.has('cloudserver.backend'));
            assert(hosts.has('kafka-0'));
            assert(hosts.has('mongo-primary'));
            assert(hosts.has('localhost'));
        });

        it('ignores empty entries from trailing/double commas', () => {
            process.env.OTEL_TRUSTED_HOSTS = 'a,,b,';
            const hosts = loadTrustedHosts();
            assert(hosts.has('a'));
            assert(hosts.has('b'));
            assert.strictEqual(hosts.has(''), false);
        });

        it('does no port/url normalization (operator supplies bare hosts)', () => {
            process.env.OTEL_TRUSTED_HOSTS = 'host-with-port:9092';
            const hosts = loadTrustedHosts();
            assert(hosts.has('host-with-port:9092'));
            assert.strictEqual(hosts.has('host-with-port'), false);
        });
    });

    describe('makeTrustedHostsHook', () => {
        const trusted = new Set(['localhost', 'trusted.internal']);

        function fakeClientRequest(hostHeader) {
            const removed = [];
            return {
                _removed: removed,
                getHeader: name => (name === 'host' ? hostHeader : undefined),
                removeHeader: name => removed.push(name),
            };
        }

        function fakeSpan() {
            const attrs = {};
            return {
                _attrs: attrs,
                setAttribute: (k, v) => {
                    attrs[k] = v;
                },
            };
        }

        it('leaves traceparent intact on trusted hosts', () => {
            const hook = makeTrustedHostsHook(trusted);
            const req = fakeClientRequest('trusted.internal');
            const span = fakeSpan();
            hook(span, req);
            assert.deepStrictEqual(req._removed, []);
            assert.strictEqual(span._attrs['scality.trace.suppressed'], undefined);
        });

        it('strips traceparent/tracestate + tags span on untrusted hosts', () => {
            const hook = makeTrustedHostsHook(trusted);
            const req = fakeClientRequest('s3.amazonaws.com');
            const span = fakeSpan();
            hook(span, req);
            assert.deepStrictEqual(req._removed, ['traceparent', 'tracestate']);
            assert.strictEqual(span._attrs['scality.trace.suppressed'], true);
        });

        it('strips the port from the Host header before matching', () => {
            const hook = makeTrustedHostsHook(trusted);
            const req = fakeClientRequest('trusted.internal:8000');
            const span = fakeSpan();
            hook(span, req);
            assert.deepStrictEqual(req._removed, []);
        });

        it('normalizes a bracketed IPv6 Host header', () => {
            const hook = makeTrustedHostsHook(new Set(['::1']));
            const req = fakeClientRequest('[::1]:4318');
            const span = fakeSpan();
            hook(span, req);
            assert.deepStrictEqual(req._removed, []);
        });

        describe('NO_PROXY-style leading-dot suffix entries', () => {
            const clusterTrusted = new Set(['.svc.cluster.local']);

            it('trusts a multi-label subdomain', () => {
                const req = fakeClientRequest('foo.bar.svc.cluster.local');
                makeTrustedHostsHook(clusterTrusted)(fakeSpan(), req);
                assert.deepStrictEqual(req._removed, []);
            });

            it('trusts a single-label subdomain', () => {
                const req = fakeClientRequest('bar.svc.cluster.local');
                makeTrustedHostsHook(clusterTrusted)(fakeSpan(), req);
                assert.deepStrictEqual(req._removed, []);
            });

            it('trusts the bare apex', () => {
                const req = fakeClientRequest('svc.cluster.local');
                makeTrustedHostsHook(clusterTrusted)(fakeSpan(), req);
                assert.deepStrictEqual(req._removed, []);
            });

            it('normalizes a trailing dot (FQDN form) before matching', () => {
                const req = fakeClientRequest('foo.svc.cluster.local.:4318');
                makeTrustedHostsHook(clusterTrusted)(fakeSpan(), req);
                assert.deepStrictEqual(req._removed, []);
            });

            it('does not match without the dot boundary', () => {
                const req = fakeClientRequest('notsvc.cluster.local');
                makeTrustedHostsHook(clusterTrusted)(fakeSpan(), req);
                assert.deepStrictEqual(req._removed, ['traceparent', 'tracestate']);
            });

            it('does not match when the suffix is not at the end', () => {
                const req = fakeClientRequest('svc.cluster.local.attacker.com');
                makeTrustedHostsHook(clusterTrusted)(fakeSpan(), req);
                assert.deepStrictEqual(req._removed, ['traceparent', 'tracestate']);
            });

            it('keeps non-dotted entries exact (no suffix behavior)', () => {
                const hook = makeTrustedHostsHook(new Set(['kafka-0']));
                const exact = fakeClientRequest('kafka-0');
                hook(fakeSpan(), exact);
                assert.deepStrictEqual(exact._removed, []);
                const sub = fakeClientRequest('x.kafka-0');
                hook(fakeSpan(), sub);
                assert.deepStrictEqual(sub._removed, ['traceparent', 'tracestate']);
            });
        });

        it('treats a missing Host header as untrusted', () => {
            const hook = makeTrustedHostsHook(trusted);
            const req = fakeClientRequest(undefined);
            const span = fakeSpan();
            hook(span, req);
            assert.deepStrictEqual(req._removed, ['traceparent', 'tracestate']);
        });

        it('skips inbound server requests (no getHeader)', () => {
            const hook = makeTrustedHostsHook(trusted);
            const span = fakeSpan();
            assert.doesNotThrow(() => hook(span, { url: '/foo' }));
            assert.strictEqual(span._attrs['scality.trace.suppressed'], undefined);
        });
    });

    describe('isHealthPath', () => {
        const PATHS = new Set(['/probe', '/ready', '/metrics']);

        it('matches paths in the set', () => {
            ['/probe', '/ready', '/metrics'].forEach(p => assert.strictEqual(isHealthPath(p, PATHS), true, p));
        });

        it('ignores a query string when matching', () => {
            assert.strictEqual(isHealthPath('/probe?token=x', PATHS), true);
            assert.strictEqual(isHealthPath('/metrics?format=prom', PATHS), true);
        });

        it('does not match paths outside the set', () => {
            ['/bucket/key', '/probez', '/metrics/custom', '/ready/deep'].forEach(p =>
                assert.strictEqual(isHealthPath(p, PATHS), false, p),
            );
        });

        it('respects the caller-provided set', () => {
            const single = new Set(['/healthcheck']);
            assert.strictEqual(isHealthPath('/healthcheck', single), true);
            assert.strictEqual(isHealthPath('/probe', single), false);
        });

        it('returns false for non-string / empty input', () => {
            assert.strictEqual(isHealthPath(undefined, PATHS), false);
            assert.strictEqual(isHealthPath('', PATHS), false);
            assert.strictEqual(isHealthPath(42, PATHS), false);
        });
    });

    describe('makeHttpInstrumentationConfig', () => {
        it('always wires requestHook + an ignore hook; never disables inbound', () => {
            const cfg = makeHttpInstrumentationConfig({ healthPaths: ['/live', '/metrics'] });
            assert.strictEqual(typeof cfg.requestHook, 'function');
            assert.strictEqual(cfg.disableIncomingRequestInstrumentation, undefined);
            const ignore = cfg.ignoreIncomingRequestHook;
            assert.strictEqual(ignore({ method: 'OPTIONS', url: '/anything' }), true);
            assert.strictEqual(ignore({ method: 'GET', url: '/metrics?x=1' }), true);
            assert.strictEqual(ignore({ method: 'GET', url: '/live' }), true);
            assert.strictEqual(ignore({ method: 'GET', url: '/bucket/key' }), false);
        });

        it('omitted/empty healthPaths: still inbound-enabled, drops only OPTIONS', () => {
            for (const cfg of [makeHttpInstrumentationConfig(), makeHttpInstrumentationConfig({ healthPaths: [] })]) {
                assert.strictEqual(cfg.disableIncomingRequestInstrumentation, undefined);
                assert.strictEqual(typeof cfg.requestHook, 'function');
                assert.strictEqual(cfg.ignoreIncomingRequestHook({ method: 'OPTIONS', url: '/x' }), true);
                assert.strictEqual(cfg.ignoreIncomingRequestHook({ method: 'GET', url: '/anything' }), false);
            }
        });
    });
});
