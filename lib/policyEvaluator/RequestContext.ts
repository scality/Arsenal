import { parseIp } from '../ipCheck';

// http://docs.aws.amazon.com/IAM/latest/UserGuide/list_s3.html
// For MPU actions:
// http://docs.aws.amazon.com/AmazonS3/latest/dev/mpuAndPermissions.html
// For bucket head and object head:
// http://docs.aws.amazon.com/AmazonS3/latest/dev/
// using-with-s3-actions.html
import {
    actionMapRQ,
    actionMapIAM,
    actionMapSSO,
    actionMapSTS,
    actionMapMetadata,
} from './utils/actionMaps';

const _actionNeedQuotaCheck = {
    objectPut: true,
    objectPutPart: true,
};

function _findAction(service: string, method: string) {
    switch (service) {
        case 's3':
            return actionMapRQ[method];
        case 'iam':
            return actionMapIAM[method];
        case 'sso':
            return actionMapSSO[method];
        case 'ring':
            return `ring:${method}`;
        case 'utapi':
            // currently only method is ListMetrics
            return `utapi:${method}`;
        case 'sts':
            return actionMapSTS[method];
        case 'metadata':
            return actionMapMetadata[method];
        default:
            return undefined;
    }
}

function _buildArn(
    service: string,
    generalResource?: string,
    specificResource?: string,
    requesterInfo?: { accountid: string, targetAccountId: string },
) {
    // arn:partition:service:region:account-id:resourcetype/resource
    switch (service) {
        case 's3': {
            // arn:aws:s3:::bucket/object
            // General resource is bucketName
            if (generalResource && specificResource) {
                return `arn:aws:s3:::${generalResource}/${specificResource}`;
            } else if (generalResource) {
                return `arn:aws:s3:::${generalResource}`;
            }
            return 'arn:aws:s3:::';
        }
        case 'iam':
        case 'sts': {
            // arn:aws:iam::<account-id>:<resource-type>/<resource>
            let accountId = requesterInfo!.accountid;
            if (service === 'sts') {
                accountId = requesterInfo!.targetAccountId;
            }
            if (specificResource) {
                return `arn:aws:iam::${accountId}:` +
                `${generalResource}${specificResource}`;
            }
            return `arn:aws:iam::${accountId}:${generalResource}`;
        }
        case 'ring': {
            // arn:aws:iam::<account-id>:<resource-type>/<resource>
            if (specificResource) {
                return `arn:aws:ring::${requesterInfo!.accountid}:` +
                `${generalResource}/${specificResource}`;
            }
            return `arn:aws:ring::${requesterInfo!.accountid}:${generalResource}`;
        }
        case 'utapi': {
            // arn:scality:utapi:::resourcetype/resource
            // (possible resource types are buckets, accounts or users)
            if (specificResource) {
                return `arn:scality:utapi::${requesterInfo!.accountid}:` +
                `${generalResource}/${specificResource}`;
            }
            return `arn:scality:utapi::${requesterInfo!.accountid}:` +
            `${generalResource}/`;
        }
        case 'sso': {
            if (specificResource) {
                return `arn:scality:sso:::${generalResource}/${specificResource}`;
            }
            return `arn:scality:sso:::${generalResource}`;
        }
        case 'metadata': {
            // arn:scality:metadata::<account-id>:<resource-type>/<resource>
            if (specificResource) {
                return `arn:scality:metadata::${requesterInfo!.accountid}:` +
                `${generalResource}/${specificResource}`;
            }
            return `arn:scality:metadata::${requesterInfo!.accountid}:` +
            `${generalResource}/`;
        }
        default:
            return undefined;
    }
}

export type RequesterInfo = {
    arn: string;
    accountid: string;
    targetAccountId: string;
    externalId: string;
    parentArn: string;
    principalType: string;
    principaltype: string;
    userid: string;
    username: string,
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

export default class RequestContext {
    _headers: { [key: string]: string | string[] };
    _query: any;
    _requesterIp: string;
    _sslEnabled: boolean;
    _apiMethod: string;
    _awsService: string;
    _generalResource: string;
    _specificResource: string;
    _locationConstraint: string;
    _multiFactorAuthPresent: boolean | null;
    _multiFactorAuthAge: number | null;
    _tokenIssueTime: string | null;
    _requesterInfo: RequesterInfo;
    _signatureVersion: string;
    _authType: string;
    _signatureAge: number;
    _securityToken: string;
    _policyArn: string;
    _action?: string;
    _needQuota: boolean;
    _requestObjTags: string | null;
    _existingObjTag: string | null;
    _needTagEval: boolean;
    _foundAction?: string;
    _foundResource?: string;
    _objectLockRetentionDays?: number | null;

    constructor(
        headers: { [key: string]: string | string[] },
        query: any,
        generalResource: string,
        specificResource: string,
        requesterIp: string,
        sslEnabled: boolean,
        apiMethod: string,
        awsService: string,
        locationConstraint: string,
        requesterInfo: RequesterInfo,
        signatureVersion: string,
        authType: string,
        signatureAge: number,
        securityToken: string,
        policyArn: string,
        action?: string,
        requestObjTags?: string,
        existingObjTag?: string,
        needTagEval?: false,
        objectLockRetentionDays?: number,
    ) {
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
        this._needQuota = _actionNeedQuotaCheck[apiMethod] === true;
        this._requestObjTags = requestObjTags || null;
        this._existingObjTag = existingObjTag || null;
        this._needTagEval = needTagEval || false;
        this._objectLockRetentionDays = objectLockRetentionDays || null;
        return this;
    }

    /**
    * Serialize the object
    * @return - stringified object
    */
    serialize(): string {
        const requestInfo = {
            apiMethod: this._apiMethod,
            headers: this._headers,
            query: this._query,
            requesterInfo: this._requesterInfo,
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
            requestObjTags: this._requestObjTags,
            existingObjTag: this._existingObjTag,
            needTagEval: this._needTagEval,
            objectLockRetentionDays: this._objectLockRetentionDays,
        };
        return JSON.stringify(requestInfo);
    }

    /**
     * deSerialize the JSON string
     * @param stringRequest - the stringified requestContext
     * @param resource - individual specificResource
     * @return - parsed string
     */
    static deSerialize(stringRequest: string, resource?: string) {
        let obj: any;
        try {
            obj = JSON.parse(stringRequest);
        } catch (err: any) {
            return new Error(err);
        }
        if (resource) {
            obj.specificResource = resource;
        }
        return new RequestContext(
            obj.headers,
            obj.query,
            obj.generalResource,
            obj.specificResource,
            obj.requesterIp,
            obj.sslEnabled,
            obj.apiMethod,
            obj.awsService,
            obj.locationConstraint,
            obj.requesterInfo,
            obj.signatureVersion,
            obj.authType,
            obj.signatureAge,
            obj.securityToken,
            obj.policyArn,
            obj.action,
            obj.requestObjTags,
            obj.existingObjTag,
            obj.needTagEval,
            obj.objectLockRetentionDays,
        );
    }

    /**
    * Get the request action
    * @return action
    */
    getAction(): string {
        if (this._action) {
            return this._action;
        }
        if (this._foundAction) {
            return this._foundAction;
        }
        this._foundAction = _findAction(this._awsService, this._apiMethod);
        return this._foundAction!;
    }

    /**
    * Get the resource impacted by the request
    * @return arn for the resource
    */
    getResource(): string {
        if (this._foundResource) {
            return this._foundResource;
        }
        this._foundResource =
            _buildArn(this._awsService, this._generalResource,
                this._specificResource, this._requesterInfo);
        return this._foundResource!;
    }


    /**
     * Set headers
     * @param headers - request headers
     * @return - RequestContext instance
     */
    setHeaders(headers: { [key: string]: string | string[] }) {
        this._headers = headers;
        return this;
    }
    /**
     * Get headers
     * @return request headers
     */
    getHeaders() {
        return this._headers;
    }

    /**
     * Set query
     * @param query - request query
     * @return - RequestContext instance
     */
    setQuery(query: any) {
        this._query = query;
        return this;
    }
    /**
     * Get query
     * @return request query
     */
    getQuery() {
        return this._query;
    }

    /**
     * Set requesterInfo
     * @param requesterInfo - info about entity making request
     * @return - RequestContext instance
     */
    setRequesterInfo(requesterInfo: any) {
        this._requesterInfo = requesterInfo;
        return this;
    }
    /**
     * Get requesterInfo
     * @return requesterInfo
     */
    getRequesterInfo() {
        return this._requesterInfo;
    }

    /**
     * Set requesterIp
     * @param requesterIp - ip address of requester
     * @return - RequestContext instance
     */
    setRequesterIp(requesterIp: string) {
        this._requesterIp = requesterIp;
        return this;
    }
    /**
     * Get requesterIp
     * @return requesterIp - parsed requesterIp
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
     * @param sslEnabled - true if https used
     * @return - RequestContext instance
     */
    setSslEnabled(sslEnabled: boolean) {
        this._sslEnabled = sslEnabled;
        return this;
    }

    /**
     * Get sslEnabled
     * @return true if sslEnabled, false if not
     */
    getSslEnabled() {
        return !!this._sslEnabled;
    }

    /**
     * Set signatureVersion
     * @param signatureVersion - "AWS" identifies Signature Version 2
     * and "AWS4-HMAC-SHA256" identifies Signature Version 4
     * @return - RequestContext instance
     */
    setSignatureVersion(signatureVersion: string) {
        this._signatureVersion = signatureVersion;
        return this;
    }

    /**
     * Get signatureVersion
     *
     * @return authentication signature version
     * "AWS" identifies Signature Version 2 and
     * "AWS4-HMAC-SHA256" identifies Signature Version 4
     */
    getSignatureVersion() {
        return this._signatureVersion;
    }

    /**
     * Set authType
     * @param authType - REST-HEADER, REST-QUERY-STRING or POST
     * @return - RequestContext instance
     */
    setAuthType(authType: string) {
        this._authType = authType;
        return this;
    }

    /**
     * Get authType
     * @return authentication type:
     * REST-HEADER, REST-QUERY-STRING or POST
     */
    getAuthType() {
        return this._authType;
    }

    /**
     * Set signatureAge
     * @param signatureAge -- age of signature in milliseconds
     * Note that for v2 query auth this will be undefined (since these
     * requests are pre-signed and only come with an expires time so
     * do not know age)
     * @return - RequestContext instance
     */
    setSignatureAge(signatureAge: number) {
        this._signatureAge = signatureAge;
        return this;
    }
    /**
     * Get signatureAge
     * @return age of signature in milliseconds
     * Note that for v2 query auth this will be undefined (since these
     * requests are pre-signed and only come with an expires time so
     * do not know age)
     */
    getSignatureAge() {
        return this._signatureAge;
    }

    /**
     * Set locationConstraint
     * @param locationConstraint - bucket region constraint
     * @return - RequestContext instance
     */
    setLocationConstraint(locationConstraint: string) {
        this._locationConstraint = locationConstraint;
        return this;
    }
    /**
     * Get locationConstraint
     * @return location constraint of put bucket request
     */
    getLocationConstraint() {
        return this._locationConstraint;
    }

    /**
     * Set awsService
     * @param awsService receiving request
     * @return - RequestContext instance
     */
    setAwsService(awsService: string) {
        this._awsService = awsService;
        return this;
    }
    /**
     * Get awsService
     * @return awsService receiving request
     */
    getAwsService() {
        return this._awsService;
    }

    /**
     * Set tokenIssueTime
     * @param tokenIssueTime - Date/time that
     * temporary security credentials were issued
     * Only present in requests that are signed using
     * temporary security credentials.
     * @return - RequestContext instance
     */
    setTokenIssueTime(tokenIssueTime: string) {
        this._tokenIssueTime = tokenIssueTime;
        return this;
    }
    /**
     * Get tokenIssueTime
     * @return tokenIssueTime
     */
    getTokenIssueTime() {
        return this._tokenIssueTime;
    }


    /**
     * Set multiFactorAuthPresent
     * @param multiFactorAuthPresent - sets out whether MFA used
     * for request
     * @return - RequestContext instance
     */
    setMultiFactorAuthPresent(multiFactorAuthPresent: boolean) {
        this._multiFactorAuthPresent = multiFactorAuthPresent;
        return this;
    }
    /**
     * Get multiFactorAuthPresent
     * @return multiFactorAuthPresent
     */
    getMultiFactorAuthPresent() {
        return this._multiFactorAuthPresent;
    }

    /**
     * Set multiFactorAuthAge
     * @param multiFactorAuthAge - seconds since
     * MFA credentials were issued
     * @return - RequestContext instance
     */
    setMultiFactorAuthAge(multiFactorAuthAge: number) {
        this._multiFactorAuthAge = multiFactorAuthAge;
        return this;
    }
    /**
     * Get multiFactorAuthAge
     * @return multiFactorAuthAge - seconds since
     *  MFA credentials were issued
     */
    getMultiFactorAuthAge() {
        return this._multiFactorAuthAge;
    }

    /**
     * Returns the authentication security token
     *
     * @return security token
     */
    getSecurityToken() {
        return this._securityToken;
    }

    /**
     * Set the authentication security token
     *
     * @param token - Security token
     * @return itself
     */
    setSecurityToken(token: string) {
        this._securityToken = token;
        return this;
    }

    /**
     * Get the policy arn
     *
     * @return policyArn - Policy arn
     */
    getPolicyArn() {
        return this._policyArn;
    }

    /**
     * Set the policy arn
     *
     * @param policyArn - Policy arn
     * @return itself
     */
    setPolicyArn(policyArn: string) {
        this._policyArn = policyArn;
        return this;
    }

    /**
     *  Returns the quota check condition
     *
     * @returns needQuota - check whether quota check is needed
     */
    isQuotaCheckNeeded() {
        return this._needQuota;
    }

    /**
     * Set request object tags
     *
     * @param requestObjTags - object tag(s) included in request in query string form
     * @return itself
     */
    setRequestObjTags(requestObjTags: string) {
        this._requestObjTags = requestObjTags;
        return this;
    }

    /**
     * Get request object tags
     *
     * @return request object tag(s)
     */
    getRequestObjTags() {
        return this._requestObjTags;
    }

    /**
     * Set info on existing tag on object included in request
     *
     * @param existingObjTag - existing object tag in query string form
     * @return itself
     */
    setExistingObjTag(existingObjTag: string) {
        this._existingObjTag = existingObjTag;
        return this;
    }

    /**
     * Get existing object tag
     *
     * @return existing object tag
     */
    getExistingObjTag() {
        return this._existingObjTag;
    }

    /**
     * Set whether IAM policy tag condition keys should be evaluated
     *
     * @param needTagEval - whether to evaluate tags
     * @return itself
     */
    setNeedTagEval(needTagEval: boolean) {
        this._needTagEval = needTagEval;
        return this;
    }

    /**
     * Get needTagEval param
     *
     * @return needTagEval - whether IAM policy tags condition keys should be evaluated
     */
    getNeedTagEval() {
        return this._needTagEval;
    }

    /**
     * Get object lock retention days
     *
     * @returns objectLockRetentionDays - object lock retention days 
     */
    getObjectLockRetentionDays() {
        return this._objectLockRetentionDays;
    }

    /**
     * Set object lock retention days
     *
     * @param objectLockRetentionDays - object lock retention days
     * @returns itself
     */
    setObjectLockRetentionDays(objectLockRetentionDays: number) {
        this._objectLockRetentionDays = objectLockRetentionDays;
        return this;
    }
}
