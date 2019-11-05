const assert = require('assert');

const {
    credPrefix,
} = require('../../../../../lib/storage/metadata/mongoclient/utils');

describe('auth credentials', () => {
    it('should return an empty string if missing creds', () => {
        assert.strictEqual(credPrefix(null), '');
    });

    it('should return an empty string if missing username', () => {
        assert.strictEqual(credPrefix({ password: 'p' }), '');
    });

    it('should return an empty string if missing password', () => {
        assert.strictEqual(credPrefix({ username: 'u' }), '');
    });

    it('should return an url-compatible auth prefix', () => {
        const creds = {
            username: 'u:',
            password: '@p',
        };
        assert.strictEqual(credPrefix(creds), 'u%3A:%40p@');
    });
});
