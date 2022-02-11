const assert = require('assert');
const SortedSet = require('../../../../lib/algos/set/SortedSet');

describe('SortedSet', () => {
    it('basic', () => {
        const set = new SortedSet();
        set.set('foo', 'bar');
        assert(set.isSet('foo'));
        assert(!set.isSet('foo2'));
        assert.strictEqual(set.get('foo'), 'bar');
        set.set('foo', 'bar2');
        assert.strictEqual(set.get('foo'), 'bar2');
        set.del('foo');
        assert(!set.isSet('foo'));
    });

    it('size', () => {
        const set = new SortedSet();
        set.set('foo', 'bar');
        assert.strictEqual(set.size, 1);
        set.set('foo2', 'bar');
        assert.strictEqual(set.size, 2);
        set.set('foo3', 'bar');
        assert.strictEqual(set.size, 3);
        set.del('foo');
        assert.strictEqual(set.size, 2);
        set.del('foo2');
        assert.strictEqual(set.size, 1);
        set.del('foo3');
        assert.strictEqual(set.size, 0);
    });
});
