'use strict'; // eslint-disable-line strict

const parseIp = require('../ipCheck').parseIp;
// http://docs.aws.amazon.com/IAM/latest/UserGuide/list_s3.html
// For MPU actions:
// http://docs.aws.amazon.com/AmazonS3/latest/dev/mpuAndPermissions.html
// For bucket head and object head:
// http://docs.aws.amazon.com/AmazonS3/latest/dev/
// using-with-s3-actions.html
const _actionMap = {
    bucketDelete: 's3:DeleteBucket',
    bucketDeleteWebsite: 's3:DeleteBucketWebsite',
    bucketGet: 's3:ListBucket',
    bucketGetACL: 's3:GetBucketAcl',
    bucketGetCors: 's3:GetBucketCORS',
    bucketGetVersioning: 's3:GetBucketVersioning',
    bucketGetWebsite: 's3:GetBucketWebsite',
    bucketGetLocation: 's3:GetBucketLocation',
    bucketHead: 's3:ListBucket',
    bucketPut: 's3:CreateBucket',
    bucketPutACL: 's3:PutBucketAcl',
    bucketPutCors: 's3:PutBucketCORS',
    // for bucketDeleteCors need s3:PutBucketCORS permission
    // see http://docs.aws.amazon.com/AmazonS3/latest/API/
    // RESTBucketDELETEcors.html
    bucketDeleteCors: 's3:PutBucketCORS',
    bucketPutVersioning: 's3:PutBucketVersioning',
    bucketPutWebsite: 's3:PutBucketWebsite',
    bucketPutReplication: 's3:PutReplicationConfiguration',
    bucketGetReplication: 's3:GetReplicationConfiguration',
    bucketDeleteReplication: 's3:DeleteReplicationConfiguration',
    completeMultipartUpload: 's3:PutObject',
    initiateMultipartUpload: 's3:PutObject',
    listMultipartUploads: 's3:ListBucketMultipartUploads',
    listParts: 's3:ListMultipartUploadParts',
    multipartDelete: 's3:AbortMultipartUpload',
    objectDelete: 's3:DeleteObject',
    objectDeleteVersion: 's3:DeleteObjectVersion',
    objectDeleteTagging: 's3:DeleteObjectTagging',
    objectDeleteTaggingVersion: 's3:DeleteObjectVersionTagging',
    objectGet: 's3:GetObject',
    objectGetVersion: 's3:GetObjectVersion',
    objectGetACL: 's3:GetObjectAcl',
    objectGetACLVersion: 's3:GetObjectVersionAcl',
    objectGetTagging: 's3:GetObjectTagging',
    objectGetTaggingVersion: 's3:GetObjectVersionTagging',
    objectHead: 's3:GetObject',
    objectPut: 's3:PutObject',
    objectPutACL: 's3:PutObjectAcl',
    objectPutACLVersion: 's3:PutObjectVersionAcl',
    objectPutPart: 's3:PutObject',
    objectPutTagging: 's3:PutObjectTagging',
    objectPutTaggingVersion: 's3:PutObjectVersionTagging',
    serviceGet: 's3:ListAllMyBuckets',
    objectReplicate: 's3:ReplicateObject',
};

const _actionMapIAM = {
    attachGroupPolicy: 'iam:AttachGroupPolicy',
    attachUserPolicy: 'iam:AttachUserPolicy',
    createAccessKey: 'iam:CreateAccessKey',
    createGroup: 'iam:CreateGroup',
    createPolicy: 'iam:CreatePolicy',
    createPolicyVersion: 'iam:CreatePolicyVersion',
    createUser: 'iam:CreateUser',
    deleteAccessKey: 'iam:DeleteAccessKey',
    deleteGroup: 'iam:DeleteGroup',
    deleteGroupPolicy: 'iam:DeleteGroupPolicy',
    deletePolicy: 'iam:DeletePolicy',
    deletePolicyVersion: 'iam:DeletePolicyVersion',
    deleteUser: 'iam:DeleteUser',
    detachGroupPolicy: 'iam:DetachGroupPolicy',
    detachUserPolicy: 'iam:DetachUserPolicy',
    getGroup: 'iam:GetGroup',
    getGroupPolicy: 'iam:GetGroupPolicy',
    getPolicy: 'iam:GetPolicy',
    getPolicyVersion: 'iam:GetPolicyVersion',
    getUser: 'iam:GetUser',
    listAccessKeys: 'iam:ListAccessKeys',
    listGroupPolicies: 'iam:ListGroupPolicies',
    listGroups: 'iam:ListGroups',
    listGroupsForUser: 'iam:ListGroupsForUser',
    listPolicies: 'iam:ListPolicies',
    listPolicyVersions: 'iam:ListPolicyVersions',
    listUsers: 'iam:ListUsers',
    putGroupPolicy: 'iam:PutGroupPolicy',
    removeUserFromGroup: 'iam:RemoveUserFromGroup',
};

const _actionMapSSO = {
    SsoAuthorize: 'sso:Authorize',
};

const _actionMapSTS = {
    assumeRole: 'sts:AssumeRole',
};

function _findAction(service, method) {
    if (service === 's3') {
        return _actionMap[method];
    }
    if (service === 'iam') {
        return _actionMapIAM[method];
    }
    if (service === 'sso') {
        return _actionMapSSO[method];
    }
    if (service === 'ring') {
        return `ring:${method}`;
    }
    if (service === 'utapi') {
        // currently only method is ListMetrics
        return `utapi:${method}`;
    }
    if (service === 'sts') {
        return _actionMapSTS[method];
    }
    return undefined;
}

function _buildArn(service, generalResource, specificResource, requesterInfo) {
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
    if (service === 'iam' || service === 'sts') {
        // arn:aws:iam::<account-id>:<resource-type><resource>
        let accountId = requesterInfo.accountid;
        if (service === 'sts') {
            accountId = requesterInfo.targetAccountId;
        }
        if (specificResource) {
            return `arn:aws:iam::${accountId}:` +
                `${generalResource}${specificResource}`;
        }
        return `arn:aws:iam::${accountId}:${generalResource}`;
    }
    if (service === 'ring') {
        // arn:aws:iam::<account-id>:<resource-type><resource>
        if (specificResource) {
            return `arn:aws:ring::${requesterInfo.accountid}:` +
                `${generalResource}/${specificResource}`;
        }
        return `arn:aws:ring::${requesterInfo.accountid}:${generalResource}`;
    }
    if (service === 'utapi') {
        // arn:scality:utapi:::resourcetype/resource
        // (possible resource types are buckets, accounts or users)
        if (specificResource) {
            return `arn:scality:utapi::${requesterInfo.accountid}:` +
                `${generalResource}/${specificResource}`;
        }
        return `arn:scality:utapi::${requesterInfo.accountid}:` +
            `${generalResource}/`;
    }
    if (service === 'sso') {
        if (specificResource) {
            return `arn:scality:sso:::${generalResource}/${specificResource}`;
        }
        return `arn:scality:sso:::${generalResource}`;
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
 * @param {string} securityToken - auth security token (temporary credentials)
 * @param {string} policyArn - policy arn
 * @return {RequestContext} a RequestContext instance
 */

class RequestContext {
    constructor(headers, query, generalResource, specificResource,
        requesterIp, sslEnabled, apiMethod,
        awsService, locationConstraint, requesterInfo,
        signatureVersion, authType, signatureAge, securityToken, policyArn,
        action) {
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
        this._securityToken = securityToken;
        this._policyArn = policyArn;
        this._action = action;
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
            securityToken: this._securityToken,
            policyArn: this._policyArn,
            action: this._action,
        };
        return JSON.stringify(requestInfo);
    }

    /**
     * deSerialize the JSON string
     * @param {string} stringRequest - the stringified requestContext
     * @return {object} - parsed string
     */
    static deSerialize(stringRequest) {
        let obj;
        try {
            obj = JSON.parse(stringRequest);
        } catch (err) {
            return new Error(err);
        }
        return new RequestContext(obj.headers, obj.query, obj.generalResource,
            obj.specificResource, obj.requesterIp, obj.sslEnabled,
            obj.apiMethod, obj.awsService, obj.locationConstraint,
            obj.requesterInfo, obj.signatureVersion,
            obj.authType, obj.signatureAge, obj.securityToken, obj.policyArn,
            obj.action);
    }

    /**
    * Get the request action
    * @return {string} action
    */
    getAction() {
        if (this._action) {
            return this._action;
        }
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
                this._specificResource, this._requesterInfo);
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
        return parseIp(this._requesterIp);
    }

    getRequesterAccountId() {
        return this._requesterInfo.accountid;
    }

    getRequesterEndArn() {
        return this._requesterInfo.arn;
    }

    getRequesterExternalId() {
        return this._requesterInfo.externalId;
    }

    getRequesterPrincipalArn() {
        return this._requesterInfo.parentArn || this._requesterInfo.arn;
    }

    getRequesterType() {
        return this._requesterInfo.principalType;
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

    /**
     * Returns the authentication security token
     *
     * @return {string} security token
     */
    getSecurityToken() {
        return this._securityToken;
    }

    /**
     * Set the authentication security token
     *
     * @param {string} token - Security token
     * @return {RequestContext} itself
     */
    setSecurityToken(token) {
        this._securityToken = token;
        return this;
    }

    /**
     * Get the policy arn
     *
     * @return {string} policyArn - Policy arn
     */
    getPolicyArn() {
        return this._policyArn;
    }

    /**
     * Set the policy arn
     *
     * @param {string} policyArn - Policy arn
     * @return {RequestContext} itself
     */
    setPolicyArn(policyArn) {
        this._policyArn = policyArn;
        return this;
    }
}

module.exports = RequestContext;
