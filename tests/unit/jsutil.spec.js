'use strict';// eslint-disable-line

const assert = require('assert');
const jsutil = require('../../index').jsutil;

describe('JSUtil', () => {
    describe('once', () => {
        it('should call the wrapped function only once when invoked ' +
           'multiple times',
           done => {
               let value = 42;
               let value2 = 51;

               const wrapOnce = jsutil.once(expectArg => {
                   assert.strictEqual(expectArg, 'foo');
                   value += 1;
                   return value;
               });
               const wrapOnce2 = jsutil.once(expectArg => {
                   assert.strictEqual(expectArg, 'foo2');
                   value2 += 1;
                   return value2;
               });
               assert.strictEqual(wrapOnce('foo'), 43);
               assert.strictEqual(wrapOnce2('foo2'), 52);
               assert.strictEqual(wrapOnce('bar'), 43);
               assert.strictEqual(wrapOnce2('bar2'), 52);
               done();
           });
    });
});
