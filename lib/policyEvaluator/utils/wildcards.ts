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
    const regExStr = string
        .replace(/[\\^$*+?.()|[\]{}]/g, '\\$&')
        .replace(/(\\\*)|(\\\?)|(\\\$\\\{\\\*\\\})|(\\\$\\\{\\\?\\\})|(\\\$\\\{\\\$\\\})/g, characterMap);
    return `^${regExStr}$`;
};
