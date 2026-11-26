import { context, propagation, trace } from '@opentelemetry/api';
import ObjectMD, { ObjectMDData } from '../../models/ObjectMD';

/**
 * Stamp the currently-active OTEL W3C trace context onto a
 * metadata-shaped object's `traceContext` field, in place. Always
 * reflects the current write: if no span is active (OTEL disabled, or
 * called outside a traced request), clears any previously-set
 * traceContext so stale context loaded from storage is not carried
 * forward into a new oplog entry.
 *
 * Call it at each write site of a new value. A stored version copied
 * as is to the master keeps its own trace context and is not stamped.
 *
 * Accepts either an `ObjectMD` instance (stamps onto its underlying
 * `getValue()` object) or a raw metadata object.
 */
export function stampActiveTraceContext(objMd: ObjectMD): void;
export function stampActiveTraceContext(data: Record<string, any>): void;
export function stampActiveTraceContext(data: ObjectMD | Record<string, any>): void {
    const target: Record<string, any> = data instanceof ObjectMD ? data.getValue() : data;
    setTraceContext(target, getActiveTraceContext());
}

export function getActiveTraceContext(): ObjectMDData['traceContext'] {
    const ctx = context.active();
    const span = trace.getSpan(ctx);
    if (!span) {
        return undefined;
    }

    const carrier: Record<string, string> = {};
    propagation.inject(ctx, carrier, {
        set: (c, k, v) => {
            c[k] = v;
        },
    });
    if (!carrier.traceparent) {
        return undefined;
    }

    const out: { traceparent: string; tracestate?: string } = {
        traceparent: carrier.traceparent,
    };
    if (carrier.tracestate) {
        out.tracestate = carrier.tracestate;
    }
    return out;
}

export function setTraceContext(target: Record<string, any>, traceContext: ObjectMDData['traceContext']): void {
    if (traceContext) {
        target.traceContext = traceContext;
    } else {
        delete target.traceContext;
    }
}
