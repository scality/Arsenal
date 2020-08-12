'use strict'; // eslint-disable-line strict
const crypto = require('crypto');

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
    passthroughFileURL: '/PassthroughFile',
    // AWS states max size for user-defined metadata
    // (x-amz-meta- headers) is 2 KB:
    // http://docs.aws.amazon.com/AmazonS3/latest/API/RESTObjectPUT.html
    // In testing, AWS seems to allow up to 88 more bytes,
    // so we do the same.
    maximumMetaHeadersSize: 2136,
    emptyFileMd5: 'd41d8cd98f00b204e9800998ecf8427e',
    // Version 2 changes the format of the data location property
    // Version 3 adds the dataStoreName attribute
    // Version 4 add the Creation-Time and Content-Language attributes,
    //     and add support for x-ms-meta-* headers in UserMetadata
    // Version 5 adds the azureInfo structure
    mdModelVersion: 5,
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
    // since aws s3 does not allow capitalized buckets, these may be
    // used for special internal purposes
    permittedCapitalizedBuckets: {
        METADATA: true,
    },
    // Setting a lower object key limit to account for:
    // - Mongo key limit of 1012 bytes
    // - Version ID in Mongo Key if versioned of 33
    // - Max bucket name length if bucket match false of 63
    // - Extra prefix slash for bucket prefix if bucket match of 1
    objectKeyByteLimit: 915,
    /* delimiter for location-constraint. The location constraint will be able
     * to include the ingestion flag
     */
    zenkoSeparator: ':',
    /* eslint-disable camelcase */
    externalBackends: { aws_s3: true, azure: true, gcp: true, pfs: true },
    replicationBackends: { aws_s3: true, azure: true, gcp: true },

    // hex digest of sha256 hash of empty string:
    emptyStringHash: crypto.createHash('sha256')
        .update('', 'binary').digest('hex'),
    mpuMDStoredExternallyBackend: { aws_s3: true, gcp: true },
    // AWS sets a minimum size limit for parts except for the last part.
    // http://docs.aws.amazon.com/AmazonS3/latest/API/mpUploadComplete.html
    minimumAllowedPartSize: 5242880,
    gcpMaximumAllowedPartCount: 1024,
    // GCP Object Tagging Prefix
    gcpTaggingPrefix: 'aws-tag-',
    productName: 'APN/1.0 Scality/1.0 Scality CloudServer for Zenko',
    legacyLocations: ['sproxyd', 'legacy'],
        // healthcheck default call from nginx is every 2 seconds
    // for external backends, don't call unless at least 1 minute
    // (60,000 milliseconds) since last call
    externalBackendHealthCheckInterval: 60000,
        // some of the available data backends  (if called directly rather
    // than through the multiple backend gateway) need a key provided
    // as a string as first parameter of the get/delete methods.
    clientsRequireStringKey: { sproxyd: true, cdmi: true },
    hasCopyPartBackends: { aws_s3: true, gcp: true },
    versioningNotImplBackends: { azure: true, gcp: true },
    // user metadata applied on zenko-created objects
    zenkoIDHeader: 'x-amz-meta-zenko-instance-id',
    // Default expiration value of the S3 pre-signed URL duration
    // 604800 seconds (seven days).
    defaultPreSignedURLExpiry: 7 * 24 * 60 * 60,
    // Regex for ISO-8601 formatted date
    shortIso8601Regex: /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/,
    longIso8601Regex: /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/,
    bucketNotifSupportedEvents: [
        's3:ObjectCreated:*',
        's3:ObjectCreated:Put',
        's3:ObjectCreated:Post',
        's3:ObjectCreated:Copy',
        's3:ObjectCreated:CompleteMultipartUpload',
        's3:ObjectRemoved:*',
        's3:ObjectRemoved:Delete',
        's3:ObjectRemoved:DeleteMarkerCreated',
    ],
};
