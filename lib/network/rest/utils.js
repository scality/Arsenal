'use strict'; // eslint-disable-line

const errors = require('../../errors');
const constants = require('../../constants');
const url = require('url');

const passthroughPrefixLength = constants.passthroughFileURL.length;

function explodePath(path) {
    if (path.startsWith(constants.passthroughFileURL)) {
        const key = path.slice(passthroughPrefixLength + 1);
        return {
            service: constants.passthroughFileURL,
            key: key.length > 0 ? key : undefined,
        };
    }
    const pathMatch = /^(\/[a-zA-Z0-9]+)(\/([0-9a-f]*))?$/.exec(path);
    if (pathMatch) {
        return {
            service: pathMatch[1],
            key: (pathMatch[3] !== undefined && pathMatch[3].length > 0 ?
                  pathMatch[3] : undefined),
        };
    }
    throw errors.InvalidURI.customizeDescription('malformed URI');
}

/**
 * Parse the given url and return a pathInfo object. Sanity checks are
 * performed.
 *
 * @param {String} urlStr - URL to parse
 * @param {Boolean} expectKey - whether the command expects to see a
 *   key in the URL
 * @return {Object} a pathInfo object with URL items containing the
 * following attributes:
 *   - pathInfo.service {String} - The name of REST service ("DataFile")
 *   - pathInfo.key {String} - The requested key
 */
function parseURL(urlStr, expectKey) {
    const urlObj = url.parse(urlStr);
    const pathInfo = explodePath(decodeURI(urlObj.path));
    if ((pathInfo.service !== constants.dataFileURL)
        && (pathInfo.service !== constants.passthroughFileURL)) {
        throw errors.InvalidAction.customizeDescription(
            `unsupported service '${pathInfo.service}'`);
    }
    if (expectKey && pathInfo.key === undefined) {
        throw errors.MissingParameter.customizeDescription(
            'URL is missing key');
    }
    if (!expectKey && pathInfo.key !== undefined) {
        // note: we may implement rewrite functionality by allowing a
        // key in the URL, though we may still provide the new key in
        // the Location header to keep immutability property and
        // atomicity of the update (we would just remove the old
        // object when the new one has been written entirely in this
        // case, saving a request over an equivalent PUT + DELETE).
        throw errors.InvalidURI.customizeDescription(
            'PUT url cannot contain a key');
    }
    return pathInfo;
}

module.exports = {
    explodePath,
    parseURL,
};
