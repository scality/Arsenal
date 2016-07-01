'use strict'; // eslint-disable-line strict

const assert = require('assert');

const evaluator = require('../../lib/policyEvaluator/evaluator.js');
const evaluatePolicy = evaluator.evaluatePolicy;
const evaluateAllPolicies = evaluator.evaluateAllPolicies;
const handleWildcards =
    require('../../lib/policyEvaluator/utils/wildcards.js').handleWildcards;
const substituteVariables =
    require('../../lib/policyEvaluator/utils/variables.js');
const samples = require('../utils/samplePolicies.json');
const DummyRequestLogger = require('./helpers').DummyRequestLogger;

const log = new DummyRequestLogger();


function check(requestContext, policy, expected) {
    const result = evaluatePolicy(requestContext, policy, log);
    assert.deepStrictEqual(result, expected);
}
let policy;
let requestContext;

describe('policyEvaluator', () => {
    describe('evaluate a single policy', () => {
        describe('with basic checks', () => {
            beforeEach(() => {
                requestContext = {
                    action: 's3:ListBucket',
                    resource: 'arn:aws:s3:::superbucket',
                    requesterInfo: {},
                    headers: {},
                    query: {},
                };
            });
            it('should permit access under full access policy', () => {
                check(requestContext,
                    samples['arn:aws:iam::aws:policy/AmazonS3FullAccess'],
                    'Allow');
            });

            it('should permit access under read only policy', () => {
                check(requestContext,
                    samples['arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess'],
                    'Allow');
            });

            it('should be neutral under multi-statement ' +
                'policy if request resource not in policy',
                () => {
                    requestContext.action = 's3:PutObject';
                    check(requestContext,
                        samples['Multi-Statement Policy'],
                        'Neutral');
                });

            it('should grant access under multi-statement ' +
                'policy if action and resource match those in policy',
                () => {
                    requestContext.action = 's3:GetObject';
                    requestContext.resource =
                        'arn:aws:s3:::notVeryPrivate/object';
                    check(requestContext,
                        samples['Multi-Statement Policy'],
                        'Allow');
                });

            it('should be neutral under multi-statement ' +
                'policy if request action not in policy',
                () => {
                    requestContext.action = 's3:DeleteObject';
                    requestContext.resource = 'arn:aws:s3:::notVeryPrivate';
                    check(requestContext,
                        samples['Multi-Statement Policy'],
                        'Neutral');
                });

            it('should allow access under a policy with a variable in the ' +
                'resource', () => {
                requestContext.action = 's3:PutObject';
                requestContext.resource =
                    'arn:aws:s3:::personalbucket/Peggy';
                requestContext.requesterInfo = {
                    username: 'Peggy',
                };
                check(requestContext,
                    samples['Variable Bucket Policy'],
                    'Allow');
            });

            it('should be neutral under a policy with a variable in the ' +
                'resource if the variable value does not match the request',
                () => {
                    requestContext.action = 's3:PutObject';
                    requestContext.resource =
                        'arn:aws:s3:::personalbucket/Joan';
                    requestContext.requesterInfo = {
                        username: 'Peggy',
                    };
                    check(requestContext,
                        samples['Variable Bucket Policy'],
                        'Neutral');
                });

            it('should be neutral under a policy with a variable in the ' +
                'resource if the variable value is not supplied by the ' +
                'requestContext', () => {
                requestContext.action = 's3:PutObject';
                requestContext.resource = 'arn:aws:s3:::personalbucket/Joan';
                check(requestContext,
                    samples['Variable Bucket Policy'],
                    'Neutral');
            });
        });

        describe('with NotAction and NotResource', () => {
            beforeEach(() => {
                policy = samples['NotAction and NotResource Example'];
                requestContext = {
                    action: 's3:PutObject',
                    resource:
                        'arn:aws:s3:::my_corporate_bucket/uploads/widgetco/obj',
                    requesterInfo: {},
                    headers: {},
                    query: {},
                };
            });
            it('should deny access for any action other than the specified ' +
            'NotAction on designated resource in a deny statement', () => {
                requestContext.action = 's3:GetObject';
                check(requestContext, policy, 'Deny');
            });

            it('should allow access for action not included in the specified ' +
            'NotAction on designated resource in a deny statement', () => {
                check(requestContext, policy, 'Allow');
            });

            it('should deny access that impacts resource other than that ' +
                'specified in NotResource in Deny policy', () => {
                requestContext.resource =
                    'arn:aws:s3:::someotherresource';
                check(requestContext, policy, 'Deny');
            });

            it('should be neutral on access that impacts resource ' +
                'specified in NotResource in Allow policy', () => {
                requestContext.resource =
                    'arn:aws:s3:::mybucket/CompanySecretInfo/supersecret';
                check(requestContext, samples['NotResource Example'],
                    'Neutral');
            });

            it('should allow access to resource that is not specified ' +
                'as part of NotResource in Allow policy', () => {
                requestContext.resource =
                    'arn:aws:s3:::someotherresource';
                check(requestContext, samples['NotResource Example'],
                    'Allow');
            });
        });

        describe('with conditions', () => {
            beforeEach(() => {
                policy = JSON.
                parse(JSON.stringify(samples['Simple Bucket Policy']));
                requestContext = {
                    action: 's3:PutObject',
                    resource: 'arn:aws:s3:::bucket',
                    requesterInfo: {},
                    headers: {},
                    query: {},
                };
            });

            it('should allow access under a StringEquals condition if ' +
                'condition passes', () => {
                policy.Statement.Condition = {
                    StringEquals: { 'aws:UserAgent': 'CyberSquaw' },
                };
                requestContext.headers['user-agent'] = 'CyberSquaw';
                check(requestContext, policy, 'Allow');
            });

            it('should be neutral under a StringEquals condition if condition' +
                'does not pass', () => {
                policy.Statement.Condition = {
                    StringEquals: { 'aws:UserAgent': 'CyberSquaw' },
                };
                requestContext.headers['user-agent'] = 's3cmd';
                check(requestContext, policy, 'Neutral');
            });

            it('should allow access under a StringEquals condition if ' +
                'condition passes based on one of many possible values',
                () => {
                    policy.Statement.Condition = {
                        StringEquals: { 'aws:UserAgent':
                            ['CyberSquaw', 's3Sergeant', 'jetSetter'] },
                    };
                    requestContext.headers['user-agent'] = 's3Sergeant';
                    check(requestContext, policy, 'Allow');
                });

            it('should be neutral under a StringEquals condition if ' +
                'condition does not pass based on one of many possible values',
                    () => {
                        policy.Statement.Condition = {
                            StringEquals: { 'aws:UserAgent':
                                ['CyberSquaw', 's3Sergeant', 'jetSetter'] },
                        };
                        requestContext.headers['user-agent'] = 'secretagent';
                        check(requestContext, policy, 'Neutral');
                    });

            it('should treat wildcards literally in StringEquals condition ' +
                'and translate variables properly',
                    () => {
                        policy.Statement.Action = 's3:ListBucket';
                        policy.Statement.Condition = { StringEquals:
                            { 's3:prefix': [
                                'home/${aws:username}/*${?}${*}${$}${}?',
                                'home/',
                            ] } };
                        requestContext.action = 's3:ListBucket';
                        requestContext.query.prefix = 'home/Roger/*?*$${}?';
                        requestContext.requesterInfo.username = 'Roger';
                        check(requestContext, policy, 'Allow');
                    });

            it('should allow access if condition operator has IfExists and ' +
                'key not provided',
                    () => {
                        policy.Statement.Action = 'ec2:RunInstances';
                        policy.Statement.Resource = '*';
                        policy.Statement.Condition = {
                            StringLikeIfExists: { 'ec2:InstanceType': [
                                't1.*',
                                't2.*',
                                'm3.*',
                            ] } };
                        requestContext.action = 'ec2:RunInstances';
                        requestContext.resource = 'arn:aws:s3:::whatever';
                        check(requestContext, policy, 'Allow');
                    });

            it('should allow access for StringLike condition with ' +
            'variables and wildcards',
                    () => {
                        policy.Statement.Action = 's3:ListBucket';
                        policy.Statement.Resource = '*';
                        policy.Statement.Condition = {
                            StringLike: { 's3:prefix': [
                                'home/${aws:username}/?/*',
                                'home/',
                            ] } };
                        requestContext.action = 's3:ListBucket';
                        requestContext.requesterInfo.username = 'Pete';
                        requestContext.query.prefix = 'home/Pete/a/something';
                        check(requestContext, policy, 'Allow');
                    });

            it('should be neutral for StringLike condition with ' +
            'variables and wildcards if do not match wildcard pattern',
                () => {
                    policy.Statement.Action = 's3:ListBucket';
                    policy.Statement.Resource = '*';
                    policy.Statement.Condition = {
                        StringLike: { 's3:prefix': [
                            'home/${aws:username}/?/*',
                            'home/',
                        ] } };
                    requestContext.action = 's3:ListBucket';
                    requestContext.requesterInfo.username = 'Pete';
                    // pattern is home/${aws:username}/?/*
                    requestContext.query.prefix = 'home/Pete/ab/something';
                    check(requestContext, policy, 'Neutral');
                });

            it('should allow access for StringNotLike condition with ' +
            'variables and wildcards',
                    () => {
                        policy.Statement.Action = 's3:ListBucket';
                        policy.Statement.Resource = '*';
                        policy.Statement.Condition = {
                            StringNotLike: { 's3:prefix': [
                                'home/${aws:username}/?/*',
                                'home/',
                            ] } };
                        requestContext.action = 's3:ListBucket';
                        requestContext.requesterInfo.username = 'Pete';
                        requestContext.query.prefix = 'home/Pete/ab/something';
                        check(requestContext, policy, 'Allow');
                    });

            it('should be neutral for StringNotLike condition with ' +
            'variables and wildcards if do not match wildcard pattern',
                () => {
                    policy.Statement.Action = 's3:ListBucket';
                    policy.Statement.Resource = '*';
                    policy.Statement.Condition = {
                        StringNotLike: { 's3:prefix': [
                            'home/${aws:username}/?/*',
                            'home/',
                        ] } };
                    requestContext.action = 's3:ListBucket';
                    requestContext.requesterInfo.username = 'Pete';
                    // pattern is home/${aws:username}/?/*
                    requestContext.query.prefix = 'home/Pete/a/something';
                    check(requestContext, policy, 'Neutral');
                });

            it('should be neutral for StringNotEquals condition if ' +
            'do not meet condition',
                () => {
                    policy.Statement.Resource = 'arn:aws:s3:::bucket/*';
                    policy.Statement.Condition = { StringNotEquals:
                        { 's3:x-amz-acl':
                            ['public-read', 'public-read-write'] } };
                    requestContext.resource = 'arn:aws:s3:::bucket/obj';
                    requestContext.headers['x-amz-acl'] = 'public-read-write';
                    check(requestContext, policy, 'Neutral');
                });

            it('should allow access for StringNotEquals condition if ' +
            'meet condition',
                () => {
                    policy.Statement.Resource = 'arn:aws:s3:::bucket/*';
                    policy.Statement.Condition = { StringNotEquals:
                        { 's3:x-amz-acl':
                            ['public-read', 'public-read-write'] } };
                    requestContext.resource = 'arn:aws:s3:::bucket/obj';
                    requestContext.headers['x-amz-acl'] = 'private';
                    check(requestContext, policy, 'Allow');
                });

            it('should be neutral for StringEqualsIgnoreCase condition ' +
                'if do not meet condition',
                () => {
                    policy.Statement.Condition = { StringEqualsIgnoreCase:
                        { 'aws:UserAgent':
                            ['CyberSquaw', 's3Sergeant', 'jetSetter'] } };
                    // Not one of the options
                    requestContext.headers['user-agent'] = 'builtMyOwn';
                    check(requestContext, policy, 'Neutral');
                });

            it('should allow access for StringEqualsIgnoreCase condition ' +
                'if meet condition',
                () => {
                    policy.Statement.Condition = { StringEqualsIgnoreCase:
                        { 'aws:UserAgent':
                            ['CyberSquaw', 's3Sergeant', 'jetSetter'] } };
                    requestContext.headers['user-agent'] = 'CYBERSQUAW';
                    check(requestContext, policy, 'Allow');
                });

            it('should be neutral for StringNotEqualsIgnoreCase condition ' +
                'if do not meet condition',
                () => {
                    policy.Statement.Condition = { StringNotEqualsIgnoreCase:
                        { 'aws:UserAgent':
                            ['CyberSquaw', 's3Sergeant', 'jetSetter'] } };
                    requestContext.headers['user-agent'] = 'cybersquaw';
                    check(requestContext, policy, 'Neutral');
                });

            it('should allow access for StringNotEqualsIgnoreCase condition ' +
                'if meet condition',
                () => {
                    policy.Statement.Condition = { StringNotEqualsIgnoreCase:
                        { 'aws:UserAgent':
                            ['CyberSquaw', 's3Sergeant', 'jetSetter'] } };
                    requestContext.headers['user-agent'] = 'builtMyOwn';
                    check(requestContext, policy, 'Allow');
                });

            it('should be neutral for NumericEquals condition ' +
                'if do not meet condition',
                () => {
                    policy.Statement.Condition = { NumericEquals:
                        { 's3:max-keys': '100' } };
                    requestContext.query['max-keys'] = '101';
                    check(requestContext, policy, 'Neutral');
                });

            it('should allow access for NumericEquals condition ' +
                'if meet condition',
                () => {
                    policy.Statement.Condition = { NumericEquals:
                        { 's3:max-keys': '100' } };
                    requestContext.query['max-keys'] = '100';
                    check(requestContext, policy, 'Allow');
                });

            it('should be neutral for NumericNotEquals condition ' +
                'if do not meet condition',
                () => {
                    policy.Statement.Condition = { NumericNotEquals:
                        { 's3:max-keys': '100' } };
                    requestContext.query['max-keys'] = '100';
                    check(requestContext, policy, 'Neutral');
                });

            it('should allow access for NumericNotEquals condition ' +
                'if meet condition',
                () => {
                    policy.Statement.Condition = { NumericNotEquals:
                        { 's3:max-keys': '100' } };
                    requestContext.query['max-keys'] = '101';
                    check(requestContext, policy, 'Allow');
                });

            it('should be neutral for NumericLessThan condition ' +
                'if do not meet condition',
                () => {
                    policy.Statement.Condition = { NumericLessThan:
                        { 's3:max-keys': '100' } };
                    requestContext.query['max-keys'] = ['100', '200', '300'];
                    check(requestContext, policy, 'Neutral');
                });

            it('should allow access for NumericLessThan condition ' +
                'if meet condition',
                () => {
                    policy.Statement.Condition = { NumericLessThan:
                        { 's3:max-keys': '100' } };
                    requestContext.query['max-keys'] = '99';
                    check(requestContext, policy, 'Allow');
                });

            it('should be neutral for NumericLessThanEquals condition ' +
                'if do not meet condition',
                () => {
                    policy.Statement.Condition = { NumericLessThanEquals:
                        { 's3:max-keys': '100' } };
                    requestContext.query['max-keys'] = '101';
                    check(requestContext, policy, 'Neutral');
                });

            it('should allow access for NumericLessThanEquals condition ' +
                'if meet condition',
                () => {
                    policy.Statement.Condition = { NumericLessThanEquals:
                        { 's3:max-keys': '100' } };
                    requestContext.query['max-keys'] = '100';
                    check(requestContext, policy, 'Allow');
                    requestContext.query['max-keys'] = '99';
                    check(requestContext, policy, 'Allow');
                });

            it('should be neutral for NumericGreaterThan condition ' +
                'if do not meet condition',
                () => {
                    policy.Statement.Condition = { NumericGreaterThan:
                        { 's3:max-keys': '100' } };
                    requestContext.query['max-keys'] = '100';
                    check(requestContext, policy, 'Neutral');
                });

            it('should allow access for NumericGreaterThan condition ' +
                'if meet condition',
                () => {
                    policy.Statement.Condition = { NumericGreaterThan:
                        { 's3:max-keys': '100' } };
                    requestContext.query['max-keys'] = '101';
                    check(requestContext, policy, 'Allow');
                });

            it('should be neutral for NumericGreaterThanEquals condition ' +
                'if do not meet condition',
                () => {
                    policy.Statement.Condition = { NumericGreaterThanEquals:
                        { 's3:max-keys': '100' } };
                    requestContext.query['max-keys'] = '99';
                    check(requestContext, policy, 'Neutral');
                });

            it('should allow access for NumericGreaterThanEquals condition ' +
                'if meet condition',
                () => {
                    policy.Statement.Condition = { NumericGreaterThanEquals:
                        { 's3:max-keys': '100' } };
                    requestContext.query['max-keys'] = '100';
                    check(requestContext, policy, 'Allow');
                    requestContext.query['max-keys'] = '101';
                    check(requestContext, policy, 'Allow');
                });

            it('should be neutral for DateEquals condition ' +
                'if do not meet condition',
                () => {
                    policy.Statement.Condition = { DateEquals:
                        { 'aws:TokenIssueTime':
                        '2016-06-30T19:42:23.531Z' } };
                    requestContext.tokenIssueTime =
                        '2016-06-30T19:42:23.431Z';
                    check(requestContext, policy, 'Neutral');
                    requestContext.tokenIssueTime = '1467315743431';
                    check(requestContext, policy, 'Neutral');
                    policy.Statement.Condition = { DateEquals:
                        { 'aws:EpochTime':
                        '1467315743531' } };
                });

            it('should allow access for DateEquals condition ' +
                'if meet condition',
                () => {
                    policy.Statement.Condition = { DateEquals:
                        { 'aws:TokenIssueTime':
                        '2016-06-30T19:42:23.431Z' } };
                    requestContext.tokenIssueTime =
                        '2016-06-30T19:42:23.431Z';
                    check(requestContext, policy, 'Allow');
                    requestContext.tokenIssueTime = '1467315743431';
                    check(requestContext, policy, 'Allow');
                    policy.Statement.Condition = { DateEquals:
                        { 'aws:EpochTime':
                        '1467315743431' } };
                    check(requestContext, policy, 'Allow');
                });

            it('should be neutral for DateNotEquals condition ' +
                'if do not meet condition',
                () => {
                    policy.Statement.Condition = { DateNotEquals:
                        { 'aws:TokenIssueTime':
                        '2016-06-30T19:42:23.431Z' } };
                    requestContext.tokenIssueTime =
                        '2016-06-30T19:42:23.431Z';
                    check(requestContext, policy, 'Neutral');
                    requestContext.tokenIssueTime = '1467315743431';
                    check(requestContext, policy, 'Neutral');
                    policy.Statement.Condition = { DateNotEquals:
                        { 'aws:EpochTime':
                        '1467315743431' } };
                    check(requestContext, policy, 'Neutral');
                });

            it('should allow access for DateNotEquals condition ' +
                'if meet condition',
                () => {
                    policy.Statement.Condition = { DateNotEquals:
                        { 'aws:TokenIssueTime':
                        '2016-06-30T19:42:23.531Z' } };
                    requestContext.tokenIssueTime =
                        '2016-06-30T19:42:23.431Z';
                    check(requestContext, policy, 'Allow');
                    requestContext.tokenIssueTime = '1467315743431';
                    check(requestContext, policy, 'Allow');
                    policy.Statement.Condition = { DateNotEquals:
                        { 'aws:EpochTime':
                        '1467315743531' } };
                    check(requestContext, policy, 'Allow');
                });

            it('should be neutral for DateLessThan condition ' +
                'if do not meet condition',
                () => {
                    policy.Statement.Condition = { DateLessThan:
                        { 'aws:TokenIssueTime':
                        '2016-06-30T19:42:23.431Z' } };
                    requestContext.tokenIssueTime =
                        '2016-06-30T19:42:23.531Z';
                    check(requestContext, policy, 'Neutral');
                    policy.Statement.Condition = { DateLessThan:
                        { 'aws:CurrentTime':
                        '2016-06-30T19:42:23.431Z' } };
                    check(requestContext, policy, 'Neutral');
                    requestContext.tokenIssueTime = '1467315743531';
                    check(requestContext, policy, 'Neutral');
                    policy.Statement.Condition = { DateLessThan:
                        { 'aws:EpochTime':
                        '1467315743431' } };
                    check(requestContext, policy, 'Neutral');
                });

            it('should allow access for DateLessThan condition ' +
                'if meet condition',
                () => {
                    policy.Statement.Condition = { DateLessThan:
                        { 'aws:TokenIssueTime':
                        ['2016-06-30T19:42:23.431Z', '2017-06-30T19:42:23.431Z',
                        '2018-06-30T19:42:23.431Z'] },
                    };
                    requestContext.tokenIssueTime =
                        '2016-06-30T19:42:23.331Z';
                    check(requestContext, policy, 'Allow');
                    policy.Statement.Condition = { DateLessThan:
                        { 'aws:CurrentTime':
                        '2099-06-30T19:42:23.431Z' } };
                    check(requestContext, policy, 'Allow');
                    requestContext.tokenIssueTime = '1467315743331';
                    check(requestContext, policy, 'Allow');
                    policy.Statement.Condition = { DateLessThan:
                        { 'aws:EpochTime':
                        '4086531743431' } };
                    check(requestContext, policy, 'Allow');
                });

            it('should be neutral for DateLessThanEquals condition ' +
                'if do not meet condition',
                () => {
                    policy.Statement.Condition = { DateLessThanEquals:
                        { 'aws:TokenIssueTime':
                        '2016-06-30T19:42:23.431Z' } };
                    requestContext.tokenIssueTime =
                        '2016-06-30T19:42:23.531Z';
                    check(requestContext, policy, 'Neutral');
                    policy.Statement.Condition = { DateLessThanEquals:
                        { 'aws:CurrentTime':
                        '2016-06-30T19:42:23.431Z' } };
                    check(requestContext, policy, 'Neutral');
                });

            it('should allow access for DateLessThanEquals condition ' +
                'if meet condition',
                () => {
                    policy.Statement.Condition = { DateLessThanEquals:
                        { 'aws:TokenIssueTime':
                        '2016-06-30T19:42:23.431Z' } };
                    requestContext.tokenIssueTime =
                        '2016-06-30T19:42:23.431Z';
                    check(requestContext, policy, 'Allow');
                    policy.Statement.Condition = { DateLessThanEquals:
                        { 'aws:CurrentTime':
                        '2099-06-30T19:42:23.431Z' } };
                    check(requestContext, policy, 'Allow');
                });

            it('should be neutral for DateGreaterThan condition ' +
                'if do not meet condition',
                () => {
                    policy.Statement.Condition = { DateGreaterThan:
                        { 'aws:TokenIssueTime':
                        '2016-06-30T19:42:23.431Z' } };
                    requestContext.tokenIssueTime =
                        '2016-06-30T19:42:23.331Z';
                    check(requestContext, policy, 'Neutral');
                    policy.Statement.Condition = { DateGreaterThan:
                        { 'aws:CurrentTime':
                        '2099-06-30T19:42:23.431Z' } };
                    check(requestContext, policy, 'Neutral');
                });

            it('should allow access for DateGreaterThan condition ' +
                'if meet condition',
                () => {
                    policy.Statement.Condition = { DateGreaterThan:
                        { 'aws:TokenIssueTime':
                        '2016-06-30T19:42:23.431Z' } };
                    requestContext.tokenIssueTime =
                        '2016-06-30T19:42:23.531Z';
                    check(requestContext, policy, 'Allow');
                    policy.Statement.Condition = { DateGreaterThan:
                        { 'aws:CurrentTime':
                        '2016-06-30T19:42:23.431Z' } };
                    check(requestContext, policy, 'Allow');
                });

            it('should be neutral for DateGreaterThanEquals condition ' +
                'if do not meet condition',
                () => {
                    policy.Statement.Condition = { DateGreaterThanEquals:
                        { 'aws:TokenIssueTime':
                        '2016-06-30T19:42:23.431Z' } };
                    requestContext.tokenIssueTime =
                        '2016-06-30T19:42:23.331Z';
                    check(requestContext, policy, 'Neutral');
                    policy.Statement.Condition = { DateGreaterThanEquals:
                        { 'aws:CurrentTime':
                        '2099-06-30T19:42:23.431Z' } };
                    check(requestContext, policy, 'Neutral');
                });

            it('should allow access for DateGreaterThanEquals condition ' +
                'if meet condition',
                () => {
                    policy.Statement.Condition = { DateGreaterThanEquals:
                        { 'aws:TokenIssueTime':
                        '2016-06-30T19:42:23.431Z' } };
                    requestContext.tokenIssueTime =
                        '2016-06-30T19:42:23.431Z';
                    check(requestContext, policy, 'Allow');
                    policy.Statement.Condition = { DateGreaterThanEquals:
                        { 'aws:CurrentTime':
                        '2016-06-30T19:42:23.431Z' } };
                    check(requestContext, policy, 'Allow');
                });

            it('should be neutral for Bool condition ' +
                'if do not meet condition',
                () => {
                    policy.Statement.Condition = { Bool:
                        { 'aws:SecureTransport': 'true' } };
                    requestContext.sslEnabled =
                        false;
                    check(requestContext, policy, 'Neutral');
                });

            it('should allow access for Bool condition ' +
                'if meet condition',
                () => {
                    policy.Statement.Condition = { Bool:
                        { 'aws:SecureTransport': 'true' } };
                    requestContext.sslEnabled =
                        true;
                    check(requestContext, policy, 'Allow');
                });

            it('should be neutral for BinaryEquals condition ' +
                'if do not meet condition',
                () => {
                    // Contrived example since applicability
                    // of this operator to S3 is unclear
                    policy.Statement.Condition = { BinaryEquals:
                        { 's3:x-amz-copy-source': 'ZnVja2V0L29iamVjdA==' } };
                    requestContext.headers['x-amz-copy-source'] =
                        'bucket/object';
                    check(requestContext, policy, 'Neutral');
                });

            it('should allow access for BinaryEquals condition ' +
                'if meet condition',
                () => {
                    policy.Statement.Condition = { BinaryEquals:
                        { 's3:x-amz-copy-source': 'YnVja2V0L29iamVjdA==' } };
                    requestContext.headers['x-amz-copy-source'] =
                        'bucket/object';
                    check(requestContext, policy, 'Allow');
                });

            it('should be neutral for BinaryNotEquals condition ' +
                'if do not meet condition',
                () => {
                    policy.Statement.Condition = { BinaryNotEquals:
                        { 's3:x-amz-copy-source': 'YnVja2V0L29iamVjdA==' } };
                    requestContext.headers['x-amz-copy-source'] =
                        'bucket/object';
                    check(requestContext, policy, 'Neutral');
                });

            it('should allow access for BinaryNotEquals condition ' +
                'if meet condition',
                () => {
                    policy.Statement.Condition = { BinaryNotEquals:
                        { 's3:x-amz-copy-source': 'ZnVja2V0L29iamVjdA==' } };
                    requestContext.headers['x-amz-copy-source'] =
                        'bucket/object';
                    check(requestContext, policy, 'Allow');
                });

            it('should be neutral for IpAddress condition ' +
                'if do not meet condition',
                () => {
                    policy.Statement.Condition = { IpAddress:
                        { 'aws:SourceIp': '203.0.113.0/24' } };
                    requestContext.requesterIp = '203.0.114.255';
                    check(requestContext, policy, 'Neutral');
                });

            it('should allow access for IpAddress condition ' +
                'if meet condition',
                () => {
                    policy.Statement.Condition = { IpAddress:
                        { 'aws:SourceIp': '203.0.113.0/24' } };
                    requestContext.requesterIp = '203.0.113.254';
                    check(requestContext, policy, 'Allow');
                });

            it('should be neutral for NotIpAddress condition ' +
                'if do not meet condition',
                () => {
                    policy.Statement.Condition = { NotIpAddress:
                        { 'aws:SourceIp': '203.0.113.0/24' } };
                    requestContext.requesterIp = '203.0.113.0';
                    check(requestContext, policy, 'Neutral');
                });

            it('should allow access for NotIpAddress condition ' +
                'if meet condition',
                () => {
                    policy.Statement.Condition = { NotIpAddress:
                        { 'aws:SourceIp': '203.0.113.0/24' } };
                    requestContext.requesterIp = '203.0.112.254';
                    check(requestContext, policy, 'Allow');
                });

            it('should be neutral for Null condition ' +
                'if do not meet condition',
                () => {
                    policy.Statement.Condition = { Null:
                        { 'aws:TokenIssueTime': 'true' } };
                    requestContext.tokenIssueTime =
                        '2016-06-30T23:26:36.642Z';
                    check(requestContext, policy, 'Neutral');
                });

            it('should allow access for Null condition ' +
                'if meet condition',
                () => {
                    policy.Statement.Condition = { Null:
                        { 'aws:TokenIssueTime': 'true' } };
                    check(requestContext, policy, 'Allow');
                });

            it('should allow access with multiple operator conditions ' +
            'and multiple conditions under an operator',
                () => {
                    policy.Statement.Action = 's3:ListBucket';
                    policy.Statement.Condition = {
                        StringLike: {
                            's3:prefix': 'home/${aws:username}',
                            'aws:UserAgent': ['Cyber*', 's3*'],
                        },
                        StringNotLike: {
                            's3:delimiter': ['/', 'a', 'x'],
                        },
                        NumericLessThanEquals: { 's3:max-keys': '10' },
                    };
                    requestContext.action = 's3:ListBucket';
                    requestContext.requesterInfo.username = 'Pete';
                    requestContext.query.prefix = 'home/Pete';
                    requestContext.headers['user-agent'] = 'CyberSquaw';
                    requestContext.query.delimiter = 'ok';
                    requestContext.query['max-keys'] = '9';
                    check(requestContext, policy, 'Allow');
                });

            it('should be neutral with multiple operator conditions ' +
            'and multiple conditions under an operator if do not pass a ' +
            'condition', () => {
                policy.Statement.Action = 's3:ListBucket';
                policy.Statement.Condition = {
                    StringLike: {
                        's3:prefix': 'home/${aws:username}',
                        'aws:UserAgent': ['Cyber*', 's3*'],
                    },
                    StringNotLike: {
                        's3:delimiter': ['/', 'a', 'x'],
                    },
                    NumericLessThanEquals: { 's3:max-keys': '10' },
                };
                requestContext.action = 's3:ListBucket';
                requestContext.requesterInfo.username = 'Pete';
                requestContext.query.prefix = 'home/Pete';
                requestContext.headers['user-agent'] = 'CyberSquaw';
                requestContext.query.delimiter = 'ok';
                requestContext.query['max-keys'] = '11';
                check(requestContext, policy, 'Neutral');
            });
        });
    });

    describe('evaluate multiple policies', () => {
        it('should deny access if any policy results in a Deny', () => {
            const requestContext = {
                action: 's3:DeleteBucket',
                resource: 'arn:aws:s3:::my_favorite_bucket',
            };
            const result = evaluateAllPolicies(requestContext,
                [samples['arn:aws:iam::aws:policy/AmazonS3FullAccess'],
                samples['Deny Bucket Policy']], log);
            assert.strictEqual(result, 'Deny');
        });

        it('should deny access if request action is not in any policy', () => {
            const requestContext = {
                action: 's3:DeleteObject',
                resource: 'arn:aws:s3:::notVeryPrivate',
                requesterInfo: {},
                headers: {},
                query: {},
            };
            const result = evaluateAllPolicies(requestContext,
                [samples['Multi-Statement Policy'],
                samples['Variable Bucket Policy']], log);
            assert.strictEqual(result, 'Deny');
        });

        it('should deny access if request resource is not in any policy',
            () => {
                const requestContext = {
                    action: 's3:GetObject',
                    resource: 'arn:aws:s3:::notbucket',
                    requesterInfo: {},
                    headers: {},
                    query: {},
                };
                const result = evaluateAllPolicies(requestContext,
                    [samples['Multi-Statement Policy'],
                    samples['Variable Bucket Policy']], log);
                assert.strictEqual(result, 'Deny');
            });
    });
});

describe('handleWildcards', () => {
    it('should convert a string to a regEx string that will match * as ' +
        'unlimited of any character and  will match ? as any single ' +
        'character', () => {
        const result = handleWildcards('lsdkfj?lk*');
        assert.deepStrictEqual(result, '^lsdkfj.{1}lk.*?$');
    });

    it('should convert a string to a regEx string that matches ${*} as ' +
        'the literal character *, matches ${?} as the literal character ? ' +
        'and ${$} as the literal character $', () => {
        const result = handleWildcards('abc${*}abc${?}abc${$}');
        assert.deepStrictEqual(result, '^abc\\*abc\\?abc\\$$');
    });

    it('should escape other regular expression special characters', () => {
        const result = handleWildcards('*^.+?()|[\]{}');
        assert.deepStrictEqual(result,
            '^.*?\\^\\.\\+.{1}\\(\\)\\|\\[\\\]\\{\\}$');
    });
});

describe('substituteVariables', () => {
    const requestContext = {
        requesterInfo: {
            username: 'Peggy',
            userid: '123456789012',
        },
        headers: {},
        query: {},
    };
    it('should substitute one variable', () => {
        const arnEnding = 'bucket/${aws:username}/homedir';
        const result = substituteVariables(arnEnding, requestContext);
        assert.strictEqual(result, 'bucket/Peggy/homedir');
    });

    it('should substitute two variables', () => {
        const arnEnding = 'bucket/${aws:username}/homedir${aws:userid}';
        const result = substituteVariables(arnEnding, requestContext);
        assert.strictEqual(result, 'bucket/Peggy/homedir123456789012');
    });

    it('should substitute two consecutive variables', () => {
        const arnEnding = 'bucket/${aws:username}${aws:userid}';
        const result = substituteVariables(arnEnding, requestContext);
        assert.strictEqual(result, 'bucket/Peggy123456789012');
    });

    it('should leave in place $, ${}, {}, {, }, ${*}, ${?} and ${$}', () => {
        const arnEnding = 'bucket/${*}${?}${$}$${}{}}{';
        const result = substituteVariables(arnEnding, requestContext);
        assert.strictEqual(result, 'bucket/${*}${?}${$}$${}{}}{');
    });

    it('should leave in place any variable whose value is undefined', () => {
        const arnEnding = 'bucket/${aws:principaltype}';
        const result = substituteVariables(arnEnding, requestContext);
        assert.strictEqual(result, 'bucket/${aws:principaltype}');
    });

    it('should leave in place any "${" that is missing a "}"', () => {
        const arnEnding = 'bucket/${aws:username';
        const result = substituteVariables(arnEnding, requestContext);
        assert.strictEqual(result, 'bucket/${aws:username');
    });
});
