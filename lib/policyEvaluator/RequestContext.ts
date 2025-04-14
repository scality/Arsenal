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
    actionMapSUR,
} from './utils/actionMaps';

// For efficient binary serialization
import { Packr } from 'msgpackr';

// Check environment variable for optimization setting
const USE_OPTIMIZED_SERIALIZATION = process.env.OPTIM_REQUEST_CONTEXT !== 'false';

// Creating a singleton packer to optimize performance - only if enabled
const packer = USE_OPTIMIZED_SERIALIZATION ? new Packr({
    structuredClone: true,
    useRecords: true,
}) : null;

// Define fields that should be skipped during serialization (null or computed values)
const SKIP_SERIALIZATION_FIELDS = [
    '_foundAction',
    '_foundResource',
];

// Define fields that are essential for serialization
// Omitting fields that can be recomputed, are null, or not important for most use cases
const ESSENTIAL_FIELDS = [
    '_apiMethod',
    '_awsService',
    '_generalResource',
    '_specificResource',
    '_requesterInfo',
    '_requesterIp',
    '_sslEnabled',
    '_signatureVersion',
    '_authType',
    '_signatureAge',
    '_securityToken',
    '_action',
    '_needQuota',
];

export const actionNeedQuotaCheck = {
    objectPut: true,
    objectPutVersion: true,
    objectPutPart: true,
    objectRestore: true,
};

/**
 * This variable describes APIs that change the bytes
 * stored, requiring quota updates
 */
export const actionWithDataDeletion = {
    objectDelete: true,
    objectDeleteVersion: true,
    multipartDelete: true,
    multiObjectDelete: true,
};

/**
 * The function returns true if the current API call is a copy object
 * and the action requires a quota evaluation logic, post retrieval
 * of the object metadata.
 * @param {string} action - the action being performed
 * @param {string} currentApi - the current API being called
 * @return {boolean} - whether the action requires a quota check
 */
export function actionNeedQuotaCheckCopy(action: string, currentApi: string) {
    return action === 'objectGet' && (currentApi === 'objectCopy' || currentApi === 'objectPutCopyPart');
}

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
    case 'sur':
        return actionMapSUR[method];
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
    case 'sur': {
        return `arn:scality:sur::${requesterInfo!.accountid}:` +
            `${generalResource}${specificResource ? `/${specificResource}` : ''}`;
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
    username: string;
    keycloakGroup: string;
    keycloakRole: string;
};

export type RequestContextType = {
    headers: Record<string, string | string[]>;
    query: any;
    requesterIp: string;
    sslEnabled: boolean;
    apiMethod: string;
    awsService: string;
    generalResource: string;
    specificResource: string;
    locationConstraint: string;
    requesterInfo: RequesterInfo;
    signatureVersion: string;
    authType: string;
    signatureAge: number;
    securityToken: string;
    policyArn: string;
    action?: string;
    requestObjTags?: string | null;
    existingObjTag?: string | null;
    needTagEval?: boolean;
    objectLockRetentionDays?: number | null;
    needQuota?: boolean;
};

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
    _headers: Record<string, string | string[]>;
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

    // Cache for serialized values
    private _cachedSerializedJSON: string | null = null;
    private _cachedSerializedBinary: Uint8Array | null = null;
    
    // Flag to track if object has been modified since last serialization
    private _isDirty = true;

    constructor(
        headers: Record<string, string | string[]>,
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
        needQuota?: boolean,
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
        this._needQuota = needQuota || actionNeedQuotaCheck[apiMethod] === true
            || actionWithDataDeletion[apiMethod] === true;
        this._requestObjTags = requestObjTags || null;
        this._existingObjTag = existingObjTag || null;
        this._needTagEval = needTagEval || false;
        this._objectLockRetentionDays = objectLockRetentionDays || null;

        // Mark as dirty initially
        this._isDirty = true;
        return this;
    }

    /**
     * Mark the context as modified, invalidating serialization caches
     * @private
     */
    private _markDirty() {
        this._isDirty = true;
        this._cachedSerializedJSON = null;
        this._cachedSerializedBinary = null;
    }

    /**
    * Serialize the object
    * @param {Object} options - Serialization options
    * @param {boolean} options.binary - Use binary serialization (msgpack)
    * @param {boolean} options.minimal - Only serialize essential fields
    * @return - serialized object (string or Uint8Array)
    */
    serialize(options: { binary?: boolean, minimal?: boolean } = {}): string | Uint8Array {
        // Use cached value if available and not modified
        if (!this._isDirty) {
            if (options.binary && this._cachedSerializedBinary) {
                return this._cachedSerializedBinary;
            } else if (!options.binary && this._cachedSerializedJSON) {
                return this._cachedSerializedJSON;
            }
        }
        
        // Determine which fields to include
        const fieldsToSerialize = options.minimal ? ESSENTIAL_FIELDS : 
            Object.getOwnPropertyNames(this).filter(key => 
                !SKIP_SERIALIZATION_FIELDS.includes(key));
        
        // Create a minimal object with only necessary fields
        const requestInfo: Record<string, any> = {};
        
        // Copy only the needed fields
        for (const field of fieldsToSerialize) {
            // Strip leading underscore for cleaner serialized output
            const fieldName = field.startsWith('_') ? field.substring(1) : field;
            requestInfo[fieldName] = this[field as keyof this];
        }
        
        // Use binary serialization if requested (much faster) and packer is available
        if (options.binary && packer) {
            const binaryData = packer.pack(requestInfo);
            this._cachedSerializedBinary = binaryData;
            this._isDirty = false;
            return binaryData;
        } 
        
        // Otherwise use JSON
        const jsonData = JSON.stringify(requestInfo);
        this._cachedSerializedJSON = jsonData;
        this._isDirty = false;
        return jsonData;
    }

    /**
     * Deserialize the serialized data
     * @param serializedData - the stringified or binary requestContext
     * @param options - deserialization options
     * @param options.resource - individual specificResource to override
     * @param options.binary - whether the input is binary serialized
     * @return - RequestContext instance or Error
     */
    static deSerialize(
        serializedData: string | Uint8Array, 
        options: { resource?: string, binary?: boolean } = {}
    ): RequestContext | Error {
        let obj: any;
        
        try {
            // Handle binary or JSON deserialization
            if ((options.binary || serializedData instanceof Uint8Array) && packer) {
                obj = packer.unpack(serializedData as Uint8Array);
            } else {
                // Fall back to JSON if binary requested but packer not available
                obj = JSON.parse(typeof serializedData === 'string' ? 
                    serializedData : 
                    new TextDecoder().decode(serializedData as Uint8Array));
            }
        } catch (err: any) {
            return new Error(err);
        }
        
        // Override specific resource if provided
        if (options.resource) {
            obj.specificResource = options.resource;
        }
        
        // Create instance with minimal required fields
        const context = new RequestContext(
            obj.headers || {},
            obj.query || {},
            obj.generalResource || '',
            obj.specificResource || '',
            obj.requesterIp || '',
            obj.sslEnabled || false,
            obj.apiMethod || '',
            obj.awsService || '',
            obj.locationConstraint || '',
            obj.requesterInfo || {},
            obj.signatureVersion || '',
            obj.authType || '',
            obj.signatureAge || 0,
            obj.securityToken || '',
            obj.policyArn || '',
            obj.action,
            obj.requestObjTags,
            obj.existingObjTag,
            obj.needTagEval,
            obj.objectLockRetentionDays,
            obj.needQuota
        );
        
        // Set any additional fields that were serialized but not in constructor
        for (const key of Object.keys(obj)) {
            const privateKey = `_${key}`;
            if (privateKey in context && !ESSENTIAL_FIELDS.includes(privateKey)) {
                (context as any)[privateKey] = obj[key];
            }
        }
        
        // Mark as clean since we just deserialized
        context._isDirty = false;
        
        return context;
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
    setHeaders(headers: Record<string, string | string[]>) {
        this._headers = headers;
        this._markDirty();
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
        this._markDirty();
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
        this._markDirty();
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
        this._markDirty();
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
        this._markDirty();
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
        this._markDirty();
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
        this._markDirty();
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
        this._markDirty();
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
        this._markDirty();
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
        this._markDirty();
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
        this._markDirty();
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
        this._markDirty();
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
        this._markDirty();
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
        this._markDirty();
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
        this._markDirty();
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
        this._markDirty();
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
        this._markDirty();
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
        this._markDirty();
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
        this._markDirty();
        return this;
    }

    // Backwards compatibility methods for simple JSON serialization
    toJSON(): string {
        return this.serialize() as string;
    }
    
    static fromJSON(json: string, resource?: string): RequestContext | Error {
        return RequestContext.deSerialize(json, { resource });
    }
    
    // New benchmark method for testing serialization performance
    static benchmark(iterations: number = 1000): { 
        jsonSerialize: number,
        jsonDeserialize: number, 
        binarySerialize: number | null, 
        binaryDeserialize: number | null,
        minimalSerialize: number
    } {
        const testContext = new RequestContext(
            { 'host': 'example.com' },
            { query: 'test' },
            'testBucket',
            'testObject',
            '127.0.0.1',
            true,
            'objectGet',
            's3',
            'us-east-1',
            {
                arn: 'arn:aws:iam::123456789012:user/test',
                accountid: '123456789012',
                targetAccountId: '123456789012',
                externalId: '',
                parentArn: '',
                principalType: 'User',
                principaltype: 'User',
                userid: 'test',
                username: 'test',
                keycloakGroup: '',
                keycloakRole: '',
            },
            'AWS4-HMAC-SHA256',
            'REST-HEADER',
            1000,
            '',
            '',
        );
        
        // Benchmark JSON serialization
        const jsonStart = Date.now();
        let jsonStr = '';
        for (let i = 0; i < iterations; i++) {
            jsonStr = testContext.serialize() as string;
        }
        const jsonTime = Date.now() - jsonStart;
        
        // Benchmark Binary serialization - only if packer is available
        let binaryTime: number | null = null;
        let binaryData: string | Uint8Array | null = null;
        
        if (packer) {
            const binaryStart = Date.now();
            for (let i = 0; i < iterations; i++) {
                binaryData = testContext.serialize({ binary: true });
            }
            binaryTime = Date.now() - binaryStart;
        }
        
        // Benchmark minimal serialization
        const minimalStart = Date.now();
        for (let i = 0; i < iterations; i++) {
            testContext.serialize({ minimal: true });
        }
        const minimalTime = Date.now() - minimalStart;
        
        // Benchmark JSON deserialization
        const deserStart = Date.now();
        for (let i = 0; i < iterations; i++) {
            RequestContext.deSerialize(jsonStr);
        }
        const deserTime = Date.now() - deserStart;
        
        // Benchmark Binary deserialization - only if packer is available
        let binDeserTime: number | null = null;
        
        if (packer && binaryData) {
            const binDeserStart = Date.now();
            for (let i = 0; i < iterations; i++) {
                RequestContext.deSerialize(binaryData, { binary: true });
            }
            binDeserTime = Date.now() - binDeserStart;
        }
        
        return {
            jsonSerialize: jsonTime,
            jsonDeserialize: deserTime,
            binarySerialize: binaryTime,
            binaryDeserialize: binDeserTime,
            minimalSerialize: minimalTime,
        };
    }
}
