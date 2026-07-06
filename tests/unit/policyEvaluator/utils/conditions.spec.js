'use strict';

const assert = require('assert');

const { findConditionKey } = require('../../../../lib/policyEvaluator/utils/conditions');
const RequestContext = require('../../../../lib/policyEvaluator/RequestContext').default;

describe('policyEvaluator utils: findConditionKey', () => {
    const headers = {
        referer: 'http://example.com',
        'user-agent': 'aws-sdk-js/2.0',
        'x-amz-acl': 'public-read',
        'x-amz-grant-read': 'id=canonical-id-read',
        'x-amz-grant-write': 'id=canonical-id-write',
        'x-amz-grant-read-acp': 'id=canonical-id-read-acp',
        'x-amz-grant-write-acp': 'id=canonical-id-write-acp',
        'x-amz-grant-full-control': 'id=canonical-id-full-control',
        'x-amz-copy-source': 'sourcebucket/sourcekey',
        'metadata-directive': 'REPLACE',
        'x-amz-server-side-encryption': 'AES256',
        'x-amz-storage-class': 'STANDARD',
        'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
        'x-amz-meta-scal-location-constraint': 'us-east-2',
    };
    const query = {
        versionId: 'version-id-1',
        delimiter: '/',
        'max-keys': '100',
        prefix: 'photos/',
    };
    const requesterInfo = {
        arn: 'arn:aws:iam::123456789012:user/johndoe',
        accountid: '123456789012',
        principaltype: 'User',
        userid: 'USERID123',
        username: 'johndoe',
        keycloakGroup: 'storage-admins',
        keycloakRole: 'storage-manager',
    };

    let requestContext;

    beforeEach(() => {
        requestContext = new RequestContext(
            headers,
            query,
            'mybucket', // generalResource
            'mykey', // specificResource
            '127.0.0.1', // requesterIp
            true, // sslEnabled
            'objectPut', // apiMethod
            's3', // awsService
            'us-east-1', // locationConstraint
            requesterInfo,
            'AWS4-HMAC-SHA256', // signatureVersion
            'REST-HEADER', // authType
            123456, // signatureAge
            'security-token', // securityToken
            'arn:aws:iam::aws:policy/AmazonS3FullAccess', // policyArn
            'objectPut', // action
            'reqTag=reqValue', // requestObjTags
            'existingTag=existingValue', // existingObjTag
            true, // needTagEval
            30, // objectLockRetentionDays
        );
    });

    const staticCases = [
        ['aws:principaltype', requesterInfo.principaltype],
        ['aws:referer', headers.referer],
        ['aws:SecureTransport', 'true'],
        ['aws:SourceArn', undefined],
        ['aws:SourceVpc', undefined],
        ['aws:SourceVpce', undefined],
        ['aws:UserAgent', headers['user-agent']],
        ['aws:userid', requesterInfo.userid],
        ['aws:username', requesterInfo.username],
        ['s3:x-amz-acl', headers['x-amz-acl']],
        ['s3:x-amz-grant-read', headers['x-amz-grant-read']],
        ['s3:x-amz-grant-write', headers['x-amz-grant-write']],
        ['s3:x-amz-grant-read-acp', headers['x-amz-grant-read-acp']],
        ['s3:x-amz-grant-write-acp', headers['x-amz-grant-write-acp']],
        ['s3:x-amz-grant-full-control', headers['x-amz-grant-full-control']],
        ['s3:x-amz-copy-source', headers['x-amz-copy-source']],
        ['s3:x-amz-metadata-directive', headers['metadata-directive']],
        ['s3:x-amz-server-side-encryption', headers['x-amz-server-side-encryption']],
        ['s3:x-amz-storage-class', headers['x-amz-storage-class']],
        ['s3:VersionId', query.versionId],
        ['s3:LocationConstraint', 'us-east-1'],
        ['s3:delimiter', query.delimiter],
        ['s3:max-keys', query['max-keys']],
        ['s3:prefix', query.prefix],
        ['s3:signatureversion', 'AWS4-HMAC-SHA256'],
        ['s3:authType', 'REST-HEADER'],
        ['s3:signatureAge', 123456],
        ['s3:x-amz-content-sha256', headers['x-amz-content-sha256']],
        ['s3:ObjLocationConstraint', headers['x-amz-meta-scal-location-constraint']],
        ['keycloak:groups', requesterInfo.keycloakGroup],
        ['keycloak:roles', requesterInfo.keycloakRole],
        ['iam:PolicyArn', 'arn:aws:iam::aws:policy/AmazonS3FullAccess'],
        ['unsupported:ConditionKey', undefined],
    ];

    staticCases.forEach(([key, expected]) => {
        it(`should return the expected value for ${key}`, () => {
            assert.deepStrictEqual(findConditionKey(key, requestContext), expected);
        });
    });

    it('should return an ISO date string for aws:CurrentTime', () => {
        const value = findConditionKey('aws:CurrentTime', requestContext);
        assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should return an epoch string for aws:EpochTime', () => {
        const value = findConditionKey('aws:EpochTime', requestContext);
        assert.match(value, /^\d+$/);
    });

    it('should return the token issue time for aws:TokenIssueTime', () => {
        requestContext.setTokenIssueTime('1633046400000');
        assert.strictEqual(findConditionKey('aws:TokenIssueTime', requestContext), '1633046400000');
    });

    it('should return the MFA presence for aws:MultiFactorAuthPresent', () => {
        requestContext.setMultiFactorAuthPresent(true);
        assert.strictEqual(findConditionKey('aws:MultiFactorAuthPresent', requestContext), true);
    });

    it('should return the MFA age for aws:MultiFactorAuthAge', () => {
        requestContext.setMultiFactorAuthAge(600);
        assert.strictEqual(findConditionKey('aws:MultiFactorAuthAge', requestContext), 600);
    });

    it('should return the requester IP for aws:SourceIp', () => {
        assert.strictEqual(findConditionKey('aws:SourceIp', requestContext).toString(), '127.0.0.1');
    });

    it('should return the external id for sts:ExternalId', () => {
        assert.strictEqual(findConditionKey('sts:ExternalId', requestContext), undefined);
    });

    it('should return the existing object tag when tag evaluation is needed', () => {
        assert.strictEqual(findConditionKey('s3:ExistingObjectTag', requestContext), 'existingTag=existingValue');
    });

    it('should skip s3:ExistingObjectTag when tag evaluation is not needed', () => {
        requestContext.setNeedTagEval(false);
        assert.strictEqual(findConditionKey('s3:ExistingObjectTag', requestContext), undefined);
    });

    it('should return the request object tags for s3:RequestObjectTagKey', () => {
        assert.strictEqual(findConditionKey('s3:RequestObjectTagKey', requestContext), 'reqTag=reqValue');
    });

    it('should skip s3:RequestObjectTagKey when tag evaluation is not needed', () => {
        requestContext.setNeedTagEval(false);
        assert.strictEqual(findConditionKey('s3:RequestObjectTagKey', requestContext), undefined);
    });

    it('should return the request object tag keys for s3:RequestObjectTagKeys', () => {
        assert.deepStrictEqual(findConditionKey('s3:RequestObjectTagKeys', requestContext), ['reqTag']);
    });

    it('should skip s3:RequestObjectTagKeys when tag evaluation is not needed', () => {
        requestContext.setNeedTagEval(false);
        assert.strictEqual(findConditionKey('s3:RequestObjectTagKeys', requestContext), undefined);
    });

    it('should return the retention days for s3:object-lock-remaining-retention-days', () => {
        assert.strictEqual(findConditionKey('s3:object-lock-remaining-retention-days', requestContext), 30);
    });
});
