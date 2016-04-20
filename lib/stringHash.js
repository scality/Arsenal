'use strict';// eslint-disable-line strict

/**
 * This function compute a hash from a string
 * https://github.com/darkskyapp/string-hash/blob/master/index.js
 * @param {String} str - The string to compute the hash
 * @return {Number} The computed hash
 */
function stringHash(str) {
    let hash = 5381;
    let i = str.length;

    while (i) {
        hash = hash * 33 ^ str.charCodeAt(--i);
    }

    /* JavaScript does bitwise operations (like XOR, above) on
     * 32-bit signed integers. Since we want the results to be
     * always positive, convert the signed int to an unsigned by
     * doing an unsigned bitshift.
     */
    return hash >>> 0;
}

module.exports = stringHash;
