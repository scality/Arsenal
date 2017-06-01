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

const errDict = {
    required: {
        Version: 'Policy document must be version 2012-10-17 or greater.',
        Action: 'Policy statement must contain actions.',
    },
    pattern: {
        Action: 'Actions/Conditions must be prefaced by a vendor,' +
            ' e.g., iam, sdb, ec2, etc.',
        Resource: 'Resource must be in ARN format or "*".',
    },
    minItems: {
        Resource: 'Policy statement must contain resources.',
    },
};
let policy;

function failRes(errDescription) {
    const error = Object.assign({}, errors.MalformedPolicyDocument);
    error.description = errDescription || error.description;
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
        assert.deepStrictEqual(result, failRes());
    });
});

describe('Policies validation - Version', () => {
    it('should validate with version date 2012-10-17', () => {
        check(policy, successRes);
    });

    it('should return error for other dates', () => {
        policy.Version = '2012-11-17';
        check(policy, failRes());
    });

    it('should return error if Version field is missing', () => {
        policy.Version = undefined;
        check(policy, failRes(errDict.required.Version));
    });
});

describe('Policies validation - Principal', () => {
    [
        {
            name: 'an account id',
            value: { AWS: '111111111111' },
        },
        {
            name: 'anonymous user AWS form',
            value: { AWS: '*' },
        },
        {
            name: 'an account arn',
            value: { AWS: 'arn:aws:iam::111111111111:root' },
        },
        {
            name: 'multiple account id',
            value: {
                AWS: ['111111111111', '111111111112'],
            },
        },
        {
            name: 'multiple account arn',
            value: {
                AWS: [
                    'arn:aws:iam::111111111111:root',
                    'arn:aws:iam::111111111112:root',
                ],
            },
        },
        {
            name: 'anonymous user as string',
            value: '*',
        },
        {
            name: 'user arn',
            value: { AWS: 'arn:aws:iam::111111111111:user/alex' },
        },
        {
            name: 'multiple user arns',
            value: {
                AWS: [
                    'arn:aws:iam::111111111111:user/alex',
                    'arn:aws:iam::111111111111:user/thibault',
                ],
            },
        },
        {
            name: 'role arn',
            value: {
                AWS: 'arn:aws:iam::111111111111:role/dev',
            },
        },
        {
            name: 'multiple role arn',
            value: {
                AWS: [
                    'arn:aws:iam::111111111111:role/dev',
                    'arn:aws:iam::111111111111:role/prod',
                ],
            },
        },
        {
            name: 'saml provider',
            value: {
                Federated:
                    'arn:aws:iam::111111111111:saml-provider/mysamlprovider',
            },
        },
        {
            name: 'with backbeat service',
            value: { Service: 'backbeat' },
        },
    ].forEach(test => {
        it(`should allow principal field with ${test.name}`, () => {
            policy.Statement.Principal = test.value;
            delete policy.Statement.Resource;
            check(policy, successRes);
        });

        it(`shoud allow notPrincipal field with ${test.name}`, () => {
            policy.Statement.NotPrincipal = test.value;
            delete policy.Statement.Resource;
            check(policy, successRes);
        });
    });

    [
        {
            name: 'wrong format account id',
            value: { AWS: '11111111111z' },
        },
        {
            name: 'empty string',
            value: '',
        },
        {
            name: 'anonymous user federated form',
            value: { federated: '*' },
        },
        {
            name: 'wildcard in ressource',
            value: { AWS: 'arn:aws:iam::111111111111:user/*' },
        },
        {
            name: 'a malformed account arn',
            value: { AWS: 'arn:aws:iam::111111111111:' },
        },
        {
            name: 'multiple malformed account id',
            value: {
                AWS: ['1111111111z1', '1111z1111112'],
            },
        },
        {
            name: 'multiple anonymous',
            value: {
                AWS: ['*', '*'],
            },
        },
        {
            name: 'multiple malformed account arn',
            value: {
                AWS: [
                    'arn:aws:iam::111111111111:root',
                    'arn:aws:iam::111111111112:',
                ],
            },
        },
        {
            name: 'account id as a string',
            value: '111111111111',
        },
        {
            name: 'account arn as a string',
            value: 'arn:aws:iam::111111111111:root',
        },
        {
            name: 'user arn as a string',
            value: 'arn:aws:iam::111111111111:user/alex',
        },
        {
            name: 'multiple malformed user arns',
            value: {
                AWS: [
                    'arn:aws:iam::111111111111:user/alex',
                    'arn:aws:iam::111111111111:user/',
                ],
            },
        },
        {
            name: 'malformed role arn',
            value: {
                AWS: 'arn:aws:iam::111111111111:role/',
            },
        },
        {
            name: 'multiple malformed role arn',
            value: {
                AWS: [
                    'arn:aws:iam::111111111111:role/dev',
                    'arn:aws:iam::11111111z111:role/prod',
                ],
            },
        },
        {
            name: 'saml provider as a string',
            value: 'arn:aws:iam::111111111111:saml-provider/mysamlprovider',
        },
        {
            name: 'with other service than backbeat',
            value: { Service: 'non-existent-service' },
        },
    ].forEach(test => {
        it(`should fail with ${test.name}`, () => {
            policy.Statement.Principal = test.value;
            delete policy.Statement.Resource;
            check(policy, failRes());
        });
    });

    it('should not allow Resource field', () => {
        policy.Statement.Principal = '*';
        check(policy, failRes());
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
        check(policy, failRes());
    });

    it('should return an error for an empty list', () => {
        policy.Statement = [];
        check(policy, failRes());
    });

    it('should return an error for an empty object', () => {
        policy.Statement = {};
        check(policy, failRes(errDict.required.Action));
    });

    it('should return an error for missing a required field - Action', () => {
        delete policy.Statement.Action;
        check(policy, failRes(errDict.required.Action));
    });

    it('should return an error for missing a required field - Effect', () => {
        delete policy.Statement.Effect;
        check(policy, failRes());
    });

    it('should return an error for missing a required field - Resource', () => {
        delete policy.Statement.Resource;
        check(policy, failRes());
    });

    it('should return an error for missing multiple required fields', () => {
        delete policy.Statement.Effect;
        delete policy.Statement.Resource;
        check(policy, failRes());
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

    it('should fail if Sid is not a valid format', () => {
        policy.Statement.Sid = 'foo bar()';
        check(policy, failRes());
    });

    it('should fail if Sid is not a string', () => {
        policy.Statement.Sid = 1234;
        check(policy, failRes());
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
        check(policy, failRes());
    });

    it('should fail if Effect is not a string', () => {
        policy.Statement.Effect = 1;
        check(policy, failRes());
    });
});

describe('Policies validation - Statement::Action_block/' +
    'Statement::NotAction_block', () => {
    beforeEach(() => {
        policy.Statement.Action = undefined;
        policy.Statement.NotAction = undefined;
    });

    it('should succeed for foo:bar', () => {
        policy.Statement.Action = 'foo:bar';
        check(policy, successRes);

        policy.Statement.Action = undefined;
        policy.Statement.NotAction = 'foo:bar';
        check(policy, successRes);
    });

    it('should succeed for foo:*', () => {
        policy.Statement.Action = 'foo:*';
        check(policy, successRes);

        policy.Statement.Action = undefined;
        policy.Statement.NotAction = 'foo:*';
        check(policy, successRes);
    });

    it('should succeed for *', () => {
        policy.Statement.Action = '*';
        check(policy, successRes);

        policy.Statement.Action = undefined;
        policy.Statement.NotAction = '*';
        check(policy, successRes);
    });

    it('should fail for **', () => {
        policy.Statement.Action = '**';
        check(policy, failRes(errDict.pattern.Action));

        policy.Statement.Action = undefined;
        policy.Statement.NotAction = '**';
        check(policy, failRes(errDict.pattern.Action));
    });

    it('should fail for foobar', () => {
        policy.Statement.Action = 'foobar';
        check(policy, failRes(errDict.pattern.Action));

        policy.Statement.Action = undefined;
        policy.Statement.NotAction = 'foobar';
        check(policy, failRes(errDict.pattern.Action));
    });
});

describe('Policies validation - Statement::Resource_block' +
    'Statement::NotResource_block', () => {
    beforeEach(() => {
        policy.Statement.Resource = undefined;
        policy.Statement.NotResource = undefined;
    });

    it('should succeed for arn:aws:s3:::*', () => {
        policy.Statement.Resource = 'arn:aws:s3:::*';
        check(policy, successRes);

        policy.Statement.Resource = undefined;
        policy.Statement.NotResource = 'arn:aws:s3:::*';
        check(policy, successRes);
    });

    it('should succeed for arn:aws:s3:::test/home/${aws:username}', () => {
        policy.Statement.Resource = 'arn:aws:s3:::test/home/${aws:username}';
        check(policy, successRes);

        policy.Statement.Resource = undefined;
        policy.Statement.NotResource = 'arn:aws:s3:::test/home/${aws:username}';
        check(policy, successRes);
    });

    it('should succeed for arn:aws:ec2:us-west-1:1234567890:vol/*', () => {
        policy.Statement.Resource = 'arn:aws:ec2:us-west-1:1234567890:vol/*';
        check(policy, successRes);

        policy.Statement.Resource = undefined;
        policy.Statement.NotResource = 'arn:aws:ec2:us-west-1:1234567890:vol/*';
        check(policy, successRes);
    });

    it('should succeed for *', () => {
        policy.Statement.Resource = '*';
        check(policy, successRes);

        policy.Statement.Resource = undefined;
        policy.Statement.NotResource = '*';
        check(policy, successRes);
    });

    it('should fail for arn:aws:ec2:us-west-1:vol/* - missing region', () => {
        policy.Statement.Resource = 'arn:aws:ec2:1234567890:vol/*';
        check(policy, failRes(errDict.pattern.Resource));

        policy.Statement.Resource = undefined;
        policy.Statement.NotResource = 'arn:aws:ec2:1234567890:vol/*';
        check(policy, failRes(errDict.pattern.Resource));
    });

    it('should fail for arn:aws:ec2:us-west-1:123456789:v/${} - ${}', () => {
        policy.Statement.Resource = 'arn:aws:ec2:us-west-1:123456789:v/${}';
        check(policy, failRes(errDict.pattern.Resource));

        policy.Statement.Resource = undefined;
        policy.Statement.NotResource = 'arn:aws:ec2:us-west-1:123456789:v/${}';
        check(policy, failRes(errDict.pattern.Resource));
    });

    it('should fail for ec2:us-west-1:qwerty:vol/* - missing arn:aws:', () => {
        policy.Statement.Resource = 'ec2:us-west-1:123456789012:vol/*';
        check(policy, failRes(errDict.pattern.Resource));

        policy.Statement.Resource = undefined;
        policy.Statement.NotResource = 'ec2:us-west-1:123456789012:vol/*';
        check(policy, failRes(errDict.pattern.Resource));
    });

    it('should fail for empty list of resources', () => {
        policy.Statement.Resource = [];
        check(policy, failRes(errDict.minItems.Resource));
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
        check(policy, failRes());
    });

    it('should fail for an invalid Condition', () => {
        policy.Statement.Condition = {
            SomethingLike: { 's3:prefix': ['Development/*'] },
        };
        check(policy, failRes());
    });

    it('should fail when one of the multiple conditions is invalid', () => {
        policy.Statement.Condition = {
            Null: { 's3:prefix': false },
            SomethingLike: { 's3:prefix': ['Development/*'] },
        };
        check(policy, failRes());
    });

    it('should fail when invalid property is assigned', () => {
        policy.Condition = {
            SomethingLike: { 's3:prefix': ['Development/*'] },
        };
        check(policy, failRes());
    });
});
