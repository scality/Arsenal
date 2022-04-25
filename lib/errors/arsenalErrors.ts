export type ErrorFormat = {
    code: number,
    description: string,
}

// ------------------- Amazon errors ------------------
export const AccessDenied: ErrorFormat = {
    code: 403,
    description: 'Access Denied',
};

export const AccessForbidden: ErrorFormat = {
    code: 403,
    description: 'Access Forbidden',
};

export const AccountProblem: ErrorFormat = {
    code: 403,
    description:
        'There is a problem with your AWS account that prevents the operation from completing successfully. Please use Contact Us.',
};

export const AmbiguousGrantByEmailAddress: ErrorFormat = {
    code: 400,
    description:
        'The email address you provided is associated with more than one account.',
};

export const BadDigest: ErrorFormat = {
    code: 400,
    description:
        'The Content-MD5 you specified did not match what we received.',
};

export const BucketAlreadyExists: ErrorFormat = {
    code: 409,
    description:
        'The requested bucket name is not available. The bucket namespace is shared by all users of the system. Please select a different name and try again.',
};

export const BucketAlreadyOwnedByYou: ErrorFormat = {
    code: 409,

    description:
        'Your previous request to create the named bucket succeeded and you already own it. You get this error in all AWS regions except US Standard, us-east-1. In us-east-1 region, you will get 200 OK, but it is no-op (if bucket exists S3 will not do anything).',
};

export const BucketNotEmpty: ErrorFormat = {
    code: 409,
    description: 'The bucket you tried to delete is not empty.',
};

export const CredentialsNotSupported: ErrorFormat = {
    code: 400,
    description: 'This request does not support credentials.',
};

export const CrossLocationLoggingProhibited: ErrorFormat = {
    code: 403,
    description:
        'Cross-location logging not allowed. Buckets in one geographic location cannot log information to a bucket in another location.',
};

export const DeleteConflict: ErrorFormat = {
    code: 409,

    description:
        'The request was rejected because it attempted to delete a resource that has attached subordinate entities. The error message describes these entities.',
};

export const EntityTooSmall: ErrorFormat = {
    code: 400,
    description:
        'Your proposed upload is smaller than the minimum allowed object size.',
};

export const EntityTooLarge: ErrorFormat = {
    code: 400,
    description:
        'Your proposed upload exceeds the maximum allowed object size.',
};

export const ExpiredToken: ErrorFormat = {
    code: 400,
    description: 'The provided token has expired.',
};

export const HttpHeadersTooLarge: ErrorFormat = {
    code: 400,
    description:
        'Your http headers exceed the maximum allowed http headers size.',
};

export const IllegalVersioningConfigurationException: ErrorFormat = {
    code: 400,
    description:
        'Indicates that the versioning configuration specified in the request is invalid.',
};

export const IncompleteBody: ErrorFormat = {
    code: 400,
    description:
        'You did not provide the number of bytes specified by the Content-Length HTTP header.',
};

export const IncorrectNumberOfFilesInPostRequest: ErrorFormat = {
    code: 400,
    description: 'POST requires exactly one file upload per request.',
};

export const InlineDataTooLarge: ErrorFormat = {
    code: 400,
    description: 'Inline data exceeds the maximum allowed size.',
};

export const InternalError: ErrorFormat = {
    code: 500,
    description: 'We encountered an internal error. Please try again.',
};

export const InvalidAccessKeyId: ErrorFormat = {
    code: 403,
    description:
        'The AWS access key Id you provided does not exist in our records.',
};

export const InvalidAddressingHeader: ErrorFormat = {
    code: 400,
    description: 'You must specify the Anonymous role.',
};

export const InvalidArgument: ErrorFormat = {
    code: 400,
    description: 'Invalid Argument',
};

export const InvalidBucketName: ErrorFormat = {
    code: 400,
    description: 'The specified bucket is not valid.',
};

export const InvalidBucketState: ErrorFormat = {
    code: 409,
    description:
        'The request is not valid with the current state of the bucket.',
};

export const InvalidDigest: ErrorFormat = {
    code: 400,
    description: 'The Content-MD5 you specified is not valid.',
};

export const InvalidEncryptionAlgorithmError: ErrorFormat = {
    code: 400,
    description:
        'The encryption request you specified is not valid. The valid value is AES256.',
};

export const InvalidLocationConstraint: ErrorFormat = {
    code: 400,
    description: 'The specified location constraint is not valid.',
};

export const InvalidObjectState: ErrorFormat = {
    code: 403,
    description:
        'The operation is not valid for the current state of the object.',
};

export const InvalidPart: ErrorFormat = {
    code: 400,
    description:
        "One or more of the specified parts could not be found. The part might not have been uploaded, or the specified entity tag might not have matched the part's entity tag.",
};

export const InvalidPartOrder: ErrorFormat = {
    code: 400,
    description:
        'The list of parts was not in ascending order.Parts list must specified in order by part number.',
};

export const InvalidPartNumber: ErrorFormat = {
    code: 416,
    description: 'The requested partnumber is not satisfiable.',
};

export const InvalidPayer: ErrorFormat = {
    code: 403,
    description: 'All access to this object has been disabled.',
};

export const InvalidPolicyDocument: ErrorFormat = {
    code: 400,
    description:
        'The content of the form does not meet the conditions specified in the policy document.',
};

export const InvalidRange: ErrorFormat = {
    code: 416,
    description: 'The requested range cannot be satisfied.',
};

export const InvalidRedirectLocation: ErrorFormat = {
    code: 400,
    description:
        "The website redirect location must have a prefix of 'http://' or 'https://' or '/'.",
};

export const InvalidRequest: ErrorFormat = {
    code: 400,
    description: 'SOAP requests must be made over an HTTPS connection.',
};

export const InvalidSecurity: ErrorFormat = {
    code: 403,
    description: 'The provided security credentials are not valid.',
};

export const InvalidSOAPRequest: ErrorFormat = {
    code: 400,
    description: 'The SOAP request body is invalid.',
};

export const InvalidStorageClass: ErrorFormat = {
    code: 400,
    description: 'The storage class you specified is not valid.',
};

export const InvalidTag: ErrorFormat = {
    code: 400,
    description: 'The Tag you have provided is invalid',
};

export const InvalidTargetBucketForLogging: ErrorFormat = {
    code: 400,
    description:
        'The target bucket for logging does not exist, is not owned by you, or does not have the appropriate grants for the log-delivery group.',
};

export const InvalidToken: ErrorFormat = {
    code: 400,
    description: 'The provided token is malformed or otherwise invalid.',
};

export const InvalidURI: ErrorFormat = {
    code: 400,
    description: "Couldn't parse the specified URI.",
};

export const KeyTooLong: ErrorFormat = {
    code: 400,
    description: 'Your key is too long.',
};

export const LimitExceeded: ErrorFormat = {
    code: 409,
    description:
        '    The request was rejected because it attempted to create resources beyond the current AWS account limits. The error message describes the limit exceeded.',
};

export const MalformedACLError: ErrorFormat = {
    code: 400,
    description:
        'The XML you provided was not well-formed or did not validate against our published schema.',
};

export const MalformedPOSTRequest: ErrorFormat = {
    code: 400,
    description:
        'The body of your POST request is not well-formed multipart/form-data.',
};

export const MalformedXML: ErrorFormat = {
    code: 400,
    description:
        'The XML you provided was not well-formed or did not validate against our published schema.',
};

export const MaxMessageLengthExceeded: ErrorFormat = {
    code: 400,
    description: 'Your request was too big.',
};

export const MaxPostPreDataLengthExceededError: ErrorFormat = {
    code: 400,
    description:
        'Your POST request fields preceding the upload file were too large.',
};

export const MetadataTooLarge: ErrorFormat = {
    code: 400,
    description:
        'Your metadata headers exceed the maximum allowed metadata size.',
};

export const MethodNotAllowed: ErrorFormat = {
    code: 405,
    description: 'The specified method is not allowed against this resource.',
};

export const MissingAttachment: ErrorFormat = {
    code: 400,
    description: 'A SOAP attachment was expected, but none were found.',
};

export const MissingContentLength: ErrorFormat = {
    code: 411,
    description: 'You must provide the Content-Length HTTP header.',
};

export const MissingRequestBodyError: ErrorFormat = {
    code: 400,
    description: 'Request body is empty',
};

export const MissingRequiredParameter: ErrorFormat = {
    code: 400,
    description: 'Your request is missing a required parameter.',
};

export const MissingSecurityElement: ErrorFormat = {
    code: 400,
    description: 'The SOAP 1.1 request is missing a security element.',
};

export const MissingSecurityHeader: ErrorFormat = {
    code: 400,
    description: 'Your request is missing a required header.',
};

export const NoLoggingStatusForKey: ErrorFormat = {
    code: 400,
    description:
        'There is no such thing as a logging status subresource for a key.',
};

export const NoSuchBucket: ErrorFormat = {
    code: 404,
    description: 'The specified bucket does not exist.',
};

export const NoSuchCORSConfiguration: ErrorFormat = {
    code: 404,
    description: 'The CORS configuration does not exist',
};

export const NoSuchKey: ErrorFormat = {
    code: 404,
    description: 'The specified key does not exist.',
};

export const NoSuchLifecycleConfiguration: ErrorFormat = {
    code: 404,
    description: 'The lifecycle configuration does not exist.',
};

export const NoSuchObjectLockConfiguration: ErrorFormat = {
    code: 404,
    description:
        'The specified object does not have a ObjectLock configuration.',
};

export const NoSuchWebsiteConfiguration: ErrorFormat = {
    code: 404,
    description: 'The specified bucket does not have a website configuration',
};

export const NoSuchUpload: ErrorFormat = {
    code: 404,
    description:
        'The specified multipart upload does not exist. The upload ID might be invalid, or the multipart upload might have been aborted or completed.',
};

export const NoSuchVersion: ErrorFormat = {
    code: 404,
    description:
        'Indicates that the version ID specified in the request does not match an existing version.',
};

export const ReplicationConfigurationNotFoundError: ErrorFormat = {
    code: 404,
    description: 'The replication configuration was not found',
};

export const ObjectLockConfigurationNotFoundError: ErrorFormat = {
    code: 404,
    description: 'The object lock configuration was not found',
};

export const ServerSideEncryptionConfigurationNotFoundError: ErrorFormat = {
    code: 404,
    description: 'The server side encryption configuration was not found',
};

export const NotImplemented: ErrorFormat = {
    code: 501,
    description:
        'A header you provided implies functionality that is not implemented.',
};

export const NotModified: ErrorFormat = {
    code: 304,
    description: 'Not Modified.',
};

export const NotSignedUp: ErrorFormat = {
    code: 403,
    description:
        'Your account is not signed up for the S3 service. You must sign up before you can use S3. ',
};

export const NoSuchBucketPolicy: ErrorFormat = {
    code: 404,
    description: 'The specified bucket does not have a bucket policy.',
};
export const OperationAborted: ErrorFormat = {
    code: 409,
    description:
        'A conflicting conditional operation is currently in progress against this resource. Try again.',
};
export const PermanentRedirect: ErrorFormat = {
    code: 301,
    description:
        'The bucket you are attempting to access must be addressed using the specified endpoint. Send all future requests to this endpoint.',
};

export const PreconditionFailed: ErrorFormat = {
    code: 412,
    description:
        'At least one of the preconditions you specified did not hold.',
};

export const Redirect: ErrorFormat = {
    code: 307,
    description: 'Temporary redirect.',
};

export const RestoreAlreadyInProgress: ErrorFormat = {
    code: 409,
    description: 'Object restore is already in progress.',
};

export const RequestIsNotMultiPartContent: ErrorFormat = {
    code: 400,
    description:
        'Bucket POST must be of the enclosure-type multipart/form-data.',
};
export const RequestTimeout: ErrorFormat = {
    code: 400,
    description:
        'Your socket connection to the server was not read from or written to within the timeout period.',
};

export const RequestTimeTooSkewed: ErrorFormat = {
    code: 403,
    description:
        "The difference between the request time and the server's time is too large.",
};

export const RequestTorrentOfBucketError: ErrorFormat = {
    code: 400,
    description: 'Requesting the torrent file of a bucket is not permitted.',
};

export const SignatureDoesNotMatch: ErrorFormat = {
    code: 403,
    description:
        'The request signature we calculated does not match the signature you provided.',
};
// "This is an AWS S3 specific error. We are opting to use the more general 'ServiceUnavailable' error used throughout AWS (IAM/EC2) to have uniformity of error messages even though we are potentially compromising S3 compatibility.",

// export const ServiceUnavailable: ErrorFormat = {
//     code: 503,
//     description: 'Reduce your request rate.',
// };

export const ServiceUnavailable: ErrorFormat = {
    code: 503,
    description:
        'The request has failed due to a temporary failure of the server.',
};

export const SlowDown: ErrorFormat = {
    code: 503,
    description: 'Reduce your request rate.',
};

export const TemporaryRedirect: ErrorFormat = {
    code: 307,
    description: 'You are being redirected to the bucket while DNS updates.',
};

export const TokenRefreshRequired: ErrorFormat = {
    code: 400,
    description: 'The provided token must be refreshed.',
};

export const TooManyBuckets: ErrorFormat = {
    code: 400,
    description: 'You have attempted to create more buckets than allowed.',
};

export const TooManyParts: ErrorFormat = {
    code: 400,
    description: 'You have attempted to upload more parts than allowed.',
};

export const UnexpectedContent: ErrorFormat = {
    code: 400,
    description: 'This request does not support content.',
};

export const UnresolvableGrantByEmailAddress: ErrorFormat = {
    code: 400,
    description:
        'The email address you provided does not match any account on record.',
};

export const UserKeyMustBeSpecified: ErrorFormat = {
    code: 400,
    description:
        'The bucket POST must contain the specified field name. If it is specified, check the order of the fields.',
};

export const NoSuchEntity: ErrorFormat = {
    code: 404,
    description:
        'The request was rejected because it referenced an entity that does not exist. The error message describes the entity.',
};

export const WrongFormat: ErrorFormat = {
    code: 400,
    description: 'Data entered by the user has a wrong format.',
};

export const Forbidden: ErrorFormat = {
    code: 403,
    description: 'Authentication failed.',
};

export const EntityDoesNotExist: ErrorFormat = {
    code: 404,
    description: 'Not found.',
};

export const EntityAlreadyExists: ErrorFormat = {
    code: 409,
    description:
        'The request was rejected because it attempted to create a resource that already exists.',
};

export const KeyAlreadyExists: ErrorFormat = {
    code: 409,
    description:
        'The request was rejected because it attempted to create a resource that already exists.',
};

export const ServiceFailure: ErrorFormat = {
    code: 500,
    description:
        'Server error: the request processing has failed because of an unknown error, exception or failure.',
};

export const IncompleteSignature: ErrorFormat = {
    code: 400,
    description: 'The request signature does not conform to AWS standards.',
};

export const InternalFailure: ErrorFormat = {
    code: 500,
    description:
        'The request processing has failed because of an unknown error, exception or failure.',
};

export const InvalidAction: ErrorFormat = {
    code: 400,
    description:
        'The action or operation requested is invalid. Verify that the action is typed correctly.',
};

export const InvalidClientTokenId: ErrorFormat = {
    code: 403,
    description:
        'The X.509 certificate or AWS access key ID provided does not exist in our records.',
};

export const InvalidParameterCombination: ErrorFormat = {
    code: 400,
    description:
        'Parameters that must not be used together were used together.',
};

export const InvalidParameterValue: ErrorFormat = {
    code: 400,
    description:
        'An invalid or out-of-range value was supplied for the input parameter.',
};

export const InvalidQueryParameter: ErrorFormat = {
    code: 400,
    description:
        'The AWS query string is malformed or does not adhere to AWS standards.',
};

export const MalformedQueryString: ErrorFormat = {
    code: 404,
    description: 'The query string contains a syntax error.',
};

export const MissingAction: ErrorFormat = {
    code: 400,
    description: 'The request is missing an action or a required parameter.',
};

export const MissingAuthenticationToken: ErrorFormat = {
    code: 403,
    description:
        'The request must contain either a valid (registered) AWS access key ID or X.509 certificate.',
};

export const MissingParameter: ErrorFormat = {
    code: 400,
    description:
        'A required parameter for the specified action is not supplied.',
};

export const OptInRequired: ErrorFormat = {
    code: 403,
    description: 'The AWS access key ID needs a subscription for the service.',
};

export const RequestExpired: ErrorFormat = {
    code: 400,

    description:
        'The request reached the service more than 15 minutes after the date stamp on the request or more than 15 minutes after the request expiration date (such as for pre-signed URLs), or the date stamp on the request is more than 15 minutes in the future.',
};

export const Throttling: ErrorFormat = {
    code: 400,
    description: 'The request was denied due to request throttling.',
};

export const AccountNotFound: ErrorFormat = {
    code: 404,
    description:
        'No account was found in Vault, please contact your system administrator.',
};

export const ValidationError: ErrorFormat = {
    code: 400,
    description: 'The specified value is invalid.',
};

export const MalformedPolicyDocument: ErrorFormat = {
    code: 400,
    description: 'Syntax errors in policy.',
};
export const InvalidInput: ErrorFormat = {
    code: 400,
    description:
        'The request was rejected because an invalid or out-of-range value was supplied for an input parameter.',
};

export const MalformedPolicy: ErrorFormat = {
    code: 400,
    description: 'This policy contains invalid Json',
};

export const ReportExpired: ErrorFormat = {
    code: 410,
    description:
        'The request was rejected because the most recent credential report has expired. To generate a new credential report, use GenerateCredentialReport.',
};

export const ReportInProgress: ErrorFormat = {
    code: 404,
    description:
        'The request was rejected because the credential report is still being generated.',
};

export const ReportNotPresent: ErrorFormat = {
    code: 410,
    description:
        'The request was rejected because the credential report does not exist. To generate a credential report, use GenerateCredentialReport.',
};

// ------------- Special non-AWS S3 errors -------------

export const MPUinProgress: ErrorFormat = {
    code: 409,
    description:
        'The bucket you tried to delete has an ongoing multipart upload.',
};

export const LocationNotFound: ErrorFormat = {
    code: 424,
    description: 'The object data location does not exist.',
};

// -------------- Internal project errors --------------
// ----------------------- Vault -----------------------
// #### formatErrors ####

export const BadName: ErrorFormat = {
    description: 'name not ok',
    code: 5001,
};

export const BadAccount: ErrorFormat = {
    description: 'account not ok',
    code: 5002,
};

export const BadGroup: ErrorFormat = {
    description: 'group not ok',
    code: 5003,
};

export const BadId: ErrorFormat = {
    description: 'id not ok',
    code: 5004,
};

export const BadAccountName: ErrorFormat = {
    description: 'accountName not ok',
    code: 5005,
};

export const BadNameFriendly: ErrorFormat = {
    description: 'nameFriendly not ok',
    code: 5006,
};

export const BadEmailAddress: ErrorFormat = {
    description: 'email address not ok',
    code: 5007,
};

export const BadPath: ErrorFormat = {
    description: 'path not ok',
    code: 5008,
};

export const BadArn: ErrorFormat = {
    description: 'arn not ok',
    code: 5009,
};

export const BadCreateDate: ErrorFormat = {
    description: 'createDate not ok',
    code: 5010,
};

export const BadLastUsedDate: ErrorFormat = {
    description: 'lastUsedDate not ok',
    code: 5011,
};

export const BadNotBefore: ErrorFormat = {
    description: 'notBefore not ok',
    code: 5012,
};

export const BadNotAfter: ErrorFormat = {
    description: 'notAfter not ok',
    code: 5013,
};

export const BadSaltedPwd: ErrorFormat = {
    description: 'salted password not ok',
    code: 5014,
};

export const ok: ErrorFormat = {
    description: 'No error',
    code: 200,
};

export const BadUser: ErrorFormat = {
    description: 'user not ok',
    code: 5016,
};

export const BadSaltedPasswd: ErrorFormat = {
    description: 'salted password not ok',
    code: 5017,
};

export const BadPasswdDate: ErrorFormat = {
    description: 'password date not ok',
    code: 5018,
};

export const BadCanonicalId: ErrorFormat = {
    description: 'canonicalId not ok',
    code: 5019,
};

export const BadAlias: ErrorFormat = {
    description: 'alias not ok',
    code: 5020,
};

//  #### internalErrors ####

export const DBPutFailed: ErrorFormat = {
    description: 'DB put failed',
    code: 5021,
};

// #### alreadyExistErrors ####

export const AccountEmailAlreadyUsed: ErrorFormat = {
    description: 'an other account already uses that email',
    code: 5022,
};

export const AccountNameAlreadyUsed: ErrorFormat = {
    description: 'an other account already uses that name',
    code: 5023,
};

export const UserEmailAlreadyUsed: ErrorFormat = {
    description: 'an other user already uses that email',
    code: 5024,
};

export const UserNameAlreadyUsed: ErrorFormat = {
    description: 'an other user already uses that name',
    code: 5025,
};

// #### doesntExistErrors ####

export const NoParentAccount: ErrorFormat = {
    description: 'parent account does not exist',
    code: 5026,
};

// #### authErrors ####

export const BadStringToSign: ErrorFormat = {
    description: "stringToSign not ok'",
    code: 5027,
};

export const BadSignatureFromRequest: ErrorFormat = {
    description: 'signatureFromRequest not ok',
    code: 5028,
};

export const BadAlgorithm: ErrorFormat = {
    description: 'hashAlgorithm not ok',
    code: 5029,
};

export const SecretKeyDoesNotExist: ErrorFormat = {
    description: 'secret key does not exist',
    code: 5030,
};

export const InvalidRegion: ErrorFormat = {
    description: 'Region was not provided or is not recognized by the system',
    code: 5031,
};

export const ScopeDate: ErrorFormat = {
    description: 'scope date is missing, or format is invalid',
    code: 5032,
};

export const BadAccessKey: ErrorFormat = {
    description: 'access key not ok',
    code: 5033,
};

export const NoDict: ErrorFormat = {
    description: 'no dictionary of params provided for signature verification',
    code: 5034,
};

export const BadSecretKey: ErrorFormat = {
    description: 'secretKey not ok',
    code: 5035,
};

export const BadSecretKeyValue: ErrorFormat = {
    description: 'secretKey value not ok',
    code: 5036,
};

export const BadSecretKeyStatus: ErrorFormat = {
    description: 'secretKey status not ok',
    code: 5037,
};

// #### OidcpErrors ####

export const BadUrl: ErrorFormat = {
    description: 'url not ok',
    code: 5038,
};

export const BadClientIdList: ErrorFormat = {
    description: "client id list not ok'",
    code: 5039,
};

export const BadThumbprintList: ErrorFormat = {
    description: "thumbprint list not ok'",
    code: 5040,
};

export const BadObject: ErrorFormat = {
    description: "Object not ok'",
    code: 5041,
};

// #### RoleErrors ####

export const BadRole: ErrorFormat = {
    description: 'role not ok',
    code: 5042,
};

// #### SamlpErrors ####

export const BadSamlp: ErrorFormat = {
    description: 'samlp not ok',
    code: 5043,
};

export const BadMetadataDocument: ErrorFormat = {
    description: 'metadata document not ok',
    code: 5044,
};

export const BadSessionIndex: ErrorFormat = {
    description: 'session index not ok',
    code: 5045,
};

export const Unauthorized: ErrorFormat = {
    description: 'not authenticated',
    code: 401,
};

// ----------------- MetaData -----------------
// #### formatErrors ####

export const CacheUpdated: ErrorFormat = {
    description: 'The cache has been updated',
    code: 500,
};

export const DBNotFound: ErrorFormat = {
    description: 'This DB does not exist',
    code: 404,
};

export const DBAlreadyExists: ErrorFormat = {
    description: 'This DB already exist',
    code: 409,
};

export const ObjNotFound: ErrorFormat = {
    description: 'This object does not exist',
    code: 404,
};

export const PermissionDenied: ErrorFormat = {
    description: 'Permission denied',
    code: 403,
};

export const BadRequest: ErrorFormat = {
    description: 'BadRequest',
    code: 400,
};

export const RaftSessionNotLeader: ErrorFormat = {
    description: 'NotLeader',
    code: 500,
};

export const RaftSessionLeaderNotConnected: ErrorFormat = {
    description: 'RaftSessionLeaderNotConnected',
    code: 400,
};

export const NoLeaderForDB: ErrorFormat = {
    description: 'NoLeaderForDB',
    code: 400,
};

export const RouteNotFound: ErrorFormat = {
    description: 'RouteNotFound',
    code: 404,
};

export const NoMapsInConfig: ErrorFormat = {
    description: 'NoMapsInConfig',
    code: 404,
};

export const DBAPINotReady: ErrorFormat = {
    description: 'DBAPINotReady',
    code: 500,
};

export const NotEnoughMapsInConfig: ErrorFormat = {
    description: 'NotEnoughMapsInConfig',
    code: 400,
};

export const TooManyRequests: ErrorFormat = {
    description: 'TooManyRequests',
    code: 429,
};

// --------------------- cdmiclient ---------------------

export const ReadOnly: ErrorFormat = {
    description: 'trying to write to read only back-end',
    code: 403,
};

// -------------------- authbackend --------------------

export const AuthMethodNotImplemented: ErrorFormat = {
    description: 'AuthMethodNotImplemented',
    code: 501,
};
