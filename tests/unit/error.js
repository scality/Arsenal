const arsenalErrors = require("../../errors/arsenalErrors.json");

const assert = require('assert');

const errors = require('../../index').Errors;

describe('class errors extended from Error', () => {
    it('should return AccessDenied Error',
       (done) => {
           const errorTest = errors.accessDenied();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .AccessDenied.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .AccessDenied.description);
           done();
       });
    it('should return AccountProblem Error',
       (done) => {
           const errorTest = errors.accountProblem();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .AccountProblem.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .AccountProblem.description);
           done();
       });
    it('should return AmbiguousGrantByEmailAddress Error',
       (done) => {
           const errorTest = errors.ambiguousGrantByEmailAddress();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .AmbiguousGrantByEmailAddress.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .AmbiguousGrantByEmailAddress.description);
           done();
       });
    it('should return BadDigest Error',
       (done) => {
           const errorTest = errors.badDigest();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .BadDigest.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .BadDigest.description);
           done();
       });
    it('should return BucketAlreadyExists Error',
       (done) => {
           const errorTest = errors.bucketAlreadyExists();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .BucketAlreadyExists.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .BucketAlreadyExists.description);
           done();
       });
    it('should return BucketAlreadyOwnedByYou Error',
       (done) => {
           const errorTest = errors.bucketAlreadyOwnedByYou();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .BucketAlreadyOwnedByYou.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .BucketAlreadyOwnedByYou.description);
           done();
       });
    it('should return BucketNotEmpty Error',
       (done) => {
           const errorTest = errors.bucketNotEmpty();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .BucketNotEmpty.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .BucketNotEmpty.description);
           done();
       });
    it('should return CredentialsNotSupported Error',
       (done) => {
           const errorTest = errors.credentialsNotSupported();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .CredentialsNotSupported.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .CredentialsNotSupported.description);
           done();
       });
    it('should return CrossLocationLoggingProhibited Error',
       (done) => {
           const errorTest = errors.crossLocationLoggingProhibited();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .CrossLocationLoggingProhibited.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .CrossLocationLoggingProhibited.description);
           done();
       });
    it('should return EntityTooSmall Error',
       (done) => {
           const errorTest = errors.entityTooSmall();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .EntityTooSmall.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .EntityTooSmall.description);
           done();
       });
    it('should return EntityTooLarge Error',
       (done) => {
           const errorTest = errors.entityTooLarge();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .EntityTooLarge.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .EntityTooLarge.description);
           done();
       });
    it('should return ExpiredToken Error',
       (done) => {
           const errorTest = errors.expiredToken();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .ExpiredToken.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .ExpiredToken.description);
           done();
       });
    it('should return IllegalVersioningConfigurationException Error',
       (done) => {
           const errorTest = errors.illegalVersioningConfigurationException();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .IllegalVersioningConfigurationException
                                  .httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .IllegalVersioningConfigurationException
                                  .description);
           done();
       });
    it('should return IncompleteBody Error',
       (done) => {
           const errorTest = errors.incompleteBody();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .IncompleteBody.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .IncompleteBody.description);
           done();
       });
    it('should return IncorrectNumberOfFilesInPostRequest Error',
       (done) => {
           const errorTest = errors.incorrectNumberOfFilesInPostRequest();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .IncorrectNumberOfFilesInPostRequest
                                  .httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .IncorrectNumberOfFilesInPostRequest
                                  .description);
           done();
       });
    it('should return InlineDataTooLarge Error',
       (done) => {
           const errorTest = errors.inlineDataTooLarge();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InlineDataTooLarge.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InlineDataTooLarge.description);
           done();
       });
    it('should return InternalError Error',
       (done) => {
           const errorTest = errors.internalError();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InternalError.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InternalError.description);
           done();
       });
    it('should return InvalidAccessKeyId Error',
       (done) => {
           const errorTest = errors.invalidAccessKeyId();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidAccessKeyId.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidAccessKeyId.description);
           done();
       });
    it('should return InvalidAddressingHeader Error',
       (done) => {
           const errorTest = errors.invalidAddressingHeader();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidAddressingHeader.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidAddressingHeader.description);
           done();
       });
    it('should return InvalidArgument Error',
       (done) => {
           const errorTest = errors.invalidArgument();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidArgument.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidArgument.description);
           done();
       });
    it('should return InvalidBucketName Error',
       (done) => {
           const errorTest = errors.invalidBucketName();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidBucketName.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidBucketName.description);
           done();
       });
    it('should return InvalidBucketState Error',
       (done) => {
           const errorTest = errors.invalidBucketState();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidBucketState.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidBucketState.description);
           done();
       });
    it('should return InvalidDigest Error',
       (done) => {
           const errorTest = errors.invalidDigest();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidDigest.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidDigest.description);
           done();
       });
    it('should return InvalidEncryptionAlgorithmError Error',
       (done) => {
           const errorTest = errors.invalidEncryptionAlgorithmError();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidEncryptionAlgorithmError.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidEncryptionAlgorithmError.description);
           done();
       });
    it('should return InvalidLocationConstraint Error',
       (done) => {
           const errorTest = errors.invalidLocationConstraint();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidLocationConstraint.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidLocationConstraint.description);
           done();
       });
    it('should return InvalidObjectState Error',
       (done) => {
           const errorTest = errors.invalidObjectState();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidObjectState.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidObjectState.description);
           done();
       });
    it('should return InvalidPart Error',
       (done) => {
           const errorTest = errors.invalidPart();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidPart.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidPart.description);
           done();
       });
    it('should return InvalidPartOrder Error',
       (done) => {
           const errorTest = errors.invalidPartOrder();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidPartOrder.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidPartOrder.description);
           done();
       });
    it('should return InvalidPayer Error',
       (done) => {
           const errorTest = errors.invalidPayer();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidPayer.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidPayer.description);
           done();
       });
    it('should return InvalidPolicyDocument Error',
       (done) => {
           const errorTest = errors.invalidPolicyDocument();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidPolicyDocument.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidPolicyDocument.description);
           done();
       });
    it('should return InvalidRange Error',
       (done) => {
           const errorTest = errors.invalidRange();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidRange.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidRange.description);
           done();
       });
    it('should return InvalidRequest Error',
       (done) => {
           const errorTest = errors.invalidRequest();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidRequest.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidRequest.description);
           done();
       });
    it('should return InvalidSecurity Error',
       (done) => {
           const errorTest = errors.invalidSecurity();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidSecurity.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidSecurity.description);
           done();
       });
    it('should return InvalidSOAPRequest Error',
       (done) => {
           const errorTest = errors.invalidSOAPRequest();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidSOAPRequest.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidSOAPRequest.description);
           done();
       });
    it('should return InvalidStorageClass Error',
       (done) => {
           const errorTest = errors.invalidStorageClass();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidStorageClass.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidStorageClass.description);
           done();
       });
    it('should return InvalidTargetBucketForLogging Error',
       (done) => {
           const errorTest = errors.invalidTargetBucketForLogging();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidTargetBucketForLogging.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidTargetBucketForLogging.description);
           done();
       });
    it('should return InvalidToken Error',
       (done) => {
           const errorTest = errors.invalidToken();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidToken.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidToken.description);
           done();
       });
    it('should return InvalidURI Error',
       (done) => {
           const errorTest = errors.invalidURI();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidURI.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidURI.description);
           done();
       });
    it('should return KeyTooLong Error',
       (done) => {
           const errorTest = errors.keyTooLong();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .KeyTooLong.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .KeyTooLong.description);
           done();
       });
    it('should return MalformedACLError Error',
       (done) => {
           const errorTest = errors.malformedACLError();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .MalformedACLError.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .MalformedACLError.description);
           done();
       });
    it('should return MalformedPOSTRequest Error',
       (done) => {
           const errorTest = errors.malformedPOSTRequest();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .MalformedPOSTRequest.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .MalformedPOSTRequest.description);
           done();
       });
    it('should return MalformedXML Error',
       (done) => {
           const errorTest = errors.malformedXML();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .MalformedXML.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .MalformedXML.description);
           done();
       });
    it('should return MaxMessageLengthExceeded Error',
       (done) => {
           const errorTest = errors.maxMessageLengthExceeded();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .MaxMessageLengthExceeded.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .MaxMessageLengthExceeded.description);
           done();
       });
    it('should return MaxPostPreDataLengthExceededError Error',
       (done) => {
           const errorTest = errors.maxPostPreDataLengthExceededError();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .MaxPostPreDataLengthExceededError
                                  .httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .MaxPostPreDataLengthExceededError
                                  .description);
           done();
       });
    it('should return MetadataTooLarge Error',
       (done) => {
           const errorTest = errors.metadataTooLarge();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .MetadataTooLarge.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .MetadataTooLarge.description);
           done();
       });
    it('should return MethodNotAllowed Error',
       (done) => {
           const errorTest = errors.methodNotAllowed();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .MethodNotAllowed.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .MethodNotAllowed.description);
           done();
       });
    it('should return MissingAttachment Error',
       (done) => {
           const errorTest = errors.missingAttachment();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .MissingAttachment.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .MissingAttachment.description);
           done();
       });
    it('should return MissingContentLength Error',
       (done) => {
           const errorTest = errors.missingContentLength();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .MissingContentLength.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .MissingContentLength.description);
           done();
       });
    it('should return MissingRequestBodyError Error',
       (done) => {
           const errorTest = errors.missingRequestBodyError();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .MissingRequestBodyError.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .MissingRequestBodyError.description);
           done();
       });
    it('should return MissingSecurityElement Error',
       (done) => {
           const errorTest = errors.missingSecurityElement();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .MissingSecurityElement.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .MissingSecurityElement.description);
           done();
       });
    it('should return MissingSecurityHeader Error',
       (done) => {
           const errorTest = errors.missingSecurityHeader();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .MissingSecurityHeader.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .MissingSecurityHeader.description);
           done();
       });
    it('should return NoLoggingStatusForKey Error',
       (done) => {
           const errorTest = errors.noLoggingStatusForKey();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .NoLoggingStatusForKey.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .NoLoggingStatusForKey.description);
           done();
       });
    it('should return NoSuchBucket Error',
       (done) => {
           const errorTest = errors.noSuchBucket();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .NoSuchBucket.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .NoSuchBucket.description);
           done();
       });
    it('should return NoSuchKey Error',
       (done) => {
           const errorTest = errors.noSuchKey();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .NoSuchKey.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .NoSuchKey.description);
           done();
       });
    it('should return NoSuchLifecycleConfiguration Error',
       (done) => {
           const errorTest = errors.noSuchLifecycleConfiguration();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .NoSuchLifecycleConfiguration.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .NoSuchLifecycleConfiguration.description);
           done();
       });
    it('should return NoSuchUpload Error',
       (done) => {
           const errorTest = errors.noSuchUpload();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .NoSuchUpload.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .NoSuchUpload.description);
           done();
       });
    it('should return NoSuchVersion Error',
       (done) => {
           const errorTest = errors.noSuchVersion();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .NoSuchVersion.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .NoSuchVersion.description);
           done();
       });
    it('should return NotImplemented Error',
       (done) => {
           const errorTest = errors.notImplemented();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .NotImplemented.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .NotImplemented.description);
           done();
       });
    it('should return NotModified Error',
       (done) => {
           const errorTest = errors.notModified();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .NotModified.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .NotModified.description);
           done();
       });
    it('should return NotSignedUp Error',
       (done) => {
           const errorTest = errors.notSignedUp();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .NotSignedUp.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .NotSignedUp.description);
           done();
       });
    it('should return NoSuchBucketPolicy Error',
       (done) => {
           const errorTest = errors.noSuchBucketPolicy();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .NoSuchBucketPolicy.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .NoSuchBucketPolicy.description);
           done();
       });
    it('should return OperationAborted Error',
       (done) => {
           const errorTest = errors.operationAborted();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .OperationAborted.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .OperationAborted.description);
           done();
       });
    it('should return PermanentRedirect Error',
       (done) => {
           const errorTest = errors.permanentRedirect();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .PermanentRedirect.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .PermanentRedirect.description);
           done();
       });
    it('should return PreconditionFailed Error',
       (done) => {
           const errorTest = errors.preconditionFailed();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .PreconditionFailed.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .PreconditionFailed.description);
           done();
       });
    it('should return Redirect Error',
       (done) => {
           const errorTest = errors.redirect();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .Redirect.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .Redirect.description);
           done();
       });
    it('should return RestoreAlreadyInProgress Error',
       (done) => {
           const errorTest = errors.restoreAlreadyInProgress();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .RestoreAlreadyInProgress.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .RestoreAlreadyInProgress.description);
           done();
       });
    it('should return RequestIsNotMultiPartContent Error',
       (done) => {
           const errorTest = errors.requestIsNotMultiPartContent();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .RequestIsNotMultiPartContent.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .RequestIsNotMultiPartContent.description);
           done();
       });
    it('should return RequestTimeout Error',
       (done) => {
           const errorTest = errors.requestTimeout();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .RequestTimeout.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .RequestTimeout.description);
           done();
       });
    it('should return RequestTimeTooSkewed Error',
       (done) => {
           const errorTest = errors.requestTimeTooSkewed();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .RequestTimeTooSkewed.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .RequestTimeTooSkewed.description);
           done();
       });
    it('should return RequestTorrentOfBucketError Error',
       (done) => {
           const errorTest = errors.requestTorrentOfBucketError();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .RequestTorrentOfBucketError.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .RequestTorrentOfBucketError.description);
           done();
       });
    it('should return SignatureDoesNotMatch Error',
       (done) => {
           const errorTest = errors.signatureDoesNotMatch();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .SignatureDoesNotMatch.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .SignatureDoesNotMatch.description);
           done();
       });
    it('should return ServiceUnavailable Error',
       (done) => {
           const errorTest = errors.serviceUnavailable();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .ServiceUnavailable.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .ServiceUnavailable.description);
           done();
       });
    it('should return SlowDown Error',
       (done) => {
           const errorTest = errors.slowDown();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .SlowDown.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .SlowDown.description);
           done();
       });
    it('should return TemporaryRedirect Error',
       (done) => {
           const errorTest = errors.temporaryRedirect();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .TemporaryRedirect.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .TemporaryRedirect.description);
           done();
       });
    it('should return TokenRefreshRequired Error',
       (done) => {
           const errorTest = errors.tokenRefreshRequired();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .TokenRefreshRequired.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .TokenRefreshRequired.description);
           done();
       });
    it('should return TooManyBuckets Error',
       (done) => {
           const errorTest = errors.tooManyBuckets();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .TooManyBuckets.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .TooManyBuckets.description);
           done();
       });
    it('should return TooManyParts Error',
       (done) => {
           const errorTest = errors.tooManyParts();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .TooManyParts.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .TooManyParts.description);
           done();
       });
    it('should return UnexpectedContent Error',
       (done) => {
           const errorTest = errors.unexpectedContent();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .UnexpectedContent.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .UnexpectedContent.description);
           done();
       });
    it('should return UnresolvableGrantByEmailAddress Error',
       (done) => {
           const errorTest = errors.unresolvableGrantByEmailAddress();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .UnresolvableGrantByEmailAddress.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .UnresolvableGrantByEmailAddress.description);
           done();
       });
    it('should return UserKeyMustBeSpecified Error',
       (done) => {
           const errorTest = errors.userKeyMustBeSpecified();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .UserKeyMustBeSpecified.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .UserKeyMustBeSpecified.description);
           done();
       });
    it('should return NoSuchEntity Error',
       (done) => {
           const errorTest = errors.noSuchEntity();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .NoSuchEntity.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .NoSuchEntity.description);
           done();
       });
    it('should return WrongFormat Error',
       (done) => {
           const errorTest = errors.wrongFormat();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .WrongFormat.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .WrongFormat.description);
           done();
       });
    it('should return Forbidden Error',
       (done) => {
           const errorTest = errors.forbidden();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .Forbidden.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .Forbidden.description);
           done();
       });
    it('should return EntityDoesNotExist Error',
       (done) => {
           const errorTest = errors.entityDoesNotExist();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .EntityDoesNotExist.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .EntityDoesNotExist.description);
           done();
       });
    it('should return EntityAlreadyExists Error',
       (done) => {
           const errorTest = errors.entityAlreadyExists();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .EntityAlreadyExists.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .EntityAlreadyExists.description);
           done();
       });
    it('should return ServiceFailure Error',
       (done) => {
           const errorTest = errors.serviceFailure();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .ServiceFailure.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .ServiceFailure.description);
           done();
       });
    it('should return IncompleteSignature Error',
       (done) => {
           const errorTest = errors.incompleteSignature();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .IncompleteSignature.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .IncompleteSignature.description);
           done();
       });

    it('should return InternalFailure Error',
       (done) => {
           const errorTest = errors.internalFailure();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InternalFailure.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InternalFailure.description);
           done();
       });

    it('should return InvalidAction Error',
       (done) => {
           const errorTest = errors.invalidAction();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidAction.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidAction.description);
           done();
       });

    it('should return InvalidClientTokenId Error',
       (done) => {
           const errorTest = errors.invalidClientTokenId();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidClientTokenId.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidClientTokenId.description);
           done();
       });

    it('should return InvalidParameterCombination Error',
       (done) => {
           const errorTest = errors.invalidParameterCombination();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidParameterCombination.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidParameterCombination.description);
           done();
       });

    it('should return InvalidParameterValue Error',
       (done) => {
           const errorTest = errors.invalidParameterValue();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidParameterValue.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidParameterValue.description);
           done();
       });

    it('should return InvalidQueryParameter Error',
       (done) => {
           const errorTest = errors.invalidQueryParameter();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidQueryParameter.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidQueryParameter.description);
           done();
       });

    it('should return MalformedQueryString Error',
       (done) => {
           const errorTest = errors.malformedQueryString();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .MalformedQueryString.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .MalformedQueryString.description);
           done();
       });

    it('should return MissingAction Error',
       (done) => {
           const errorTest = errors.missingAction();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .MissingAction.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .MissingAction.description);
           done();
       });

    it('should return MissingAuthenticationToken Error',
       (done) => {
           const errorTest = errors.missingAuthenticationToken();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .MissingAuthenticationToken.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .MissingAuthenticationToken.description);
           done();
       });

    it('should return MissingParameter Error',
       (done) => {
           const errorTest = errors.missingParameter();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .MissingParameter.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .MissingParameter.description);
           done();
       });

    it('should return OptInRequired Error',
       (done) => {
           const errorTest = errors.optInRequired();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .OptInRequired.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .OptInRequired.description);
           done();
       });

    it('should return RequestExpired Error',
       (done) => {
           const errorTest = errors.requestExpired();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .RequestExpired.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .RequestExpired.description);
           done();
       });

    it('should return ServiceUnavailable Error',
       (done) => {
           const errorTest = errors.serviceUnavailable();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .ServiceUnavailable.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .ServiceUnavailable.description);
           done();
       });
    it('should return Throttling Error',
       (done) => {
           const errorTest = errors.throttling();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .Throttling.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .Throttling.description);
           done();
       });
    it('should return DeleteConflict Error',
       (done) => {
           const errorTest = errors.deleteConflict();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .DeleteConflict.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .DeleteConflict.description);
           done();
       });
    it('should return LimitExceeded Error',
       (done) => {
           const errorTest = errors.limitExceeded();
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .LimitExceeded.httpCode);
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .LimitExceeded.description);
           done();
       });
});
