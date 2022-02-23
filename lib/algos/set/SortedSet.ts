import * as ArrayUtils from './ArrayUtils';

export default class SortedSet<Key, Value> {
    keys: Key[];
    values: Value[];

    constructor(obj?: { keys: Key[]; values: Value[] }) {
        this.keys = obj?.keys ?? [];
        this.values = obj?.values ?? [];
    }

    clear() {
        this.keys = [];
        this.values = [];
    }

    get size() {
        return this.keys.length;
    }

    set(key: Key, value: Value) {
        const index = ArrayUtils.indexAtOrBelow(this.keys, key);
        if (this.keys[index] === key) {
            this.values[index] = value;
            return;
        }
        this.keys.splice(index + 1, 0, key);
        this.values.splice(index + 1, 0, value);
    }

    isSet(key: Key) {
        const index = ArrayUtils.indexOf(this.keys, key);
        return index >= 0;
    }

    get(key: Key) {
        const index = ArrayUtils.indexOf(this.keys, key);
        return index >= 0 ? this.values[index] : undefined;
    }

    del(key: Key) {
        const index = ArrayUtils.indexOf(this.keys, key);
        if (index >= 0) {
            this.keys.splice(index, 1);
            this.values.splice(index, 1);
        }
    }
}
