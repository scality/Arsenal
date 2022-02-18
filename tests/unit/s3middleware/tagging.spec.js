const assert = require('assert');
const { _validator } = require('../../../lib/s3middleware/tagging');

describe('tagging validator', () => {
    it('validates keys and values are less than 128 and 256', () => {
        const result = _validator.validateKeyValue('hey', 'you guys');
        assert.strictEqual(result, true);
    });
    it('returns error for keys greater than 128', () => {
        const result = _validator.validateKeyValue('Y'.repeat(200), 'you guys');
        assert(result instanceof Error);
    });
    it('returns error for values greater than 256', () => {
        const result = _validator.validateKeyValue('X', 'Z'.repeat(300));
        assert(result instanceof Error);
    });
    it('allows any utf8 string in keys and values', () => {
        const result = _validator.validateKeyValue('あいう', '😀😄');
        assert.strictEqual(result, true);
    });
});
