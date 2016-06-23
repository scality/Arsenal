'use strict'; // eslint-disable-line strict

const assert = require('assert');
const List = require('../../../lib/extension/list.extension').List;
const Werelogs = require('werelogs');
const logger = new Werelogs('listTest');
const performListing = require('../../utils/performListing');

class Test {
    constructor(name, input, output) {
        this.name = name;
        this.input = input;
        this.output = output;
    }
}

describe('List extension', () => {
    const data = [];
    for (let i = 0; i < 15000; ++i) {
        data.push({
            key: `key${i}`,
            value: `value${i}`,
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
            const res = performListing(data, List, test.input, logger);
            assert.deepStrictEqual(res, test.output);
            done();
        });
    });
});
