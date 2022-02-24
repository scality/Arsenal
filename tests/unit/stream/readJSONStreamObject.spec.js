const assert = require('assert');
const stream = require('stream');
const joi = require('@hapi/joi');
const readJSONStreamObject = require('../../../lib/stream/readJSONStreamObject').default;

class ReqStream extends stream.Readable {
    constructor(contents) {
        super();
        this.contents = contents;
    }

    _read() {
        while (this.contents.length > 0) {
            this.push(this.contents.slice(0, 1000));
            this.contents = this.contents.slice(1000);
        }
        this.push(null);
    }
}

describe('readJSONStreamObject', () => {
    [{
        desc: 'accept a valid JSON object',
        contents: '{"foo":"bar","baz":42}',
        error: false,
        value: { foo: 'bar', baz: 42 },
    }, {
        desc: 'error with empty stream contents',
        contents: '',
        error: true,
    }, {
        desc: 'error if stream contents does not match against the validation schema',
        contents: '"foo"',
        joiSchema: joi.object(),
        error: true,
    }, {
        desc: 'accept a large JSON payload',
        contents: `[${new Array(10000).fill('"some-payload"').join(',')}]`,
        error: false,
        value: new Array(10000).fill('some-payload'),
    }].forEach(testCase => {
        it(`should ${testCase.desc}`, async () => {
            let value;
            try {
                value = await readJSONStreamObject(
                    new ReqStream(testCase.contents), testCase.joiSchema);
            } catch (err) {
                assert.strictEqual(testCase.error, true);
                return undefined;
            }
            assert.strictEqual(testCase.error, false);
            assert.deepStrictEqual(testCase.value, value);
            return undefined;
        });
    });
});
