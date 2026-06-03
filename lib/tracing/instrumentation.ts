import type { Tracer, Span } from '@opentelemetry/api';
import { isEnabled } from './bootstrap';
import { API_TRACER_NAME, SPAN_PREFIX, ERROR_TYPE_ATTR } from './constants';

// Lazy-loaded so OTEL-off processes don't pull in @opentelemetry/api at all
// (consumers expect "no @opentelemetry/* loaded when ENABLE_OTEL is unset").
// instrumentApiMethod gates on isEnabled() before any code path here that
// calls getApi(), so it's safe to assume the require succeeds when reached.
let api: typeof import('@opentelemetry/api') | null = null;
function getApi(): typeof import('@opentelemetry/api') {
    if (api) {
        return api;
    }
    api = require('@opentelemetry/api');
    return api!;
}

let tracer: Tracer | null = null;
function getTracer(): Tracer {
    if (tracer) {
        return tracer;
    }
    tracer = getApi().trace.getTracer(API_TRACER_NAME);
    return tracer;
}

// Test-only: drop the cached tracer so a freshly-installed provider is picked up.
export function resetTracer(): void {
    tracer = null;
}

// Mark a span errored or OK, then end it. Exported for callers owning their spans.
export function endSpan(span: Span, err?: any): void {
    const { SpanStatusCode } = getApi();
    if (err) {
        span.recordException(err);
        span.setStatus({ code: SpanStatusCode.ERROR });
        if (err.code) {
            span.setAttribute(ERROR_TYPE_ATTR, err.code);
        }
    } else {
        span.setStatus({ code: SpanStatusCode.OK });
    }
    span.end();
}

type ApiMethod = (...args: any[]) => any;

function instrumentCallbackHandler(
    self: unknown,
    apiMethod: ApiMethod,
    spanName: string,
    args: any[],
    callbackIndex: number,
): any {
    const { trace, context, SpanKind } = getApi();
    const span = getTracer().startSpan(spanName, { kind: SpanKind.INTERNAL });

    const wrappedArgs = [...args];
    const originalCallback = args[callbackIndex];
    wrappedArgs[callbackIndex] = function wrappedCallback(this: unknown, err: any, ...results: any[]) {
        endSpan(span, err);
        return originalCallback.call(this, err, ...results);
    };

    const ctx = trace.setSpan(context.active(), span);
    try {
        return context.with(ctx, () => apiMethod.apply(self, wrappedArgs));
    } catch (err) {
        endSpan(span, err);
        throw err;
    }
}

function instrumentAsyncHandler(self: unknown, apiMethod: ApiMethod, spanName: string, args: any[]): any {
    const { trace, context, SpanKind } = getApi();
    const span = getTracer().startSpan(spanName, { kind: SpanKind.INTERNAL });
    const ctx = trace.setSpan(context.active(), span);

    let result;
    try {
        result = context.with(ctx, () => apiMethod.apply(self, args));
    } catch (err) {
        endSpan(span, err);
        throw err;
    }

    // Only chain endSpan if the handler returned a Promise; otherwise end now
    // and return the raw value (preserve sync vs async return shape).
    if (result && typeof result.then === 'function') {
        return (async () => {
            let value;
            try {
                value = await result;
            } catch (err) {
                endSpan(span, err);
                throw err;
            }
            endSpan(span);
            return value;
        })();
    }
    endSpan(span);
    return result;
}

// Wrap an API handler so each call produces an `api.<methodName>` span; returns
// the handler unchanged when OTEL is off.
export function instrumentApiMethod<T extends (...args: any[]) => any>(apiMethod: T, methodName: string): T {
    if (!isEnabled()) {
        return apiMethod;
    }
    const spanName = `${SPAN_PREFIX}${methodName}`;
    return function instrumented(this: unknown, ...args: any[]) {
        const callbackIndex = (args as any).findLastIndex((a: any) => typeof a === 'function');
        if (callbackIndex !== -1) {
            return instrumentCallbackHandler(this, apiMethod, spanName, args, callbackIndex);
        }
        return instrumentAsyncHandler(this, apiMethod, spanName, args);
    } as T;
}
