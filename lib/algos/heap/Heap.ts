export enum HeapOrder {
    Min = -1,
    Max = 1,
}

export enum CompareResult {
    LT = -1,
    EQ = 0,
    GT = 1,
}

export type CompareFunction = (x: any, y: any) => CompareResult;

export class Heap {
    size: number;
    _maxSize: number;
    _order: HeapOrder;
    _heap: any[];
    _cmpFn: CompareFunction;
    
    constructor(size: number, order: HeapOrder, cmpFn: CompareFunction) {
        this.size = 0;
        this._maxSize = size;
        this._order = order;
        this._cmpFn = cmpFn;
        this._heap = new Array<any>(this._maxSize);
    }

    _parent(i: number): number {
        return Math.floor((i - 1) / 2);
    }

    _left(i: number): number {
        return Math.floor((2 * i) + 1);
    }

    _right(i: number): number {
        return Math.floor((2 * i) + 2);
    }

    _shouldSwap(childIdx: number, parentIdx: number): boolean {
        return this._cmpFn(this._heap[childIdx], this._heap[parentIdx]) as number === this._order as number;
    }

    _swap(i: number, j: number) {
        const tmp = this._heap[i];
        this._heap[i] = this._heap[j];
        this._heap[j] = tmp;
    }

    _heapify(i: number) {
        const l = this._left(i);
        const r = this._right(i);
        let c = i;

        if (l < this.size && this._shouldSwap(l, c)) {
            c = l;
        }

        if (r < this.size && this._shouldSwap(r, c)) {
            c = r;
        }

        if (c != i) {
            this._swap(c, i);
            this._heapify(c);
        }
    }

    add(item: any): any {
        if (this.size >= this._maxSize) {
            return new Error('Max heap size reached');
        }

        ++this.size;
        let c = this.size - 1;
        this._heap[c] = item;

        while (c > 0) {
            if (!this._shouldSwap(c, this._parent(c))) {
                return null;
            }

            this._swap(c, this._parent(c));
            c = this._parent(c);
        }

        return null;
    };

    remove(): any {
        if (this.size <= 0) {
            return null;
        }

        const ret = this._heap[0];
        this._heap[0] = this._heap[this.size - 1];
        this._heapify(0);
        --this.size;

        return ret;
    };

    peek(): any {
        if (this.size <= 0) {
            return null;
        }

        return this._heap[0];
    };
}

export class MinHeap extends Heap {
    constructor(size: number, cmpFn: CompareFunction) {
        super(size, HeapOrder.Min, cmpFn);
    }
}

export class MaxHeap extends Heap {
    constructor(size: number, cmpFn: CompareFunction) {
        super(size, HeapOrder.Max, cmpFn);
    }
} 

