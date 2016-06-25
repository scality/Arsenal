'use strict'; // eslint-disable-line strict

const assert = require('assert');
const policyValidator = require('../../../lib/policy/policyValidator');
const errors = require('../../../lib/errors');
const validateUserPolicy = policyValidator.validateUserPolicy;
const successRes = { error: null, valid: true };
const samplePolicy = {
    Version: '2012-10-17',
    Statement: {
        Sid: 'FooBar1234',
        Effect: 'Allow',
        Action: 's3:PutObject',
        Resource: 'arn:aws:s3:::my_bucket/uploads/widgetco/*',
        Condition: { NumericLessThanEquals: { 's3:max-keys': '10' } },
    },
};
let policy;

function failRes(error) {
    return { error, valid: false };
}

function check(input, expected) {
    const result = validateUserPolicy(JSON.stringify(input));
    assert.deepStrictEqual(result, expected);
}

beforeEach(() => {
    policy = JSON.parse(JSON.stringify(samplePolicy));
});

describe('Policies validation - Invalid JSON', () => {
    it('should return error for invalid JSON', () => {
        const result = validateUserPolicy('{"Version":"2012-10-17",' +
        '"Statement":{"Effect":"Allow""Action":"s3:PutObject",' +
        '"Resource":"arn:aws:s3*"}}');
        assert.deepStrictEqual(result, failRes(errors.PolicyInvalidJSON));
    });
});

describe('Policies validation - Version', () => {
    it('should validate with version date 2012-10-17', () => {
        check(policy, successRes);
    });

    it('should return error for other dates', () => {
        policy.Version = '2012-11-17';
        check(policy, failRes(errors.InvalidPolicyDocument));
    });

    it('should return error if Version field is missing', () => {
        policy.Version = undefined;
        check(policy, failRes(errors.MissingPolicyVersion));
    });
});

describe('Policies validation - Statement', () => {
    it('should succeed for a valid object', () => {
        check(policy, successRes);
    });

    it('should succeed for a valid array', () => {
        policy.Statement = [
            {
                Effect: 'Allow',
                Action: 's3:PutObject',
                Resource: 'arn:aws:s3:::my_bucket/uploads/widgetco/*',
            },
            {
                Effect: 'Deny',
                Action: 's3:DeleteObject',
                Resource: 'arn:aws:s3:::my_bucket/uploads/widgetco/*',
            },
        ];
        check(policy, successRes);
    });

    it('should return an error for undefined', () => {
        policy.Statement = undefined;
        check(policy, failRes(errors.MissingPolicyStatement));
    });

    it('should return an error for an empty list', () => {
        policy.Statement = [];
        check(policy, failRes(errors.InvalidPolicyDocument));
    });

    it('should return an error for an empty object', () => {
        policy.Statement = {};
        check(policy, failRes(errors.MissingPolicyAction));
    });

    it('should return an error for missing a required field - Action', () => {
        delete policy.Statement.Action;
        check(policy, failRes(errors.MissingPolicyAction));
    });

    it('should return an error for missing a required field - Effect', () => {
        delete policy.Statement.Effect;
        check(policy, failRes(errors.MissingPolicyEffect));
    });

    it('should return an error for missing a required field - Resource', () => {
        delete policy.Statement.Resource;
        check(policy, failRes(errors.MissingPolicyResource));
    });

    it('should return an error for missing multiple required fields', () => {
        delete policy.Statement.Effect;
        delete policy.Statement.Resource;
        check(policy, failRes(errors.MissingPolicyEffect));
    });

    it('should succeed with optional fields missing - Sid, Condition', () => {
        delete policy.Statement.Sid;
        delete policy.Statement.Condition;
        check(policy, successRes);
    });
});

describe('Policies validation - Statement::Sid_block', () => {
    it('should succeed if Sid is any alphanumeric string', () => {
        check(policy, successRes);
    });

    it('should fail if Sid is not a string', () => {
        policy.Statement.Sid = 1234;
        check(policy, failRes(errors.InvalidPolicyDocument));
    });
});

describe('Policies validation - Statement::Effect_block', () => {
    it('should succeed for Allow', () => {
        check(policy, successRes);
    });

    it('should succeed for Deny', () => {
        policy.Statement.Effect = 'Deny';
        check(policy, successRes);
    });

    it('should fail for strings other than Allow/Deny', () => {
        policy.Statement.Effect = 'Reject';
        check(policy, failRes(errors.InvalidPolicyDocument));
    });

    it('should fail if Effect is not a string', () => {
        policy.Statement.Effect = 1;
        check(policy, failRes(errors.InvalidPolicyDocument));
    });
});

describe('Policies validation - Statement::Action_block', () => {
    it('should succeed for foo:bar', () => {
        policy.Statement.Action = 'foo:bar';
        check(policy, successRes);
    });

    it('should succeed for foo:*', () => {
        policy.Statement.Action = 'foo:*';
        check(policy, successRes);
    });

    it('should succeed for *', () => {
        policy.Statement.Action = '*';
        check(policy, successRes);
    });

    it('should fail for **', () => {
        policy.Statement.Action = '**';
        check(policy, failRes(errors.InvalidPolicyDocument));
    });

    it('should fail for foobar', () => {
        policy.Statement.Action = 'foobar';
        check(policy, failRes(errors.InvalidPolicyDocument));
    });
});

describe('Policies validation - Statement::Resource_block', () => {
    it('should succeed for arn:aws:s3:::*', () => {
        policy.Statement.Resource = 'arn:aws:s3:::*';
        check(policy, successRes);
    });

    it('should succeed for arn:aws:s3:::test/home/${aws:username}', () => {
        policy.Statement.Resource = 'arn:aws:s3:::test/home/${aws:username}';
        check(policy, successRes);
    });

    it('should succeed for arn:aws:ec2:us-west-1:1234qwerty:volume/*', () => {
        policy.Statement.Resource = 'arn:aws:ec2:us-west-1:1234qwerty:volume/*';
        check(policy, successRes);
    });

    it('should succeed for *', () => {
        policy.Statement.Resource = '*';
        check(policy, successRes);
    });

    it('should fail for ec2:us-west-1:1234qwerty:volume/*', () => {
        policy.Statement.Resource = 'ec2:us-west-1:1234qwerty:volume/*';
        check(policy, failRes(errors.InvalidPolicyDocument));
    });
});

describe('Policies validation - Statement::Condition_block', () => {
    it('should succeed for single Condition', () => {
        check(policy, successRes);
    });

    it('should succeed for multiple Conditions', () => {
        policy.Statement.Condition = {
            StringNotLike: { 's3:prefix': ['Development/*'] },
            Null: { 's3:prefix': false },
        };
        check(policy, successRes);
    });

    it('should fail when Condition is not an Object', () => {
        policy.Statement.Condition = 'NumericLessThanEquals';
        check(policy, failRes(errors.InvalidPolicyDocument));
    });

    it('should fail for an invalid Condition', () => {
        policy.Statement.Condition = {
            SomethingLike: { 's3:prefix': ['Development/*'] },
        };
        check(policy, failRes(errors.InvalidPolicyDocument));
    });

    it('should fail when one of the multiple conditions is invalid', () => {
        policy.Statement.Condition = {
            Null: { 's3:prefix': false },
            SomethingLike: { 's3:prefix': ['Development/*'] },
        };
        check(policy, failRes(errors.InvalidPolicyDocument));
    });
});
