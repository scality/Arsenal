'use strict'; // eslint-disable-line strict


const wildcards = {};

// * represents any combo of characters
// ? represents any single character

// TODO: Note that there are special rules for * in Principal.
// Handle when working with bucket policies.

const mustConvertForRegex = {
    '\\': '\\\\',
    '*': '.*?',
    '?': '.',
    '$': '\\$',
    '^': '\\^',
    '+': '\\+',
    '.': '\\.',
    '(': '\\(',
    ')': '\\)',
    '|': '\\|',
    '[': '\\[',
    ']': '\\]',
    '{': '\\{',
    '}': '\\}',
};

wildcards.handleWildcards = str => {
    const end = str.length;
    let res = '';
    let lastIndex = 0;
    let i = 0;
    for (; i < end; ++i) {
        const c = str[i];
        const c2 = str[i + 2];
        if (c === '$' && str[i + 1] === '{' && str[i + 3] === '}'
            && (c2 === '*' || c2 === '?' || c2 === '$')) {
            res += (i > lastIndex) ?
                str.substring(lastIndex, i) + '\\' + c2 : // eslint-disable-line
                '\\' + c2; // eslint-disable-line
            i += 3;
            lastIndex = i + 1;
            continue;
        }
        const toSecure = mustConvertForRegex[c];
        if (toSecure) {
            res += (i > lastIndex) ? str.substring(lastIndex, i) + toSecure :
                toSecure;
            lastIndex = i + 1;
            continue;
        }
    }
    if (i > lastIndex) {
        res += str.substring(lastIndex, i);
    }
    // eslint-disable-next-line prefer-template
    return '^' + res + '$';
};

// /**
//  * Converts string into a string that has all regEx characters escaped except
//  * for those needed to check for AWS wildcards.  Converted string can then
//  * be used for a regEx comparison.
//  * @param {string} string - any input string
//  * @return {string} converted string
//  */
// wildcards.handleWildcards = string => {
//     // Replace all '*' with '.*' (allow any combo of letters)
//     // and all '?' with '.{1}' (allow for any one character)
//     // If *, ? or $ are enclosed in ${}, keep literal *, ?, or $
//     function characterMap(char) {
//         const map = {
//             '\\*': '.*?',
//             '\\?': '.{1}',
//             '\\$\\{\\*\\}': '\\*',
//             '\\$\\{\\?\\}': '\\?',
//             '\\$\\{\\$\\}': '\\$',
//         };
//         return map[char];
//     }
//     // Escape all regExp special characters
//     let regExStr = string.replace(/[\\^$*+?.()|[\]{}]/g, '\\$&');
//     // Replace the AWS special characters with regExp equivalents
//     regExStr = regExStr.replace(
//         // eslint-disable-next-line max-len
//    /(\\\*)|(\\\?)|(\\\$\\\{\\\*\\\})|(\\\$\\\{\\\?\\\})|(\\\$\\\{\\\$\\\})/g,
//         characterMap);
//     return `^${regExStr}$`;
// };

/**
 * Converts each portion of an ARN into a converted regEx string
 * to compare against each portion of the ARN from the request
 * @param {string} arn - arn for requested resource
 * @return {[string]} array of strings to be used for regEx comparisons
 */
wildcards.handleWildcardInResource = arn => {
// Wildcards can be part of the resource ARN.
// Wildcards do NOT span segments of the ARN (separated by ":")

// Example: all elements in specific bucket:
// "Resource": "arn:aws:s3:::my_corporate_bucket/*"
// ARN format:
// arn:partition:service:region:namespace:relative-id
    const arnArr = arn.split(':');
    return arnArr.map(portion => wildcards.handleWildcards(portion));
};

module.exports = wildcards;
