const assert = require('assert');
const { indexOf, indexAtOrBelow, symDiff } = require('../../../../lib/algos/set/ArrayUtils');
const crypto = require('crypto');

describe('ArrayUtils', () => {
    it('indexOf basic', () => {
        const arr = [];
        assert.strictEqual(indexOf(arr, 42), -1);
        arr.push(42);
        arr.sort();
        assert.strictEqual(indexOf(arr, 42), 0);
        arr.push(41);
        arr.sort();
        assert.strictEqual(indexOf(arr, 41), 0);
        assert.strictEqual(indexOf(arr, 42), 1);
        arr.push(43);
        arr.sort();
        assert.strictEqual(indexOf(arr, 41), 0);
        assert.strictEqual(indexOf(arr, 42), 1);
        assert.strictEqual(indexOf(arr, 43), 2);
    });

    it('indexOf', () => {
        const numOps = 10000;
        const arr = [];
        const refMap = new Map();
        for (let i = 0; i < numOps; i++) {
            const val = crypto.randomBytes(20).toString('hex');
            if (!refMap.get(val)) {
                arr.push(val);
                refMap.set(val);
            }
        }
        arr.sort();
        const refMap2 = new Map([...refMap.entries()].sort());
        let i = 0;
        for (const key of refMap2.keys()) {
            assert.strictEqual(indexOf(arr, key), i++);
        }
    });

    it('indexAtOrBelow basic', () => {
        const arr = [];
        assert.strictEqual(indexAtOrBelow(arr, 42), -1);
        arr.push(42);
        arr.sort();
        assert.strictEqual(indexAtOrBelow(arr, 43), 0);
        arr.push(40);
        arr.sort();
        assert.strictEqual(indexAtOrBelow(arr, 41), 0);
        assert.strictEqual(indexAtOrBelow(arr, 43), 1);
        arr.push(44);
        arr.sort();
        assert.strictEqual(indexAtOrBelow(arr, 41), 0);
        assert.strictEqual(indexAtOrBelow(arr, 43), 1);
        assert.strictEqual(indexAtOrBelow(arr, 45), 2);
    });

    it('indexAtOrBelow', () => {
        const numOps = 10000;
        const arr = [];
        const refMap = new Map();
        for (let i = 0; i < numOps; i++) {
            const val = crypto.randomBytes(20).toString('hex');
            if (!refMap.get(val)) {
                arr.push(val);
                let c = '';
                if (Math.random() < 0.5) {
                    c = 'z';
                }
                refMap.set(val + c);
            }
        }
        arr.sort();
        const refMap2 = new Map([...refMap.entries()].sort());
        let i = 0;
        for (const key of refMap2.keys()) {
            assert.strictEqual(indexAtOrBelow(arr, key), i++);
        }
    });

    it('shall find symmetric difference', () => {
        const arr1 = [2, 4, 5, 7, 8, 10, 12, 15];
        const arr2 = [5, 8, 11, 12, 14, 15];
        const arr3 = [];
        symDiff(arr1, arr2, arr1, arr2, x => arr3.push(x));
        assert.deepEqual(arr3, [2, 4, 7, 10, 11, 14]);
    });
});
