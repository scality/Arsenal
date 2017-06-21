const constants = require('../constants');
const errors = require('../errors');

const userMetadata = {};
/**
 * Pull user provided meta headers from request headers
 * @param {object} headers - headers attached to the http request (lowercased)
 * @return {(object|Error)} all user meta headers or MetadataTooLarge
 */
userMetadata.getMetaHeaders = headers => {
    const metaHeaders = Object.create(null);
    let totalLength = 0;
    const metaHeaderKeys = Object.keys(headers).filter(h =>
        h.startsWith('x-amz-meta-'));
    const validHeaders = metaHeaderKeys.every(k => {
        totalLength += k.length;
        totalLength += headers[k].length;
        metaHeaders[k] = headers[k];
        return (totalLength <= constants.maximumMetaHeadersSize);
    });
    if (validHeaders) {
        return metaHeaders;
    }
    return errors.MetadataTooLarge;
};

module.exports = userMetadata;
