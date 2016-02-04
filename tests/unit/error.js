const arsenalErrors = require("../../errors/arsenalErrors.json");

const assert = require('assert');
const crypto = require('crypto');

const errors = require('../../index').Errors;

describe('class errors extended from Error', () => {
    it('should return AccessDenied Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.accessDenied(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .AccessDenied.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .AccessDenied.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.AccessDenied, true,
                                  "errorTest.AccessDenied have to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return AccountProblem Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.accountProblem(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .AccountProblem.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .AccountProblem.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.AccountProblem, true,
                                  "errorTest.AccountProblem have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return AmbiguousGrantByEmailAddress Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.ambiguousGrantByEmailAddress(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .AmbiguousGrantByEmailAddress.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .AmbiguousGrantByEmailAddress.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.AmbiguousGrantByEmailAddress, true,
                                  "errorTest.AmbiguousGrantByEmailAddress " +
                                  "have to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return BadDigest Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.badDigest(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .BadDigest.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .BadDigest.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.BadDigest, true,
                                  "errorTest.BadDigest have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return BucketAlreadyExists Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.bucketAlreadyExists(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .BucketAlreadyExists.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .BucketAlreadyExists.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.BucketAlreadyExists, true,
                                  "errorTest.BucketAlreadyExists have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return BucketAlreadyOwnedByYou Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.bucketAlreadyOwnedByYou(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .BucketAlreadyOwnedByYou.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .BucketAlreadyOwnedByYou.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.BucketAlreadyOwnedByYou, true,
                                  "errorTest.BucketAlreadyOwnedByYou have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return BucketNotEmpty Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.bucketNotEmpty(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .BucketNotEmpty.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .BucketNotEmpty.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.BucketNotEmpty, true,
                                  "errorTest.BucketNotEmpty have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return CredentialsNotSupported Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.credentialsNotSupported(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .CredentialsNotSupported.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .CredentialsNotSupported.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.CredentialsNotSupported, true,
                                  "errorTest.CredentialsNotSupported have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return CrossLocationLoggingProhibited Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.crossLocationLoggingProhibited(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .CrossLocationLoggingProhibited.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .CrossLocationLoggingProhibited.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.CrossLocationLoggingProhibited,
                                  true, "errorTest.CrossLocationLoggingProhib" +
                                  "ited have to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return DeleteConflict Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.deleteConflict(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .DeleteConflict.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .DeleteConflict.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.DeleteConflict, true,
                                  "errorTest.DeleteConflict have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return EntityTooSmall Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.entityTooSmall(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .EntityTooSmall.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .EntityTooSmall.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.EntityTooSmall, true,
                                  "errorTest.EntityTooSmall have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return EntityTooLarge Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.entityTooLarge(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .EntityTooLarge.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .EntityTooLarge.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.EntityTooLarge, true,
                                  "errorTest.EntityTooLarge have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return ExpiredToken Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.expiredToken(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .ExpiredToken.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .ExpiredToken.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.ExpiredToken, true,
                                  "errorTest.ExpiredToken have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return IllegalVersioningConfigurationException Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors
                 .illegalVersioningConfigurationException(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .IllegalVersioningConfigurationException
                                  .httpCode, "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .IllegalVersioningConfigurationException
                                  .description, "Not the good description");
           assert.deepStrictEqual(errorTest
                                  .IllegalVersioningConfigurationException,
                                  true, "errorTest.IllegalVersioningConfigur" +
                                  "ationException have to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return IncompleteBody Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.incompleteBody(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .IncompleteBody.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .IncompleteBody.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.IncompleteBody, true,
                                  "errorTest.IncompleteBody have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return IncorrectNumberOfFilesInPostRequest Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors
                 .incorrectNumberOfFilesInPostRequest(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .IncorrectNumberOfFilesInPostRequest.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .IncorrectNumberOfFilesInPostRequest
                                  .description, "Not the good description");
           assert.deepStrictEqual(errorTest.IncorrectNumberOfFilesInPostRequest,
                                  true, "errorTest.IncorrectNumberOfFilesInPo" +
                                  "stRequest have to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return InlineDataTooLarge Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.inlineDataTooLarge(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InlineDataTooLarge.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InlineDataTooLarge.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.InlineDataTooLarge, true,
                                  "errorTest.InlineDataTooLarge have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return InternalError Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.internalError(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InternalError.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InternalError.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.InternalError, true,
                                  "errorTest.InternalError have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return InvalidAccessKeyId Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.invalidAccessKeyId(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidAccessKeyId.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidAccessKeyId.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.InvalidAccessKeyId, true,
                                  "errorTest.InvalidAccessKeyId have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return InvalidAddressingHeader Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.invalidAddressingHeader(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidAddressingHeader.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidAddressingHeader.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.InvalidAddressingHeader, true,
                                  "errorTest.InvalidAddressingHeader have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return InvalidArgument Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.invalidArgument(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidArgument.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidArgument.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.InvalidArgument, true,
                                  "errorTest.InvalidArgument have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return InvalidBucketName Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.invalidBucketName(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidBucketName.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidBucketName.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.InvalidBucketName, true,
                                  "errorTest.InvalidBucketName have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return InvalidBucketState Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.invalidBucketState(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidBucketState.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidBucketState.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.InvalidBucketState, true,
                                  "errorTest.InvalidBucketState have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return InvalidDigest Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.invalidDigest(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidDigest.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidDigest.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.InvalidDigest, true,
                                  "errorTest.InvalidDigest have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return InvalidEncryptionAlgorithmError Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.invalidEncryptionAlgorithmError(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidEncryptionAlgorithmError.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidEncryptionAlgorithmError.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.InvalidEncryptionAlgorithmError,
                                  true, "errorTest.InvalidEncryptionAlgorithm" +
                                  "Error have to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return InvalidLocationConstraint Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.invalidLocationConstraint(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidLocationConstraint.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidLocationConstraint.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.InvalidLocationConstraint, true,
                                  "errorTest.InvalidLocationConstraint have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return InvalidObjectState Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.invalidObjectState(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidObjectState.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidObjectState.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.InvalidObjectState, true,
                                  "errorTest.InvalidObjectState have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return InvalidPart Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.invalidPart(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidPart.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidPart.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.InvalidPart, true,
                                  "errorTest.InvalidPart have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return InvalidPartOrder Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.invalidPartOrder(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidPartOrder.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidPartOrder.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.InvalidPartOrder, true,
                                  "errorTest.InvalidPartOrder have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return InvalidPayer Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.invalidPayer(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidPayer.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidPayer.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.InvalidPayer, true,
                                  "errorTest.InvalidPayer have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return InvalidPolicyDocument Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.invalidPolicyDocument(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidPolicyDocument.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidPolicyDocument.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.InvalidPolicyDocument, true,
                                  "errorTest.InvalidPolicyDocument have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return InvalidRange Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.invalidRange(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidRange.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidRange.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.InvalidRange, true,
                                  "errorTest.InvalidRange have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return InvalidRequest Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.invalidRequest(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidRequest.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidRequest.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.InvalidRequest, true,
                                  "errorTest.InvalidRequest have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return InvalidSecurity Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.invalidSecurity(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidSecurity.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidSecurity.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.InvalidSecurity, true,
                                  "errorTest.InvalidSecurity have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return InvalidSOAPRequest Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.invalidSOAPRequest(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidSOAPRequest.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidSOAPRequest.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.InvalidSOAPRequest, true,
                                  "errorTest.InvalidSOAPRequest have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return InvalidStorageClass Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.invalidStorageClass(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidStorageClass.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidStorageClass.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.InvalidStorageClass, true,
                                  "errorTest.InvalidStorageClass have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return InvalidTargetBucketForLogging Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.invalidTargetBucketForLogging(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidTargetBucketForLogging.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidTargetBucketForLogging.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.InvalidTargetBucketForLogging, true,
                                  "errorTest.InvalidTargetBucketForLogging ha" +
                                  "ve to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return InvalidToken Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.invalidToken(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidToken.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidToken.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.InvalidToken, true,
                                  "errorTest.InvalidToken have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return InvalidURI Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.invalidURI(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidURI.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidURI.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.InvalidURI, true,
                                  "errorTest.InvalidURI have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return KeyTooLong Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.keyTooLong(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .KeyTooLong.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .KeyTooLong.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.KeyTooLong, true,
                                  "errorTest.KeyTooLong have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return LimitExceeded Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.limitExceeded(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .LimitExceeded.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .LimitExceeded.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.LimitExceeded, true,
                                  "errorTest.LimitExceeded have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return MalformedACLError Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.malformedACLError(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .MalformedACLError.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .MalformedACLError.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.MalformedACLError, true,
                                  "errorTest.MalformedACLError have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return MalformedPOSTRequest Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.malformedPOSTRequest(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .MalformedPOSTRequest.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .MalformedPOSTRequest.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.MalformedPOSTRequest, true,
                                  "errorTest.MalformedPOSTRequest have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return MalformedXML Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.malformedXML(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .MalformedXML.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .MalformedXML.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.MalformedXML, true,
                                  "errorTest.MalformedXML have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return MaxMessageLengthExceeded Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.maxMessageLengthExceeded(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .MaxMessageLengthExceeded.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .MaxMessageLengthExceeded.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.MaxMessageLengthExceeded, true,
                                  "errorTest.MaxMessageLengthExceeded have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return MaxPostPreDataLengthExceededError Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.maxPostPreDataLengthExceededError(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .MaxPostPreDataLengthExceededError.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .MaxPostPreDataLengthExceededError
                                  .description, "Not the good description");
           assert.deepStrictEqual(errorTest.MaxPostPreDataLengthExceededError,
                                  true, "errorTest.MaxPostPreDataLengthExcee" +
                                  "dedError have to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return MetadataTooLarge Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.metadataTooLarge(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .MetadataTooLarge.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .MetadataTooLarge.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.MetadataTooLarge, true,
                                  "errorTest.MetadataTooLarge have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return MethodNotAllowed Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.methodNotAllowed(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .MethodNotAllowed.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .MethodNotAllowed.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.MethodNotAllowed, true,
                                  "errorTest.MethodNotAllowed have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return MissingAttachment Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.missingAttachment(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .MissingAttachment.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .MissingAttachment.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.MissingAttachment, true,
                                  "errorTest.MissingAttachment have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return MissingContentLength Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.missingContentLength(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .MissingContentLength.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .MissingContentLength.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.MissingContentLength, true,
                                  "errorTest.MissingContentLength have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return MissingRequestBodyError Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.missingRequestBodyError(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .MissingRequestBodyError.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .MissingRequestBodyError.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.MissingRequestBodyError, true,
                                  "errorTest.MissingRequestBodyError have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return MissingSecurityElement Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.missingSecurityElement(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .MissingSecurityElement.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .MissingSecurityElement.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.MissingSecurityElement, true,
                                  "errorTest.MissingSecurityElement have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return MissingSecurityHeader Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.missingSecurityHeader(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .MissingSecurityHeader.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .MissingSecurityHeader.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.MissingSecurityHeader, true,
                                  "errorTest.MissingSecurityHeader have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return NoLoggingStatusForKey Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.noLoggingStatusForKey(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .NoLoggingStatusForKey.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .NoLoggingStatusForKey.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.NoLoggingStatusForKey, true,
                                  "errorTest.NoLoggingStatusForKey have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return NoSuchBucket Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.noSuchBucket(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .NoSuchBucket.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .NoSuchBucket.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.NoSuchBucket, true,
                                  "errorTest.NoSuchBucket have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return NoSuchKey Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.noSuchKey(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .NoSuchKey.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .NoSuchKey.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.NoSuchKey, true,
                                  "errorTest.NoSuchKey have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return NoSuchLifecycleConfiguration Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.noSuchLifecycleConfiguration(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .NoSuchLifecycleConfiguration.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .NoSuchLifecycleConfiguration.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.NoSuchLifecycleConfiguration, true,
                                  "errorTest.NoSuchLifecycleConfiguration " +
                                  "have to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return NoSuchUpload Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.noSuchUpload(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .NoSuchUpload.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .NoSuchUpload.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.NoSuchUpload, true,
                                  "errorTest.NoSuchUpload have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return NoSuchVersion Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.noSuchVersion(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .NoSuchVersion.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .NoSuchVersion.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.NoSuchVersion, true,
                                  "errorTest.NoSuchVersion have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return NotImplemented Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.notImplemented(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .NotImplemented.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .NotImplemented.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.NotImplemented, true,
                                  "errorTest.NotImplemented have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return NotModified Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.notModified(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .NotModified.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .NotModified.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.NotModified, true,
                                  "errorTest.NotModified have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return NotSignedUp Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.notSignedUp(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .NotSignedUp.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .NotSignedUp.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.NotSignedUp, true,
                                  "errorTest.NotSignedUp have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return NoSuchBucketPolicy Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.noSuchBucketPolicy(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .NoSuchBucketPolicy.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .NoSuchBucketPolicy.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.NoSuchBucketPolicy, true,
                                  "errorTest.NoSuchBucketPolicy have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return OperationAborted Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.operationAborted(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .OperationAborted.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .OperationAborted.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.OperationAborted, true,
                                  "errorTest.OperationAborted have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return PermanentRedirect Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.permanentRedirect(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .PermanentRedirect.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .PermanentRedirect.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.PermanentRedirect, true,
                                  "errorTest.PermanentRedirect have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return PreconditionFailed Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.preconditionFailed(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .PreconditionFailed.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .PreconditionFailed.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.PreconditionFailed, true,
                                  "errorTest.PreconditionFailed have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return Redirect Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.redirect(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .Redirect.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .Redirect.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.Redirect, true,
                                  "errorTest.Redirect have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return RestoreAlreadyInProgress Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.restoreAlreadyInProgress(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .RestoreAlreadyInProgress.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .RestoreAlreadyInProgress.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.RestoreAlreadyInProgress, true,
                                  "errorTest.RestoreAlreadyInProgress have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return RequestIsNotMultiPartContent Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.requestIsNotMultiPartContent(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .RequestIsNotMultiPartContent.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .RequestIsNotMultiPartContent.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.RequestIsNotMultiPartContent, true,
                                  "errorTest.RequestIsNotMultiPartContent " +
                                  "have to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return RequestTimeout Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.requestTimeout(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .RequestTimeout.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .RequestTimeout.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.RequestTimeout, true,
                                  "errorTest.RequestTimeout have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return RequestTimeTooSkewed Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.requestTimeTooSkewed(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .RequestTimeTooSkewed.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .RequestTimeTooSkewed.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.RequestTimeTooSkewed, true,
                                  "errorTest.RequestTimeTooSkewed have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return RequestTorrentOfBucketError Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.requestTorrentOfBucketError(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .RequestTorrentOfBucketError.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .RequestTorrentOfBucketError.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.RequestTorrentOfBucketError, true,
                                  "errorTest.RequestTorrentOfBucketError have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return SignatureDoesNotMatch Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.signatureDoesNotMatch(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .SignatureDoesNotMatch.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .SignatureDoesNotMatch.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.SignatureDoesNotMatch, true,
                                  "errorTest.SignatureDoesNotMatch have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return ServiceUnavailable Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.serviceUnavailable(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .ServiceUnavailable.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .ServiceUnavailable.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.ServiceUnavailable, true,
                                  "errorTest.ServiceUnavailable have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return ServiceUnavailable Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.serviceUnavailable(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .ServiceUnavailable.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .ServiceUnavailable.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.ServiceUnavailable, true,
                                  "errorTest.ServiceUnavailable have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return SlowDown Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.slowDown(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .SlowDown.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .SlowDown.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.SlowDown, true,
                                  "errorTest.SlowDown have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return TemporaryRedirect Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.temporaryRedirect(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .TemporaryRedirect.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .TemporaryRedirect.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.TemporaryRedirect, true,
                                  "errorTest.TemporaryRedirect have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return TokenRefreshRequired Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.tokenRefreshRequired(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .TokenRefreshRequired.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .TokenRefreshRequired.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.TokenRefreshRequired, true,
                                  "errorTest.TokenRefreshRequired have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return TooManyBuckets Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.tooManyBuckets(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .TooManyBuckets.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .TooManyBuckets.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.TooManyBuckets, true,
                                  "errorTest.TooManyBuckets have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return TooManyParts Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.tooManyParts(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .TooManyParts.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .TooManyParts.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.TooManyParts, true,
                                  "errorTest.TooManyParts have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return UnexpectedContent Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.unexpectedContent(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .UnexpectedContent.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .UnexpectedContent.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.UnexpectedContent, true,
                                  "errorTest.UnexpectedContent have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return UnresolvableGrantByEmailAddress Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.unresolvableGrantByEmailAddress(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .UnresolvableGrantByEmailAddress.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .UnresolvableGrantByEmailAddress.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.UnresolvableGrantByEmailAddress,
                                  true, "errorTest.UnresolvableGrantByEmailAd" +
                                  "dress have to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return UserKeyMustBeSpecified Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.userKeyMustBeSpecified(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .UserKeyMustBeSpecified.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .UserKeyMustBeSpecified.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.UserKeyMustBeSpecified, true,
                                  "errorTest.UserKeyMustBeSpecified have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return NoSuchEntity Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.noSuchEntity(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .NoSuchEntity.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .NoSuchEntity.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.NoSuchEntity, true,
                                  "errorTest.NoSuchEntity have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return WrongFormat Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.wrongFormat(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .WrongFormat.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .WrongFormat.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.WrongFormat, true,
                                  "errorTest.WrongFormat have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return Forbidden Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.forbidden(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .Forbidden.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .Forbidden.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.Forbidden, true,
                                  "errorTest.Forbidden have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return EntityDoesNotExist Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.entityDoesNotExist(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .EntityDoesNotExist.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .EntityDoesNotExist.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.EntityDoesNotExist, true,
                                  "errorTest.EntityDoesNotExist have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return EntityAlreadyExists Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.entityAlreadyExists(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .EntityAlreadyExists.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .EntityAlreadyExists.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.EntityAlreadyExists, true,
                                  "errorTest.EntityAlreadyExists have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return ServiceFailure Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.serviceFailure(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .ServiceFailure.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .ServiceFailure.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.ServiceFailure, true,
                                  "errorTest.ServiceFailure have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return IncompleteSignature Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.incompleteSignature(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .IncompleteSignature.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .IncompleteSignature.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.IncompleteSignature, true,
                                  "errorTest.IncompleteSignature have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return InternalFailure Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.internalFailure(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InternalFailure.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InternalFailure.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.InternalFailure, true,
                                  "errorTest.InternalFailure have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return InvalidAction Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.invalidAction(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidAction.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidAction.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.InvalidAction, true,
                                  "errorTest.InvalidAction have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return InvalidClientTokenId Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.invalidClientTokenId(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidClientTokenId.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidClientTokenId.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.InvalidClientTokenId, true,
                                  "errorTest.InvalidClientTokenId have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return InvalidParameterCombination Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.invalidParameterCombination(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidParameterCombination.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidParameterCombination.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.InvalidParameterCombination, true,
                                  "errorTest.InvalidParameterCombination have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return InvalidParameterValue Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.invalidParameterValue(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidParameterValue.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidParameterValue.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.InvalidParameterValue, true,
                                  "errorTest.InvalidParameterValue have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return InvalidQueryParameter Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.invalidQueryParameter(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .InvalidQueryParameter.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .InvalidQueryParameter.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.InvalidQueryParameter, true,
                                  "errorTest.InvalidQueryParameter have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return MalformedQueryString Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.malformedQueryString(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .MalformedQueryString.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .MalformedQueryString.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.MalformedQueryString, true,
                                  "errorTest.MalformedQueryString have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return MissingAction Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.missingAction(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .MissingAction.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .MissingAction.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.MissingAction, true,
                                  "errorTest.MissingAction have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return MissingAuthenticationToken Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.missingAuthenticationToken(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .MissingAuthenticationToken.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .MissingAuthenticationToken.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.MissingAuthenticationToken, true,
                                  "errorTest.MissingAuthenticationToken have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return MissingParameter Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.missingParameter(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .MissingParameter.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .MissingParameter.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.MissingParameter, true,
                                  "errorTest.MissingParameter have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return OptInRequired Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.optInRequired(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .OptInRequired.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .OptInRequired.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.OptInRequired, true,
                                  "errorTest.OptInRequired have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return RequestExpired Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.requestExpired(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .RequestExpired.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .RequestExpired.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.RequestExpired, true,
                                  "errorTest.RequestExpired have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
    it('should return Throttling Error',
       (done) => {
           const details = crypto.randomBytes(40).toString("utf8");
           const errorTest = errors.throttling(details);
           assert.deepStrictEqual(errorTest instanceof Error, true,
                                  "errorTest must be an instance of Error");
           assert.deepStrictEqual(errorTest.code, arsenalErrors
                                  .Throttling.httpCode,
                                  "Wrong httpCode");
           assert.deepStrictEqual(errorTest.description, arsenalErrors
                                  .Throttling.description,
                                  "Not the good description");
           assert.deepStrictEqual(errorTest.Throttling, true,
                                  "errorTest.Throttling have" +
                                  "to be true");
           assert.deepStrictEqual(errorTest.details, details,
                                  "details not match");
           done();
       });
});
