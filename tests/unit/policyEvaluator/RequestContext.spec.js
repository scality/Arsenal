const assert = require('assert');

const RequestContext = require('../../../lib/policyEvaluator/RequestContext').default;

describe('RequestContext', () => {
    const constructorParams = [
        { 'some-header': 'some-value' }, // headers
        { q1: 'v1', q2: 'v2' }, // query
        'general-resource', // generalResource
        'specific-resource', // specificResource
        '127.0.0.1', // requesterIp
        true, // sslEnabled
        'GET', // apiMethod
        's3', // awsService
        'us-east-1', // locationConstraint
        { // requesterInfo
            arn: 'arn:aws:iam::user/johndoe',
            accountId: 'JOHNACCOUNT',
            username: 'John Doe',
            principalType: 'user',
        },
        'v4', // signatureVersion
        'REST-HEADER', // authType
        123456, // signatureAge
        'security-token', // securityToken
        'arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess', // policyArn
        'objectGet', // action
        'reqTagOne=valueOne&reqTagTwo=valueTwo', // requestObjTags
        'existingTagOne=valueOne&existingTagTwo=valueTwo', // existingObjTag
        true, // needTagEval
    ];
    const rc = new RequestContext(...constructorParams);

    const GetterTests = [
        { name: 'getAction', expectedValue: 'objectGet' },
        { name: 'getResource', expectedValue: 'arn:aws:s3:::general-resource/specific-resource' },
        { name: 'getHeaders', expectedValue: { 'some-header': 'some-value' } },
        { name: 'getQuery', expectedValue: { q1: 'v1', q2: 'v2' } },
        {
            name: 'getRequesterInfo',
            expectedValue: {
                accountId: 'JOHNACCOUNT',
                arn: 'arn:aws:iam::user/johndoe',
                username: 'John Doe',
                principalType: 'user',
            },
        },
        { name: 'getRequesterIp', expectedValueToString: '127.0.0.1' },
        { name: 'getRequesterAccountId', expectedValue: undefined },
        { name: 'getRequesterEndArn', expectedValue: 'arn:aws:iam::user/johndoe' },
        { name: 'getRequesterExternalId', expectedValue: undefined },
        { name: 'getRequesterPrincipalArn', expectedValue: 'arn:aws:iam::user/johndoe' },
        { name: 'getRequesterType', expectedValue: 'user' },
        { name: 'getSslEnabled', expectedValue: true },
        { name: 'getSignatureVersion', expectedValue: 'v4' },
        { name: 'getAuthType', expectedValue: 'REST-HEADER' },
        { name: 'getSignatureAge', expectedValue: 123456 },
        { name: 'getLocationConstraint', expectedValue: 'us-east-1' },
        { name: 'getAwsService', expectedValue: 's3' },
        { name: 'getTokenIssueTime', expectedValue: null },
        { name: 'getMultiFactorAuthPresent', expectedValue: null },
        { name: 'getMultiFactorAuthAge', expectedValue: null },
        { name: 'getSecurityToken', expectedValue: 'security-token' },
        { name: 'getPolicyArn', expectedValue: 'arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess' },
        { name: 'isQuotaCheckNeeded', expectedValue: false },
        { name: 'getRequestObjTags', expectedValue: 'reqTagOne=valueOne&reqTagTwo=valueTwo' },
        { name: 'getExistingObjTag', expectedValue: 'existingTagOne=valueOne&existingTagTwo=valueTwo' },
        { name: 'getNeedTagEval', expectedValue: true },
    ];
    GetterTests.forEach(testCase => {
        it(`getter:${testCase.name}`, () => {
            const getterResult = rc[testCase.name]();
            if (testCase.expectedValueToString) {
                assert.strictEqual(getterResult.toString(), testCase.expectedValueToString);
            } else {
                assert.deepStrictEqual(getterResult, testCase.expectedValue);
            }
        });
    });

    const SerializedFields = {
        action: 'objectGet',
        apiMethod: 'GET',
        authType: 'REST-HEADER',
        awsService: 's3',
        existingObjTag: 'existingTagOne=valueOne&existingTagTwo=valueTwo',
        generalResource: 'general-resource',
        headers: {
            'some-header': 'some-value',
        },
        locationConstraint: 'us-east-1',
        multiFactorAuthAge: null,
        multiFactorAuthPresent: null,
        needTagEval: true,
        policyArn: 'arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess',
        query: {
            q1: 'v1',
            q2: 'v2',
        },
        requesterInfo: {
            accountId: 'JOHNACCOUNT',
            arn: 'arn:aws:iam::user/johndoe',
            principalType: 'user',
            username: 'John Doe',
        },
        requestObjTags: 'reqTagOne=valueOne&reqTagTwo=valueTwo',
        requesterIp: '127.0.0.1',
        securityToken: 'security-token',
        signatureAge: 123456,
        signatureVersion: 'v4',
        specificResource: 'specific-resource',
        sslEnabled: true,
        tokenIssueTime: null,
    };
    it('serialize()', () => {
        assert.deepStrictEqual(JSON.parse(rc.serialize()), SerializedFields);
    });
    it('deSerialize()', () => {
        // check that everything that was serialized is deserialized
        // properly into a new RequestContext object by making sure
        // the serialized version of the latter corresponds to the
        // input
        const serialized = JSON.stringify(SerializedFields);
        const deserializedRC = RequestContext.deSerialize(serialized);
        const newSerialized = JSON.parse(deserializedRC.serialize());
        assert.deepStrictEqual(newSerialized, SerializedFields);
    });
});
