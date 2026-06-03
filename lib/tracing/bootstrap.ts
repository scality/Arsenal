import assert from 'assert';

import { DEFAULT_SAMPLING_RATIO, SPAN_LIMITS, SHUTDOWN_DEADLINE_MS } from './constants';

export interface InitOptions {
    // service.name (OTEL_SERVICE_NAME env overrides).
    serviceName: string;
    // service.version (OTEL_SERVICE_VERSION env overrides).
    serviceVersion?: string;
    // Lazy invoked once inside init() only when OTEL is enabled, so the
    // consumer's require()s and instrumentation patch hooks never load when off.
    instrumentations?: () => any[];
}

let sdk: any = null;

let diagLog: any = null;
function getDiagLog(): any {
    if (!diagLog) {
        const werelogs = require('werelogs');
        diagLog = new werelogs.Logger('tracing');
    }
    return diagLog;
}

function makeDiagLogger(): any {
    const log = getDiagLog();
    const fwd =
        (level: string) =>
        (m: string, ...a: unknown[]) =>
            log[level](m, a.length ? { args: a } : undefined);
    return {
        error: fwd('error'),
        warn: fwd('warn'),
        info: fwd('info'),
        debug: fwd('debug'),
        verbose: fwd('trace'),
    };
}

export function isEnabled(): boolean {
    return process.env.ENABLE_OTEL === 'true';
}

export function init(options: InitOptions): void {
    if (!isEnabled() || sdk) {
        return;
    }

    const endpoint = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
    assert(endpoint, 'ENABLE_OTEL=true but OTEL_EXPORTER_OTLP_TRACES_ENDPOINT is unset');
    assert(options.serviceName, 'tracing.init: options.serviceName is required');

    let samplingRatio = DEFAULT_SAMPLING_RATIO;
    if (process.env.OTEL_SAMPLING_RATIO !== undefined) {
        const parsed = Number(process.env.OTEL_SAMPLING_RATIO);
        assert(
            Number.isFinite(parsed) && parsed >= 0 && parsed <= 1,
            `OTEL_SAMPLING_RATIO must be a finite number in [0, 1], got: ${process.env.OTEL_SAMPLING_RATIO}`,
        );
        samplingRatio = parsed;
    }

    // diag + NodeSDK are required lazily here (never at module top) so OTEL-off
    // processes load nothing beyond @opentelemetry/api.
    const { diag, DiagLogLevel } = require('@opentelemetry/api');
    const { NodeSDK } = require('@opentelemetry/sdk-node');
    diag.setLogger(makeDiagLogger(), DiagLogLevel.WARN);

    sdk = new NodeSDK(_buildSdkConfig(options, endpoint, samplingRatio));
    sdk.start();
}

export function _buildSdkConfig(options: InitOptions, endpoint: string, samplingRatio: number): any {
    const { resourceFromAttributes } = require('@opentelemetry/resources');
    const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
    const { ParentBasedSampler, TraceIdRatioBasedSampler } = require('@opentelemetry/sdk-trace-base');

    return {
        resource: resourceFromAttributes({
            'service.name': process.env.OTEL_SERVICE_NAME || options.serviceName,
            'service.version': process.env.OTEL_SERVICE_VERSION || options.serviceVersion,
            // Operators set OTEL_SERVICE_NAME per-pod but not the namespace,
            // so the 'scality' default marks Scality-owned traces.
            'service.namespace': process.env.OTEL_SERVICE_NAMESPACE || 'scality',
        }),
        traceExporter: new OTLPTraceExporter({ url: endpoint }),
        // Disable OTLP log + metric exporters with empties
        logRecordProcessors: [],
        metricReaders: [],
        spanLimits: SPAN_LIMITS,
        // ParentBased so a service honors the upstream sampled flag; without
        // it, it re-samples at `ratio` and the pipeline rate collapses to
        // ratio × ratio.
        sampler: new ParentBasedSampler({
            root: new TraceIdRatioBasedSampler(samplingRatio),
        }),
        instrumentations: options.instrumentations ? options.instrumentations() : [],
    };
}

export async function close(): Promise<void> {
    if (!sdk) {
        return;
    }
    // Capture the sdk via the IIFE param and null the module ref synchronously
    // (before any await) so concurrent callers don't both shutdown() — the SDK
    // isn't idempotent. The IIFE owns the rejection so a late failure after the
    // timeout wins the race can't crash the process.
    const shutdown = (async (running: any) => {
        try {
            await running.shutdown();
        } catch (err) {
            getDiagLog().error('tracing close failed', { err });
        }
    })(sdk);
    sdk = null;
    await Promise.race([
        shutdown,
        // .unref() so the timer doesn't keep the event loop alive.
        new Promise<void>(resolve => {
            setTimeout(resolve, SHUTDOWN_DEADLINE_MS).unref();
        }),
    ]);
}
