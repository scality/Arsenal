'use strict'; // eslint-disable-line strict

// The min value here is to manage further backward compat if we
// need it
const iamSecurityTokenSizeMin = 128;
const iamSecurityTokenSizeMax = 128;
// Security token is an hex string (no real format from amazon)
const iamSecurityTokenPattern =
    new RegExp(`^[a-f0-9]{${iamSecurityTokenSizeMin},` +
        `${iamSecurityTokenSizeMax}}$`);

module.exports = {
    // info about the iam security token
    iamSecurityToken: {
        min: iamSecurityTokenSizeMin,
        max: iamSecurityTokenSizeMax,
        pattern: iamSecurityTokenPattern,
    },
    // PublicId is used as the canonicalID for a request that contains
    // no authentication information.  Requestor can access
    // only public resources
    publicId: 'http://acs.amazonaws.com/groups/global/AllUsers',
    metadataFileNamespace: '/MDFile',
    dataFileURL: '/DataFile',
    // AWS states max size for user-defined metadata
    // (x-amz-meta- headers) is 2 KB:
    // http://docs.aws.amazon.com/AmazonS3/latest/API/RESTObjectPUT.html
    // In testing, AWS seems to allow up to 88 more bytes,
    // so we do the same.
    maximumMetaHeadersSize: 2136,
    emptyFileMd5: 'd41d8cd98f00b204e9800998ecf8427e',
};
