const ArrayUtils = require('./ArrayUtils');

class SortedSet {

    constructor(obj) {
        if (obj) {
            this.keys = obj.keys;
            this.values = obj.values;
        } else {
            this.clear();
        }
    }

    clear() {
        this.keys = [];
        this.values = [];
    }

    get size() {
        return this.keys.length;
    }

    set(key, value) {
        const index = ArrayUtils.indexAtOrBelow(this.keys, key);
        if (this.keys[index] === key) {
            this.values[index] = value;
            return;
        }
        this.keys.splice(index + 1, 0, key);
        this.values.splice(index + 1, 0, value);
    }

    isSet(key) {
        const index = ArrayUtils.indexOf(this.keys, key);
        return index >= 0;
    }

    get(key) {
        const index = ArrayUtils.indexOf(this.keys, key);
        return index >= 0 ? this.values[index] : undefined;
    }

    del(key) {
        const index = ArrayUtils.indexOf(this.keys, key);
        if (index >= 0) {
            this.keys.splice(index, 1);
            this.values.splice(index, 1);
        }
    }
}

module.exports = SortedSet;
