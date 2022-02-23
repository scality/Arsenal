module.exports = {
    Basic: require('./basic').List,
    Delimiter: require('./delimiter').Delimiter,
    DelimiterVersions: require('./delimiterVersions')
        .DelimiterVersions,
    DelimiterMaster: require('./delimiterMaster')
        .DelimiterMaster,
    MPU: require('./MPU').MultipartUploads,
};
