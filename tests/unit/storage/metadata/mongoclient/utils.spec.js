const assert = require('assert');

const errors = require('../../../../../lib/errors').default;

const {
    credPrefix,
    translateConditions,
    formatMasterKey,
    formatVersionKey,
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
    ];
    tests.forEach(([msg, params]) => it(msg, () => {
        const { depth, prefix, query, error, result } = params;
        if (error) {
            expect(() => translateConditions(depth, prefix, {}, query)).toThrow();
            return;
        }
        const filter = {};
        translateConditions(depth, prefix, filter, query);
        assert.deepStrictEqual(filter, result);
    }));
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
