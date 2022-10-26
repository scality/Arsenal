import * as crypto from 'crypto';

// The min value here is to manage further backward compat if we
// need it
// Default value
export const vaultGeneratedIamSecurityTokenSizeMin = 128;
// Safe to assume that a typical token size is less than 8192 bytes
export const vaultGeneratedIamSecurityTokenSizeMax = 8192;
// Base-64
export const vaultGeneratedIamSecurityTokenPattern = /^[A-Za-z0-9/+=]*$/;

// info about the iam security token
export const iamSecurityToken = {
    min: vaultGeneratedIamSecurityTokenSizeMin,
    max: vaultGeneratedIamSecurityTokenSizeMax,
    pattern: vaultGeneratedIamSecurityTokenPattern,
};
// PublicId is used as the canonicalID for a request that contains
// no authentication information.  Requestor can access
// only public resources
export const publicId = 'http://acs.amazonaws.com/groups/global/AllUsers';
export const zenkoServiceAccount = 'http://acs.zenko.io/accounts/service';
export const metadataFileNamespace = '/MDFile';
export const dataFileURL = '/DataFile';
export const passthroughFileURL = '/PassthroughFile';
// AWS states max size for user-defined metadata
// (x-amz-meta- headers) is 2 KB:
// http://docs.aws.amazon.com/AmazonS3/latest/API/RESTObjectPUT.html
// In testing, AWS seems to allow up to 88 more bytes,
// so we do the same.
export const maximumMetaHeadersSize = 2136;
export const emptyFileMd5 = 'd41d8cd98f00b204e9800998ecf8427e';
// Version 2 changes the format of the data location property
// Version 3 adds the dataStoreName attribute
// Version 4 add the Creation-Time and Content-Language attributes,
//     and add support for x-ms-meta-* headers in UserMetadata
// Version 5 adds the azureInfo structure
// Version 6 adds a "deleted" flag that is updated to true before
// the object gets deleted. This is done to keep object metadata in the
// oplog when deleting the object, as oplog deletion events don't contain
// any metadata of the object.
// version 6 also adds the "isPHD" flag that is used to indicate that the master
// object is a placeholder and is not up to date.
export const mdModelVersion = 6;
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
// Setting a lower object key limit to account for:
// - Mongo key limit of 1012 bytes
// - Version ID in Mongo Key if versioned of 33
// - Max bucket name length if bucket match false of 63
// - Extra prefix slash for bucket prefix if bucket match of 1
export const objectKeyByteLimit = 915;
/* delimiter for location-constraint. The location constraint will be able
 * to include the ingestion flag
 */
export const zenkoSeparator = ':';
/* eslint-disable camelcase */
export const externalBackends = { aws_s3: true, azure: true, gcp: true, pfs: true };
export const replicationBackends = { aws_s3: true, azure: true, gcp: true };
// hex digest of sha256 hash of empty string:
export const emptyStringHash = crypto.createHash('sha256')
    .update('', 'binary').digest('hex');
export const mpuMDStoredExternallyBackend = { aws_s3: true, gcp: true };
// AWS sets a minimum size limit for parts except for the last part.
// http://docs.aws.amazon.com/AmazonS3/latest/API/mpUploadComplete.html
export const minimumAllowedPartSize = 5242880;
export const gcpMaximumAllowedPartCount = 1024;
// GCP Object Tagging Prefix
export const gcpTaggingPrefix = 'aws-tag-';
export const productName = 'APN/1.0 Scality/1.0 Scality CloudServer for Zenko';
export const legacyLocations = ['sproxyd', 'legacy'];
// healthcheck default call from nginx is every 2 seconds
// for external backends, don't call unless at least 1 minute
// (60,000 milliseconds) since last call
export const externalBackendHealthCheckInterval = 60000;
// some of the available data backends  (if called directly rather
// than through the multiple backend gateway) need a key provided
// as a string as first parameter of the get/delete methods.
export const clientsRequireStringKey = { sproxyd: true, cdmi: true };
export const hasCopyPartBackends = { aws_s3: true, gcp: true };
export const versioningNotImplBackends = { azure: true, gcp: true };
// user metadata applied on zenko-created objects
export const zenkoIDHeader = 'x-amz-meta-zenko-instance-id';
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
    's3:Replication:OperationFailedReplication',
    's3:ObjectTagging:*',
    's3:ObjectTagging:Put',
    's3:ObjectTagging:Delete',
    's3:ObjectAcl:Put',
]);
export const notificationArnPrefix = 'arn:scality:bucketnotif';
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
    'transitions',
    'noncurrentVersionTransition',
];
// Maximum number of buckets to cache (bucket metadata)
export const maxCachedBuckets = process.env.METADATA_MAX_CACHED_BUCKETS ?
    Number(process.env.METADATA_MAX_CACHED_BUCKETS) : 1000;

export const validRestoreObjectTiers = new Set(['Expedited', 'Standard', 'Bulk']);
