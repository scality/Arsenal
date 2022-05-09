const assert = require('assert');
const { getMetaHeaders } = require('../../../lib/s3middleware/userMetadata');
const { maximumMetaHeadersSize } = require('../../../lib/constants');

function genMaxSizeMetaHeaders() {
    const metaHeaders = {};
    const counter = 8;
    const bytesPerHeader =
        (maximumMetaHeadersSize / counter);
    for (let i = 0; i < counter; i++) {
        const key = `x-amz-meta-header${i}`;
        const valueLength = bytesPerHeader - key.length;
        metaHeaders[key] = '0'.repeat(valueLength);
    }
    return metaHeaders;
}

describe('get meta headers', () => {
    it('returns no error for metadata length equal to maximum allowed', () => {
        const headers = genMaxSizeMetaHeaders();
        assert.doesNotThrow(() => {
            getMetaHeaders(headers);
        });
    });
    it('returns error for metadata length equal to maximum allowed plus one', () => {
        const headers = genMaxSizeMetaHeaders();
        headers['x-amz-meta-header0'] = `${headers['x-amz-meta-header0']}1`;
        const result = getMetaHeaders(headers);
        assert(result instanceof Error);
        assert.strictEqual(result.is.MetadataTooLarge, true);
    });
});
