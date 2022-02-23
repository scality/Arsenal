export function indexOf<T>(arr: T[], value: T) {
    if (!arr.length) {
        return -1;
    }
    let lo = 0;
    let hi = arr.length - 1;

    while (hi - lo > 1) {
        const i = lo + ((hi - lo) >> 1);
        if (arr[i] > value) {
            hi = i;
        } else {
            lo = i;
        }
    }
    if (arr[lo] === value) {
        return lo;
    }
    if (arr[hi] === value) {
        return hi;
    }
    return -1;
}

export function indexAtOrBelow<T>(arr: T[], value: T) {
    let i: number;
    let lo: number;
    let hi: number;

    if (!arr.length || arr[0] > value) {
        return -1;
    }
    if (arr[arr.length - 1] <= value) {
        return arr.length - 1;
    }

    lo = 0;
    hi = arr.length - 1;

    while (hi - lo > 1) {
        i = lo + ((hi - lo) >> 1);
        if (arr[i] > value) {
            hi = i;
        } else {
            lo = i;
        }
    }

    return lo;
}

/*
 * perform symmetric diff in O(m + n)
 */
export function symDiff(k1, k2, v1, v2, cb) {
    let i = 0;
    let j = 0;
    const n = k1.length;
    const m = k2.length;

    while (i < n && j < m) {
        if (k1[i] < k2[j]) {
            cb(v1[i]);
            i++;
        } else if (k2[j] < k1[i]) {
            cb(v2[j]);
            j++;
        } else {
            i++;
            j++;
        }
    }
    while (i < n) {
        cb(v1[i]);
        i++;
    }
    while (j < m) {
        cb(v2[j]);
        j++;
    }
}
