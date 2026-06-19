'use strict';

const assert = require('assert');

const tracing = require('../../../lib/tracing');

describe('lib/tracing barrel', () => {
    it('should re-export the public API surface', () => {
        assert.strictEqual(typeof tracing.isEnabled, 'function');
        assert.strictEqual(typeof tracing.init, 'function');
        assert.strictEqual(typeof tracing.close, 'function');
        assert.strictEqual(typeof tracing.instrumentApiMethod, 'function');
        assert.strictEqual(typeof tracing.startApiSpan, 'function');
        assert.strictEqual(typeof tracing.endSpan, 'function');
        assert.strictEqual(typeof tracing.makeHttpInstrumentationConfig, 'function');
        assert.strictEqual(typeof tracing.kafka, 'object');
    });
});
