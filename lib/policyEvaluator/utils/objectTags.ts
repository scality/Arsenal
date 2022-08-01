/**
 * Removes tag key value from condition key and adds it to value if needed
 * @param key - condition key
 * @param value - condition value
 * @return key/value pair to use
 */
export function transformTagKeyValue(key: string, value: string): [string, string | string[]] {
    const patternKeys = ['s3:ExistingObjectTag/', 's3:RequestObjectTagKey/'];
    if (!patternKeys.some(k => key.startsWith(k))) {
        return [key, value];
    }
    // if key is RequestObjectTag or ExistingObjectTag,
    // remove tag key from condition key and add to value
    // and transform value into query string
    const slashIndex = key.indexOf('/');
    const [conditionKey, tagKey] = [key.slice(0, slashIndex), key.slice(slashIndex + 1)];
    const transformedValue = [tagKey, value].join('=');
    return [conditionKey, [transformedValue]];
}

/**
 * Gets array of tag key names from request tag query string
 * @param tagQuery - request tags in query string format
 * @return array of tag key names
 */
export function getTagKeys(tagQuery: string) {
    return tagQuery.split('&')
        .map(tag => tag.split('=')[0]);
}
