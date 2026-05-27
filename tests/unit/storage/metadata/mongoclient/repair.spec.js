// Mock @opentelemetry/api so the trace-context tests can drive the
// active-span state without bringing up an OTEL SDK.
const mockOtelActive = jest.fn();
const mockOtelGetSpan = jest.fn();
const mockOtelInject = jest.fn();
jest.mock('@opentelemetry/api', () => ({
    context: { active: mockOtelActive },
    trace: { getSpan: mockOtelGetSpan },
    propagation: { inject: mockOtelInject },
}));

const assert = require('assert');
const werelogs = require('werelogs');
const logger = new werelogs.Logger('MongoClientInterface', 'debug', 'debug');
const sinon = require('sinon');
const MongoClientInterface = require('../../../../../lib/storage/metadata/mongoclient/MongoClientInterface');
const { makeOtelHelpers } = require('../otelMockHelpers');

const otel = makeOtelHelpers({
    active: mockOtelActive,
    getSpan: mockOtelGetSpan,
    inject: mockOtelInject,
});

describe('MongoClientInterface:repair trace-context plumbing', () => {
    let client;
    let collection;
    let captured;

    beforeAll(() => {
        client = new MongoClientInterface({});
    });

    beforeEach(() => {
        otel.resetMocks();
        captured = null;
        collection = {
            findOneAndReplace: sinon.stub().callsFake((_filter, doc) => {
                captured = doc;
                return Promise.resolve({ ok: 1, value: doc });
            }),
        };
    });

    afterEach(() => {
        sinon.restore();
    });

    it('stamps traceContext on the repair write when a span is active', done => {
        otel.activateSpan();
        client.repair(collection, 'bucket', 'example', { key: 'example' }, { versionId: 'v1' }, 'v0', logger, err => {
            assert.ifError(err);
            assert.deepStrictEqual(captured.value.traceContext, { traceparent: otel.TRACEPARENT });
            done();
        });
    });

    it('clears stale traceContext when no span is active', done => {
        otel.deactivateSpan();
        const objVal = {
            key: 'example',
            traceContext: { traceparent: 'stale-prior-trace' },
        };
        client.repair(collection, 'bucket', 'example', objVal, { versionId: 'v1' }, 'v0', logger, err => {
            assert.ifError(err);
            assert.strictEqual(captured.value.traceContext, undefined);
            done();
        });
    });
});
