import type { ClientRequest } from 'http';
import type { Span } from '@opentelemetry/api';

// makeHttpInstrumentationConfig builds the params a consumer passes to its
// HttpInstrumentation: the outbound trust boundary and the inbound health-path
// span filter.

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '::1'];

const HOST_BRACKET_RE = /^\[([^\]]+)\](?::\d+)?$/;
const HOST_PORT_RE = /:\d+$/;
const TRAILING_DOT_RE = /\.$/;

// Operator-supplied bare hostnames (+ always-trusted loopback). A '.'-prefixed
// entry is a NO_PROXY-style suffix (see makeTrustedHostsHook). Unset → only
// loopback, so every other outbound call gets traceparent stripped.
export function loadTrustedHosts(): Set<string> {
    const hosts = new Set(LOOPBACK_HOSTS);
    const raw = process.env.OTEL_TRUSTED_HOSTS;
    if (typeof raw === 'string' && raw.length > 0) {
        raw.split(',').forEach(entry => {
            if (entry) {
                hosts.add(entry.toLowerCase());
            }
        });
    }
    return hosts;
}

// Bare hostname for matching. IPv6 is bracket-handled separately so the :port
// strip can't eat into the address (naive strip of `[::1]` → `:`). A trailing
// dot (FQDN form) is stripped so it matches the same patterns.
function normalizeHostHeader(s: string): string {
    const bracket = HOST_BRACKET_RE.exec(s);
    if (bracket) {
        return bracket[1].toLowerCase();
    }
    return s.replace(HOST_PORT_RE, '').replace(TRAILING_DOT_RE, '').toLowerCase();
}

// HTTP requestHook that strips traceparent/tracestate (and tags the span
// suppressed) on outbound calls to untrusted hosts, so trace IDs don't leak off-platform.
export function makeTrustedHostsHook(trustedHosts: Set<string>) {
    // '.'-prefixed entries are suffix patterns, partitioned once (not per request).
    const suffixes = [...trustedHosts].filter(h => h.startsWith('.'));
    const isTrusted = (host: string): boolean =>
        trustedHosts.has(host) ||
        // endsWith keeps the dot boundary (`xsvc.cluster.local` not matched);
        // the slice(1) check also trusts the bare apex.
        suffixes.some(sfx => host.endsWith(sfx) || host === sfx.slice(1));

    return function requestHook(span: Span, request: ClientRequest): void {
        // Only ClientRequest exposes getHeader/removeHeader, not inbound IncomingMessage.
        if (!request || typeof request.getHeader !== 'function') {
            return;
        }
        const host = normalizeHostHeader((request.getHeader('host') || '').toString());
        if (isTrusted(host)) {
            return;
        }
        if (typeof request.removeHeader === 'function') {
            request.removeHeader('traceparent');
            request.removeHeader('tracestate');
        }
        if (span && typeof span.setAttribute === 'function') {
            span.setAttribute('scality.trace.suppressed', true);
        }
    };
}

// True when url's path (query string stripped) exactly matches an entry in
// pathSet — used to skip spans for health/probe endpoints. The set differs per
// service, so the caller passes it in.
export function isHealthPath(url: string | undefined, pathSet: Set<string>): boolean {
    if (typeof url !== 'string' || url.length === 0) {
        return false;
    }
    const qIdx = url.indexOf('?');
    const path = qIdx === -1 ? url : url.slice(0, qIdx);
    return pathSet.has(path);
}

// HttpInstrumentation params (the consumer constructs it): trust-boundary
// requestHook + an ignore hook for OPTIONS and the given health paths.
export function makeHttpInstrumentationConfig(options: { healthPaths?: string[] } = {}): Record<string, any> {
    const healthPaths = new Set(options.healthPaths ?? []);
    return {
        ignoreIncomingRequestHook: (req: { method?: string; url?: string }) =>
            req.method === 'OPTIONS' || isHealthPath(req.url, healthPaths),
        requestHook: makeTrustedHostsHook(loadTrustedHosts()),
    };
}
