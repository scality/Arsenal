// The min value here is to manage further backward compat if we
// need it
const iamSecurityTokenSizeMin = 128;
const iamSecurityTokenSizeMax = 128;
// Security token is an hex string (no real format from amazon)
const iamSecurityTokenPattern = new RegExp(
    `^[a-f0-9]{${iamSecurityTokenSizeMin},${iamSecurityTokenSizeMax}}$`,
);

// info about the iam security token
export const iamSecurityToken = {
    min: iamSecurityTokenSizeMin,
    max: iamSecurityTokenSizeMax,
    pattern: iamSecurityTokenPattern,
};
// PublicId is used as the canonicalID for a request that contains
// no authentication information.  Requestor can access
// only public resources
export const publicId = 'http://acs.amazonaws.com/groups/global/AllUsers';
export const zenkoServiceAccount = 'http://acs.zenko.io/accounts/service';
export const metadataFileNamespace = '/MDFile';
export const dataFileURL = '/DataFile';
// AWS states max size for user-defined metadata
// (x-amz-meta- headers) is 2 KB:
// http://docs.aws.amazon.com/AmazonS3/latest/API/RESTObjectPUT.html
// In testing, AWS seems to allow up to 88 more bytes,
// so we do the same.
export const maximumMetaHeadersSize = 2136;
export const emptyFileMd5 = 'd41d8cd98f00b204e9800998ecf8427e';
// Version 2 changes the format of the data location property
// Version 3 adds the dataStoreName attribute
export const mdModelVersion = 3;
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

export const splitter = '..|..';
export const usersBucket = 'users..bucket';
// MPU Bucket Prefix is used to create the name of the shadow
// bucket used for multipart uploads.  There is one shadow mpu
// bucket per bucket and its name is the mpuBucketPrefix followed
// by the name of the final destination bucket for the object
// once the multipart upload is complete.
export const mpuBucketPrefix = 'mpuShadowBucket';
// since aws s3 does not allow capitalized buckets, these may be
// used for special internal purposes
export const permittedCapitalizedBuckets = {
    METADATA: true,
};
/* eslint-disable camelcase */
export const externalBackends = { aws_s3: true, azure: true, gcp: true, pfs: true }
// Default expiration value of the S3 pre-signed URL duration
// 604800 seconds (seven days).
export const defaultPreSignedURLExpiry = 7 * 24 * 60 * 60;
// Regex for ISO-8601 formatted date
export const shortIso8601Regex = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/;
export const longIso8601Regex = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/;
export const supportedNotificationEvents = new Set([
    's3:ObjectCreated:*',
    's3:ObjectCreated:Put',
    's3:ObjectCreated:Copy',
    's3:ObjectCreated:CompleteMultipartUpload',
    's3:ObjectRemoved:*',
    's3:ObjectRemoved:Delete',
    's3:ObjectRemoved:DeleteMarkerCreated',
]);
export const notificationArnPrefix = 'arn:scality:bucketnotif';
// some of the available data backends  (if called directly rather
// than through the multiple backend gateway) need a key provided
// as a string as first parameter of the get/delete methods.
export const clientsRequireStringKey = { sproxyd: true, cdmi: true };
// HTTP server keep-alive timeout is set to a higher value than
// client's free sockets timeout to avoid the risk of triggering
// ECONNRESET errors if the server closes the connection at the
// exact moment clients attempt to reuse an established connection
// for a new request.
//
// Note: the ability to close inactive connections on the client
// after httpClientFreeSocketsTimeout milliseconds requires the
// use of "agentkeepalive" module instead of the regular node.js
// http.Agent.
export const httpServerKeepAliveTimeout = 60000;
export const httpClientFreeSocketTimeout = 55000;
export const supportedLifecycleRules = [
    'expiration',
    'noncurrentVersionExpiration',
    'abortIncompleteMultipartUpload',
];
// Maximum number of buckets to cache (bucket metadata)
export const maxCachedBuckets = process.env.METADATA_MAX_CACHED_BUCKETS ?
    Number(process.env.METADATA_MAX_CACHED_BUCKETS) : 1000;
