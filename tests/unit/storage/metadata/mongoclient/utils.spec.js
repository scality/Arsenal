const index = require('../../../../..');
const errors = index.errors;
const {
    credPrefix,
    translateConditions,
} = require('../../../../../lib/storage/metadata/mongoclient/utils');

describe('auth credentials', () => {
    it('should return an empty string if missing creds', () => {
        const result = credPrefix(null);
        expect(result).toStrictEqual('');
    });

    it('should return an empty string if missing username', () => {
        const result = credPrefix({ password: 'p' });
        expect(result).toStrictEqual('');
    });

    it('should return an empty string if missing password', () => {
        const result = credPrefix({ username: 'u' });
        expect(result).toStrictEqual('');
    });

    it('should return an url-compatible auth prefix', () => {
        const creds = { username: 'u:', password: '@p' };
        const result = credPrefix(creds);
        expect(result).toStrictEqual('u%3A:%40p@');
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
    for (const [msg, params] of tests) {
        it(msg, () => {
            const { depth, prefix, query, error, result } = params;
            if (error) {
                const fn = () => translateConditions(depth, prefix, {}, query);
                expect(fn).toThrow(error);
            } else {
                const filter = {};
                translateConditions(depth, prefix, filter, query);
                expect(filter).toStrictEqual(result);
            }
        });
    }
});
