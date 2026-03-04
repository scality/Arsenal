const assert = require('assert');
const werelogs = require('werelogs');
const { areTagsValid, _validator, parseTagXml } = require('../../../lib/s3middleware/tagging');

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

describe('areTagsValid', () => {
    it('should return true for empty array', () => {
        const result = areTagsValid([]);
        assert.strictEqual(result, true);
    });

    it('should return true for valid tags', () => {
        const validTags = [
            { Key: 'key1', Value: 'value1' },
            { Key: 'key2', Value: 'value2' }
        ];
        const result = areTagsValid(validTags);
        assert.strictEqual(result, true);
    });

    it('should return false if number of tags exceed 50', () => {
        const tags = Array(51).fill(0).map((_, i) => ({
            Key: `key${i}`,
            Value: `value${i}`
        }));
        const result = areTagsValid(tags);
        assert.strictEqual(result, false);
    });

    it('should return false for tags with missing Key', () => {
        const invalidTags = [
            { Value: 'value1' }
        ];
        const result = areTagsValid(invalidTags);
        assert.strictEqual(result, false);
    });

    it('should return false for tags with missing Value', () => {
        const invalidTags = [
            { Key: 'key1' }
        ];
        const result = areTagsValid(invalidTags);
        assert.strictEqual(result, false);
    });

    it('should return false for tags with empty Key', () => {
        const invalidTags = [
            { Key: '', Value: 'value1' }
        ];
        const result = areTagsValid(invalidTags);
        assert.strictEqual(result, false);
    });

    it('should return true for tags with empty Value', () => {
        const validTags = [
            { Key: 'key1', Value: '' }
        ];
        const result = areTagsValid(validTags);
        assert.strictEqual(result, true);
    });

    it('should return false for tags with duplicate keys', () => {
        const invalidTags = [
            { Key: 'key1', Value: 'value1' },
            { Key: 'key1', Value: 'value2' }
        ];
        const result = areTagsValid(invalidTags);
        assert.strictEqual(result, false);
    });

    it('should return false for tags with Key longer than 128 characters', () => {
        const invalidTags = [
            { Key: 'a'.repeat(129), Value: 'value1' }
        ];
        const result = areTagsValid(invalidTags);
        assert.strictEqual(result, false);
    });

    it('should return false for tags with Value longer than 256 characters', () => {
        const invalidTags = [
            { Key: 'key1', Value: 'a'.repeat(257) }
        ];
        const result = areTagsValid(invalidTags);
        assert.strictEqual(result, false);
    });
});

describe('parseTagXml', () => {
    const log = new werelogs.Logger('test');

    it('should parse tags with empty values from XML', (done) => {
        const xml = '<Tagging><TagSet><Tag><Key>key1</Key><Value></Value></Tag></TagSet></Tagging>';
        parseTagXml(xml, log, (err, result) => {
            assert.ifError(err);
            assert.deepStrictEqual(result, { key1: '' });
            done();
        });
    });
});
