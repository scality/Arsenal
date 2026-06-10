import type { Context, Span, Link } from '@opentelemetry/api';
import { KAFKA_TRACER_NAME } from './constants';

type KafkaHeader = Record<string, Buffer | string>;

// Lazy-loaded so OTEL-off processes (and arsenal consumers that don't use the
// kafka helpers at all, e.g. cloudserver) never pull in @opentelemetry/api.
let api: typeof import('@opentelemetry/api') | null = null;
function getApi(): typeof import('@opentelemetry/api') {
    if (api) {
        return api;
    }
    api = require('@opentelemetry/api');
    return api!;
}

// Extract traceparent from a parsed oplog entry value into node-rdkafka headers.
export function traceHeadersFromEntry(entryValue: any): KafkaHeader[] | undefined {
    const tc = entryValue && entryValue.traceContext;
    if (!tc || !tc.traceparent) {
        return undefined;
    }
    const headers: KafkaHeader[] = [{ traceparent: tc.traceparent }];
    if (tc.tracestate) {
        headers.push({ tracestate: tc.tracestate });
    }
    return headers;
}

// Build an OTEL context carrying the remote span from Kafka message headers.
export function contextFromKafkaHeaders(kafkaHeaders?: KafkaHeader[] | null): Context {
    const { propagation, ROOT_CONTEXT } = getApi();
    // Base on ROOT_CONTEXT, not context.active(): with no traceparent we want
    // no link (not a spurious one to whatever span happens to be active).
    if (!kafkaHeaders) {
        return ROOT_CONTEXT;
    }
    const carrier: Record<string, string> = {};
    for (const h of kafkaHeaders) {
        if (h.traceparent) {
            carrier.traceparent = h.traceparent.toString();
        }
        if (h.tracestate) {
            carrier.tracestate = h.tracestate.toString();
        }
    }
    if (!carrier.traceparent) {
        return ROOT_CONTEXT;
    }
    return propagation.extract(ROOT_CONTEXT, carrier);
}

// Start a new root span that LINKS to (not a child of) the upstream span in the
// Kafka entry. Kafka hops can fire hours after the original request, so links —
// not parent/child — keep traces small. Caller must span.end(). New trace each read.
export function startLinkedSpanFromKafkaEntry(
    kafkaEntry: { headers?: KafkaHeader[] },
    operationName: string,
): { ctx: Context; span: Span } {
    const { trace, SpanKind, ROOT_CONTEXT } = getApi();
    const tracer = trace.getTracer(KAFKA_TRACER_NAME);
    const links: Link[] = [];

    const parentCtx = contextFromKafkaHeaders(kafkaEntry.headers);
    const remoteSpan = trace.getSpan(parentCtx);
    const remoteSpanCtx = remoteSpan && remoteSpan.spanContext();
    if (remoteSpanCtx && trace.isSpanContextValid(remoteSpanCtx)) {
        links.push({ context: remoteSpanCtx });
    }

    // ROOT_CONTEXT forces a new trace even if a span is somehow active here.
    const span = tracer.startSpan(
        operationName,
        {
            kind: SpanKind.CONSUMER,
            links,
        },
        ROOT_CONTEXT,
    );

    return { ctx: trace.setSpan(ROOT_CONTEXT, span), span };
}

// Serialize the active OTEL context into node-rdkafka traceparent/tracestate headers.
function traceHeadersFromCurrentContext(): KafkaHeader[] | undefined {
    const { trace, context, propagation } = getApi();
    const span = trace.getSpan(context.active());
    if (!span) {
        return undefined;
    }
    const spanCtx = span.spanContext();
    if (!spanCtx || !trace.isSpanContextValid(spanCtx)) {
        return undefined;
    }

    const carrier: Record<string, string> = {};
    propagation.inject(context.active(), carrier);
    const headers: KafkaHeader[] = [];
    if (carrier.traceparent) {
        headers.push({ traceparent: carrier.traceparent });
    }
    if (carrier.tracestate) {
        headers.push({ tracestate: carrier.tracestate });
    }
    return headers.length > 0 ? headers : undefined;
}

// Attach the active span's trace headers to a kafka entry, returning a copy with
// `headers` set. Returns the entry unchanged when tracing is off / no span is
// active, so the OTEL-off path keeps its original message shape (no
// `headers: undefined`).
export function stampTraceHeaders<T extends object>(entry: T): T {
    const headers = traceHeadersFromCurrentContext();
    return headers ? { ...entry, headers } : entry;
}
