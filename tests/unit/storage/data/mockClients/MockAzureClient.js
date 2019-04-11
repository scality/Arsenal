const assert = require('assert');
const http = require('http');
const MetadataWrapper =
    require('../../../../../lib/storage/metadata/MetadataWrapper');

class MockAzureClient {
    put(stream, size, keyContext, reqUids, callback, skey, metadata) {
        if (stream) {
            assert(stream instanceof http.IncomingMessage);
        }
        assert.strictEqual(typeof size, 'number');
        assert.strictEqual(typeof keyContext, 'object');
        const { objectKey, bucketName } = keyContext;
        assert.strictEqual(typeof objectKey, 'string');
        assert.strictEqual(typeof bucketName, 'string');
        assert.strictEqual(typeof reqUids, 'string');
        assert.strictEqual(typeof callback, 'function');
        assert.equal(skey, null);
        assert(metadata instanceof MetadataWrapper);
        return callback(null, objectKey);
    }

    get(objectGetInfo, range, reqUids, callback) {
        assert.strictEqual(typeof objectGetInfo, 'object');
        const { key, bucketName } = objectGetInfo;
        if (range) {
            assert(Array.isArray(range));
        }
        assert.strictEqual(typeof key, 'string');
        assert.strictEqual(typeof bucketName, 'string');
        assert.strictEqual(typeof reqUids, 'string');
        assert.strictEqual(typeof callback, 'function');
        return callback();
    }

    delete(objectGetInfo, reqUids, callback) {
        assert.strictEqual(typeof objectGetInfo, 'object');
        const { key, bucketName } = objectGetInfo;
        assert.strictEqual(typeof key, 'string');
        assert.strictEqual(typeof bucketName, 'string');
        assert.strictEqual(typeof reqUids, 'string');
        assert.strictEqual(typeof callback, 'function');
        return callback();
    }
}

module.exports = MockAzureClient;
