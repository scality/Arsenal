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
    zenkoServiceAccount: 'http://acs.zenko.io/accounts/service',
    metadataFileNamespace: '/MDFile',
    dataFileURL: '/DataFile',
    // AWS states max size for user-defined metadata
    // (x-amz-meta- headers) is 2 KB:
    // http://docs.aws.amazon.com/AmazonS3/latest/API/RESTObjectPUT.html
    // In testing, AWS seems to allow up to 88 more bytes,
    // so we do the same.
    maximumMetaHeadersSize: 2136,
    emptyFileMd5: 'd41d8cd98f00b204e9800998ecf8427e',
    // Version 2 changes the format of the data location property
    // Version 3 adds the dataStoreName attribute
    mdModelVersion: 3,
    /*
     * Splitter is used to build the object name for the overview of a
     * multipart upload and to build the object names for each part of a
     * multipart upload.  These objects with large names are then stored in
     * metadata in a "shadow bucket" to a real bucket.  The shadow bucket
     * contains all ongoing multipart uploads.  We include in the object
     * name some of the info we might need to pull about an open multipart
     * upload or about an individual part with each piece of info separated
     * by the splitter.  We can then extract each piece of info by splitting
     * the object name string with this splitter.
     * For instance, assuming a splitter of '...!*!',
     * the name of the upload overview would be:
     *   overview...!*!objectKey...!*!uploadId
     * For instance, the name of a part would be:
     *   uploadId...!*!partNumber
     *
     * The sequence of characters used in the splitter should not occur
     * elsewhere in the pieces of info to avoid splitting where not
     * intended.
     *
     * Splitter is also used in adding bucketnames to the
     * namespacerusersbucket.  The object names added to the
     * namespaceusersbucket are of the form:
     * canonicalID...!*!bucketname
     */

    splitter: '..|..',
    usersBucket: 'users..bucket',
    // MPU Bucket Prefix is used to create the name of the shadow
    // bucket used for multipart uploads.  There is one shadow mpu
    // bucket per bucket and its name is the mpuBucketPrefix followed
    // by the name of the final destination bucket for the object
    // once the multipart upload is complete.
    mpuBucketPrefix: 'mpuShadowBucket',
};
