'use strict';

// Shared OTEL mock plumbing for the trace-context tests scattered across
// the per-method MongoClientInterface specs. Each spec file declares its
// own `mockOtel*` jest.fn()s at the top and passes them into
// makeOtelHelpers() — jest hoists `jest.mock(...)` factories above local
// requires, so the mocks themselves can't live here.

const TRACEPARENT = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

function makeOtelHelpers(mocks) {
    return {
        TRACEPARENT,
        activateSpan(traceparent = TRACEPARENT) {
            mocks.active.mockReturnValue({ tag: 'mock-active-context' });
            mocks.getSpan.mockReturnValue({
                /* opaque span */
            });
            mocks.inject.mockImplementation((ctx, carrier, setter) => {
                setter.set(carrier, 'traceparent', traceparent);
            });
        },
        deactivateSpan() {
            mocks.active.mockReturnValue({});
            mocks.getSpan.mockReturnValue(undefined);
            mocks.inject.mockImplementation(() => {});
        },
        resetMocks() {
            mocks.active.mockReset();
            mocks.getSpan.mockReset();
            mocks.inject.mockReset();
        },
    };
}

module.exports = { TRACEPARENT, makeOtelHelpers };
