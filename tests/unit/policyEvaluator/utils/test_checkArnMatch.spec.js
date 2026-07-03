const assert = require('assert');
const checkArnMatch = require('../../../../lib/policyEvaluator/utils/checkArnMatch').default;

const tests = [
    {
        policyArn: 'arn:aws:iam::*:policy/1236-Ng',
        requestArn: 'arn:aws:iam::005978442556:policy/1236-Ng',
        isMatch: true,
    },
    {
        // matching is case-sensitive, as on AWS
        policyArn: 'arn:aws:iam::*:policy/1236-Ng',
        requestArn: 'arn:aws:iam::005978442556:policy/1236-ng',
        isMatch: false,
    },
    {
        policyArn: 'arn:aws:iam::005978442556:policy/1236-Ng',
        requestArn: 'arn:aws:iam::005978442556:policy/1236-Ng',
        isMatch: true,
    },
    {
        policyArn: 'arn:aws:iam::005978442556:policy/1236-Ng',
        requestArn: 'arn:aws:iam::005978442556:policy/1236-ng',
        isMatch: false,
    },
    {
        policyArn: 'arn:aws:iam::005978442556:policy/1236-Ng',
        requestArn: 'arn:aws:iam::005978442557:policy/1236-Ng',
        isMatch: false,
    },
    {
        policyArn: 'arn:aws:iam::005978442556:policy/1236-Ng',
        requestArn: 'arn:aws:iam::005978442557:policy/1236-ng',
        isMatch: false,
    },
    {
        // a leading segment differing only by case does not match either
        policyArn: 'arn:aws:IAM::005978442556:policy/1236-Ng',
        requestArn: 'arn:aws:iam::005978442556:policy/1236-Ng',
        isMatch: false,
    },
    {
        policyArn: 'arn:aws:s3:::bucket/file.txt',
        requestArn: 'arn:aws:s3:::bucket/file.txt',
        isMatch: true,
    },
    {
        // '.' in the policy ARN is a literal dot, not a regExp wildcard
        policyArn: 'arn:aws:s3:::bucket/file.txt',
        requestArn: 'arn:aws:s3:::bucket/fileAtxt',
        isMatch: false,
    },
    {
        policyArn: 'arn:aws:s3:::bucket/prefix/*',
        requestArn: 'arn:aws:s3:::bucket/prefix/deep/obj',
        isMatch: true,
    },
    {
        policyArn: 'arn:aws:s3:::bucket/prefix/*',
        requestArn: 'arn:aws:s3:::bucket/other/obj',
        isMatch: false,
    },
    {
        policyArn: 'arn:aws:s3:::bucket/??x',
        requestArn: 'arn:aws:s3:::bucket/abx',
        isMatch: true,
    },
    {
        policyArn: 'arn:aws:s3:::bucket/??x',
        requestArn: 'arn:aws:s3:::bucket/ax',
        isMatch: false,
    },
    {
        // ${*} is a literal '*', not a wildcard
        policyArn: 'arn:aws:s3:::bucket/${*}',
        requestArn: 'arn:aws:s3:::bucket/*',
        isMatch: true,
    },
    {
        policyArn: 'arn:aws:s3:::bucket/${*}',
        requestArn: 'arn:aws:s3:::bucket/x',
        isMatch: false,
    },
    {
        // utapi ARNs with an empty account id match any account id
        policyArn: 'arn:scality:utapi:::buckets/foo',
        requestArn: 'arn:scality:utapi::005978442556:buckets/foo',
        isMatch: true,
    },
    {
        // other services do not get the empty-account exemption
        policyArn: 'arn:aws:s3:::bucket/foo',
        requestArn: 'arn:aws:s3::005978442556:bucket/foo',
        isMatch: false,
    },
    {
        policyArn: 'arn:aws:iam::005978442556:role/path/sub/MyRole',
        requestArn: 'arn:aws:iam::005978442556:role/path/sub/MyRole',
        isMatch: true,
    },
    // relative-ids may legally contain ':' (e.g. S3 object keys)
    {
        policyArn: 'arn:aws:s3:::bucket/a:b',
        requestArn: 'arn:aws:s3:::bucket/a:b',
        isMatch: true,
    },
    {
        policyArn: 'arn:aws:s3:::bucket/data:2024/*',
        requestArn: 'arn:aws:s3:::bucket/data:2024/report.csv',
        isMatch: true,
    },
    {
        policyArn: 'arn:aws:s3:::bucket/a:b:c',
        requestArn: 'arn:aws:s3:::bucket/a:b:c',
        isMatch: true,
    },
    {
        policyArn: 'arn:aws:s3:::bucket/A:B',
        requestArn: 'arn:aws:s3:::bucket/a:b',
        isMatch: false,
    },
    {
        policyArn: 'arn:aws:s3:::bucket/a:b',
        requestArn: 'arn:aws:s3:::bucket/a:c',
        isMatch: false,
    },
    {
        policyArn: 'arn:aws:s3:::bucket/a:b',
        requestArn: 'arn:aws:s3:::bucket/ab',
        isMatch: false,
    },
];

describe('checkArnMatch matcher memoization', () => {
    it('returns consistent results on repeated calls', () => {
        const policyArn = 'arn:aws:s3:::bucket/prefix/*';
        for (let i = 0; i < 3; i++) {
            const requestArn = 'arn:aws:s3:::bucket/prefix/obj';
            const arr = requestArn.split(':');
            assert.strictEqual(checkArnMatch(policyArn, arr.slice(5).join(':'), arr), true);
            const miss = 'arn:aws:s3:::bucket/other/obj'.split(':');
            assert.strictEqual(checkArnMatch(policyArn, miss.slice(5).join(':'), miss), false);
        }
    });

    it('keeps matching correctly across cache eviction', () => {
        const first = 'arn:aws:s3:::bucket-0/key';
        const firstArr = first.split(':');
        assert.strictEqual(checkArnMatch(first, firstArr.slice(5).join(':'), firstArr), true);
        // overflow the 10000-entry LRU so `first` gets evicted
        for (let i = 0; i < 10001; i++) {
            const arn = `arn:aws:s3:::bucket-${i}/key`;
            const arr = arn.split(':');
            checkArnMatch(arn, arr.slice(5).join(':'), arr);
        }
        assert.strictEqual(checkArnMatch(first, firstArr.slice(5).join(':'), firstArr), true);
        const other = 'arn:aws:s3:::bucket-x/other'.split(':');
        assert.strictEqual(checkArnMatch(first, other.slice(5).join(':'), other), false);
    });
});

describe('policyEvaluator checkArnMatch utility function', () => {
    tests.forEach(test => {
        it(
            `Check '${test.requestArn}' against '${test.policyArn}' ` +
                `and it should ${test.isMatch ? 'be' : 'not be'} a match`,
            () => {
                const requestArn = test.requestArn;
                const requestResourceArr = requestArn.split(':');
                const requestRelativeId = requestResourceArr.slice(5).join(':');
                const result = checkArnMatch(test.policyArn, requestRelativeId, requestResourceArr);
                assert.deepStrictEqual(result, test.isMatch);
            },
        );
    });
});
