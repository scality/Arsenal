export const DEFAULT_SAMPLING_RATIO = 0.01;

export const SPAN_LIMITS = {
    attributeValueLengthLimit: 4096,
    attributeCountLimit: 128,
    eventCountLimit: 128,
    linkCountLimit: 128,
};

// Bound the shutdown flush so an unreachable collector can't block past
// Kubernetes' 30s grace (BatchSpanProcessor's own export timeout is also 30s).
export const SHUTDOWN_DEADLINE_MS = 5000;

// Instrumentation scopes + API span naming. Service identity comes from
// service.name on the resource, not these.
export const API_TRACER_NAME = 'arsenal.api';
export const KAFKA_TRACER_NAME = 'arsenal.kafka';
export const SPAN_PREFIX = 'api.';
export const ERROR_TYPE_ATTR = 'error.type';
