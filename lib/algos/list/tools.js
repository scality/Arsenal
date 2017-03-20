// constants for extensions
const SKIP_NONE = undefined; // to be inline with the values of NextMarker
const FILTER_ACCEPT = 1;
const FILTER_SKIP = 0;
const FILTER_END = -1;

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

module.exports = {
    checkLimit,
    inc,
    SKIP_NONE,
    FILTER_END,
    FILTER_SKIP,
    FILTER_ACCEPT,
};
