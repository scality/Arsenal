module.exports = function performListing(data, Extension, params, logger) {
    const listing = new Extension(params, logger);
    data.every(e => listing.filter(e));
    return listing.result();
};
