// constants for extensions
const SKIP_NONE = undefined; // to be inline with the values of NextMarker
const FILTER_ACCEPT = 1;
const FILTER_SKIP = 0;
const FILTER_END = -1;
const UNICODE_MAX = String.fromCodePoint(0x10FFFF);

/**
 * This function check if number is valid
 * To be valid a number need to be an Integer and be lower than the limit
 *                  if specified
 * If the number is not valid the limit is returned
 * @param {Number} number - The number to check
 * @param {Number} limit - The limit to respect
 * @return {Number} - The parsed number || limit
 */
function checkLimit(number, limit) {
    const parsed = Number.parseInt(number, 10);
    const valid = !Number.isNaN(parsed) && (!limit || parsed <= limit);
    return valid ? parsed : limit;
}

/**
 * Increment the charCode of the last character of a valid string.
 *
 * @param {string} str - the input string
 * @return {string} - the incremented string
 *                    or the input if it is not valid
 */
function inc(str) {
    return str ? (str.slice(0, str.length - 1) +
            String.fromCharCode(str.charCodeAt(str.length - 1) + 1)) : str;
}

/*
 * Compares two Strings, s1 and s2, using UTF-8 lexicographic ordering.
 * @function
 * @param {String} s1 the first string to compare
 * @param {String} s2 the second string to compare
 * @return {number} -1, 0, or 1 if s1 is less than, equal or greater than s2
 *  respectively
 */
function utf8Compare(s1, s2) {
    const l1 = s1.length;
    const l2 = s2.length;
    const l = Math.min(l1, l2);

    for (let i = 0; i < l; i++) {
        const cp1 = s1.codePointAt(i);
        const cp2 = s2.codePointAt(i);

        if (cp1 < cp2) {
            return -1;
        } else if (cp1 > cp2) {
            return 1;
        }

        if (cp1 > 0xFFFF) {
            i++;
        }
    }

    return Math.sign(l1 - l2);
}

module.exports = {
    checkLimit,
    inc,
    utf8Compare,
    SKIP_NONE,
    FILTER_END,
    FILTER_SKIP,
    FILTER_ACCEPT,
    UNICODE_MAX,
};
