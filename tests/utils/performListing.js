const {
    FILTER_END,
    FILTER_ACCEPT,
    FILTER_SKIP } = require('../../lib/algos/list/tools');

function performListingExtended(data, Extension, params, logger) {
    const listing = new Extension(params, logger);
    const counters = { skipped: 0, ended: 0, accepted: 0 };
    data.every(e => {
        const ret = listing.filter(e);
        if (ret === FILTER_END) {
            counters.ended += 1;
            return false;
        } else if (ret === FILTER_SKIP) {
            counters.skipped += 1;
        } else if (ret === FILTER_ACCEPT) {
            counters.accepted += 1;
        } else {
            throw new Error('Unknown filter return value');
        }
        return true;
    });
    return { res: listing.result(), counters };
}

function performListing(data, Extension, params, logger) {
    const retData = performListingExtended(data, Extension, params, logger);
    return retData.res;
}

module.exports = {
    performListing,
    performListingExtended,
};
