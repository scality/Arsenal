module.exports = {
    // mpu functions
    abortMultipartUpload: require('./abortMultipartUpload'),
    completeMultipartUpload: require('./completeMultipartUpload'),
    createMultipartUpload: require('./createMultipartUpload'),
    listParts: require('./listParts'),
    uploadPart: require('./uploadPart'),
    uploadPartCopy: require('./uploadPartCopy'),
    // object tagging
    putObject: require('./putObject'),
    putObjectTagging: require('./putObjectTagging'),
    getObjectTagging: require('./getObjectTagging'),
    deleteObjectTagging: require('./deleteObjectTagging'),
};
