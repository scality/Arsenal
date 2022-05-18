import * as crypto from 'crypto';

/**
 * Takes an array and shuffles it in place. It does not create a new array.
 * @param array the array to shuffle
 * @returns the reference on the array
 */
export default function shuffle<T>(array: T[]) {
    for (let i = array.length - 1; i > 0; i--) {
        const randIndex = crypto.randomInt(0, i);
        [array[randIndex], array[i]] = [array[i], array[randIndex]];
    }
    return array;
}
