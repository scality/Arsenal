import * as bootstrap from './bootstrap';

export { makeHttpInstrumentationConfig } from './httpHooks';
export { instrumentApiMethod, endSpan } from './instrumentation';
export type { InitOptions } from './bootstrap';
export * as kafka from './kafkaTraceContext';

export const isEnabled = bootstrap.isEnabled;
export const init = bootstrap.init;
export const close = bootstrap.close;
