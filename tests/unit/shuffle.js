import assert from 'assert';

import arsenal from '../../index';

describe('Shuffle', () => {
    it('should fail less than 0.005% times', (done) => {
        let array = [];
        const reference = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
        let fails = 0;
        for (let i = 0; i < 20000; i++) {
            array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
            arsenal.shuffle(array);
            if (array === reference)
                fails++;
        }
        assert.equal(fails / 200 <= 0.005, true);
        done();
    });
});
