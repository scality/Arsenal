'use strict'; // eslint-disable-line strict

const ERRORS = require('../errors/arsenalErrors.json');

class ArsenalErrors extends Error {
    constructor(type, details) {
        super(type);
        this.code = ERRORS[type].httpCode || ERRORS[type].code ?
            ERRORS[type].httpCode || ERRORS[type].code : undefined;
        this.description = ERRORS[type].description;
        this[type] = true;
        this.details = details;
    }
}

module.exports = {
    accessDenied: (details) => {
        return new ArsenalErrors("AccessDenied", details);
    },

    accountProblem: (details) => {
        return new ArsenalErrors("AccountProblem", details);
    },

    ambiguousGrantByEmailAddress: (details) => {
        return new ArsenalErrors("AmbiguousGrantByEmailAddress", details);
    },

    badDigest: (details) => {
        return new ArsenalErrors("BadDigest", details);
    },

    bucketAlreadyExists: (details) => {
        return new ArsenalErrors("BucketAlreadyExists", details);
    },

    bucketAlreadyOwnedByYou: (details) => {
        return new ArsenalErrors("BucketAlreadyOwnedByYou", details);
    },

    bucketNotEmpty: (details) => {
        return new ArsenalErrors("BucketNotEmpty", details);
    },

    credentialsNotSupported: (details) => {
        return new ArsenalErrors("CredentialsNotSupported", details);
    },

    crossLocationLoggingProhibited: (details) => {
        return new ArsenalErrors("CrossLocationLoggingProhibited", details);
    },

    deleteConflict: (details) => {
        return new ArsenalErrors("DeleteConflict", details);
    },

    entityTooSmall: (details) => {
        return new ArsenalErrors("EntityTooSmall", details);
    },

    entityTooLarge: (details) => {
        return new ArsenalErrors("EntityTooLarge", details);
    },

    expiredToken: (details) => {
        return new ArsenalErrors("ExpiredToken", details);
    },

    illegalVersioningConfigurationException: (details) => {
        return new ArsenalErrors("IllegalVersioningConfigurationException",
                                 details);
    },

    incompleteBody: (details) => {
        return new ArsenalErrors("IncompleteBody", details);
    },

    incorrectNumberOfFilesInPostRequest: (details) => {
        return new ArsenalErrors("IncorrectNumberOfFilesInPostRequest",
                                 details);
    },

    inlineDataTooLarge: (details) => {
        return new ArsenalErrors("InlineDataTooLarge", details);
    },

    internalError: (details) => {
        return new ArsenalErrors("InternalError", details);
    },

    invalidAccessKeyId: (details) => {
        return new ArsenalErrors("InvalidAccessKeyId", details);
    },

    invalidAddressingHeader: (details) => {
        return new ArsenalErrors("InvalidAddressingHeader", details);
    },

    invalidArgument: (details) => {
        return new ArsenalErrors("InvalidArgument", details);
    },

    invalidBucketName: (details) => {
        return new ArsenalErrors("InvalidBucketName", details);
    },

    invalidBucketState: (details) => {
        return new ArsenalErrors("InvalidBucketState", details);
    },

    invalidDigest: (details) => {
        return new ArsenalErrors("InvalidDigest", details);
    },

    invalidEncryptionAlgorithmError: (details) => {
        return new ArsenalErrors("InvalidEncryptionAlgorithmError", details);
    },

    invalidLocationConstraint: (details) => {
        return new ArsenalErrors("InvalidLocationConstraint", details);
    },

    invalidObjectState: (details) => {
        return new ArsenalErrors("InvalidObjectState", details);
    },

    invalidPart: (details) => {
        return new ArsenalErrors("InvalidPart", details);
    },

    invalidPartOrder: (details) => {
        return new ArsenalErrors("InvalidPartOrder", details);
    },

    invalidPayer: (details) => {
        return new ArsenalErrors("InvalidPayer", details);
    },

    invalidPolicyDocument: (details) => {
        return new ArsenalErrors("InvalidPolicyDocument", details);
    },

    invalidRange: (details) => {
        return new ArsenalErrors("InvalidRange", details);
    },

    invalidRequest: (details) => {
        return new ArsenalErrors("InvalidRequest", details);
    },

    invalidSecurity: (details) => {
        return new ArsenalErrors("InvalidSecurity", details);
    },

    invalidSOAPRequest: (details) => {
        return new ArsenalErrors("InvalidSOAPRequest", details);
    },

    invalidStorageClass: (details) => {
        return new ArsenalErrors("InvalidStorageClass", details);
    },

    invalidTargetBucketForLogging: (details) => {
        return new ArsenalErrors("InvalidTargetBucketForLogging", details);
    },

    invalidToken: (details) => {
        return new ArsenalErrors("InvalidToken", details);
    },

    invalidURI: (details) => {
        return new ArsenalErrors("InvalidURI", details);
    },

    keyTooLong: (details) => {
        return new ArsenalErrors("KeyTooLong", details);
    },

    limitExceeded: (details) => {
        return new ArsenalErrors("LimitExceeded", details);
    },

    malformedACLError: (details) => {
        return new ArsenalErrors("MalformedACLError", details);
    },

    malformedPOSTRequest: (details) => {
        return new ArsenalErrors("MalformedPOSTRequest", details);
    },

    malformedXML: (details) => {
        return new ArsenalErrors("MalformedXML", details);
    },

    maxMessageLengthExceeded: (details) => {
        return new ArsenalErrors("MaxMessageLengthExceeded", details);
    },

    maxPostPreDataLengthExceededError: (details) => {
        return new ArsenalErrors("MaxPostPreDataLengthExceededError", details);
    },

    metadataTooLarge: (details) => {
        return new ArsenalErrors("MetadataTooLarge", details);
    },

    methodNotAllowed: (details) => {
        return new ArsenalErrors("MethodNotAllowed", details);
    },

    missingAttachment: (details) => {
        return new ArsenalErrors("MissingAttachment", details);
    },

    missingContentLength: (details) => {
        return new ArsenalErrors("MissingContentLength", details);
    },

    missingRequestBodyError: (details) => {
        return new ArsenalErrors("MissingRequestBodyError", details);
    },

    missingSecurityElement: (details) => {
        return new ArsenalErrors("MissingSecurityElement", details);
    },

    missingSecurityHeader: (details) => {
        return new ArsenalErrors("MissingSecurityHeader", details);
    },

    noLoggingStatusForKey: (details) => {
        return new ArsenalErrors("NoLoggingStatusForKey", details);
    },

    noSuchBucket: (details) => {
        return new ArsenalErrors("NoSuchBucket", details);
    },

    noSuchKey: (details) => {
        return new ArsenalErrors("NoSuchKey", details);
    },

    noSuchLifecycleConfiguration: (details) => {
        return new ArsenalErrors("NoSuchLifecycleConfiguration", details);
    },

    noSuchUpload: (details) => {
        return new ArsenalErrors("NoSuchUpload", details);
    },

    noSuchVersion: (details) => {
        return new ArsenalErrors("NoSuchVersion", details);
    },

    notImplemented: (details) => {
        return new ArsenalErrors("NotImplemented", details);
    },

    notModified: (details) => {
        return new ArsenalErrors("NotModified", details);
    },

    notSignedUp: (details) => {
        return new ArsenalErrors("NotSignedUp", details);
    },

    noSuchBucketPolicy: (details) => {
        return new ArsenalErrors("NoSuchBucketPolicy", details);
    },

    operationAborted: (details) => {
        return new ArsenalErrors("OperationAborted", details);
    },

    permanentRedirect: (details) => {
        return new ArsenalErrors("PermanentRedirect", details);
    },

    preconditionFailed: (details) => {
        return new ArsenalErrors("PreconditionFailed", details);
    },

    redirect: (details) => {
        return new ArsenalErrors("Redirect", details);
    },

    restoreAlreadyInProgress: (details) => {
        return new ArsenalErrors("RestoreAlreadyInProgress", details);
    },

    requestIsNotMultiPartContent: (details) => {
        return new ArsenalErrors("RequestIsNotMultiPartContent", details);
    },

    requestTimeout: (details) => {
        return new ArsenalErrors("RequestTimeout", details);
    },

    requestTimeTooSkewed: (details) => {
        return new ArsenalErrors("RequestTimeTooSkewed", details);
    },

    requestTorrentOfBucketError: (details) => {
        return new ArsenalErrors("RequestTorrentOfBucketError", details);
    },

    signatureDoesNotMatch: (details) => {
        return new ArsenalErrors("SignatureDoesNotMatch", details);
    },

    serviceUnavailable: (details) => {
        return new ArsenalErrors("ServiceUnavailable", details);
    },

    slowDown: (details) => {
        return new ArsenalErrors("SlowDown", details);
    },

    temporaryRedirect: (details) => {
        return new ArsenalErrors("TemporaryRedirect", details);
    },

    tokenRefreshRequired: (details) => {
        return new ArsenalErrors("TokenRefreshRequired", details);
    },

    tooManyBuckets: (details) => {
        return new ArsenalErrors("TooManyBuckets", details);
    },

    tooManyParts: (details) => {
        return new ArsenalErrors("TooManyParts", details);
    },

    unexpectedContent: (details) => {
        return new ArsenalErrors("UnexpectedContent", details);
    },

    unresolvableGrantByEmailAddress: (details) => {
        return new ArsenalErrors("UnresolvableGrantByEmailAddress", details);
    },

    userKeyMustBeSpecified: (details) => {
        return new ArsenalErrors("UserKeyMustBeSpecified", details);
    },

    noSuchEntity: (details) => {
        return new ArsenalErrors("NoSuchEntity", details);
    },

    wrongFormat: (details) => {
        return new ArsenalErrors("WrongFormat", details);
    },

    forbidden: (details) => {
        return new ArsenalErrors("Forbidden", details);
    },

    entityDoesNotExist: (details) => {
        return new ArsenalErrors("EntityDoesNotExist", details);
    },

    entityAlreadyExists: (details) => {
        return new ArsenalErrors("EntityAlreadyExists", details);
    },

    serviceFailure: (details) => {
        return new ArsenalErrors("ServiceFailure", details);
    },

    incompleteSignature: (details) => {
        return new ArsenalErrors("IncompleteSignature", details);
    },

    internalFailure: (details) => {
        return new ArsenalErrors("InternalFailure", details);
    },

    invalidAction: (details) => {
        return new ArsenalErrors("InvalidAction", details);
    },

    invalidClientTokenId: (details) => {
        return new ArsenalErrors("InvalidClientTokenId", details);
    },

    invalidParameterCombination: (details) => {
        return new ArsenalErrors("InvalidParameterCombination", details);
    },

    invalidParameterValue: (details) => {
        return new ArsenalErrors("InvalidParameterValue", details);
    },

    invalidQueryParameter: (details) => {
        return new ArsenalErrors("InvalidQueryParameter", details);
    },

    malformedQueryString: (details) => {
        return new ArsenalErrors("MalformedQueryString", details);
    },

    missingAction: (details) => {
        return new ArsenalErrors("MissingAction", details);
    },

    missingAuthenticationToken: (details) => {
        return new ArsenalErrors("MissingAuthenticationToken", details);
    },

    missingParameter: (details) => {
        return new ArsenalErrors("MissingParameter", details);
    },

    optInRequired: (details) => {
        return new ArsenalErrors("OptInRequired", details);
    },

    requestExpired: (details) => {
        return new ArsenalErrors("RequestExpired", details);
    },

    throttling: (details) => {
        return new ArsenalErrors("Throttling", details);
    },

    badName: (details) => {
        return new ArsenalErrors("badName", details);
    },

    badAccount: (details) => {
        return new ArsenalErrors("badAccount", details);
    },

    badGroup: (details) => {
        return new ArsenalErrors("badGroup", details);
    },

    badId: (details) => {
        return new ArsenalErrors("badId", details);
    },

    badAccountName: (details) => {
        return new ArsenalErrors("badAccountName", details);
    },

    badNameFriendly: (details) => {
        return new ArsenalErrors("badNameFriendly", details);
    },

    badEmailAddress: (details) => {
        return new ArsenalErrors("badEmailAddress", details);
    },

    badPath: (details) => {
        return new ArsenalErrors("badPath", details);
    },

    badArn: (details) => {
        return new ArsenalErrors("badArn", details);
    },

    badCreateDate: (details) => {
        return new ArsenalErrors("badCreateDate", details);
    },

    badLastUsedDate: (details) => {
        return new ArsenalErrors("badLastUsedDate", details);
    },

    badNotBefore: (details) => {
        return new ArsenalErrors("badNotBefore", details);
    },

    badNotAfter: (details) => {
        return new ArsenalErrors("badNotAfter", details);
    },

    badSaltedPwd: (details) => {
        return new ArsenalErrors("badSaltedPwd", details);
    },

    ok: (details) => {
        return new ArsenalErrors("ok", details);
    },

    badUser: (details) => {
        return new ArsenalErrors("badUser", details);
    },

    badSaltedPasswd: (details) => {
        return new ArsenalErrors("badSaltedPasswd", details);
    },

    badPasswdDate: (details) => {
        return new ArsenalErrors("badPasswdDate", details);
    },

    badCanonicalId: (details) => {
        return new ArsenalErrors("badCanonicalId", details);
    },

    badAlias: (details) => {
        return new ArsenalErrors("badAlias", details);
    },

    dBPutFailed: (details) => {
        return new ArsenalErrors("dBPutFailed", details);
    },

    accountEmailAlreadyUsed: (details) => {
        return new ArsenalErrors("accountEmailAlreadyUsed", details);
    },

    accountNameAlreadyUsed: (details) => {
        return new ArsenalErrors("accountNameAlreadyUsed", details);
    },

    userEmailAlreadyUsed: (details) => {
        return new ArsenalErrors("userEmailAlreadyUsed", details);
    },

    userNameAlreadyUsed: (details) => {
        return new ArsenalErrors("userNameAlreadyUsed", details);
    },

    noParentAccount: (details) => {
        return new ArsenalErrors("noParentAccount", details);
    },

    badStringToSign: (details) => {
        return new ArsenalErrors("badStringToSign", details);
    },

    badSignatureFromRequest: (details) => {
        return new ArsenalErrors("badSignatureFromRequest", details);
    },

    badAlgorithm: (details) => {
        return new ArsenalErrors("badAlgorithm", details);
    },

    secretKeyDoesNotExist: (details) => {
        return new ArsenalErrors("secretKeyDoesNotExist", details);
    },

    invalidRegion: (details) => {
        return new ArsenalErrors("invalidRegion", details);
    },

    scopeDate: (details) => {
        return new ArsenalErrors("scopeDate", details);
    },

    badAccessKey: (details) => {
        return new ArsenalErrors("badAccessKey", details);
    },

    noDict: (details) => {
        return new ArsenalErrors("noDict", details);
    },

    badUrl: (details) => {
        return new ArsenalErrors("badUrl", details);
    },

    badClientIdList: (details) => {
        return new ArsenalErrors("badClientIdList", details);
    },

    badThumbprintList: (details) => {
        return new ArsenalErrors("badThumbprintList", details);
    },

    badObject: (details) => {
        return new ArsenalErrors("badObject", details);
    },

    badRole: (details) => {
        return new ArsenalErrors("badRole", details);
    },

    badSamlp: (details) => {
        return new ArsenalErrors("badSamlp", details);
    },

    badMetadataDocument: (details) => {
        return new ArsenalErrors("badMetadataDocument", details);
    },

    unauthorized: (details) => {
        return new ArsenalErrors("unauthorized", details);
    },

    bucketAlreadyExist: (details) => {
        return new ArsenalErrors("BucketAlreadyExist", details);
    },

    dBNotFound: (details) => {
        return new ArsenalErrors("DBNotFound", details);
    },

    dBAlreadyExists: (details) => {
        return new ArsenalErrors("DBAlreadyExists", details);
    },

    badSecretKey: (details) => {
        return new ArsenalErrors("badSecretKey", details);
    },

    badSecretKeyValue: (details) => {
        return new ArsenalErrors("badSecretKeyValue", details);
    },

    badSecretKeyStatus: (details) => {
        return new ArsenalErrors("badSecretKeyStatus", details);
    },

    objNotFound: (details) => {
        return new ArsenalErrors("ObjNotFound", details);
    }
};
