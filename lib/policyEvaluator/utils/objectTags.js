/**
 * Removes tag key value from condition key and adds it to value if needed
 * @param {string} key - condition key
 * @param {string} value - condition value
 * @return {array} key/value pair to use
 */
function transformTagKeyValue(key, value) {
    if (!key.includes('/')) {
        return [key, value];
    }
    // if key is RequestObjectTag or ExistingObjectTag,
    // remove tag key from condition key and add to value
    // and transform value into query string
    const [conditionKey, tagKey] = key.split('/');
    return [conditionKey, [tagKey, value].join('=')];
}

/**
 * Gets array of tag key names from request tag query string
 * @param {string} tagQuery - request tags in query string format
 * @return {array} array of tag key names
 */
function getTagKeys(tagQuery) {
    const tagsArray = tagQuery.split(',');
    const keysArray = tagsArray.map(tag => tag.split('=')[0]);
    return keysArray;
}

module.exports = {
    transformTagKeyValue,
    getTagKeys,
};
