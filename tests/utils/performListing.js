module.exports = function performListing(data, Extension, params, logger, vFormat) {
    const listing = new Extension(params, logger, vFormat);
    data.every(e => listing.filter(e) >= 0);
    return listing.result();
};
