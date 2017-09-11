const assert = require('assert');
const Principal = require('../../../lib/policyEvaluator/principal');
const RequestContext = require('../../../lib/policyEvaluator/RequestContext');

const defaultAccountId = '123456789012';
const anotherAccountId = '098765432112';
const defaultAccountArn = `arn:aws:iam::${defaultAccountId}:root`;
const defaultUserArn = `arn:aws:iam::${defaultAccountId}:user/test`;
const defaultRole = `arn:aws:iam::${defaultAccountId}:role/role1`;
const defaultAssumedRole =
    `arn:aws:sts::${defaultAccountId}:assumed-role/role1/session`;
const defaultSamlProvider =
    `arn:aws:iam::${defaultAccountId}:saml-provider/provider1`;
const defaultFederatedUser =
    `arn:aws:sts::${defaultAccountId}:federated-user/foo`;
const anotherAccountArn = `arn:aws:iam::${anotherAccountId}:root`;
const anotherUserArn = `arn:aws:iam::${anotherAccountId}:user/test`;
const defaultValids = {
    AWS: [
        defaultAccountId,
        defaultAccountArn,
    ],
};

const defaultParams = {
    log: {
        trace: () => {},
        debug: () => {},
        info: () => {},
    },
};

describe('Principal evaluator', () => {
    [
        {
            name: 'anonymous as Principal (effect Allow) -> grant access',
            statement: {
                Principal: '*',
                Effect: 'Allow',
            },
            valids: defaultValids,
            result: 'Allow',
        },
        {
            name: 'anonymous as Principal (effect Deny) -> deny access',
            statement: {
                Principal: '*',
                Effect: 'Deny',
            },
            valids: defaultValids,
            result: 'Deny',
        },
        {
            name: 'account (arn) in Principal (effect Allow) -> grant access',
            statement: {
                Principal: {
                    AWS: defaultAccountArn,
                },
                Effect: 'Allow',
            },
            valids: defaultValids,
            result: 'Allow',
        },
        {
            name: 'account (arn) in Principal (effect Deny) -> deny access',
            statement: {
                Principal: {
                    AWS: [defaultAccountArn],
                },
                Effect: 'Deny',
            },
            valids: defaultValids,
            result: 'Deny',
        },
        {
            name: 'account (id) in Principal (effect Allow) -> grant access',
            statement: {
                Principal: {
                    AWS: defaultAccountId,
                },
                Effect: 'Allow',
            },
            valids: defaultValids,
            result: 'Allow',
        },
        {
            name: 'account (id) as Principal (effect Deny) -> deny access',
            statement: {
                Principal: {
                    AWS: defaultAccountId,
                },
                Effect: 'Deny',
            },
            valids: defaultValids,
            result: 'Deny',
        },
        {
            name: 'account not in Principal (effect Allow) -> neutral',
            statement: {
                Principal: {
                    AWS: [anotherAccountId],
                },
                Effect: 'Allow',
            },
            valids: defaultValids,
            result: 'Neutral',
        },
        {
            name: 'account not in Principal (effect Deny) -> neutral',
            statement: {
                Principal: {
                    AWS: [anotherAccountId],
                },
                Effect: 'Deny',
            },
            valids: defaultValids,
            result: 'Neutral',
        },
        {
            name:
                'multiple account as Principal (effect Allow) -> grant access',
            statement: {
                Principal: {
                    AWS: [anotherAccountId, defaultAccountId],
                },
                Effect: 'Allow',
            },
            valids: defaultValids,
            result: 'Allow',
        },
        {
            name: 'anonymous as NotPrincipal (effect Allow) -> neutral',
            statement: {
                NotPrincipal: '*',
                Effect: 'Allow',
            },
            valids: defaultValids,
            result: 'Neutral',
        },
        {
            name: 'anonymous as NotPrincipal (effect Deny) -> neutral',
            statement: {
                NotPrincipal: '*',
                Effect: 'Allow',
            },
            valids: defaultValids,
            result: 'Neutral',
        },
        {
            name: 'account (arn) in NotPrincipal (effect Allow) -> neutral',
            statement: {
                NotPrincipal: {
                    AWS: defaultAccountArn,
                },
                Effect: 'Allow',
            },
            valids: defaultValids,
            result: 'Neutral',
        },
        {
            name: 'account (arn) in NotPrincipal (effect Deny) -> neutral',
            statement: {
                NotPrincipal: {
                    AWS: [anotherAccountArn, defaultAccountArn],
                },
                Effect: 'Allow',
            },
            valids: defaultValids,
            result: 'Neutral',
        },
        {
            name: 'account (arn) not in NotPrincipal (effect Allow) -> ' +
                'grant access',
            statement: {
                NotPrincipal: {
                    AWS: anotherAccountArn,
                },
                Effect: 'Allow',
            },
            valids: defaultValids,
            result: 'Allow',
        },
        {
            name: 'account (arn) not in NotPrincipal (effect Deny) -> ' +
                'deny access',
            statement: {
                NotPrincipal: {
                    AWS: anotherAccountArn,
                },
                Effect: 'Deny',
            },
            valids: defaultValids,
            result: 'Deny',
        },
        {
            name: 'Other entities than AWS in principal (effect Allow) -> ' +
                'neutral',
            statement: {
                Principal: {
                    Service: 'backbeat',
                },
                Effect: 'Allow',
            },
            valids: defaultValids,
            result: 'Neutral',
        },
        {
            name: 'Other entities than AWS in principal (effect Deny) -> ' +
                'neutral',
            statement: {
                Principal: {
                    Service: 'backbeat',
                },
                Effect: 'Deny',
            },
            valids: defaultValids,
            result: 'Neutral',
        },
        {
            name: 'Service in Principal (effect Allow) -> grant access',
            statement: {
                Principal: {
                    Service: 'backbeat',
                },
                Effect: 'Allow',
            },
            valids: {
                Service: 'backbeat',
            },
            result: 'Allow',
        },
        {
            name: 'User as principal (effect Allow) -> grant access',
            statement: {
                Principal: {
                    AWS: `arn:aws:iam::${defaultAccountId}:user/test`,
                },
                Effect: 'Allow',
            },
            valids: {
                AWS: `arn:aws:iam::${defaultAccountId}:user/test`,
            },
            result: 'Allow',
        },
        {
            name: 'User not in Principal (effect Allow) -> neutral',
            statement: {
                Principal: {
                    AWS: `arn:aws:iam::${defaultAccountId}:user/test`,
                },
                Effect: 'Allow',
            },
            valids: {
                AWS: `arn:aws:iam::${defaultAccountId}:user/another/testUser`,
            },
            result: 'Neutral',
        },
        {
            name: 'Role in Principal (effect Allow) -> grant access',
            statement: {
                Principal: {
                    AWS: `arn:aws:iam::${defaultAccountId}:role/role1`,
                },
                Effect: 'Allow',
            },
            valids: {
                AWS: [
                    `arn:aws:iam::${defaultAccountId}:role/role1`,
                    `arn:aws:iam::${defaultAccountId}:assumed-role` +
                        '/role1/session',
                ],
            },
            result: 'Allow',
        },
        {
            name: 'Role in Principal (effect Deny) -> deny access',
            statement: {
                Principal: {
                    AWS: `arn:aws:iam::${defaultAccountId}:role/role1`,
                },
                Effect: 'Deny',
            },
            valids: {
                AWS: [
                    `arn:aws:iam::${defaultAccountId}:role/role1`,
                    `arn:aws:iam::${defaultAccountId}:assumed-role` +
                        '/role1/session',
                ],
            },
            result: 'Deny',
        },
    ].forEach(test => {
        it(`_evaluatePrincipalField(): ${test.name}`, () => {
            assert.strictEqual(Principal._evaluatePrincipalField(defaultParams,
                test.statement, test.valids), test.result);
        });
    });

    [
        {
            name: 'should allow with a neutral',
            statement: [
                {
                    Principal: {
                        AWS: anotherAccountArn,
                    },
                    Effect: 'Deny',
                },
                {
                    Principal: {
                        AWS: defaultAccountArn,
                    },
                    Effect: 'Allow',
                },
            ],
            valids: defaultValids,
            result: 'Allow',
        },
        {
            name: 'should deny even with an allow',
            statement: [
                {
                    Principal: {
                        AWS: defaultAccountArn,
                    },
                    Effect: 'Allow',
                },
                {
                    Principal: {
                        AWS: defaultAccountArn,
                    },
                    Effect: 'Deny',
                },
            ],
            valids: defaultValids,
            result: 'Deny',
        },
        {
            name: 'should deny if no matches',
            statement: [
                {
                    Principal: {
                        AWS: anotherAccountArn,
                    },
                    Effect: 'Allow',
                },
            ],
            valids: defaultValids,
            result: 'Deny',
        },
    ].forEach(test => {
        it(`_evaluatePrincipal(): ${test.name}`, () => {
            const params = {
                log: defaultParams.log,
                trustedPolicy: {
                    Statement: test.statement,
                },
            };
            const valids = test.valids;
            assert.strictEqual(Principal._evaluatePrincipal(params, valids),
                test.result);
        });
    });

    [
        {
            name: 'should check user inside the same account',
            statement: [
                {
                    Principal: {
                        AWS: defaultUserArn,
                    },
                    Effect: 'Allow',
                },
            ],
            requester: {
                accountId: defaultAccountId,
                arn: defaultUserArn,
                parentArn: null,
                userType: 'User',
            },
            target: {
                accountId: defaultAccountId,
            },
            result: {
                result: 'Allow',
                checkAction: false,
            },
        },
        {
            name: 'should deny user inside the same account',
            statement: [
                {
                    Principal: {
                        AWS: defaultUserArn,
                    },
                    Effect: 'Allow',
                },
            ],
            requester: {
                accountId: defaultAccountId,
                arn: `arn:aws:iam::${defaultAccountId}:user/anotherUser`,
                parentArn: null,
                userType: 'User',
            },
            target: {
                accountId: defaultAccountId,
            },
            result: {
                result: 'Deny',
                checkAction: false,
            },
        },
        {
            name: 'should deny principal if account is deny',
            statement: [
                {
                    Principal: {
                        AWS: defaultAccountId,
                    },
                    Effect: 'Deny',
                },
                {
                    Principal: {
                        AWS: defaultUserArn,
                    },
                    Effect: 'Allow',
                },
            ],
            requester: {
                accountId: defaultAccountId,
                arn: defaultUserArn,
                parentArn: null,
                userType: 'User',
            },
            target: {
                accountId: defaultAccountId,
            },
            result: {
                result: 'Deny',
                checkAction: false,
            },
        },
        {
            name: 'should deny assumed role if role is deny',
            statement: [
                {
                    Principal: {
                        AWS: defaultRole,
                    },
                    Effect: 'Deny',
                },
                {
                    Principal: {
                        AWS: defaultAssumedRole,
                    },
                    Effect: 'Allow',
                },
            ],
            requester: {
                accountId: defaultAccountId,
                arn: defaultAssumedRole,
                parentArn: defaultRole,
                userType: 'AssumedRole',
            },
            target: {
                accountId: defaultAccountId,
            },
            result: {
                result: 'Deny',
                checkAction: false,
            },
        },
        {
            name: 'should deny user as principal if account is different',
            statement: [
                {
                    Principal: {
                        AWS: anotherUserArn,
                    },
                    Effect: 'Allow',
                },
            ],
            requester: {
                accountId: anotherAccountId,
                arn: anotherUserArn,
                parentArn: null,
                userType: 'User',
            },
            target: {
                accountId: defaultAccountId,
            },
            result: {
                result: 'Deny',
                checkAction: true,
            },
        },
        {
            name: 'should allow user if account is in principal',
            statement: [
                {
                    Principal: {
                        AWS: anotherAccountArn,
                    },
                    Effect: 'Allow',
                },
            ],
            requester: {
                accountId: anotherAccountId,
                arn: anotherUserArn,
                parentArn: null,
                userType: 'User',
            },
            target: {
                accountId: defaultAccountId,
            },
            result: {
                result: 'Allow',
                checkAction: true,
            },
        },
        {
            name: 'should allow service as principal',
            statement: [
                {
                    Principal: {
                        Service: 'backbeat',
                    },
                    Effect: 'Allow',
                },
            ],
            requester: {
                accountId: defaultAccountId,
                arn: 'backbeat',
                parentArn: null,
                userType: 'Service',
            },
            target: {
                accountId: defaultAccountId,
            },
            result: {
                result: 'Allow',
                checkAction: false,
            },
        },
        {
            name: 'should allow federated provider',
            statement: [
                {
                    Principal: {
                        Federated: defaultSamlProvider,
                    },
                    Effect: 'Allow',
                },
            ],
            requester: {
                accountId: defaultAccountId,
                arn: defaultFederatedUser,
                parentArn: defaultSamlProvider,
                userType: 'Federated',
            },
            target: {
                accountId: defaultAccountId,
            },
            result: {
                result: 'Allow',
                checkAction: false,
            },
        },
        {
            name: 'should not allow when external id not matching',
            statement: [
                {
                    Principal: {
                        AWS: anotherAccountId,
                    },
                    Effect: 'Allow',
                    Condition: {
                        StringEquals: { 'sts:ExternalId': '12345' },
                    },
                },
            ],
            requester: {
                accountId: anotherAccountId,
                arn: anotherUserArn,
                parentArn: null,
                userType: 'User',
            },
            target: {
                accountId: defaultAccountId,
            },
            result: {
                result: 'Deny',
                checkAction: true,
            },
        },
        {
            name: 'should allow when external id matching',
            statement: [
                {
                    Principal: {
                        AWS: anotherAccountId,
                    },
                    Effect: 'Allow',
                    Condition: {
                        StringEquals: { 'sts:ExternalId': '4321' },
                    },
                },
            ],
            requester: {
                accountId: anotherAccountId,
                arn: anotherUserArn,
                parentArn: null,
                userType: 'User',
            },
            target: {
                accountId: defaultAccountId,
            },
            result: {
                result: 'Allow',
                checkAction: true,
            },
        },
    ].forEach(test => {
        it(`evaluatePrincipal(): ${test.name}`, () => {
            const rc = new RequestContext({}, {}, '', '', '127.0.0.1',
                false, 'assumeRole', 'sts', null, {
                    accountid: test.requester.accountId,
                    arn: test.requester.arn,
                    parentArn: test.requester.parentArn,
                    principalType: test.requester.userType,
                    externalId: '4321',
                }, 'v4', 'V4');

            const params = {
                log: defaultParams.log,
                trustedPolicy: {
                    Statement: test.statement,
                },
                rc,
                targetAccountId: test.target.accountId,
            };
            const result = Principal.evaluatePrincipal(params);
            assert.deepStrictEqual(result, test.result);
        });
    });
});
