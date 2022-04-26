// * represents any combo of characters
// ? represents any single character

// TODO: Note that there are special rules for * in Principal.
// Handle when working with bucket policies.


// Replace all '*' with '.*' (allow any combo of letters)
// and all '?' with '.{1}' (allow for any one character)
// If *, ? or $ are enclosed in ${}, keep literal *, ?, or $
function characterMap(char: string) {
    const map = {
        '\\*': '.*?',
        '\\?': '.{1}',
        '\\$\\{\\*\\}': '\\*',
        '\\$\\{\\?\\}': '\\?',
        '\\$\\{\\$\\}': '\\$',
    };
    return map[char];
}

/**
 * Converts string into a string that has all regEx characters escaped except
 * for those needed to check for AWS wildcards.  Converted string can then
 * be used for a regEx comparison.
 * @param string - any input string
 * @return converted string
 */
export const handleWildcards = (string: string) => {
    // Escape all regExp special characters
    // Then replace the AWS special characters with regExp equivalents
    const regExStr = string.replace(/[\\^$*+?.()|[\]{}]/g, '\\$&').replace(
        // eslint-disable-next-line max-len
        /(\\\*)|(\\\?)|(\\\$\\\{\\\*\\\})|(\\\$\\\{\\\?\\\})|(\\\$\\\{\\\$\\\})/g,
        characterMap
    );
    return `^${regExStr}$`;
};

/**
 * Converts each portion of an ARN into a converted regEx string
 * to compare against each portion of the ARN from the request
 * @param arn - arn for requested resource
 * @return array of strings to be used for regEx comparisons
 */
export const handleWildcardInResource = (arn: string) => {
// Wildcards can be part of the resource ARN.
// Wildcards do NOT span segments of the ARN (separated by ":")

    // Example: all elements in specific bucket:
    // "Resource": "arn:aws:s3:::my_corporate_bucket/*"
    // ARN format:
    // arn:partition:service:region:namespace:relative-id
    const arnArr = arn.split(':');
    return arnArr.map(portion => handleWildcards(portion));
};
