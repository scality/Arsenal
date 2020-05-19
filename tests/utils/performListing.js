const assert = require('assert');

module.exports = function performListing(data, Extension, params, logger, vFormat) {
    const listing = new Extension(params, logger, vFormat);
    const mdParams = listing.genMDParams();
    assert(typeof mdParams === 'object');
    data.every(e => listing.filter(e) >= 0);
    return listing.result();
};
