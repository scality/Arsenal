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

module.exports = {
    checkLimit,
};
