'use strict'; // eslint-disable-line strict

const { validateUserPolicy, validateResourcePolicy } =
    require('../../../lib/policy/policyValidator');
const { default: errors, ArsenalError } = require('../../../lib/errors');
const successRes = { error: null, valid: true };
const sampleUserPolicy = {
    Version: '2012-10-17',
    Statement: {
        Sid: 'FooBar1234',
        Effect: 'Allow',
        Action: 's3:PutObject',
        Resource: 'arn:aws:s3:::my_bucket/uploads/widgetco/*',
        Condition: { NumericLessThanEquals: { 's3:max-keys': '10' } },
    },
};
const sampleResourcePolicy = {
    Version: '2012-10-17',
    Statement: [
        {
            Sid: 'ResourcePolicy1',
            Effect: 'Allow',
            Action: 's3:ListBucket',
            Resource: 'arn:aws:s3:::example-bucket',
            Condition: { StringLike: { 's3:prefix': 'foo' } },
            Principal: '*',
        },
    ],
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

function failRes(policyType, errDescription) {
    let error;
    if (policyType === 'user') {
        error = errors.MalformedPolicyDocument;
    }
    if (policyType === 'resource') {
        error = errors.MalformedPolicy;
    }
    if (errDescription || error.description) {
        error = error.customizeDescription(errDescription || error.description);
    }
    return { error, valid: false };
}

function check(input, expected, policyType) {
    let result;
    if (policyType === 'user') {
        result = validateUserPolicy(JSON.stringify(input));
    }
    if (policyType === 'resource') {
        result = validateResourcePolicy(JSON.stringify(input));
    }
    expect(result.valid).toEqual(expected.valid);
    if (!result.valid) {
        expect(result.error.type).toEqual(expected.error.type);
        expect(result.error.description).toEqual(expected.error.description);
        expect(result.error).toBeInstanceOf(ArsenalError);
    }
}

let userPolicy;
let resourcePolicy;
const user = 'user';
const resource = 'resource';

beforeEach(() => {
    userPolicy = JSON.parse(JSON.stringify(sampleUserPolicy));
    resourcePolicy = JSON.parse(JSON.stringify(sampleResourcePolicy));
});

describe('Policies validation - Invalid JSON', () => {
    it('should return error for invalid user policy JSON', () => {
        const result = validateUserPolicy('{"Version":"2012-10-17",' +
        '"Statement":{"Effect":"Allow""Action":"s3:PutObject",' +
        '"Resource":"arn:aws:s3*"}}');
        const fail = failRes(user);
        expect(result.valid).toBeFalsy();
        expect(result.error.type).toEqual(fail.error.type);
        expect(result.error.description).toEqual(fail.error.description);
        expect(result.error).toBeInstanceOf(ArsenalError);
    });
    it('should return error for invaild resource policy JSON', () => {
        const result = validateResourcePolicy('{"Version":"2012-10-17",' +
        '"Statement":{"Effect":"Allow""Action":"s3:PutObject",' +
        '"Resource":"arn:aws:s3*"}}');
        const fail = failRes(resource);
        expect(result.valid).toBeFalsy();
        expect(result.error.type).toEqual(fail.error.type);
        expect(result.error.description).toEqual(fail.error.description);
        expect(result.error).toBeInstanceOf(ArsenalError);
    });
});

describe('Policies validation - Version', () => {
    it('should validate user policy with version date 2012-10-17', () => {
        check(userPolicy, successRes, user);
    });

    it('should validate resource policy with version date 2012-10-17', () => {
        check(resourcePolicy, successRes, 'resource');
    });

    it('user policy should return error for other dates', () => {
        userPolicy.Version = '2012-11-17';
        check(userPolicy, failRes(user), user);
    });

    it('resource policy should return error for other dates', () => {
        resourcePolicy.Version = '2012-11-17';
        check(resourcePolicy, failRes(resource), resource);
    });

    it('should return error if Version field in user policy is missing', () => {
        userPolicy.Version = undefined;
        check(userPolicy, failRes(user, errDict.required.Version), user);
    });

    it('should return error if Version field in resource policy is missing',
    () => {
        resourcePolicy.Version = undefined;
        check(resourcePolicy, failRes(resource, errDict.required.Version),
            resource);
    });
});

describe('Policies validation - Principal', () => {
    [
        {
            name: 'an account id',
            value: { AWS: '111111111111' },
            policyType: [user, resource],
        },
        {
            name: 'anonymous user AWS form',
            value: { AWS: '*' },
            policyType: [user, resource],
        },
        {
            name: 'an account arn',
            value: { AWS: 'arn:aws:iam::111111111111:root' },
            policyType: [user, resource],
        },
        {
            name: 'multiple account id',
            value: {
                AWS: ['111111111111', '111111111112'],
            },
            policyType: [user, resource],
        },
        {
            name: 'multiple account arn',
            value: {
                AWS: [
                    'arn:aws:iam::111111111111:root',
                    'arn:aws:iam::111111111112:root',
                ],
            },
            policyType: [user, resource],
        },
        {
            name: 'anonymous user as string',
            value: '*',
            policyType: [user, resource],
        },
        {
            name: 'user arn',
            value: { AWS: 'arn:aws:iam::111111111111:user/alex' },
            policyType: [user, resource],
        },
        {
            name: 'user arn with path',
            value: { AWS: 'arn:aws:iam::111111111111:user/path/in/org/leaf' },
            policyType: [user, resource],
        },
        {
            name: 'multiple user arns',
            value: {
                AWS: [
                    'arn:aws:iam::111111111111:user/alex',
                    'arn:aws:iam::111111111111:user/thibault',
                ],
            },
            policyType: [user, resource],
        },
        {
            name: 'role arn',
            value: {
                AWS: 'arn:aws:iam::111111111111:role/dev',
            },
            policyType: [user, resource],
        },
        {
            name: 'multiple role arn',
            value: {
                AWS: [
                    'arn:aws:iam::111111111111:role/dev',
                    'arn:aws:iam::111111111111:role/prod',
                ],
            },
            policyType: [user, resource],
        },
        {
            name: 'saml provider',
            value: {
                Federated:
                    'arn:aws:iam::111111111111:saml-provider/mysamlprovider',
            },
            policyType: [user],
        },
        {
            name: 'with backbeat service',
            value: { Service: 'backbeat' },
            policyType: [user, resource],
        },
        {
            name: 'with canonical user id',
            value: { CanonicalUser:
                '1examplecanonicalid12345678909876' +
                '54321qwerty12345asdfg67890z1x2c' },
            policyType: [resource],
        },
    ].forEach(test => {
        if (test.policyType.includes(user)) {
            it(`should allow user policy principal field with ${test.name}`,
            () => {
                userPolicy.Statement.Principal = test.value;
                delete userPolicy.Statement.Resource;
                check(userPolicy, successRes, user);
            });

            it(`should allow user policy notPrincipal field with ${test.name}`,
            () => {
                userPolicy.Statement.NotPrincipal = test.value;
                delete userPolicy.Statement.Resource;
                check(userPolicy, successRes, user);
            });
        }
        if (test.policyType.includes(resource)) {
            it(`should allow resource policy principal field with ${test.name}`,
            () => {
                resourcePolicy.Statement[0].Principal = test.value;
                check(resourcePolicy, successRes, resource);
            });
        }
    });

    [
        {
            name: 'wrong format account id',
            value: { AWS: '11111111111z' },
            policyType: [user, resource],
        },
        {
            name: 'empty string',
            value: '',
            policyType: [user, resource],
        },
        {
            name: 'anonymous user federated form',
            value: { federated: '*' },
            policyType: [user, resource],
        },
        {
            name: 'wildcard in resource',
            value: { AWS: 'arn:aws:iam::111111111111:user/*' },
            policyType: [user, resource],
        },
        {
            name: 'a malformed account arn',
            value: { AWS: 'arn:aws:iam::111111111111:' },
            policyType: [user, resource],
        },
        {
            name: 'multiple malformed account id',
            value: {
                AWS: ['1111111111z1', '1111z1111112'],
            },
            policyType: [user, resource],
        },
        {
            name: 'multiple anonymous',
            value: {
                AWS: ['*', '*'],
            },
            policyType: [user, resource],
        },
        {
            name: 'multiple malformed account arn',
            value: {
                AWS: [
                    'arn:aws:iam::111111111111:root',
                    'arn:aws:iam::111111111112:',
                ],
            },
            policyType: [user, resource],
        },
        {
            name: 'account id as a string',
            value: '111111111111',
            policyType: [user, resource],
        },
        {
            name: 'account arn as a string',
            value: 'arn:aws:iam::111111111111:root',
            policyType: [user, resource],
        },
        {
            name: 'user arn as a string',
            value: 'arn:aws:iam::111111111111:user/alex',
            policyType: [user, resource],
        },
        {
            name: 'multiple malformed user arns',
            value: {
                AWS: [
                    'arn:aws:iam::111111111111:user/alex',
                    'arn:aws:iam::111111111111:user/',
                ],
            },
            policyType: [user, resource],
        },
        {
            name: 'malformed role arn',
            value: {
                AWS: 'arn:aws:iam::111111111111:role/',
            },
            policyType: [user, resource],
        },
        {
            name: 'multiple malformed role arn',
            value: {
                AWS: [
                    'arn:aws:iam::111111111111:role/dev',
                    'arn:aws:iam::11111111z111:role/prod',
                ],
            },
            policyType: [user, resource],
        },
        {
            name: 'saml provider as a string',
            value: 'arn:aws:iam::111111111111:saml-provider/mysamlprovider',
            policyType: [user],
        },
        {
            name: 'with other service than backbeat',
            value: { Service: 'non-existent-service' },
            policyType: [user, resource],
        },
        {
            name: 'invalid canonical user',
            value: { CanonicalUser:
                '12345invalid-canonical-id$$$//098' +
                '7654321poiu1q2w3e4r5t6y7u8i9o0p' },
            policyType: [resource],
        },
    ].forEach(test => {
        if (test.policyType.includes(user)) {
            it(`user policy should fail with ${test.name}`, () => {
                userPolicy.Statement.Principal = test.value;
                delete userPolicy.Statement.Resource;
                check(userPolicy, failRes(user), user);
            });
        }
        if (test.policyType.includes(resource)) {
            it(`resource policy should fail with ${test.name}`, () => {
                resourcePolicy.Statement[0].Principal = test.value;
                check(resourcePolicy, failRes(resource), resource);
            });
        }
    });

    it('should not allow Resource field', () => {
        userPolicy.Statement.Principal = '*';
        check(userPolicy, failRes(user), user);
    });
});

describe('Policies validation - Statement', () => {
    [
        {
            name: 'should return error for undefined',
            value: undefined,
        },
        {
            name: 'should return an error for an empty list',
            value: [],
        },
        {
            name: 'should return an error for an empty object',
            value: {},
            errMessage: errDict.required.Action,
        },
    ].forEach(test => {
        it(`user policy ${test.name}`, () => {
            userPolicy.Statement = test.value;
            check(userPolicy, failRes(user, test.errMessage), user);
        });

        it(`resource policy ${test.name}`, () => {
            resourcePolicy.Statement = test.value;
            check(resourcePolicy, failRes(resource, test.errMessage), resource);
        });
    });

    it('user policy should succeed for a valid object', () => {
        check(userPolicy, successRes, user);
    });

    it('resource policy should succeed for a valid object', () => {
        check(resourcePolicy, successRes, resource);
    });

    it('user policy should succeed for a valid object', () => {
        userPolicy.Statement = [
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
        check(userPolicy, successRes, user);
    });

    it('resource policy should succeed for a valid object', () => {
        resourcePolicy.Statement = [
            {
                Effect: 'Allow',
                Action: 's3:PutObject',
                Resource: 'arn:aws:s3:::my_bucket/uploads/widgetco/*',
                Principal: '*',
            },
            {
                Effect: 'Deny',
                Action: 's3:DeleteObject',
                Resource: 'arn:aws:s3:::my_bucket/uploads/widgetco/*',
                Principal: '*',
            },
        ];
        check(resourcePolicy, successRes, resource);
    });

    [
        {
            name: 'should return error for missing a required field - Action',
            toDelete: ['Action'],
            expected: 'fail',
            errMessage: errDict.required.Action,
        },
        {
            name: 'should return error for missing a required field - Effect',
            toDelete: ['Effect'],
            expected: 'fail',
        },
        {
            name: 'should return error for missing required field - Resource',
            toDelete: ['Resource'],
            expected: 'fail',
        },
        {
            name: 'should return error for missing multiple required fields',
            toDelete: ['Effect', 'Resource'],
            expected: 'fail',
        },
        {
            name: 'should succeed w optional fields missing - Sid, Condition',
            toDelete: ['Sid', 'Condition'],
            expected: successRes,
        },
    ].forEach(test => {
        it(`user policy ${test.name}`, () => {
            test.toDelete.forEach(p => delete userPolicy.Statement[p]);
            if (test.expected === 'fail') {
                check(userPolicy, failRes(user, test.errMessage), user);
            } else {
                check(userPolicy, test.expected, user);
            }
        });

        it(`resource policy ${test.name}`, () => {
            test.toDelete.forEach(p => delete resourcePolicy.Statement[0][p]);
            if (test.expected === 'fail') {
                check(resourcePolicy, failRes(resource, test.errMessage),
                    resource);
            } else {
                check(resourcePolicy, test.expected, resource);
            }
        });
    });
});

describe('Policies validation - Statement::Sid_block', () => {
    it('user policy should succeed if Sid is any alphanumeric string', () => {
        check(userPolicy, successRes, user);
    });

    it('resource policy should succeed if Sid is any alphanumeric string',
    () => {
        check(resourcePolicy, successRes, resource);
    });

    it('user policy should fail if Sid is not a valid format', () => {
        userPolicy.Statement.Sid = 'foo bar()';
        check(userPolicy, failRes(user), user);
    });

    it('resource policy should fail if Sid is not a valid format', () => {
        resourcePolicy.Statement[0].Sid = 'foo bar()';
        check(resourcePolicy, failRes(resource), resource);
    });

    it('user policy should fail if Sid is not a string', () => {
        userPolicy.Statement.Sid = 1234;
        check(userPolicy, failRes(user), user);
    });

    it('resource policy should fail if Sid is not a string', () => {
        resourcePolicy.Statement[0].Sid = 1234;
        check(resourcePolicy, failRes(resource), resource);
    });
});

describe('Policies validation - Statement::Effect_block', () => {
    it('user policy should succeed for Allow', () => {
        check(userPolicy, successRes, user);
    });

    it('resource policy should succeed for Allow', () => {
        check(resourcePolicy, successRes, resource);
    });

    it('user policy should succeed for Deny', () => {
        userPolicy.Statement.Effect = 'Deny';
        check(userPolicy, successRes, user);
    });

    it('resource policy should succeed for Deny', () => {
        resourcePolicy.Statement[0].Effect = 'Deny';
        check(resourcePolicy, successRes, resource);
    });

    it('user policy should fail for strings other than Allow/Deny', () => {
        userPolicy.Statement.Effect = 'Reject';
        check(userPolicy, failRes(user), user);
    });

    it('resource policy should fail for strings other than Allow/Deny', () => {
        resourcePolicy.Statement[0].Effect = 'Reject';
        check(resourcePolicy, failRes(resource), resource);
    });

    it('user policy should fail if Effect is not a string', () => {
        userPolicy.Statement.Effect = 1;
        check(userPolicy, failRes(user), user);
    });

    it('resource policy should fail if Effect is not a string', () => {
        resourcePolicy.Statement[0].Effect = 1;
        check(resourcePolicy, failRes(resource), resource);
    });
});

const actionTests = [
    {
        name: 'should succeed for foo:bar',
        value: 'foo:bar',
        expected: successRes,
    },
    {
        name: 'should succeed for foo:*',
        value: 'foo:*',
        expected: successRes,
    },
    {
        name: 'should succeed for *',
        value: '*',
        expected: successRes,
    },
    {
        name: 'should fail for **',
        value: '**',
        expected: 'fail',
        errMessage: errDict.pattern.Action,
    },
    {
        name: 'should fail for foobar',
        value: 'foobar',
        expected: 'fail',
        errMessage: errDict.pattern.Action,
    },
];

describe('User policies validation - Statement::Action_block/' +
    'Statement::NotAction_block', () => {
    beforeEach(() => {
        userPolicy.Statement.Action = undefined;
        userPolicy.Statement.NotAction = undefined;
    });

    actionTests.forEach(test => {
        it(`${test.name}`, () => {
            userPolicy.Statement.Action = test.value;
            if (test.expected === 'fail') {
                check(userPolicy, failRes(user, test.errMessage), user);
            } else {
                check(userPolicy, test.expected, user);
            }

            userPolicy.Statement.Action = undefined;
            userPolicy.Statement.NotAction = test.value;
            if (test.expected === 'fail') {
                check(userPolicy, failRes(user, test.errMessage), user);
            } else {
                check(userPolicy, test.expected, user);
            }
        });
    });
});

describe('Resource policies validation - Statement::Action_block', () => {
    actionTests.forEach(test => {
        it(`${test.name}`, () => {
            resourcePolicy.Statement[0].Action = test.value;
            if (test.expected === 'fail') {
                check(resourcePolicy, failRes(resource, test.errMessage),
                    resource);
            } else {
                check(resourcePolicy, test.expected, resource);
            }
        });
    });
});

const resourceTests = [
    {
        name: 'should succeed for arn:aws::s3:::*',
        value: 'arn:aws:s3:::*',
        expected: successRes,
    },
    {
        name: 'should succeed for arn:aws:s3:::test/home/${aws:username}',
        value: 'arn:aws:s3:::test/home/${aws:username}',
        expected: successRes,
    },
    {
        name: 'should succeed for arn:aws:ec2:us-west-1:1234567890:vol/*',
        value: 'arn:aws:ec2:us-west-1:1234567890:vol/*',
        expected: successRes,
    },
    {
        name: 'should succeed for *',
        value: '*',
        expected: successRes,
    },
    {
        name: 'should fail for arn:aws:ec2:us-west-1:vol/* - missing region',
        value: 'arn:aws:ec2:us-west-1:vol/*',
        expected: 'fail',
        errMessage: errDict.pattern.Resource,
    },
    {
        name: 'should fail for arn:aws:ec2:us-west-1:123456789:v/${} - ${}',
        value: 'arn:aws:ec2:us-west-1:123456789:v/${}',
        expected: 'fail',
        errMessage: errDict.pattern.Resource,
    },
    {
        name: 'should fail for ec2:us-west-1:qwerty:vol/* - missing arn:aws:',
        value: 'ec2:us-west-1:123456789012:vol/*',
        expected: 'fail',
        errMessage: errDict.pattern.Resource,
    },
];

describe('User policies validation - Statement::Resource_block' +
    'Statement::NotResource_block', () => {
    beforeEach(() => {
        userPolicy.Statement.Resource = undefined;
        userPolicy.Statement.NotResource = undefined;
    });

    resourceTests.forEach(test => {
        it(`${test.name}`, () => {
            userPolicy.Statement.Resource = test.value;
            if (test.expected === 'fail') {
                check(userPolicy, failRes(user, test.errMessage), user);
            } else {
                check(userPolicy, test.expected, user);
            }

            userPolicy.Statement.Resource = undefined;
            userPolicy.Statement.NotResource = test.value;
            if (test.expected === 'fail') {
                check(userPolicy, failRes(user, test.errMessage), user);
            } else {
                check(userPolicy, test.expected, user);
            }
        });
    });

    it('should fail for empty list of resources', () => {
        userPolicy.Statement.Resource = [];
        check(userPolicy, failRes(user, errDict.minItems.Resource), user);
    });
});

describe('Resource policies validation - Statement::Resource_block', () => {
    resourceTests.forEach(test => {
        it(`${test.name}`, () => {
            resourcePolicy.Statement[0].Resource = test.value;
            if (test.expected === 'fail') {
                check(resourcePolicy, failRes(resource, test.errMessage),
                    resource);
            } else {
                check(resourcePolicy, test.expected, resource);
            }
        });
    });

    it('should fail for empty list of resources', () => {
        resourcePolicy.Statement[0].Resource = [];
        check(resourcePolicy, failRes(resource, errDict.minItems.Resource),
            resource);
    });
});

describe('Policies validation - Statement::Condition_block', () => {
    it('user policy should succeed for single Condition', () => {
        check(userPolicy, successRes, user);
    });

    it('resource policy should succeed for single Condition', () => {
        check(resourcePolicy, successRes, resource);
    });

    [
        {
            name: 'should succeed for multiple Conditions',
            value: {
                StringNotLike: { 's3:prefix': ['Development/*'] },
                Null: { 's3:prefix': false },
            },
            expected: successRes,
        },
        {
            name: 'should fail when Condition is not an Object',
            value: 'NumericLessThanEquals',
            expected: 'fail',
        },
        {
            name: 'should fail for an invalid Condition',
            value: {
                SomethingLike: { 's3:prefix': ['Development/*'] },
            },
            expected: 'fail',
        },
        {
            name: 'should fail when one of the multiple conditions is invalid',
            value: {
                Null: { 's3:prefix': false },
                SomethingLike: { 's3:prefix': ['Development/*'] },
            },
            expected: 'fail',
        },
        {
            name: 'should fail when invalid property is assigned',
            value: {
                SomethingLike: { 's3:prefix': ['Development/*'] },
            },
            expected: 'fail',
        },
    ].forEach(test => {
        it(`user policy ${test.name}`, () => {
            userPolicy.Statement.Condition = test.value;
            if (test.expected === 'fail') {
                check(userPolicy, failRes(user), user);
            } else {
                check(userPolicy, test.expected, user);
            }
        });

        it(`resource policy ${test.name}`, () => {
            resourcePolicy.Statement[0].Condition = test.value;
            if (test.expected === 'fail') {
                check(resourcePolicy, failRes(resource), resource);
            } else {
                check(resourcePolicy, test.expected, resource);
            }
        });
    });
});
