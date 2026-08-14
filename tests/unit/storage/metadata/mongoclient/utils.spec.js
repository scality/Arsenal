const assert = require('assert');

const errors = require('../../../../../lib/errors').default;

const {
    credPrefix,
    translateConditions,
    formatMasterKey,
    formatVersionKey,
    indexFormatObjectToMongoArray,
    indexFormatMongoArrayToObject,
} = require('../../../../../lib/storage/metadata/mongoclient/utils');

const MongoUtils = require('../../../../../lib/storage/metadata/mongoclient/utils');

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

describe('translate query object', () => {
    const tests = [
        [
            'should throw an error if depth < 0',
            {
                depth: -1,
                prefix: '',
                query: { $eq: 42 },
                error: errors.InternalError,
                result: null,
            },
        ],
        [
            'should throw an error if depth > 10',
            {
                depth: 11,
                prefix: '',
                query: { $eq: 42 },
                error: errors.InternalError,
                result: null,
            },
        ],
        [
            'should throw an error if query contains an invalid value',
            {
                depth: 0,
                prefix: '',
                query: null,
                error: errors.InternalError,
                result: null,
            },
        ],
        [
            'should throw an error if query contains an invalid value',
            {
                depth: 0,
                prefix: '',
                query: undefined,
                error: errors.InternalError,
                result: null,
            },
        ],
        [
            'should throw an error if query contains an invalid value',
            {
                depth: 0,
                prefix: '',
                query: [42],
                error: errors.InternalError,
                result: null,
            },
        ],
        [
            'should throw an error if query contains an invalid value',
            {
                depth: 0,
                prefix: '',
                query: { nested: null },
                error: errors.InternalError,
                result: null,
            },
        ],
        [
            'should throw an error if query contains an invalid value',
            {
                depth: 0,
                prefix: '',
                query: {
                    $eq: 42,
                    nested: 42,
                },
                error: errors.InternalError,
                result: null,
            },
        ],
        [
            'should throw an error if query contains an invalid value',
            {
                depth: 0,
                prefix: '',
                query: {
                    $eq: 42,
                    nested: 21,
                },
                error: errors.InternalError,
                result: null,
            },
        ],
        [
            'should throw an error if query contains an invalid value',
            {
                depth: 0,
                prefix: '',
                query: {
                    $eq: 42,
                    $ne: 21,
                },
                error: errors.InternalError,
                result: null,
            },
        ],
        [
            'should throw an error if query contains an invalid value',
            {
                depth: 0,
                prefix: '',
                query: {
                    nested1: { $eq: 42 },
                    nested2: null,
                },
                error: errors.InternalError,
                result: null,
            },
        ],
        [
            'should return filter',
            {
                depth: 0,
                prefix: 'prefix',
                query: 42,
                error: null,
                result: { prefix: 42 },
            },
        ],
        [
            'should return filter',
            {
                depth: 0,
                prefix: 'prefix',
                query: { nested: 42 },
                error: null,
                result: { 'prefix.nested': 42 },
            },
        ],
        [
            'should return filter',
            {
                depth: 0,
                prefix: '',
                query: { nested: 42 },
                error: null,
                result: { nested: 42 },
            },
        ],
        [
            'should return filter',
            {
                depth: 0,
                prefix: 'prefix',
                query: { $eq: 42 },
                error: null,
                result: { prefix: { $eq: 42 } },
            },
        ],
        [
            'should return filter',
            {
                depth: 0,
                prefix: 'prefix',
                query: { nested: { $eq: 42 } },
                error: null,
                result: { 'prefix.nested': { $eq: 42 } },
            },
        ],
        [
            'should return filter',
            {
                depth: 0,
                prefix: 'prefix',
                query: {
                    nested1: { $eq: 42 },
                    nested2: 'forty-two',
                },
                error: null,
                result: {
                    'prefix.nested1': { $eq: 42 },
                    'prefix.nested2': 'forty-two',
                },
            },
        ],
        [
            'should throw when $exists value is not a boolean',
            {
                depth: 0,
                prefix: 'value',
                query: { microVersionId: { $exists: 'yes' } },
                error: errors.InternalError,
                result: null,
            },
        ],
        [
            'should translate $exists operator',
            {
                depth: 0,
                prefix: 'value',
                query: { microVersionId: { $exists: false } },
                error: null,
                result: { 'value.microVersionId': { $exists: false } },
            },
        ],
        [
            'should translate $or with $exists and $gt',
            {
                depth: 0,
                prefix: 'value',
                query: {
                    $or: [{ microVersionId: { $exists: false } }, { microVersionId: { $gt: 'abc' } }],
                },
                error: null,
                result: {
                    $or: [{ 'value.microVersionId': { $exists: false } }, { 'value.microVersionId': { $gt: 'abc' } }],
                },
            },
        ],
        [
            'should translate nested $or',
            {
                depth: 0,
                prefix: 'value',
                query: {
                    $or: [{ $or: [{ microVersionId: { $exists: false } }] }],
                },
                error: null,
                result: {
                    $or: [{ $or: [{ 'value.microVersionId': { $exists: false } }] }],
                },
            },
        ],
        [
            'should translate $and',
            {
                depth: 0,
                prefix: 'value',
                query: {
                    $and: [{ fieldA: { $gt: 1 } }, { fieldB: { $exists: true } }],
                },
                error: null,
                result: {
                    $and: [{ 'value.fieldA': { $gt: 1 } }, { 'value.fieldB': { $exists: true } }],
                },
            },
        ],
        [
            'should translate $or with mixed plain and nested $or items',
            {
                depth: 0,
                prefix: 'value',
                query: {
                    $or: [
                        { fieldA: { $gt: 1 } },
                        { $or: [{ fieldB: { $exists: false } }, { fieldC: { $lte: 'xyz' } }] },
                    ],
                },
                error: null,
                result: {
                    $or: [
                        { 'value.fieldA': { $gt: 1 } },
                        { $or: [{ 'value.fieldB': { $exists: false } }, { 'value.fieldC': { $lte: 'xyz' } }] },
                    ],
                },
            },
        ],
        [
            'should throw when two sibling fields both contain a structural operator of the same type',
            {
                depth: 0,
                prefix: 'value',
                query: {
                    fieldA: { $or: [{ x: 1 }] },
                    fieldB: { $or: [{ y: 2 }] },
                },
                error: errors.InternalError,
                result: null,
            },
        ],
        [
            'should throw on empty $or array',
            {
                depth: 0,
                prefix: 'value',
                query: { $or: [] },
                error: errors.InternalError,
                result: null,
            },
        ],
        [
            'should translate $or nested under a field',
            {
                depth: 0,
                prefix: 'value',
                query: {
                    $or: [{ foo: { $or: [{ microVersionId: { $exists: false } }] } }],
                },
                error: null,
                result: {
                    $or: [{ $or: [{ 'value.foo.microVersionId': { $exists: false } }] }],
                },
            },
        ],
    ];
    tests.forEach(([msg, params]) =>
        it(msg, () => {
            const { depth, prefix, query, error, result } = params;
            if (error) {
                const thrower = () => translateConditions(depth, prefix, {}, query);
                expect(thrower).toThrowError(error.message);
                return;
            }
            const filter = {};
            translateConditions(depth, prefix, filter, query);
            assert.deepStrictEqual(filter, result);
        }),
    );
});

describe('object key formating', () => {
    const tests = [
        [
            'should correctly format master key for old bucket format',
            {
                args: {
                    objName: 'test-object',
                    vFormat: 'v0',
                },
                fn: formatMasterKey,
                expected: 'test-object',
            },
        ],
        [
            'should correctly format master key for new bucket format',
            {
                args: {
                    objName: 'test-object',
                    vFormat: 'v1',
                },
                fn: formatMasterKey,
                expected: '\x7fMtest-object',
            },
        ],
        [
            'should correctly format version key for old bucket format',
            {
                args: {
                    objName: 'test-object',
                    versionId: 'a1234',
                    vFormat: 'v0',
                },
                fn: formatVersionKey,
                expected: 'test-object\0a1234',
            },
        ],
        [
            'should correctly format version key for new bucket format',
            {
                args: {
                    objName: 'test-object',
                    versionId: 'a1234',
                    vFormat: 'v1',
                },
                fn: formatVersionKey,
                expected: '\x7fVtest-object\0a1234',
            },
        ],
    ];
    tests.forEach(([message, params]) => {
        const { args, fn, expected } = params;
        it(message, done => {
            assert.strictEqual(fn(...Object.values(args)), expected);
            return done();
        });
    });
});

describe('Index object transforms', () => {
    const indexObjIn = [
        {
            keys: [
                { key: 'value.last-modified', order: 1 },
                { key: '_id', order: 1 },
            ],
            name: 'index1',
            background: true,
        },
        {
            keys: [
                { key: 'value.dataStoreName', order: 1 },
                { key: 'value.last-modified', order: 1 },
                { key: '_id', order: 1 },
            ],
            name: 'index2',
        },
    ];

    const mongoIndexObjOut = [
        {
            name: 'index1',
            key: new Map([
                ['value.last-modified', 1],
                ['_id', 1],
            ]),
            background: true,
        },
        {
            name: 'index2',
            key: new Map([
                ['value.dataStoreName', 1],
                ['value.last-modified', 1],
                ['_id', 1],
            ]),
        },
    ];

    const mongoIndexObjIn = [
        {
            name: 'index1',
            key: {
                'value.last-modified': 1,
                _id: 1,
            },
        },
        {
            name: 'index2',
            key: {
                'value.dataStoreName': 1,
                'value.last-modified': 1,
                _id: 1,
            },
        },
    ];

    const indexObjOut = [
        {
            keys: [
                { key: 'value.last-modified', order: 1 },
                { key: '_id', order: 1 },
            ],
            name: 'index1',
        },
        {
            keys: [
                { key: 'value.dataStoreName', order: 1 },
                { key: 'value.last-modified', order: 1 },
                { key: '_id', order: 1 },
            ],
            name: 'index2',
        },
    ];

    it('should convert index object to mongo index object', done => {
        assert.deepStrictEqual(indexFormatObjectToMongoArray(indexObjIn), mongoIndexObjOut);
        return done();
    });

    it('should convert mongo index object to index object', done => {
        assert.deepStrictEqual(indexFormatMongoArrayToObject(mongoIndexObjIn), indexObjOut);
        return done();
    });
});

describe('MongoUtils', () => {
    describe('indexFormatObjectToMongoArray', () => {
        it('should handle null input', () => {
            const result = MongoUtils.indexFormatObjectToMongoArray(null);
            assert.deepStrictEqual(result, []);
        });

        it('should handle undefined input', () => {
            const result = MongoUtils.indexFormatObjectToMongoArray(undefined);
            assert.deepStrictEqual(result, []);
        });

        it('should handle non-array input', () => {
            const result = MongoUtils.indexFormatObjectToMongoArray({});
            assert.deepStrictEqual(result, []);
        });

        it('should convert array of index objects to mongo array format', () => {
            const input = [
                {
                    name: 'testIndex',
                    keys: [
                        { key: 'field1', order: 1 },
                        { key: 'field2', order: -1 },
                    ],
                },
            ];

            const result = MongoUtils.indexFormatObjectToMongoArray(input);

            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].name, 'testIndex');
            assert(result[0].key instanceof Map);
            assert.strictEqual(result[0].key.get('field1'), 1);
            assert.strictEqual(result[0].key.get('field2'), -1);
        });
    });
});
