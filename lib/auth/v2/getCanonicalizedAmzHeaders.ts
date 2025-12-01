export default function getCanonicalizedAmzHeaders(headers: Record<string, string>, clientType: string) {
    /*
    Iterate through headers and pull any headers that are x-amz headers.
    Need to include 'x-amz-date' here even though AWS docs
    ambiguous on this.
    */
    const filterFn = clientType === 'GCP' ?
        (val: string) => val.startsWith('x-goog-') :
        (val: string) => val.startsWith('x-amz-');
    const amzHeaders = Object.keys(headers)
        .filter(filterFn)
        .map(val => {
            const headerValue = headers[val];
            // AWS SDK v3 can pass header values as arrays (for multiple values),
            // strings, or other types. We need to normalize them before calling .trim()
            // Per HTTP spec and AWS Signature v2, multiple values are joined with commas
            const stringValue = Array.isArray(headerValue) 
                ? headerValue.join(',') 
                : String(headerValue);
            return [val.trim(), stringValue.trim()];
        });
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
    amzHeaders.sort((a, b) => {
        if (a[0] > b[0]) {
            return 1;
        }
        return -1;
    });
    // Build headerString
    return amzHeaders.reduce((headerStr, current) =>
        `${headerStr}${current[0]}:${current[1]}\n`,
    '');
}
