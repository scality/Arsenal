const assert = require('assert');
const routesUtils = require('../../../../lib/s3routes/routesUtils.js');

const bannedStr = 'banned';
const prefixBlacklist = [];

describe('routesUtils.isValidObjectKey', () => {
    it('should return isValid false if object key name starts with a ' +
    'blacklisted prefix', () => {
        const result = routesUtils.isValidObjectKey('bannedkey', [bannedStr]);
        // return { isValid: false, invalidPrefix };
        assert.strictEqual(result.isValid, false);
        assert.strictEqual(result.invalidPrefix, bannedStr);
    });

    it('should return isValid false if object key name exceeds length of 1024',
    () => {
        const keyLength1025 = 'a'.repeat(1025);
        const result = routesUtils.isValidObjectKey(keyLength1025,
            prefixBlacklist);
        assert.strictEqual(result.isValid, false);
    });
});
