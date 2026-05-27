import { context, propagation, trace } from '@opentelemetry/api';
import ObjectMD from '../../models/ObjectMD';

/**
 * Stamp the currently-active OTEL W3C trace context onto a
 * metadata-shaped object's `traceContext` field, in place. Always
 * reflects the current write: if no span is active (OTEL disabled, or
 * called outside a traced request), clears any previously-set
 * traceContext so stale context loaded from storage is not carried
 * forward into a new oplog entry.
 *
 * Mongo writes go through `MongoUtils.serialize`, which calls this — so
 * callers there don't invoke this directly. Use this helper directly
 * only at write sites that bypass serialize (e.g. paths that hand off
 * a pre-built `ObjectMDData` to bulkWrite without going through tag
 * escape).
 *
 * Accepts either an `ObjectMD` instance (stamps onto its underlying
 * `getValue()` object) or a raw metadata object.
 */
export function stampActiveTraceContext(objMd: ObjectMD): void;
export function stampActiveTraceContext(data: Record<string, any>): void;
export function stampActiveTraceContext(data: ObjectMD | Record<string, any>): void {
    const target: Record<string, any> = data instanceof ObjectMD ? data.getValue() : data;

    const ctx = context.active();
    const span = trace.getSpan(ctx);
    if (!span) {
        delete target.traceContext;
        return;
    }

    const carrier: Record<string, string> = {};
    propagation.inject(ctx, carrier, {
        set: (c, k, v) => {
            c[k] = v;
        },
    });
    if (!carrier.traceparent) {
        delete target.traceContext;
        return;
    }

    const out: { traceparent: string; tracestate?: string } = {
        traceparent: carrier.traceparent,
    };
    if (carrier.tracestate) {
        out.tracestate = carrier.tracestate;
    }
    target.traceContext = out;
}
