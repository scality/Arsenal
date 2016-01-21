import { shuffle } from '../../index';

import assert from 'assert';

describe('Shuffle', () => {
    it ('should be differente 1000 times', (done) => {
        let array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
        const array2 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

        for (let i = 0; i < 1000; i++){
            shuffle(array);
            assert.notEqual(array, array2);
        }
        done();
    });
});
