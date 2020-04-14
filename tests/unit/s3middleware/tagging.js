const assert = require('assert');
const { _validator } = require('../../../lib/s3middleware/tagging');

describe('tagging validator', () => {
    it('validates keys and values are less than 128 and 256', () => {
      assert.strictEqual(_validator.validateKeyValue("hey", "you guys"), true);
    })
    it('returns error for keys greater than 128', () => {
      const longKey = "Z".repeat(200);
      assert(_validator.validateKeyValue(longKey, "you guys") instanceof Error);
    })
    it('returns error for values greater than 256', () => {
      const longValue = "Z".repeat(300);
      assert(_validator.validateKeyValue("short key", longValue) instanceof Error);
    })
    it('allows any utf8 string in keys and values', () => {
      assert.strictEqual(_validator.validateKeyValue('あいうえお', "😀😄😀😄"), true);
    })
});
