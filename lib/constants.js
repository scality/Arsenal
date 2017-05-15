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
};
