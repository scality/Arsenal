'use strict'; // eslint-disable-line strict

const randomBytes = require('crypto').randomBytes;

/*
 * This set of function allows us to create an efficient shuffle
 * of our array, since Math.random() will not be enough (32 bits of
 * entropy are less than enough when the entropy needed is the factorial
 * of the array length).
 *
 * Many thanks to @jmunoznaranjo for providing us with a solid solution.
 */

/*
 * Returns the lowest number of bits required to represent a positive base-10
 * number. Sync function.
 * @param {number} number - a positive integer
 * @return {number} the lowest number of bits
 * @throws Error if number < 0
 */
function bitsNeeded(number) {
    if (number < 0) {
        throw new Error('Input must be greater than or equal to zero');
    } else if (number === 0) {
        return 1;
    } else {
        return Math.floor(Math.log2(number)) + 1;
    }
}

/*
 * Returns a 'numbits'-long sequence of 1s *as a base-10 integer*.
 * Sync function.
 * @param {number} numbits - a positive integer
 * @return {number} the sequence of 1s
 *  if numbits === 0
 * @throws Error if numBits < 0
 */
function createMaskOnes(numBits) {
    if (numBits < 0) {
        throw new Error('Input must be greater than or equal to zero');
    }
    return Math.pow(2, numBits) - 1;
}

/*
 * Returns a buffer of cryptographically secure pseudo-random bytes. The
 * source of bytes is nodejs' crypto.randomBytes. Sync function.
 * @param{number} howMany - the number of bytes to  return
 * @return {buffer} a InRangebuffer with 'howMany' pseudo-random bytes.
 * @throws Error if numBytes < 0 or if insufficient entropy
 */
function nextBytes(numBytes) {
    if (numBytes < 0) {
        throw new Error('Input must be greater than or equal to zero');
    }
    try {
        return randomBytes(numBytes);
    } catch (ex) {
        throw new Error('Insufficient entropy');
    }
}

/*
 * Returns the number of bytes needed to store a number of bits. Sync function.
 * @param {number} numBits - a positive integer
 * @return {number} the number of bytes needed
 * @throws Error if numBits < 0
 */
function bitsToBytes(numBits) {
    if (numBits < 0) {
        throw new Error('Input must be greater than or equal to zero');
    }
    return Math.ceil(numBits / 8);
}

/*
 * Returns a cryptographically secure pseudo-random integer in range [min,max].
 * The source of randomness underneath is nodejs' crypto.randomBytes.
 * Sync function.
 * @param {number} min - minimum possible value of the returned integer
 * @param {number} max - maximum possible value of the returned integer
 * @return {number} - a pseudo-random integer in [min,max], undefined if
 *  min >= max
 */
function randomRange(min, max) {
    if (max < min) {
        throw new Error('Invalid range');
    }
    if (min === max) {
        return min;
    }
    const range = (max - min);
    const bits = bitsNeeded(range);
    // decide how many bytes we need to draw from nextBytes: drawing less
    // bytes means being more efficient
    const bytes = bitsToBytes(bits);
    // we use a mask as an optimization: it increases the chances for the
    // candidate to be in range
    const mask = createMaskOnes(bits);
    let candidate;
    do {
        candidate = parseInt(nextBytes(bytes).toString('hex'), 16) & mask;
    } while (candidate > range);
    return (candidate + min);
}

/**
 * This shuffles an array of any length, using sufficient entropy
 * in every single case.
 * @param {Array} array - Any type of array
 * @return {Array} - The sorted array
 */
module.exports = function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const randIndex = randomRange(0, i);
        /* eslint-disable no-param-reassign */
        const randIndexVal = array[randIndex];
        array[randIndex] = array[i];
        array[i] = randIndexVal;
        /* eslint-enable no-param-reassign */
    }
    return array;
};
