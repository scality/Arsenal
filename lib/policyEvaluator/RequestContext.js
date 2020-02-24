'use strict'; // eslint-disable-line strict

const ipAddr = require('ipaddr.js');

// http://docs.aws.amazon.com/IAM/latest/UserGuide/list_s3.html
// For MPU actions:
// http://docs.aws.amazon.com/AmazonS3/latest/dev/mpuAndPermissions.html
// For bucket head and object head:
// http://docs.aws.amazon.com/AmazonS3/latest/dev/
// using-with-s3-actions.html
const _actionMap = {
    bucketDelete: 's3:DeleteBucket',
    bucketGet: 's3:ListBucket',
    bucketGetACL: 's3:GetBucketAcl',
    bucketHead: 's3:ListBucket',
    bucketPut: 's3:CreateBucket',
    bucketPutACL: 's3:PutBucketAcl',
    completeMultipartUpload: 's3:PutObject',
    initiateMultipartUpload: 's3:PutObject',
    listMultipartUploads: 's3:ListBucketMultipartUploads',
    listParts: 's3:ListMultipartUploadParts',
    multipartDelete: 's3:AbortMultipartUpload',
    objectDelete: 's3:DeleteObject',
    objectGet: 's3:GetObject',
    objectGetACL: 's3:GetObjectAcl',
    objectHead: 's3:GetObject',
    objectPut: 's3:PutObject',
    objectPutACL: 's3:PutObjectAcl',
    objectPutPart: 's3:PutObject',
    serviceGet: 's3:ListAllMyBuckets',
};


function _findAction(service, method) {
    if (service === 's3') {
        return _actionMap[method];
    }
    if (service === 'utapi') {
        // currently only method is ListMetrics
        return `utapi:${method}`;
    }
    return undefined;
}

function _buildArn(service, generalResource, specificResource) {
      // arn:partition:service:region:account-id:resourcetype/resource
    if (service === 's3') {
        // arn:aws:s3:::bucket/object
        // General resource is bucketName
        if (generalResource && specificResource) {
            return `arn:aws:s3:::${generalResource}/${specificResource}`;
        } else if (generalResource) {
            return `arn:aws:s3:::${generalResource}`;
        }
        return 'arn:aws:s3:::';
    }
    if (service === 'utapi') {
        // arn:scality:utapi:::resourcetype/resource
        // (possible resource types are buckets, accounts or users)
        if (specificResource) {
            return `arn:scality:utapi:::${generalResource}/${specificResource}`;
        }
        return `arn:scality:utapi:::${generalResource}/`;
    }
    return undefined;
}

/**
 * Class containing RequestContext for policy auth check
 * @param {object} headers - request headers
 * @param {query} query - request query
 * @param {string} generalResource - bucket name from request if any if from s3
 * or accounts, buckets or users from utapi
 * @param {string} specificResource - object name from request if any if from s3
 * or bucketname from utapi if from utapi
 * @param {string} requesterIp - ip of requester
 * @param {boolean} sslEnabled - whether request was https
 * @param {string} apiMethod - type of request
 * @param {string} awsService - service receiving request
 * @param {string} locationConstraint - location constraint
 * for put bucket operation
 * @param {object} requesterInfo - info about entity making request
 * @param {string} signatureVersion - auth signature type used
 * @param {string} authType - type of authentication used
 * @param {number} signatureAge - age of signature in milliseconds
 * @return {RequestContext} a RequestContext instance
 */

class RequestContext {
    constructor(headers, query, generalResource, specificResource,
        requesterIp, sslEnabled, apiMethod,
        awsService, locationConstraint, requesterInfo,
        signatureVersion, authType, signatureAge) {
        this._headers = headers;
        this._query = query;
        this._requesterIp = requesterIp;
        this._sslEnabled = sslEnabled;
        this._apiMethod = apiMethod;
        this._awsService = awsService;
        this._generalResource = generalResource;
        this._specificResource = specificResource;
        this._locationConstraint = locationConstraint;
        // Not implemented
        this._multiFactorAuthPresent = null;
        // Not implemented
        this._multiFactorAuthAge = null;
        // Not implemented
        this._tokenIssueTime = null;

        // Remainder not set when originally instantiated
        // (unless if instantiated from deSerialize)
        this._requesterInfo = requesterInfo;
        // See http://docs.aws.amazon.com/AmazonS3/latest/
        // API/bucket-policy-s3-sigv4-conditions.html
        this._signatureVersion = signatureVersion;
        this._authType = authType;
        this._signatureAge = signatureAge;

        return this;
    }

    /**
    * Serialize the object
    * @return {string} - stringified object
    */
    serialize() {
        const requestInfo = {
            apiMethod: this._apiMethod,
            headers: this._headers,
            query: this._query,
            requersterInfo: this._requesterInfo,
            requesterIp: this._requesterIp,
            sslEnabled: this._sslEnabled,
            awsService: this._awsService,
            generalResource: this._generalResource,
            specificResource: this._specificResource,
            multiFactorAuthPresent: this._multiFactorAuthPresent,
            multiFactorAuthAge: this._multiFactorAuthAge,
            signatureVersion: this._signatureVersion,
            authType: this._authType,
            signatureAge: this._signatureAge,
            locationConstraint: this._locationConstraint,
            tokenIssueTime: this._tokenIssueTime,
        };
        return JSON.stringify(requestInfo);
    }

    /**
     * deSerialize the JSON string
     * @param {string} stringRequest - the stringified requestContext
     * @param {string} resource - individual specificResource
     * @return {object} - parsed string
     */
    static deSerialize(stringRequest, resource) {
        let obj;
        try {
            obj = JSON.parse(stringRequest);
        } catch (err) {
            return new Error(err);
        }
        if (resource) {
            obj.specificResource = resource;
        }
        return new RequestContext(obj.headers, obj.query, obj.generalResource,
            obj.specificResource, obj.requesterIp, obj.sslEnabled,
            obj.apiMethod, obj.awsService, obj.locationConstraint,
            obj.requesterInfo, obj.signatureVersion,
            obj.authType, obj.signatureAge);
    }

    /**
    * Get the request action
    * @return {string} action
    */
    getAction() {
        if (this._foundAction) {
            return this._foundAction;
        }
        this._foundAction = _findAction(this._awsService, this._apiMethod);
        return this._foundAction;
    }

    /**
    * Get the resource impacted by the request
    * @return {string} arn for the resource
    */
    getResource() {
        if (this._foundResource) {
            return this._foundResource;
        }
        this._foundResource =
            _buildArn(this._awsService, this._generalResource,
                this._specificResource);
        return this._foundResource;
    }


    /**
     * Set headers
     * @param {object} headers - request headers
     * @return {RequestContext} - RequestContext instance
     */
    setHeaders(headers) {
        this._headers = headers;
        return this;
    }
    /**
     * Get headers
     * @return {object} request headers
     */
    getHeaders() {
        return this._headers;
    }

    /**
     * Set query
     * @param {object} query - request query
     * @return {RequestContext} - RequestContext instance
     */
    setQuery(query) {
        this._query = query;
        return this;
    }
    /**
     * Get query
     * @return {object} request query
     */
    getQuery() {
        return this._query;
    }

    /**
     * Set requesterInfo
     * @param {object} requesterInfo - info about entity making request
     * @return {RequestContext} - RequestContext instance
     */
    setRequesterInfo(requesterInfo) {
        this._requesterInfo = requesterInfo;
        return this;
    }
    /**
     * Get requesterInfo
     * @return {object} requesterInfo
     */
    getRequesterInfo() {
        return this._requesterInfo;
    }

    /**
     * Set requesterIp
     * @param {string} requesterIp - ip address of requester
     * @return {RequestContext} - RequestContext instance
     */
    setRequesterIp(requesterIp) {
        this._requesterIp = requesterIp;
        return this;
    }
    /**
     * Get requesterIp
     * @return {object} requesterIp - parsed requesterIp
     */
    getRequesterIp() {
        const requesterIp = this._requesterIp;
        if (ipAddr.IPv4.isValid(requesterIp)) {
            return ipAddr.parse(requesterIp);
        }
        if (ipAddr.IPv6.isValid(requesterIp)) {
            // .process pares v6 as v6 and parses mapped v4 addresses as IPv4
            //  (unmapped)
            return ipAddr.process(requesterIp);
        }
        // not valid ip address according to module, so return empty object
        // which will obviously not match a given condition range
        return {};
    }

    /**
     * Set sslEnabled
     * @param {boolean} sslEnabled - true if https used
     * @return {RequestContext} - RequestContext instance
     */
    setSslEnabled(sslEnabled) {
        this._sslEnabled = sslEnabled;
        return this;
    }

    /**
     * Get sslEnabled
     * @return {boolean} true if sslEnabled, false if not
     */
    getSslEnabled() {
        return !!this._sslEnabled;
    }

    /**
     * Set signatureVersion
     * @param {string} signatureVersion - "AWS" identifies Signature Version 2
     * and "AWS4-HMAC-SHA256" identifies Signature Version 4
     * @return {RequestContext} - RequestContext instance
     */
    setSignatureVersion(signatureVersion) {
        this._signatureVersion = signatureVersion;
        return this;
    }

    /**
     * Get signatureVersion
     *
     * @return {string} authentication signature version
     * "AWS" identifies Signature Version 2 and
     * "AWS4-HMAC-SHA256" identifies Signature Version 4
     */
    getSignatureVersion() {
        return this._signatureVersion;
    }

    /**
     * Set authType
     * @param {string} authType - REST-HEADER, REST-QUERY-STRING or POST
     * @return {RequestContext} - RequestContext instance
     */
    setAuthType(authType) {
        this._authType = authType;
        return this;
    }

    /**
     * Get authType
     * @return {string} authentication type:
     * REST-HEADER, REST-QUERY-STRING or POST
     */
    getAuthType() {
        return this._authType;
    }

    /**
     * Set signatureAge
     * @param {number} signatureAge -- age of signature in milliseconds
     * Note that for v2 query auth this will be undefined (since these
     * requests are pre-signed and only come with an expires time so
     * do not know age)
     * @return {RequestContext} - RequestContext instance
     */
    setSignatureAge(signatureAge) {
        this._signatureAge = signatureAge;
        return this;
    }
    /**
     * Get signatureAge
     * @return {number} age of signature in milliseconds
     * Note that for v2 query auth this will be undefined (since these
     * requests are pre-signed and only come with an expires time so
     * do not know age)
     */
    getSignatureAge() {
        return this._signatureAge;
    }

    /**
     * Set locationConstraint
     * @param {string} locationConstraint - bucket region constraint
     * @return {RequestContext} - RequestContext instance
     */
    setLocationConstraint(locationConstraint) {
        this._locationConstraint = locationConstraint;
        return this;
    }
    /**
     * Get locationConstraint
     * @return {string} location constraint of put bucket request
     */
    getLocationConstraint() {
        return this._locationConstraint;
    }

    /**
     * Set awsService
     * @param {string} awsService receiving request
     * @return {RequestContext} - RequestContext instance
     */
    setAwsService(awsService) {
        this._awsService = awsService;
        return this;
    }
    /**
     * Get awsService
     * @return {string} awsService receiving request
     */
    getAwsService() {
        return this._awsService;
    }

    /**
     * Set tokenIssueTime
     * @param {string} tokenIssueTime - Date/time that
     * temporary security credentials were issued
     * Only present in requests that are signed using
     * temporary security credentials.
     * @return {RequestContext} - RequestContext instance
     */
    setTokenIssueTime(tokenIssueTime) {
        this._tokenIssueTime = tokenIssueTime;
        return this;
    }
    /**
     * Get tokenIssueTime
     * @return {string} tokenIssueTime
     */
    getTokenIssueTime() {
        return this._tokenIssueTime;
    }


    /**
     * Set multiFactorAuthPresent
     * @param {boolean} multiFactorAuthPresent - sets out whether MFA used
     * for request
     * @return {RequestContext} - RequestContext instance
     */
    setMultiFactorAuthPresent(multiFactorAuthPresent) {
        this._multiFactorAuthPresent = multiFactorAuthPresent;
        return this;
    }
    /**
     * Get multiFactorAuthPresent
     * @return {boolean} multiFactorAuthPresent
     */
    getMultiFactorAuthPresent() {
        return this._multiFactorAuthPresent;
    }

    /**
     * Set multiFactorAuthAge
     * @param {number} multiFactorAuthAge - seconds since
     * MFA credentials were issued
     * @return {RequestContext} - RequestContext instance
     */
    setMultiFactorAuthAge(multiFactorAuthAge) {
        this._multiFactorAuthAge = multiFactorAuthAge;
        return this;
    }
    /**
     * Get multiFactorAuthAge
     * @return {number} multiFactorAuthAge - seconds since
     *  MFA credentials were issued
     */
    getMultiFactorAuthAge() {
        return this._multiFactorAuthAge;
    }
}

module.exports = RequestContext;
