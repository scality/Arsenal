'use strict'; // eslint-disable-line strict

function getCanonicalizedAmzHeaders(headers) {
    /*
    Iterate through headers and pull any headers that are x-amz headers.
    Need to include 'x-amz-date' here even though AWS docs
    ambiguous on this.
    */
    const amzHeaders = [];
    const keys = Object.keys(headers);
    const len = keys.length;
    for (let i = 0; i < len; ++i) {
        const key = keys[i];
        if (key.startsWith('x-amz-')) {
            amzHeaders.push([key.trim(), headers[key].trim()]);
        }
    }
    /*
    AWS docs state that duplicate headers should be combined
    in the same header with values concatenated with
    a comma separation.
    Node combines duplicate headers and concatenates the values
    with a comma AND SPACE separation.
    Could replace all occurrences of ', ' with ',' but this
    would remove spaces that might be desired
    (for instance, in date header).
    Opted to proceed without this parsing since it does not appear
    that the AWS clients use duplicate headers.
    */

    // If there are no amz headers, just return an empty string
    if (amzHeaders.length === 0) {
        return '';
    }

    // Sort the amz headers by key (first item in tuple)
    amzHeaders.sort((a, b) => a[0] > b[0] ? 1 : -1);
    // Build headerString
    let headerStr = '';
    const finLen = amzHeaders.length;
    for (let i = 0; i < finLen; ++i) {
        const current = amzHeaders[i];
        headerStr += current[0] + ':' + current[1] + '\n';
    }
    return headerStr;
}

module.exports = getCanonicalizedAmzHeaders;
