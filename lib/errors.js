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

function accessDenied(details) {
    return new ArsenalErrors("AccessDenied", details);
}

function accountProblem(details) {
    return new ArsenalErrors("AccountProblem", details);
}

function ambiguousGrantByEmailAddress(details) {
    return new ArsenalErrors("AmbiguousGrantByEmailAddress", details);
}

function badDigest(details) {
    return new ArsenalErrors("BadDigest", details);
}

function bucketAlreadyExists(details) {
    return new ArsenalErrors("BucketAlreadyExists", details);
}

function bucketAlreadyOwnedByYou(details) {
    return new ArsenalErrors("BucketAlreadyOwnedByYou", details);
}

function bucketNotEmpty(details) {
    return new ArsenalErrors("BucketNotEmpty", details);
}

function credentialsNotSupported(details) {
    return new ArsenalErrors("CredentialsNotSupported", details);
}

function crossLocationLoggingProhibited(details) {
    return new ArsenalErrors("CrossLocationLoggingProhibited", details);
}

function deleteConflict(details) {
    return new ArsenalErrors("DeleteConflict", details);
}

function entityTooSmall(details) {
    return new ArsenalErrors("EntityTooSmall", details);
}

function entityTooLarge(details) {
    return new ArsenalErrors("EntityTooLarge", details);
}

function expiredToken(details) {
    return new ArsenalErrors("ExpiredToken", details);
}

function illegalVersioningConfigurationException(details) {
    return new ArsenalErrors("IllegalVersioningConfigurationException",
                             details);
}

function incompleteBody(details) {
    return new ArsenalErrors("IncompleteBody", details);
}

function incorrectNumberOfFilesInPostRequest(details) {
    return new ArsenalErrors("IncorrectNumberOfFilesInPostRequest", details);
}

function inlineDataTooLarge(details) {
    return new ArsenalErrors("InlineDataTooLarge", details);
}

function internalError(details) {
    return new ArsenalErrors("InternalError", details);
}

function invalidAccessKeyId(details) {
    return new ArsenalErrors("InvalidAccessKeyId", details);
}

function invalidAddressingHeader(details) {
    return new ArsenalErrors("InvalidAddressingHeader", details);
}

function invalidArgument(details) {
    return new ArsenalErrors("InvalidArgument", details);
}

function invalidBucketName(details) {
    return new ArsenalErrors("InvalidBucketName", details);
}

function invalidBucketState(details) {
    return new ArsenalErrors("InvalidBucketState", details);
}

function invalidDigest(details) {
    return new ArsenalErrors("InvalidDigest", details);
}

function invalidEncryptionAlgorithmError(details) {
    return new ArsenalErrors("InvalidEncryptionAlgorithmError", details);
}

function invalidLocationConstraint(details) {
    return new ArsenalErrors("InvalidLocationConstraint", details);
}

function invalidObjectState(details) {
    return new ArsenalErrors("InvalidObjectState", details);
}

function invalidPart(details) {
    return new ArsenalErrors("InvalidPart", details);
}

function invalidPartOrder(details) {
    return new ArsenalErrors("InvalidPartOrder", details);
}

function invalidPayer(details) {
    return new ArsenalErrors("InvalidPayer", details);
}

function invalidPolicyDocument(details) {
    return new ArsenalErrors("InvalidPolicyDocument", details);
}

function invalidRange(details) {
    return new ArsenalErrors("InvalidRange", details);
}

function invalidRequest(details) {
    return new ArsenalErrors("InvalidRequest", details);
}

function invalidSecurity(details) {
    return new ArsenalErrors("InvalidSecurity", details);
}

function invalidSOAPRequest(details) {
    return new ArsenalErrors("InvalidSOAPRequest", details);
}

function invalidStorageClass(details) {
    return new ArsenalErrors("InvalidStorageClass", details);
}

function invalidTargetBucketForLogging(details) {
    return new ArsenalErrors("InvalidTargetBucketForLogging", details);
}

function invalidToken(details) {
    return new ArsenalErrors("InvalidToken", details);
}

function invalidURI(details) {
    return new ArsenalErrors("InvalidURI", details);
}

function keyTooLong(details) {
    return new ArsenalErrors("KeyTooLong", details);
}

function limitExceeded(details) {
    return new ArsenalErrors("LimitExceeded", details);
}

function malformedACLError(details) {
    return new ArsenalErrors("MalformedACLError", details);
}

function malformedPOSTRequest(details) {
    return new ArsenalErrors("MalformedPOSTRequest", details);
}

function malformedXML(details) {
    return new ArsenalErrors("MalformedXML", details);
}

function maxMessageLengthExceeded(details) {
    return new ArsenalErrors("MaxMessageLengthExceeded", details);
}

function maxPostPreDataLengthExceededError(details) {
    return new ArsenalErrors("MaxPostPreDataLengthExceededError", details);
}

function metadataTooLarge(details) {
    return new ArsenalErrors("MetadataTooLarge", details);
}

function methodNotAllowed(details) {
    return new ArsenalErrors("MethodNotAllowed", details);
}

function missingAttachment(details) {
    return new ArsenalErrors("MissingAttachment", details);
}

function missingContentLength(details) {
    return new ArsenalErrors("MissingContentLength", details);
}

function missingRequestBodyError(details) {
    return new ArsenalErrors("MissingRequestBodyError", details);
}

function missingSecurityElement(details) {
    return new ArsenalErrors("MissingSecurityElement", details);
}

function missingSecurityHeader(details) {
    return new ArsenalErrors("MissingSecurityHeader", details);
}

function noLoggingStatusForKey(details) {
    return new ArsenalErrors("NoLoggingStatusForKey", details);
}

function noSuchBucket(details) {
    return new ArsenalErrors("NoSuchBucket", details);
}

function noSuchKey(details) {
    return new ArsenalErrors("NoSuchKey", details);
}

function noSuchLifecycleConfiguration(details) {
    return new ArsenalErrors("NoSuchLifecycleConfiguration", details);
}

function noSuchUpload(details) {
    return new ArsenalErrors("NoSuchUpload", details);
}

function noSuchVersion(details) {
    return new ArsenalErrors("NoSuchVersion", details);
}

function notImplemented(details) {
    return new ArsenalErrors("NotImplemented", details);
}

function notModified(details) {
    return new ArsenalErrors("NotModified", details);
}

function notSignedUp(details) {
    return new ArsenalErrors("NotSignedUp", details);
}

function noSuchBucketPolicy(details) {
    return new ArsenalErrors("NoSuchBucketPolicy", details);
}

function operationAborted(details) {
    return new ArsenalErrors("OperationAborted", details);
}

function permanentRedirect(details) {
    return new ArsenalErrors("PermanentRedirect", details);
}

function preconditionFailed(details) {
    return new ArsenalErrors("PreconditionFailed", details);
}

function redirect(details) {
    return new ArsenalErrors("Redirect", details);
}

function restoreAlreadyInProgress(details) {
    return new ArsenalErrors("RestoreAlreadyInProgress", details);
}

function requestIsNotMultiPartContent(details) {
    return new ArsenalErrors("RequestIsNotMultiPartContent", details);
}

function requestTimeout(details) {
    return new ArsenalErrors("RequestTimeout", details);
}

function requestTimeTooSkewed(details) {
    return new ArsenalErrors("RequestTimeTooSkewed", details);
}

function requestTorrentOfBucketError(details) {
    return new ArsenalErrors("RequestTorrentOfBucketError", details);
}

function signatureDoesNotMatch(details) {
    return new ArsenalErrors("SignatureDoesNotMatch", details);
}

function serviceUnavailable(details) {
    return new ArsenalErrors("ServiceUnavailable", details);
}

function slowDown(details) {
    return new ArsenalErrors("SlowDown", details);
}

function temporaryRedirect(details) {
    return new ArsenalErrors("TemporaryRedirect", details);
}

function tokenRefreshRequired(details) {
    return new ArsenalErrors("TokenRefreshRequired", details);
}

function tooManyBuckets(details) {
    return new ArsenalErrors("TooManyBuckets", details);
}

function tooManyParts(details) {
    return new ArsenalErrors("TooManyParts", details);
}

function unexpectedContent(details) {
    return new ArsenalErrors("UnexpectedContent", details);
}

function unresolvableGrantByEmailAddress(details) {
    return new ArsenalErrors("UnresolvableGrantByEmailAddress", details);
}

function userKeyMustBeSpecified(details) {
    return new ArsenalErrors("UserKeyMustBeSpecified", details);
}

function noSuchEntity(details) {
    return new ArsenalErrors("NoSuchEntity", details);
}

function wrongFormat(details) {
    return new ArsenalErrors("WrongFormat", details);
}

function forbidden(details) {
    return new ArsenalErrors("Forbidden", details);
}

function entityDoesNotExist(details) {
    return new ArsenalErrors("EntityDoesNotExist", details);
}

function entityAlreadyExists(details) {
    return new ArsenalErrors("EntityAlreadyExists", details);
}

function serviceFailure(details) {
    return new ArsenalErrors("ServiceFailure", details);
}

function incompleteSignature(details) {
    return new ArsenalErrors("IncompleteSignature", details);
}

function internalFailure(details) {
    return new ArsenalErrors("InternalFailure", details);
}

function invalidAction(details) {
    return new ArsenalErrors("InvalidAction", details);
}

function invalidClientTokenId(details) {
    return new ArsenalErrors("InvalidClientTokenId", details);
}

function invalidParameterCombination(details) {
    return new ArsenalErrors("InvalidParameterCombination", details);
}

function invalidParameterValue(details) {
    return new ArsenalErrors("InvalidParameterValue", details);
}

function invalidQueryParameter(details) {
    return new ArsenalErrors("InvalidQueryParameter", details);
}

function malformedQueryString(details) {
    return new ArsenalErrors("MalformedQueryString", details);
}

function missingAction(details) {
    return new ArsenalErrors("MissingAction", details);
}

function missingAuthenticationToken(details) {
    return new ArsenalErrors("MissingAuthenticationToken", details);
}

function missingParameter(details) {
    return new ArsenalErrors("MissingParameter", details);
}

function optInRequired(details) {
    return new ArsenalErrors("OptInRequired", details);
}

function requestExpired(details) {
    return new ArsenalErrors("RequestExpired", details);
}

function throttling(details) {
    return new ArsenalErrors("Throttling", details);
}

function badName(details) {
    return new ArsenalErrors("badName", details);
}

function badId(details) {
    return new ArsenalErrors("badId", details);
}

function badAccountName(details) {
    return new ArsenalErrors("badAccountName", details);
}

function badAccount(details) {
    return new ArsenalErrors("badAccount", details);
}

function badGroup(details) {
    return new ArsenalErrors("badGroup", details);
}

function badNameFriendly(details) {
    return new ArsenalErrors("badNameFriendly", details);
}

function badEmailAddress(details) {
    return new ArsenalErrors("badEmailAddress", details);
}

function badPath(details) {
    return new ArsenalErrors("badPath", details);
}

function badArn(details) {
    return new ArsenalErrors("badArn", details);
}

function badCreateDate(details) {
    return new ArsenalErrors("badCreateDate", details);
}

function badLastUsedDate(details) {
    return new ArsenalErrors("badLastUsedDate", details);
}

function badNotBefore(details) {
    return new ArsenalErrors("badNotBefore", details);
}

function badNotAfter(details) {
    return new ArsenalErrors("badNotAfter", details);
}

function badSaltedPwd(details) {
    return new ArsenalErrors("badSaltedPwd", details);
}

function ok(details) {
    return new ArsenalErrors("ok", details);
}

function badUser(details) {
    return new ArsenalErrors("badUser", details);
}

function badSaltedPasswd(details) {
    return new ArsenalErrors("badSaltedPasswd", details);
}

function badPasswdDate(details) {
    return new ArsenalErrors("badPasswdDate", details);
}

function badCanonicalId(details) {
    return new ArsenalErrors("badCanonicalId", details);
}

function badAlias(details) {
    return new ArsenalErrors("badAlias", details);
}

function dBPutFailed(details) {
    return new ArsenalErrors("dBPutFailed", details);
}

function accountEmailAlreadyUsed(details) {
    return new ArsenalErrors("accountEmailAlreadyUsed", details);
}

function accountNameAlreadyUsed(details) {
    return new ArsenalErrors("accountNameAlreadyUsed", details);
}

function userEmailAlreadyUsed(details) {
    return new ArsenalErrors("userEmailAlreadyUsed", details);
}

function userNameAlreadyUsed(details) {
    return new ArsenalErrors("userNameAlreadyUsed", details);
}

function noParentAccount(details) {
    return new ArsenalErrors("noParentAccount", details);
}

function badStringToSign(details) {
    return new ArsenalErrors("badStringToSign", details);
}

function badSignatureFromRequest(details) {
    return new ArsenalErrors("badSignatureFromRequest", details);
}

function badAlgorithm(details) {
    return new ArsenalErrors("badAlgorithm", details);
}

function secretKeyDoesNotExist(details) {
    return new ArsenalErrors("secretKeyDoesNotExist", details);
}

function badUrl(details) {
    return new ArsenalErrors("badUrl", details);
}

function badClientIdList(details) {
    return new ArsenalErrors("badClientIdList", details);
}

function badThumbprintList(details) {
    return new ArsenalErrors("badThumbprintList", details);
}

function badObject(details) {
    return new ArsenalErrors("badObject", details);
}

function badRole(details) {
    return new ArsenalErrors("badRole", details);
}

function badSamlp(details) {
    return new ArsenalErrors("badSamlp", details);
}

function badMetadataDocument(details) {
    return new ArsenalErrors("badMetadataDocument", details);
}

function bucketAlreadyExist(details) {
    return new ArsenalErrors("BucketAlreadyExist", details);
}

function dBNotFound(details) {
    return new ArsenalErrors("DBNotFound", details);
}

function objNotFound(details) {
    return new ArsenalErrors("ObjNotFound", details);
}

function dBAlreadyExists(details) {
    return new ArsenalErrors("DBAlreadyExists", details);
}

function invalidRegion(details) {
    return new ArsenalErrors("invalidRegion", details);
}

function scopeDate(details) {
    return new ArsenalErrors("scopeDate", details);
}

function badAccessKey(details) {
    return new ArsenalErrors("badAccessKey", details);
}

function noDict(details) {
    return new ArsenalErrors("noDict", details);
}

function unauthorized(details) {
    return new ArsenalErrors("unauthorized", details);
}

module.exports = {
    accessDenied,
    accountProblem,
    ambiguousGrantByEmailAddress,
    badDigest,
    bucketAlreadyExists,
    bucketAlreadyOwnedByYou,
    bucketNotEmpty,
    credentialsNotSupported,
    crossLocationLoggingProhibited,
    deleteConflict,
    entityAlreadyExists,
    entityDoesNotExist,
    entityTooSmall,
    entityTooLarge,
    expiredToken,
    forbidden,
    illegalVersioningConfigurationException,
    incompleteBody,
    incompleteSignature,
    incorrectNumberOfFilesInPostRequest,
    inlineDataTooLarge,
    internalFailure,
    internalError,
    invalidAccessKeyId,
    invalidAction,
    invalidAddressingHeader,
    invalidArgument,
    invalidBucketName,
    invalidBucketState,
    invalidClientTokenId,
    invalidDigest,
    invalidEncryptionAlgorithmError,
    invalidLocationConstraint,
    invalidObjectState,
    invalidParameterCombination,
    invalidParameterValue,
    invalidPart,
    invalidPartOrder,
    invalidPayer,
    invalidPolicyDocument,
    invalidQueryParameter,
    invalidRange,
    invalidRequest,
    invalidSecurity,
    invalidSOAPRequest,
    invalidStorageClass,
    invalidTargetBucketForLogging,
    invalidToken,
    invalidURI,
    keyTooLong,
    limitExceeded,
    malformedACLError,
    malformedPOSTRequest,
    malformedQueryString,
    malformedXML,
    maxMessageLengthExceeded,
    maxPostPreDataLengthExceededError,
    metadataTooLarge,
    methodNotAllowed,
    missingAction,
    missingAttachment,
    missingAuthenticationToken,
    missingContentLength,
    missingParameter,
    missingRequestBodyError,
    missingSecurityElement,
    missingSecurityHeader,
    noLoggingStatusForKey,
    noSuchBucket,
    noSuchEntity,
    noSuchKey,
    noSuchLifecycleConfiguration,
    noSuchUpload,
    noSuchVersion,
    notImplemented,
    notModified,
    notSignedUp,
    noSuchBucketPolicy,
    operationAborted,
    optInRequired,
    permanentRedirect,
    preconditionFailed,
    redirect,
    restoreAlreadyInProgress,
    requestExpired,
    requestIsNotMultiPartContent,
    requestTimeout,
    requestTimeTooSkewed,
    requestTorrentOfBucketError,
    signatureDoesNotMatch,
    serviceFailure,
    serviceUnavailable,
    slowDown,
    temporaryRedirect,
    throttling,
    tokenRefreshRequired,
    tooManyBuckets,
    tooManyParts,
    unexpectedContent,
    unresolvableGrantByEmailAddress,
    userKeyMustBeSpecified,
    wrongFormat,
    badName,
    badId,
    badAccountName,
    badAccount,
    badGroup,
    badNameFriendly,
    badEmailAddress,
    badPath,
    badArn,
    badCreateDate,
    badLastUsedDate,
    badNotBefore,
    badNotAfter,
    badSaltedPwd,
    ok,
    badUser,
    badSaltedPasswd,
    badPasswdDate,
    badCanonicalId,
    badAlias,
    dBPutFailed,
    accountEmailAlreadyUsed,
    accountNameAlreadyUsed,
    userEmailAlreadyUsed,
    userNameAlreadyUsed,
    noParentAccount,
    badStringToSign,
    badSignatureFromRequest,
    badAlgorithm,
    secretKeyDoesNotExist,
    badUrl,
    badClientIdList,
    badThumbprintList,
    badObject,
    badRole,
    badSamlp,
    badMetadataDocument,
    bucketAlreadyExist,
    dBNotFound,
    objNotFound,
    dBAlreadyExists,
    invalidRegion,
    scopeDate,
    badAccessKey,
    unauthorized,
    noDict
};
