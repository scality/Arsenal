const assert = require('assert');
const crypto = require('crypto');
const http = require('http');

function genSproxydKey() {
    return crypto.randomBytes(20).toString('hex');
}

class MockSproxydclient {
    put(stream, size, params, reqUids, callback, keyScheme) {
        if (keyScheme) {
            assert.strictEqual(typeof keyScheme, 'string');
            assert.strictEqual(keyScheme.length, 40);
        }
        if (stream) {
            assert(stream instanceof http.IncomingMessage);
        }
        assert.strictEqual(typeof size, 'number');
        assert.strictEqual(typeof params, 'object');

        const { bucketName, objectKey } = params;
        assert.strictEqual(typeof bucketName, 'string');
        assert.strictEqual(typeof objectKey, 'string');
        assert.strictEqual(typeof reqUids, 'string');
        assert.strictEqual(typeof callback, 'function');
        return callback(null, genSproxydKey());
    }

    get(key, range, reqUids, callback) {
        assert.strictEqual(typeof key, 'string');
        assert.strictEqual(key.length, 40);
        if (range) {
            assert(Array.isArray(range));
        }
        assert.strictEqual(typeof reqUids, 'string');
        assert.strictEqual(typeof callback, 'function');
        return callback();
    }

    delete(key, reqUids, callback) {
        assert.strictEqual(typeof key, 'string');
        assert.strictEqual(key.length, 40);
        assert.strictEqual(typeof reqUids, 'string');
        assert.strictEqual(typeof callback, 'function');
        return callback();
    }
}

module.exports = MockSproxydclient;
