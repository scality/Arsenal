const assert = require('assert');
const { serializeCircJSON } = require('../../../lib/storage/utils');

const obj = {
    key1: 'foo',
    key2: 1,
    key3: { key4: 5 },
};

describe('SerializeCircJSON', () => {
    it('should stringify circular JSON', () => {
        try {
            const circularJSON = Object.assign(obj, {});
            circularJSON.key5 = circularJSON;
            const json = JSON.stringify(circularJSON, serializeCircJSON());
            const parsedJSON = JSON.parse(json);
            assert.strictEqual(parsedJSON.key1, 'foo');
            assert.strictEqual(parsedJSON.key2, 1);
            assert.deepStrictEqual(parsedJSON.key3, { key4: 5 });
            assert.strictEqual(parsedJSON.key5, '[Circular ~. ]');
        } catch (e) {
            assert.ifError(e);
        }
    });

    it('should stringify valid JSON', () => {
        try {
            const validJSON = Object.assign(obj, {});
            const json = JSON.stringify(validJSON, serializeCircJSON());
            const parsedJSON = JSON.parse(json);
            assert.strictEqual(parsedJSON.key1, 'foo');
            assert.strictEqual(parsedJSON.key2, 1);
            assert.deepStrictEqual(parsedJSON.key3, { key4: 5 });
        } catch (e) {
            assert.ifError(e);
        }
    });
});
