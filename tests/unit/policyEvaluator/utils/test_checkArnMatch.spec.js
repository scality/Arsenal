const assert = require('assert');
const checkArnMatch = require('../../../../lib/policyEvaluator/utils/checkArnMatch').default;

const tests = [
    {
        policyArn: 'arn:aws:iam::*:policy/1236-Ng',
        requestArn: 'arn:aws:iam::005978442556:policy/1236-Ng',
        caseSensitive: true,
        isMatch: true,
    },
    {
        policyArn: 'arn:aws:iam::*:policy/1236-Ng',
        requestArn: 'arn:aws:iam::005978442556:policy/1236-Ng',
        caseSensitive: false,
        isMatch: true,
    },
    {
        policyArn: 'arn:aws:iam::*:policy/1236-Ng',
        requestArn: 'arn:aws:iam::005978442556:policy/1236-ng',
        caseSensitive: true,
        isMatch: false,
    },
    {
        policyArn: 'arn:aws:iam::*:policy/1236-Ng',
        requestArn: 'arn:aws:iam::005978442556:policy/1236-ng',
        caseSensitive: false,
        isMatch: true,
    },
    {
        policyArn: 'arn:aws:iam::005978442556:policy/1236-Ng',
        requestArn: 'arn:aws:iam::005978442556:policy/1236-Ng',
        caseSensitive: true,
        isMatch: true,
    },
    {
        policyArn: 'arn:aws:iam::005978442556:policy/1236-Ng',
        requestArn: 'arn:aws:iam::005978442556:policy/1236-Ng',
        caseSensitive: false,
        isMatch: true,
    },
    {
        policyArn: 'arn:aws:iam::005978442556:policy/1236-Ng',
        requestArn: 'arn:aws:iam::005978442556:policy/1236-ng',
        caseSensitive: true,
        isMatch: false,
    },
    {
        policyArn: 'arn:aws:iam::005978442556:policy/1236-Ng',
        requestArn: 'arn:aws:iam::005978442556:policy/1236-ng',
        caseSensitive: false,
        isMatch: true,
    },
    {
        policyArn: 'arn:aws:iam::005978442556:policy/1236-Ng',
        requestArn: 'arn:aws:iam::005978442557:policy/1236-Ng',
        caseSensitive: true,
        isMatch: false,
    },
    {
        policyArn: 'arn:aws:iam::005978442556:policy/1236-Ng',
        requestArn: 'arn:aws:iam::005978442557:policy/1236-Ng',
        caseSensitive: false,
        isMatch: false,
    },
    {
        policyArn: 'arn:aws:iam::005978442556:policy/1236-Ng',
        requestArn: 'arn:aws:iam::005978442557:policy/1236-ng',
        caseSensitive: true,
        isMatch: false,
    },
    {
        policyArn: 'arn:aws:iam::005978442556:policy/1236-Ng',
        requestArn: 'arn:aws:iam::005978442557:policy/1236-ng',
        caseSensitive: false,
        isMatch: false,
    },
    {
        policyArn: 'arn:aws:s3:::bucket/file.txt',
        requestArn: 'arn:aws:s3:::bucket/file.txt',
        caseSensitive: true,
        isMatch: true,
    },
    {
        // '.' in the policy ARN is a literal dot, not a regExp wildcard
        policyArn: 'arn:aws:s3:::bucket/file.txt',
        requestArn: 'arn:aws:s3:::bucket/fileAtxt',
        caseSensitive: true,
        isMatch: false,
    },
    {
        policyArn: 'arn:aws:s3:::bucket/prefix/*',
        requestArn: 'arn:aws:s3:::bucket/prefix/deep/obj',
        caseSensitive: true,
        isMatch: true,
    },
    {
        policyArn: 'arn:aws:s3:::bucket/prefix/*',
        requestArn: 'arn:aws:s3:::bucket/other/obj',
        caseSensitive: true,
        isMatch: false,
    },
    {
        policyArn: 'arn:aws:s3:::bucket/??x',
        requestArn: 'arn:aws:s3:::bucket/abx',
        caseSensitive: true,
        isMatch: true,
    },
    {
        policyArn: 'arn:aws:s3:::bucket/??x',
        requestArn: 'arn:aws:s3:::bucket/ax',
        caseSensitive: true,
        isMatch: false,
    },
    {
        // ${*} is a literal '*', not a wildcard
        policyArn: 'arn:aws:s3:::bucket/${*}',
        requestArn: 'arn:aws:s3:::bucket/*',
        caseSensitive: true,
        isMatch: true,
    },
    {
        policyArn: 'arn:aws:s3:::bucket/${*}',
        requestArn: 'arn:aws:s3:::bucket/x',
        caseSensitive: true,
        isMatch: false,
    },
    {
        // utapi ARNs with an empty account id match any account id
        policyArn: 'arn:scality:utapi:::buckets/foo',
        requestArn: 'arn:scality:utapi::005978442556:buckets/foo',
        caseSensitive: true,
        isMatch: true,
    },
    {
        // other services do not get the empty-account exemption
        policyArn: 'arn:aws:s3:::bucket/foo',
        requestArn: 'arn:aws:s3::005978442556:bucket/foo',
        caseSensitive: true,
        isMatch: false,
    },
    {
        policyArn: 'arn:aws:iam::005978442556:role/path/sub/MyRole',
        requestArn: 'arn:aws:iam::005978442556:role/path/sub/MyRole',
        caseSensitive: true,
        isMatch: true,
    },
];

describe('policyEvaluator checkArnMatch utility function', () => {
    tests.forEach(test => {
        it(
            `Check '${test.requestArn}' against '${test.policyArn}' with case ` +
                `sensitive check ${test.caseSensitive ? 'enabled' : 'disabled'} ` +
                `and it should ${test.isMatch ? 'be' : 'not be'} a match`,
            () => {
                const requestArn = test.requestArn;
                const requestResourceArr = requestArn.split(':');
                const requestRelativeId = requestResourceArr.slice(5).join(':');
                const caseSensitive = test.caseSensitive;
                const result = checkArnMatch(test.policyArn, requestRelativeId, requestResourceArr, caseSensitive);
                assert.deepStrictEqual(result, test.isMatch);
            },
        );
    });
});
