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

describe('checkArnMatch matcher memoization', () => {
    it('returns consistent results on repeated calls', () => {
        const policyArn = 'arn:aws:s3:::bucket/prefix/*';
        for (let i = 0; i < 3; i++) {
            const requestArn = 'arn:aws:s3:::bucket/prefix/obj';
            const arr = requestArn.split(':');
            assert.strictEqual(checkArnMatch(policyArn, arr.slice(5).join(':'), arr, true), true);
            const miss = 'arn:aws:s3:::bucket/other/obj'.split(':');
            assert.strictEqual(checkArnMatch(policyArn, miss.slice(5).join(':'), miss, true), false);
        }
    });

    it('keeps matching correctly across cache eviction', () => {
        const first = 'arn:aws:s3:::bucket-0/key';
        const firstArr = first.split(':');
        assert.strictEqual(checkArnMatch(first, firstArr.slice(5).join(':'), firstArr, true), true);
        // overflow the 10000-entry LRU so `first` gets evicted
        for (let i = 0; i < 10001; i++) {
            const arn = `arn:aws:s3:::bucket-${i}/key`;
            const arr = arn.split(':');
            checkArnMatch(arn, arr.slice(5).join(':'), arr, true);
        }
        assert.strictEqual(checkArnMatch(first, firstArr.slice(5).join(':'), firstArr, true), true);
        const other = 'arn:aws:s3:::bucket-x/other'.split(':');
        assert.strictEqual(checkArnMatch(first, other.slice(5).join(':'), other, true), false);
    });
});

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
