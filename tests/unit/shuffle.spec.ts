import { shuffle } from '../../index';

describe('Shuffle', () => {
    test('should not lose data', () => {
        const base = new Array(1000).fill(null).map((_, i) => i);
        const comp = [...base];
        shuffle(comp);
        expect(comp.length).toEqual(base.length);
        const incs = comp.reduce((acc, val) => acc && base.includes(val), true);
        expect(incs).toBeTruthy();
    });
    test('should correctly handle empty array', () => {
        const base = [];
        shuffle(base);
        expect(base).toEqual([]);
    });
    test('should correctly handle one-element array', () => {
        const base = [1];
        shuffle(base);
        expect(base).toEqual([1]);
    });
});
