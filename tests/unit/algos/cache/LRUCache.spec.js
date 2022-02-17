const assert = require('assert');

const LRUCache = require('../../../../lib/algos/cache/LRUCache');

describe('LRUCache', () => {
    it('max 1 entry', () => {
        const lru = new LRUCache(1);
        assert.strictEqual(lru.count(), 0);

        assert.strictEqual(lru.add('a', 1), false);
        assert.strictEqual(lru.add('b', 2), false);
        assert.strictEqual(lru.add('b', 3), true);
        assert.strictEqual(lru.count(), 1);

        assert.strictEqual(lru.get('b'), 3);
        // a has been evicted when b was inserted
        assert.strictEqual(lru.get('a'), undefined);

        assert.strictEqual(lru.remove('a'), false);
        assert.strictEqual(lru.remove('b'), true);
        assert.strictEqual(lru.remove('c'), false);
        assert.strictEqual(lru.remove('b'), false);
        assert.strictEqual(lru.count(), 0);
        assert.strictEqual(lru.get('b'), undefined);
    });

    it('max 3 entries', () => {
        const lru = new LRUCache(3);

        assert.strictEqual(lru.add('a', 1), false);
        assert.strictEqual(lru.add('b', 2), false);
        assert.strictEqual(lru.add('b', 3), true);
        assert.strictEqual(lru.count(), 2);

        assert.strictEqual(lru.get('b'), 3);
        assert.strictEqual(lru.get('a'), 1);
        assert.strictEqual(lru.add('c', 4), false);
        assert.strictEqual(lru.count(), 3);

        assert.strictEqual(lru.get('b'), 3);

        // a is the least recently accessed item at the time of
        // insertion of d, so will be evicted first
        assert.strictEqual(lru.add('d', 5), false);
        assert.strictEqual(lru.get('a'), undefined);
        assert.strictEqual(lru.get('b'), 3);
        assert.strictEqual(lru.get('c'), 4);
        assert.strictEqual(lru.get('d'), 5);

        assert.strictEqual(lru.remove('d'), true);
        assert.strictEqual(lru.remove('c'), true);
        assert.strictEqual(lru.count(), 1);
        assert.strictEqual(lru.remove('b'), true);
        assert.strictEqual(lru.count(), 0);
    });

    it('max 1000 entries', () => {
        const lru = new LRUCache(1000);

        for (let i = 0; i < 1000; ++i) {
            assert.strictEqual(lru.add(`${i}`, i), false);
        }
        assert.strictEqual(lru.count(), 1000);
        for (let i = 0; i < 1000; ++i) {
            assert.strictEqual(lru.get(`${i}`), i);
        }
        for (let i = 999; i >= 0; --i) {
            assert.strictEqual(lru.get(`${i}`), i);
        }
        // this shall evict the least recently accessed items, which
        // are in the range [500..1000)
        for (let i = 1000; i < 1500; ++i) {
            assert.strictEqual(lru.add(`${i}`, i), false);
        }
        for (let i = 0; i < 500; ++i) {
            assert.strictEqual(lru.get(`${i}`), i);
        }
        // check evicted items
        for (let i = 500; i < 1000; ++i) {
            assert.strictEqual(lru.get(`${i}`), undefined);
        }

        lru.clear();
        assert.strictEqual(lru.count(), 0);
        assert.strictEqual(lru.get(100), undefined);
    });

    it('max 1000000 entries', function lru1M() {
        // this test takes ~1-2 seconds on a laptop, nevertheless set a
        // large timeout to reduce the potential of flakiness on possibly
        // slower CI environment.
        jest.setTimeout(30000);

        const lru = new LRUCache(1000000);

        for (let i = 0; i < 1000000; ++i) {
            assert.strictEqual(lru.add(`${i}`, i), false);
        }
        assert.strictEqual(lru.count(), 1000000);
        // access all even-numbered items to make them the most
        // recently accessed
        for (let i = 0; i < 1000000; i += 2) {
            assert.strictEqual(lru.get(`${i}`), i);
        }
        // this shall evict the 500K least recently accessed items,
        // which are all odd-numbered items
        for (let i = 1000000; i < 1500000; ++i) {
            assert.strictEqual(lru.add(`${i}`, i), false);
        }
        assert.strictEqual(lru.count(), 1000000);
        // check present (even) and evicted (odd) items
        for (let i = 0; i < 1000000; ++i) {
            assert.strictEqual(lru.get(`${i}`),
                               i % 2 === 0 ? i : undefined);
            assert.strictEqual(lru.remove(`${i}`), i % 2 === 0);
        }
        assert.strictEqual(lru.count(), 500000);
        for (let i = 1499999; i >= 1000000; --i) {
            assert.strictEqual(lru.remove(`${i}`), true);
        }
        assert.strictEqual(lru.count(), 0);
    });
});
