/**
 * Removes tag key value from condition key and adds it to value if needed
 * @param {string} key - condition key
 * @param {string} value - condition value
 * @return {array} key/value pair to use
 */
function transformTagKeyValue(key, value) {
    const patternKeys = ['s3:ExistingObjectTag/', 's3:RequestObjectTagKey/'];
    if (!patternKeys.some(k => key.includes(k))) {
        return [key, value];
    }
    // if key is RequestObjectTag or ExistingObjectTag,
    // remove tag key from condition key and add to value
    // and transform value into query string
    const [conditionKey, tagKey] = key.split('/');
    const transformedValue = [tagKey, value].join('=');
    return [conditionKey, [transformedValue]];
}

/**
 * Gets array of tag key names from request tag query string
 * @param {string} tagQuery - request tags in query string format
 * @return {array} array of tag key names
 */
function getTagKeys(tagQuery) {
    return tagQuery.split('&')
        .map(tag => tag.split('=')[0]);
}

module.exports = {
    transformTagKeyValue,
    getTagKeys,
};
