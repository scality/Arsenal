'use strict'; // eslint-disable-line

const errors = require('../../errors');
const constants = require('../../constants');
const passthroughPrefixLength = constants.passthroughFileURL.length;

module.exports.explodePath = function explodePath(path) {
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
};
