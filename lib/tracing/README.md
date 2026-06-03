# OpenTelemetry tracing

Shared OTEL tracing bootstrap and helpers for the S3 platform services
(backbeat, cloudserver, vault). Arsenal owns the parts that are hard to get
right and identical across services — SDK lifecycle, the outbound trust
boundary, span conventions — while each consumer supplies its own
instrumentation packages.

## Import

Deep-require the built module; do **not** use `require('arsenal').tracing`:

```js
const tracing = require('arsenal/build/lib/tracing');
```

The arsenal barrel (`require('arsenal')`) eagerly loads `ioredis` (via
`lib/metrics`) and `mongodb` (via `lib/storage`); reaching `init()` through it
would load those before OpenTelemetry can patch them, silently disabling the
instrumentation. The deep-require pulls only the tracing module, which loads
nothing instrumentable at import time.

## Enabling

Tracing is **off** unless `ENABLE_OTEL=true`. When enabled, `init()` requires
`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` and fails fast if it is unset.

- `ENABLE_OTEL` — master switch (`isEnabled()`); must be exactly `true`.
  Default: off.
- `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` — OTLP/HTTP traces collector URL;
  required when enabled.
- `OTEL_SAMPLING_RATIO` — root sampling ratio in `[0, 1]`. Default `0.01`.
- `OTEL_SERVICE_NAME` — overrides the `serviceName` option.
- `OTEL_SERVICE_VERSION` — overrides the `serviceVersion` option.
- `OTEL_SERVICE_NAMESPACE` — resource `service.namespace`. Default `scality`.
- `OTEL_TRUSTED_HOSTS` — comma-separated hostnames trusted for outbound trace
  propagation; a `.suffix` entry matches any subdomain. Default: loopback only.

## Lifecycle

```js
const tracing = require('arsenal/build/lib/tracing');

tracing.init({
    serviceName: 'cloudserver',
    serviceVersion: require('./package.json').version,
    // Lazy thunk — invoked once inside init(), only when OTEL is enabled, so
    // the instrumentation packages (and their patch hooks) never load when
    // OTEL is off. The consumer owns these packages and their options.
    instrumentations: () => {
        const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
        const { IORedisInstrumentation } = require('@opentelemetry/instrumentation-ioredis');
        const { MongoDBInstrumentation } = require('@opentelemetry/instrumentation-mongodb');
        return [
            // makeHttpInstrumentationConfig wires the trust boundary + health
            // filter. Outbound-only services (backbeat) spread it and add
            // disableIncomingRequestInstrumentation: true.
            new HttpInstrumentation(
                tracing.makeHttpInstrumentationConfig({
                    healthPaths: ['/live', '/_/healthcheck', '/metrics'],
                }),
            ),
            new IORedisInstrumentation({ requireParentSpan: true }),
            new MongoDBInstrumentation({ enhancedDatabaseReporting: false }),
        ];
    },
});

// On shutdown — bounded flush (~5s), safe to call concurrently / when never inited:
await tracing.close();
```

`init()` is idempotent and a no-op when disabled. Build the instrumentation
array entirely inside the thunk so packages resolve from the consumer's
`node_modules` and load lazily.

## API

- `init(options)` — boot the SDK. Options: `serviceName` (required),
  `serviceVersion?`, `instrumentations?: () => Instrumentation[]`.
- `close()` — bounded-flush shutdown; idempotent.
- `isEnabled()` — `process.env.ENABLE_OTEL === 'true'`.
- `makeHttpInstrumentationConfig({ healthPaths? })` → params for the consumer's
  `HttpInstrumentation`: the outbound trust-boundary `requestHook` plus an
  `ignoreIncomingRequestHook` that drops OPTIONS and the given health/probe
  paths (none by default). arsenal never disables inbound spans — an
  outbound-only service spreads the result and adds
  `disableIncomingRequestInstrumentation: true`.
- `instrumentApiMethod(handler, methodName)` — wrap a callback/async/sync
  handler in an `api.<methodName>` span (scope `arsenal.api`, `err.code` →
  `error.type`); returns the handler unchanged when OTEL is off.
- `kafka.*` — trace-context propagation over node-rdkafka headers (scope
  `arsenal.kafka`): `traceHeadersFromEntry`, `traceHeadersFromCurrentContext`,
  `contextFromKafkaHeaders`, `startLinkedSpanFromKafkaEntry`.

## Examples

Instrument API handlers (cloudserver / vault) — wrap each handler so calls
produce `api.<name>` spans:

```js
const { instrumentApiMethod } = require('arsenal/build/lib/tracing');
for (const [name, handler] of Object.entries(api)) {
    api[name] = instrumentApiMethod(handler, name);
}
```

Kafka propagation (backbeat) — producer stamps headers from the active span or
an oplog entry; consumer starts a new trace linked to the upstream span:

```js
const { kafka } = require('arsenal/build/lib/tracing');

// producer side
producer.send(payload, kafka.traceHeadersFromCurrentContext());
producer.send(payload, kafka.traceHeadersFromEntry(objectMd));

// consumer side
const { ctx, span } = kafka.startLinkedSpanFromKafkaEntry(entry, 'replicate');
try {
    /* ...work within ctx... */
} finally {
    span.end();
}
```

## Dependencies

`@opentelemetry/api` is a hard dependency (inert until an SDK is registered).
The SDK-core packages (`sdk-node`, `sdk-trace-base`, `resources`,
`exporter-trace-otlp-http`) are **optional** dependencies, required lazily in
`init()`. The `instrumentation-*` packages are **not** arsenal dependencies —
consumers bring their own and pass them via the `instrumentations` thunk.
