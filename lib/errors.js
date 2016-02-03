'use strict'; // eslint-disable-line strict

const ERRORS = require('../errors/arsenalErrors.json');

class ArsenalErrors extends Error {
    constructor(type) {
        super(type);
        this.code = ERRORS[type].httpCode;
        this.description = ERRORS[type].description;
        this[type] = true;
    }
}

function accessDenied() {
    return new ArsenalErrors("AccessDenied");
}

function accountProblem() {
    return new ArsenalErrors("AccountProblem");
}

function ambiguousGrantByEmailAddress() {
    return new ArsenalErrors("AmbiguousGrantByEmailAddress");
}

function badDigest() {
    return new ArsenalErrors("BadDigest");
}

function bucketAlreadyExists() {
    return new ArsenalErrors("BucketAlreadyExists");
}

function bucketAlreadyOwnedByYou() {
    return new ArsenalErrors("BucketAlreadyOwnedByYou");
}

function bucketNotEmpty() {
    return new ArsenalErrors("BucketNotEmpty");
}

function credentialsNotSupported() {
    return new ArsenalErrors("CredentialsNotSupported");
}

function crossLocationLoggingProhibited() {
    return new ArsenalErrors("CrossLocationLoggingProhibited");
}

function entityTooSmall() {
    return new ArsenalErrors("EntityTooSmall");
}

function entityTooLarge() {
    return new ArsenalErrors("EntityTooLarge");
}

function expiredToken() {
    return new ArsenalErrors("ExpiredToken");
}

function illegalVersioningConfigurationException() {
    return new ArsenalErrors("IllegalVersioningConfigurationException");
}

function incompleteBody() {
    return new ArsenalErrors("IncompleteBody");
}

function incorrectNumberOfFilesInPostRequest() {
    return new ArsenalErrors("IncorrectNumberOfFilesInPostRequest");
}

function inlineDataTooLarge() {
    return new ArsenalErrors("InlineDataTooLarge");
}

function internalError() {
    return new ArsenalErrors("InternalError");
}

function invalidAccessKeyId() {
    return new ArsenalErrors("InvalidAccessKeyId");
}

function invalidAddressingHeader() {
    return new ArsenalErrors("InvalidAddressingHeader");
}

function invalidArgument() {
    return new ArsenalErrors("InvalidArgument");
}

function invalidBucketName() {
    return new ArsenalErrors("InvalidBucketName");
}

function invalidBucketState() {
    return new ArsenalErrors("InvalidBucketState");
}

function invalidDigest() {
    return new ArsenalErrors("InvalidDigest");
}

function invalidEncryptionAlgorithmError() {
    return new ArsenalErrors("InvalidEncryptionAlgorithmError");
}

function invalidLocationConstraint() {
    return new ArsenalErrors("InvalidLocationConstraint");
}

function invalidObjectState() {
    return new ArsenalErrors("InvalidObjectState");
}

function invalidPart() {
    return new ArsenalErrors("InvalidPart");
}

function invalidPartOrder() {
    return new ArsenalErrors("InvalidPartOrder");
}

function invalidPayer() {
    return new ArsenalErrors("InvalidPayer");
}

function invalidPolicyDocument() {
    return new ArsenalErrors("InvalidPolicyDocument");
}

function invalidRange() {
    return new ArsenalErrors("InvalidRange");
}

function invalidRequest() {
    return new ArsenalErrors("InvalidRequest");
}

function invalidSecurity() {
    return new ArsenalErrors("InvalidSecurity");
}

function invalidSOAPRequest() {
    return new ArsenalErrors("InvalidSOAPRequest");
}

function invalidStorageClass() {
    return new ArsenalErrors("InvalidStorageClass");
}

function invalidTargetBucketForLogging() {
    return new ArsenalErrors("InvalidTargetBucketForLogging");
}

function invalidToken() {
    return new ArsenalErrors("InvalidToken");
}

function invalidURI() {
    return new ArsenalErrors("InvalidURI");
}

function keyTooLong() {
    return new ArsenalErrors("KeyTooLong");
}

function malformedACLError() {
    return new ArsenalErrors("MalformedACLError");
}

function malformedPOSTRequest() {
    return new ArsenalErrors("MalformedPOSTRequest");
}

function malformedXML() {
    return new ArsenalErrors("MalformedXML");
}

function maxMessageLengthExceeded() {
    return new ArsenalErrors("MaxMessageLengthExceeded");
}

function maxPostPreDataLengthExceededError() {
    return new ArsenalErrors("MaxPostPreDataLengthExceededError");
}

function metadataTooLarge() {
    return new ArsenalErrors("MetadataTooLarge");
}

function methodNotAllowed() {
    return new ArsenalErrors("MethodNotAllowed");
}

function missingAttachment() {
    return new ArsenalErrors("MissingAttachment");
}

function missingContentLength() {
    return new ArsenalErrors("MissingContentLength");
}

function missingRequestBodyError() {
    return new ArsenalErrors("MissingRequestBodyError");
}

function missingSecurityElement() {
    return new ArsenalErrors("MissingSecurityElement");
}

function missingSecurityHeader() {
    return new ArsenalErrors("MissingSecurityHeader");
}

function noLoggingStatusForKey() {
    return new ArsenalErrors("NoLoggingStatusForKey");
}

function noSuchBucket() {
    return new ArsenalErrors("NoSuchBucket");
}

function noSuchKey() {
    return new ArsenalErrors("NoSuchKey");
}

function noSuchLifecycleConfiguration() {
    return new ArsenalErrors("NoSuchLifecycleConfiguration");
}

function noSuchUpload() {
    return new ArsenalErrors("NoSuchUpload");
}

function noSuchVersion() {
    return new ArsenalErrors("NoSuchVersion");
}

function notImplemented() {
    return new ArsenalErrors("NotImplemented");
}

function notModified() {
    return new ArsenalErrors("NotModified");
}

function notSignedUp() {
    return new ArsenalErrors("NotSignedUp");
}

function noSuchBucketPolicy() {
    return new ArsenalErrors("NoSuchBucketPolicy");
}

function operationAborted() {
    return new ArsenalErrors("OperationAborted");
}

function permanentRedirect() {
    return new ArsenalErrors("PermanentRedirect");
}

function preconditionFailed() {
    return new ArsenalErrors("PreconditionFailed");
}

function redirect() {
    return new ArsenalErrors("Redirect");
}

function restoreAlreadyInProgress() {
    return new ArsenalErrors("RestoreAlreadyInProgress");
}

function requestIsNotMultiPartContent() {
    return new ArsenalErrors("RequestIsNotMultiPartContent");
}

function requestTimeout() {
    return new ArsenalErrors("RequestTimeout");
}

function requestTimeTooSkewed() {
    return new ArsenalErrors("RequestTimeTooSkewed");
}

function requestTorrentOfBucketError() {
    return new ArsenalErrors("RequestTorrentOfBucketError");
}

function signatureDoesNotMatch() {
    return new ArsenalErrors("SignatureDoesNotMatch");
}

function serviceUnavailable() {
    return new ArsenalErrors("ServiceUnavailable");
}

function slowDown() {
    return new ArsenalErrors("SlowDown");
}

function temporaryRedirect() {
    return new ArsenalErrors("TemporaryRedirect");
}

function tokenRefreshRequired() {
    return new ArsenalErrors("TokenRefreshRequired");
}

function tooManyBuckets() {
    return new ArsenalErrors("TooManyBuckets");
}

function tooManyParts() {
    return new ArsenalErrors("TooManyParts");
}

function unexpectedContent() {
    return new ArsenalErrors("UnexpectedContent");
}

function unresolvableGrantByEmailAddress() {
    return new ArsenalErrors("UnresolvableGrantByEmailAddress");
}

function userKeyMustBeSpecified() {
    return new ArsenalErrors("UserKeyMustBeSpecified");
}

function noSuchEntity() {
    return new ArsenalErrors("NoSuchEntity");
}

function wrongFormat() {
    return new ArsenalErrors("WrongFormat");
}

function forbidden() {
    return new ArsenalErrors("Forbidden");
}

function entityDoesNotExist() {
    return new ArsenalErrors("EntityDoesNotExist");
}

function entityAlreadyExists() {
    return new ArsenalErrors("EntityAlreadyExists");
}

function serviceFailure() {
    return new ArsenalErrors("ServiceFailure");
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
    entityTooSmall,
    entityTooLarge,
    expiredToken,
    illegalVersioningConfigurationException,
    incompleteBody,
    incorrectNumberOfFilesInPostRequest,
    inlineDataTooLarge,
    internalError,
    invalidAccessKeyId,
    invalidAddressingHeader,
    invalidArgument,
    invalidBucketName,
    invalidBucketState,
    invalidDigest,
    invalidEncryptionAlgorithmError,
    invalidLocationConstraint,
    invalidObjectState,
    invalidPart,
    invalidPartOrder,
    invalidPayer,
    invalidPolicyDocument,
    invalidRange,
    invalidRequest,
    invalidSecurity,
    invalidSOAPRequest,
    invalidStorageClass,
    invalidTargetBucketForLogging,
    invalidToken,
    invalidURI,
    keyTooLong,
    malformedACLError,
    malformedPOSTRequest,
    malformedXML,
    maxMessageLengthExceeded,
    maxPostPreDataLengthExceededError,
    metadataTooLarge,
    methodNotAllowed,
    missingAttachment,
    missingContentLength,
    missingRequestBodyError,
    missingSecurityElement,
    missingSecurityHeader,
    noLoggingStatusForKey,
    noSuchBucket,
    noSuchKey,
    noSuchLifecycleConfiguration,
    noSuchUpload,
    noSuchVersion,
    notImplemented,
    notModified,
    notSignedUp,
    noSuchBucketPolicy,
    operationAborted,
    permanentRedirect,
    preconditionFailed,
    redirect,
    restoreAlreadyInProgress,
    requestIsNotMultiPartContent,
    requestTimeout,
    requestTimeTooSkewed,
    requestTorrentOfBucketError,
    signatureDoesNotMatch,
    serviceUnavailable,
    slowDown,
    temporaryRedirect,
    tokenRefreshRequired,
    tooManyBuckets,
    tooManyParts,
    unexpectedContent,
    unresolvableGrantByEmailAddress,
    userKeyMustBeSpecified,
    noSuchEntity,
    wrongFormat,
    forbidden,
    entityDoesNotExist,
    entityAlreadyExists,
    serviceFailure,
};
