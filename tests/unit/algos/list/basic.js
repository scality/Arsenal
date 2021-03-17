'use strict'; // eslint-disable-line strict

const assert = require('assert');
const Basic = require('../../../../lib/algos/list/basic').List;
const Werelogs = require('werelogs').Logger;
const logger = new Werelogs('listTest');
const performListing = require('../../../utils/performListing');

class Test {
    constructor(name, input, output) {
        this.name = name;
        this.input = input;
        this.output = output;
    }
}

describe('Basic listing algorithm', () => {
    const data = [];
    for (let i = 0; i < 15000; ++i) {
        // Following the fix for S3C-1985, data is set as a stringified JSON
        // object, so that the test does not keep logging warnings.
        data.push({
            key: `key${i}`,
            value: `{"data":"value${i}"}`,
        });
    }
    const tests = [
        new Test('0 elements', { maxKeys: 0 }, []),
        new Test('15 elements', { maxKeys: 15 }, data.slice(0, 15)),
        new Test('10000 elements', { maxKeys: 10000 }, data.slice(0, 10000)),
        new Test('more than limit', { maxKeys: 15000 }, data.slice(0, 10000)),
        new Test('default limit', {}, data.slice(0, 10000)),
        new Test('without parameters', undefined, data.slice(0, 10000)),
        new Test('with bad parameters', 'lala', data.slice(0, 10000)),
    ];
    tests.forEach(test => {
        it(`Should list ${test.name}`, done => {
            const res = performListing(data, Basic, test.input, logger);
            assert.deepStrictEqual(res, test.output);
            done();
        });
    });

    it('Should support entries with no key', () => {
        const res1 = performListing([{
            value: '{"data":"foo"}',
        }], Basic, { maxKeys: 1 }, logger);
        assert.deepStrictEqual(res1, [{
            key: undefined,
            value: '{"data":"foo"}',
        }]);

        const res2 = performListing([{
            key: undefined,
            value: '{"data":"foo"}',
        }], Basic, { maxKeys: 1 }, logger);
        assert.deepStrictEqual(res2, [{
            key: undefined,
            value: '{"data":"foo"}',
        }]);
    });

    it('Should support key-only listing', () => {
        const res = performListing(['key1', 'key2'],
                                   Basic, { maxKeys: 1 }, logger);
        assert.deepStrictEqual(res, ['key1']);
    });

    const attr1 = {
        key: 'key1',
        value: '{"foo": "bar"}',
    };
    const attr2 = {
        key: 'key2',
        value: '{"customAttributes": {"foo": "bar"}}',
    };
    const attr3 = {
        key: 'key3',
        value: `{"customAttributes": {
"cd_tenant_id%3D%3D6a84c782-8766-11eb-b0a1-d7238b6e9579": "",
"cd_tenant_id%3D%3Dc486659c-8761-11eb-87c2-8b0faea3c595": ""
}}`,
    };
    const attr4 = {
        key: 'key4',
        value: `{"customAttributes": {
"cd_tenant_id%3D%3D6a84c782-8766-11eb-b0a1-d7238b6e9579": ""
}}`,
    };
    const input = [attr1, attr2, attr3, attr4];

    it('Shall ignore custom attributes if no filter is specified', () => {
        const output = input;
        const res = performListing(
            input, Basic,
            {},
            logger);
        assert.deepStrictEqual(res, output);
    });

    it('Shall report nothing if filter does not match', () => {
        const output = [];
        const res = performListing(
            input, Basic,
            { filterKey: 'do not exist' },
            logger);
        assert.deepStrictEqual(res, output);
    });

    it('Shall find key in custom attributes', () => {
        const output = [attr3];
        const res = performListing(
            input, Basic,
            { filterKey: 'cd_tenant_id%3D%3Dc486659c-8761-11eb-87c2-8b0faea3c595' },
            logger);
        assert.deepStrictEqual(res, output);
    });

    it('Shall find key starting with a prefix in custom attributes', () => {
        const output = [attr3, attr4];
        const res = performListing(
            input, Basic,
            { filterKeyStartsWith: 'cd_tenant_id%3D%3D' },
            logger);
        assert.deepStrictEqual(res, output);
    });
});
