'use strict'

import * as Heap from '../../../../lib/algos/heap/Heap';

function numberCompare(x: any, y: any): Heap.CompareResult {
    if (x > y) {
        return Heap.CompareResult.GT;
    }

    if (x < y) {
        return Heap.CompareResult.LT;
    }

    return Heap.CompareResult.EQ;
}

describe('Heap', () => {
    describe('Heap::add', () => {
        it('should set max heap size and return error if max size is reached', () => {
            const heap = new Heap.Heap(1, Heap.HeapOrder.Min, numberCompare);
            expect(heap.add(1)).toBeNull();
            expect(heap.add(2)).not.toBeNull();
        });
    });

    describe('Heap::remove', () => {
        it('should return null if heap is empty', () => {
            const heap = new Heap.Heap(1, Heap.HeapOrder.Min, numberCompare);
            expect(heap.remove()).toBeNull();
        });
    });

    describe('Heap::peek', () => {
        it('should return null if heap is empty', () => {
            const heap = new Heap.Heap(1, Heap.HeapOrder.Min, numberCompare);
            expect(heap.peek()).toBeNull();
        });
    });
});

describe('MinHeap', () => {
    it('should maintain min heap properties', () => {
        const minHeap = new Heap.MinHeap(5, numberCompare);
        expect(minHeap.add(5)).toBeNull();
        expect(minHeap.add(3)).toBeNull();
        expect(minHeap.add(2)).toBeNull();
        expect(minHeap.add(4)).toBeNull();
        expect(minHeap.add(1)).toBeNull();
        expect(minHeap.size).toEqual(5);
        expect(minHeap.remove()).toEqual(1);
        expect(minHeap.remove()).toEqual(2);
        expect(minHeap.remove()).toEqual(3);
        expect(minHeap.remove()).toEqual(4);
        expect(minHeap.remove()).toEqual(5);
        expect(minHeap.size).toEqual(0);
    });
});

describe('MaxHeap', () => {
    it('should maintain max heap properties', () => {
        const maxHeap = new Heap.MaxHeap(5, numberCompare);
        expect(maxHeap.add(5)).toBeNull();
        expect(maxHeap.add(3)).toBeNull();
        expect(maxHeap.add(2)).toBeNull();
        expect(maxHeap.add(4)).toBeNull();
        expect(maxHeap.add(1)).toBeNull();
        expect(maxHeap.size).toEqual(5);
        expect(maxHeap.remove()).toEqual(5);
        expect(maxHeap.remove()).toEqual(4);
        expect(maxHeap.remove()).toEqual(3);
        expect(maxHeap.remove()).toEqual(2);
        expect(maxHeap.remove()).toEqual(1);
        expect(maxHeap.size).toEqual(0);
    });
});
