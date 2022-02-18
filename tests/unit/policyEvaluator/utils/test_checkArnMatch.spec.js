const assert = require('assert');
const checkArnMatch
    = require('../../../../lib/policyEvaluator/utils/checkArnMatch');

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
];

describe('policyEvaluator checkArnMatch utility function', () => {
    tests.forEach(test => {
        it(`Check '${test.requestArn}' against '${test.policyArn}' with case ` +
            `sensitive check ${test.caseSensitive ? 'enabled' : 'disabled'} ` +
            `and it should ${test.isMatch ? 'be' : 'not be'} a match`, () => {
            const requestArn = test.requestArn;
            const requestResourceArr = requestArn.split(':');
            const requestRelativeId = requestResourceArr.slice(5).join(':');
            const caseSensitive = test.caseSensitive;
            const result = checkArnMatch(test.policyArn, requestRelativeId,
                requestResourceArr, caseSensitive);
            assert.deepStrictEqual(result, test.isMatch);
        });
    });
});
