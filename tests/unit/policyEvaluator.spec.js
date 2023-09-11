'use strict'; // eslint-disable-line strict

const assert = require('assert');
const fakeTimers = require('@sinonjs/fake-timers');

const evaluator = require('../../lib/policyEvaluator/evaluator');
const evaluatePolicy = evaluator.evaluatePolicy;
const evaluateAllPolicies = evaluator.evaluateAllPolicies;
const evaluateAllPoliciesNew = evaluator.evaluateAllPoliciesNew;
const handleWildcards =
    require('../../lib/policyEvaluator/utils/wildcards').handleWildcards;
const substituteVariables =
    require('../../lib/policyEvaluator/utils/variables').default;
const samples = require('../utils/samplePolicies.json');
const DummyRequestLogger = require('./helpers').DummyRequestLogger;
const RequestContext = require('../../lib/policyEvaluator/RequestContext').default;
const log = new DummyRequestLogger();


function check(requestContext, rcModifiers, policy, expected) {
    const modifiedRequestContext = requestContext;
    Object.keys(rcModifiers).forEach(key => {
        modifiedRequestContext[key] = rcModifiers[key];
    });
    // Note that evaluate policy converts the policy statements into an array
    // so cannot modify the policy conditions after running check function
    const result = evaluatePolicy(requestContext, policy, log);
    assert.deepStrictEqual(result, expected);
}
let policy;
let requestContext;

describe('policyEvaluator', () => {
    describe('evaluate a single policy', () => {
        describe('with basic checks', () => {
            beforeEach(() => {
                requestContext = new RequestContext({}, {}, 'superbucket',
                    undefined, undefined, undefined, 'bucketGet', 's3');
            });
            it('should permit access under full access policy', () => {
                check(requestContext, {},
                    samples['arn:aws:iam::aws:policy/AmazonS3FullAccess'],
                    'Allow');
            });

            it('should permit access under read only policy', () => {
                check(requestContext, {},
                    samples['arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess'],
                    'Allow');
            });

            it('should be neutral under multi-statement ' +
                'policy if request resource not in policy',
            () => {
                check(requestContext, { _apiMethod: 'objectPut' },
                    samples['Multi-Statement Policy'],
                    'Neutral');
            });

            it('should grant access under multi-statement ' +
                'policy if action and resource match those in policy',
            () => {
                const rcModifiers = {
                    _apiMethod: 'objectGet',
                    _generalResource: 'notVeryPrivate',
                    _specificResource: 'object',
                };
                check(requestContext, rcModifiers,
                    samples['Multi-Statement Policy'],
                    'Allow');
            });

            it('should be neutral under multi-statement ' +
                'policy if request action not in policy',
            () => {
                const rcModifiers = {
                    _apiMethod: 'objectDelete',
                    _generalResource: 'notVeryPrivate',
                };
                check(requestContext, rcModifiers,
                    samples['Multi-Statement Policy'],
                    'Neutral');
            });

            it('should allow access under a policy with a variable in the ' +
                'resource', () => {
                const rcModifiers = {
                    _apiMethod: 'objectPut',
                    _generalResource: 'personalbucket',
                    _specificResource: 'Peggy',
                    _requesterInfo: { username: 'Peggy' },
                };
                check(requestContext, rcModifiers,
                    samples['Variable Bucket Policy'],
                    'Allow');
            });

            it('check of action should be case insensitive', () => {
                const rcModifiers = {
                    _apiMethod: 'bucketPut',
                    _generalResource: 'random',
                };
                check(requestContext, rcModifiers,
                    samples['lowercase action'], 'Allow');
            });

            it('should be neutral under a policy with a variable in the ' +
                'resource if the variable value does not match the request',
            () => {
                const rcModifiers = {
                    _apiMethod: 'objectPut',
                    _generalResource: 'personalbucket',
                    _specificResource: 'Joan',
                    _requesterInfo: { username: 'Peggy' },
                };
                check(requestContext, rcModifiers,
                    samples['Variable Bucket Policy'],
                    'Neutral');
            });

            it('should be neutral under a policy with a variable in the ' +
                'resource if the variable value is not supplied by the ' +
                'requestContext', () => {
                const rcModifiers = {
                    _apiMethod: 'objectPut',
                    _generalResource: 'personalbucket',
                    _specificResource: 'Joan',
                    _requesterInfo: {},
                };
                check(requestContext, rcModifiers,
                    samples['Variable Bucket Policy'],
                    'Neutral');
            });
        });

        describe('with NotAction and NotResource', () => {
            beforeEach(() => {
                policy = samples['NotAction and NotResource Example'];
                requestContext = new RequestContext({}, {},
                    'my_corporate_bucket', 'uploads/widgetco/obj',
                    undefined, undefined, 'objectPut', 's3');
            });
            it('should deny access for any action other than the specified ' +
            'NotAction on designated resource in a deny statement', () => {
                const rcModifiers = {
                    _apiMethod: 'objectGet',
                };
                check(requestContext, rcModifiers, policy, 'Deny');
            });

            it('should allow access for action not included in the specified ' +
            'NotAction on designated resource in a deny statement', () => {
                check(requestContext, {}, policy, 'Allow');
            });

            it('should deny access that impacts resource other than that ' +
                'specified in NotResource in Deny policy', () => {
                const rcModifiers = {
                    _generalResource: 'someotherresource',
                    _specificResource: undefined,
                };
                check(requestContext, rcModifiers, policy, 'Deny');
            });

            it('should be neutral on access that impacts resource ' +
                'specified in NotResource in Allow policy', () => {
                const rcModifiers = {
                    _generalResource: 'mybucket',
                    _specificResource: 'CompanySecretInfo',
                };
                check(requestContext, rcModifiers,
                    samples['NotResource Example'], 'Neutral');
            });

            it('should allow access to resource that is not specified ' +
                'as part of NotResource in Allow policy', () => {
                const rcModifiers = {
                    _generalResource: 'someotherresource',
                    _specificResource: 'notIt',
                };
                check(requestContext, rcModifiers,
                    samples['NotResource Example'], 'Allow');
            });
        });

        describe('with conditions', () => {
            beforeEach(() => {
                policy = JSON.
                    parse(JSON.stringify(samples['Simple Bucket Policy']));
                requestContext = new RequestContext({}, {}, 'bucket',
                    undefined, undefined, undefined, 'objectPut', 's3');
                requestContext.setRequesterInfo({});
            });

            it('should allow access under a StringEquals condition if ' +
                'condition passes', () => {
                policy.Statement.Condition = {
                    StringEquals: { 'aws:UserAgent': 'CyberSquaw' },
                };
                const rcModifiers = {
                    _headers: {
                        'user-agent': 'CyberSquaw',
                    },
                };
                check(requestContext, rcModifiers, policy, 'Allow');
            });

            it('should be neutral under a StringEquals condition if condition' +
                ' does not pass', () => {
                policy.Statement.Condition = {
                    StringEquals: { 'aws:UserAgent': 'CyberSquaw' },
                };
                const rcModifiers = {
                    _headers: {
                        'user-agent': 's3cmd',
                    },
                };
                check(requestContext, rcModifiers, policy, 'Neutral');
            });

            it('should allow access under a StringEquals condition if ' +
                'condition passes based on one of many possible values',
            () => {
                policy.Statement.Condition = {
                    StringEquals: { 'aws:UserAgent':
                            ['CyberSquaw', 's3Sergeant', 'jetSetter'] },
                };
                const rcModifiers = {
                    _headers: {
                        'user-agent': 's3Sergeant',
                    },
                };
                check(requestContext, rcModifiers, policy, 'Allow');
            });

            it('should be neutral under a StringEquals condition if ' +
                'condition does not pass based on one of many possible values',
            () => {
                policy.Statement.Condition = {
                    StringEquals: { 'aws:UserAgent':
                                ['CyberSquaw', 's3Sergeant', 'jetSetter'] },
                };
                const rcModifiers = {
                    _headers: {
                        'user-agent': 'secretagent',
                    },
                };
                check(requestContext, rcModifiers, policy, 'Neutral');
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
                const rcModifiers = {
                    _query: {
                        prefix: 'home/Roger/*?*$${}?',
                    },
                    _apiMethod: 'bucketGet',
                    _requesterInfo: { username: 'Roger' },
                };
                check(requestContext, rcModifiers, policy, 'Allow');
            });

            it('should allow access if condition operator has IfExists and ' +
                'key not provided',
            () => {
                policy.Statement.Resource = '*';
                policy.Statement.Condition = {
                    StringLikeIfExists: { 'ec2:InstanceType': [
                        't1.*',
                        't2.*',
                        'm3.*',
                    ] } };
                check(requestContext, {}, policy, 'Allow');
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
                const rcModifiers = {
                    _query: {
                        prefix: 'home/Pete/a/something',
                    },
                    _apiMethod: 'bucketGet',
                    _requesterInfo: { username: 'Pete' },
                };
                check(requestContext, rcModifiers, policy, 'Allow');
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
                const rcModifiers = {
                    _query: {
                        // pattern is home/${aws:username}/?/*
                        prefix: 'home/Pete/ab/something',
                    },
                    _apiMethod: 'bucketGet',
                    _requesterInfo: { username: 'Pete' },
                };
                check(requestContext, rcModifiers, policy, 'Neutral');
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
                const rcModifiers = {
                    _query: {
                        // pattern is home/${aws:username}/?/*
                        prefix: 'home/Pete/ab/something',
                    },
                    _apiMethod: 'bucketGet',
                    _requesterInfo: { username: 'Pete' },
                };
                check(requestContext, rcModifiers, policy, 'Allow');
            });

            it('should allow access for StringNotLike condition if condition' +
            ' parameter is completely missing from request',
            () => {
                policy.Statement.Action = 's3:ListBucket';
                policy.Statement.Resource = '*';
                policy.Statement.Condition = {
                    StringNotLike: { 's3:prefix': [
                        'home/${aws:username}/?/*',
                        'home/',
                    ] } };
                const rcModifiers = {
                    _query: {},
                    _apiMethod: 'bucketGet',
                    _requesterInfo: { username: 'Pete' },
                };
                check(requestContext, rcModifiers, policy, 'Allow');
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
                const rcModifiers = {
                    _query: {
                        // pattern is home/${aws:username}/?/*
                        prefix: 'home/Pete/a/something',
                    },
                    _apiMethod: 'bucketGet',
                    _requesterInfo: { username: 'Pete' },
                };
                check(requestContext, rcModifiers, policy, 'Neutral');
            });

            it('should be neutral for StringNotEquals condition if ' +
            'do not meet condition',
            () => {
                policy.Statement.Resource = 'arn:aws:s3:::bucket/*';
                policy.Statement.Condition = { StringNotEquals:
                    { 's3:x-amz-acl':
                            ['public-read', 'public-read-write'] } };
                const rcModifiers = {
                    _generalResource: 'bucket',
                    _specificResource: 'obj',
                    _headers: {
                        'x-amz-acl': 'public-read-write',
                    },
                };
                check(requestContext, rcModifiers, policy, 'Neutral');
            });

            it('should allow access for StringNotEquals condition if ' +
            'meet condition',
            () => {
                policy.Statement.Resource = 'arn:aws:s3:::bucket/*';
                policy.Statement.Condition = { StringNotEquals:
                    { 's3:x-amz-acl':
                            ['public-read', 'public-read-write'] } };
                const rcModifiers = {
                    _generalResource: 'bucket',
                    _specificResource: 'obj',
                    _headers: {
                        'x-amz-acl': 'private',
                    },
                };
                check(requestContext, rcModifiers, policy, 'Allow');
            });

            it('should allow access for StringNotEquals condition if ' +
            'condition parameter is completely missing from request',
            () => {
                policy.Statement.Resource = 'arn:aws:s3:::bucket/*';
                policy.Statement.Condition = { StringNotEquals:
                    { 's3:x-amz-acl':
                            ['public-read', 'public-read-write'] } };
                const rcModifiers = {
                    _generalResource: 'bucket',
                    _specificResource: 'obj',
                };
                check(requestContext, rcModifiers, policy, 'Allow');
            });

            it('should be neutral for StringEqualsIgnoreCase condition ' +
                'if do not meet condition',
            () => {
                policy.Statement.Condition = { StringEqualsIgnoreCase:
                    { 'aws:UserAgent':
                            ['CyberSquaw', 's3Sergeant', 'jetSetter'] } };
                // Not one of the options
                const rcModifiers = {
                    _headers: {
                        'user-agent': 'builtMyOwn',
                    },
                };
                check(requestContext, rcModifiers, policy, 'Neutral');
            });

            it('should allow access for StringEqualsIgnoreCase condition ' +
                'if meet condition',
            () => {
                policy.Statement.Condition = { StringEqualsIgnoreCase:
                    { 'aws:UserAgent':
                            ['CyberSquaw', 's3Sergeant', 'jetSetter'] } };
                const rcModifiers = {
                    _headers: {
                        'user-agent': 'CYBERSQUAW',
                    },
                };
                check(requestContext, rcModifiers, policy, 'Allow');
            });

            it('should be neutral for StringNotEqualsIgnoreCase condition ' +
                'if do not meet condition',
            () => {
                policy.Statement.Condition = { StringNotEqualsIgnoreCase:
                    { 'aws:UserAgent':
                            ['CyberSquaw', 's3Sergeant', 'jetSetter'] } };
                const rcModifiers = {
                    _headers: {
                        'user-agent': 'cybersquaw',
                    },
                };
                check(requestContext, rcModifiers, policy, 'Neutral');
            });

            it('should allow access for StringNotEqualsIgnoreCase condition ' +
                'if meet condition',
            () => {
                policy.Statement.Condition = { StringNotEqualsIgnoreCase:
                    { 'aws:UserAgent':
                            ['CyberSquaw', 's3Sergeant', 'jetSetter'] } };
                const rcModifiers = {
                    _headers: {
                        'user-agent': 'builtMyOwn',
                    },
                };
                check(requestContext, rcModifiers, policy, 'Allow');
            });
            it('should allow access for StringNotEqualsIgnoreCase condition ' +
                'if condition parameter is completely missing from request',
            () => {
                policy.Statement.Condition = { StringNotEqualsIgnoreCase:
                    { 'aws:UserAgent':
                            ['CyberSquaw', 's3Sergeant', 'jetSetter'] } };
                const rcModifiers = {};
                check(requestContext, rcModifiers, policy, 'Allow');
            });

            it('should be neutral for NumericEquals condition ' +
                'if do not meet condition',
            () => {
                policy.Statement.Condition = { NumericEquals:
                        { 's3:max-keys': '100' } };
                const rcModifiers = { _query: { 'max-keys': '101' } };
                check(requestContext, rcModifiers, policy, 'Neutral');
            });

            it('should allow access for NumericEquals condition ' +
                'if meet condition',
            () => {
                policy.Statement.Condition = { NumericEquals:
                        { 's3:max-keys': '100' } };
                const rcModifiers = { _query: { 'max-keys': '100' } };
                check(requestContext, rcModifiers, policy, 'Allow');
            });

            it('should be neutral for NumericNotEquals condition ' +
                'if do not meet condition',
            () => {
                policy.Statement.Condition = { NumericNotEquals:
                        { 's3:max-keys': '100' } };
                const rcModifiers = { _query: { 'max-keys': '100' } };
                check(requestContext, rcModifiers, policy, 'Neutral');
            });

            it('should allow access for NumericNotEquals condition ' +
                'if meet condition',
            () => {
                policy.Statement.Condition = { NumericNotEquals:
                        { 's3:max-keys': '100' } };
                const rcModifiers = { _query: { 'max-keys': '101' } };
                check(requestContext, rcModifiers, policy, 'Allow');
            });

            it('should allow access for NumericNotEquals condition ' +
                'if condition parameter is completely missing from request',
            () => {
                policy.Statement.Condition = { NumericNotEquals:
                        { 's3:max-keys': '100' } };
                const rcModifiers = {};
                check(requestContext, rcModifiers, policy, 'Allow');
            });

            it('should be neutral for NumericLessThan condition ' +
                'if do not meet condition',
            () => {
                policy.Statement.Condition = { NumericLessThan:
                        { 's3:max-keys': '100' } };
                requestContext._query['max-keys'] = ['100', '200', '300'];
                const rcModifiers = { _query: { 'max-keys':
                        ['100', '200', '300'] } };
                check(requestContext, rcModifiers, policy, 'Neutral');
            });

            it('should allow access for NumericLessThan condition ' +
                'if meet condition',
            () => {
                policy.Statement.Condition = { NumericLessThan:
                        { 's3:max-keys': '100' } };
                const rcModifiers = { _query: { 'max-keys': '99' } };
                check(requestContext, rcModifiers, policy, 'Allow');
            });

            it('should be neutral for NumericLessThanEquals condition ' +
                'if do not meet condition',
            () => {
                policy.Statement.Condition = { NumericLessThanEquals:
                        { 's3:max-keys': '100' } };
                const rcModifiers = { _query: { 'max-keys': '101' } };
                check(requestContext, rcModifiers, policy, 'Neutral');
            });

            it('should allow access for NumericLessThanEquals condition ' +
                'if meet condition',
            () => {
                policy.Statement.Condition = { NumericLessThanEquals:
                        { 's3:max-keys': '100' } };
                let rcModifiers = { _query: { 'max-keys': '100' } };
                check(requestContext, rcModifiers, policy, 'Allow');
                rcModifiers = { _query: { 'max-keys': '99' } };
                check(requestContext, rcModifiers, policy, 'Allow');
            });

            it('should be neutral for NumericGreaterThan condition ' +
                'if do not meet condition',
            () => {
                policy.Statement.Condition = { NumericGreaterThan:
                        { 's3:max-keys': '100' } };
                const rcModifiers = { _query: { 'max-keys': '100' } };
                check(requestContext, rcModifiers, policy, 'Neutral');
            });

            it('should allow access for NumericGreaterThan condition ' +
                'if meet condition',
            () => {
                policy.Statement.Condition = { NumericGreaterThan:
                        { 's3:max-keys': '100' } };
                const rcModifiers = { _query: { 'max-keys': '101' } };
                check(requestContext, rcModifiers, policy, 'Allow');
            });

            it('should be neutral for NumericGreaterThanEquals condition ' +
                'if do not meet condition',
            () => {
                policy.Statement.Condition = { NumericGreaterThanEquals:
                        { 's3:max-keys': '100' } };
                const rcModifiers = { _query: { 'max-keys': '99' } };
                check(requestContext, rcModifiers, policy, 'Neutral');
            });

            it('should allow access for NumericGreaterThanEquals condition ' +
                'if meet condition',
            () => {
                policy.Statement.Condition = { NumericGreaterThanEquals:
                        { 's3:max-keys': '100' } };
                let rcModifiers = { _query: { 'max-keys': '100' } };
                check(requestContext, rcModifiers, policy, 'Allow');
                rcModifiers = { _query: { 'max-keys': '101' } };
                check(requestContext, rcModifiers, policy, 'Allow');
            });

            it('should be neutral for DateEquals condition with ISO date' +
                'if do not meet condition',
            () => {
                policy.Statement.Condition = { DateEquals:
                    { 'aws:TokenIssueTime':
                        '2016-06-30T19:42:23.531Z' } };
                let rcModifiers =
                        { _tokenIssueTime: '2016-06-30T19:42:23.431Z' };
                check(requestContext, rcModifiers, policy, 'Neutral');
                rcModifiers =
                        { _tokenIssueTime: '1467315743431' };
                check(requestContext, rcModifiers, policy, 'Neutral');
            });

            it('should be neutral for DateEquals condition with epoch date' +
                'if do not meet condition',
            () => {
                policy.Statement.Condition =
                    { 'aws:EpochTime':
                        '1467315743531' };
                const rcModifiers =
                            { _tokenIssueTime: '1467315743431' };
                check(requestContext, rcModifiers, policy, 'Neutral');
            });

            it('should allow access for DateEquals condition with ISO time ' +
                'if meet condition',
            () => {
                policy.Statement.Condition = { DateEquals:
                    { 'aws:TokenIssueTime':
                        '2016-06-30T19:42:23.431Z' } };
                let rcModifiers =
                        { _tokenIssueTime: '2016-06-30T19:42:23.431Z' };
                check(requestContext, rcModifiers, policy, 'Allow');
                rcModifiers =
                        { _tokenIssueTime: '1467315743431' };
                check(requestContext, rcModifiers, policy, 'Allow');
            });

            it('should allow access for DateEquals condition with epoch time ' +
                'if meet condition',
            () => {
                const clock = fakeTimers.install({ now: 1467315743431 });
                policy.Statement.Condition = { DateEquals:
                    { 'aws:EpochTime':
                        '1467315743431' } };
                check(requestContext, {}, policy, 'Allow');
                clock.uninstall();
            });

            it('should be neutral for DateNotEquals condition with ISO time' +
                'if do not meet condition',
            () => {
                policy.Statement.Condition = { DateNotEquals:
                    { 'aws:TokenIssueTime':
                        '2016-06-30T19:42:23.431Z' } };
                let rcModifiers =
                        { _tokenIssueTime: '2016-06-30T19:42:23.431Z' };
                check(requestContext, rcModifiers, policy, 'Neutral');
                rcModifiers =
                        { _tokenIssueTime: '1467315743431' };
                check(requestContext, rcModifiers, policy, 'Neutral');
            });

            it('should be neutral for DateNotEquals condition with epoch ' +
                'time if do not meet condition',
            () => {
                const clock = fakeTimers.install({ now: 1467315743431 });
                policy.Statement.Condition = { DateNotEquals:
                    { 'aws:EpochTime':
                        '1467315743431' } };
                check(requestContext, {}, policy, 'Neutral');
                clock.uninstall();
            });

            it('should allow access for DateNotEquals condition with ISO time' +
                'if meet condition',
            () => {
                policy.Statement.Condition = { DateNotEquals:
                    { 'aws:TokenIssueTime':
                        '2016-06-30T19:42:23.531Z' } };
                let rcModifiers =
                        { _tokenIssueTime: '2016-06-30T19:42:23.431Z' };
                check(requestContext, rcModifiers, policy, 'Allow');
                rcModifiers =
                        { _tokenIssueTime: '1467315743431' };
                check(requestContext, rcModifiers, policy, 'Allow');
            });

            it('should allow access for DateNotEquals condition with epoch ' +
            'time if meet condition',
            () => {
                policy.Statement.Condition = { DateNotEquals:
                    { 'aws:EpochTime':
                        '1467315743531' } };
                check(requestContext, {}, policy, 'Allow');
            });

            it('should be neutral for DateLessThan token issue time ' +
            'condition with ISO time if do not meet condition',
            () => {
                policy.Statement.Condition = { DateLessThan:
                    { 'aws:TokenIssueTime':
                        '2016-06-30T19:42:23.431Z' } };
                let rcModifiers =
                        { _tokenIssueTime: '2016-06-30T19:42:23.531Z' };
                check(requestContext, rcModifiers, policy, 'Neutral');
                rcModifiers =
                        { _tokenIssueTime: '1467315743531' };
                check(requestContext, rcModifiers, policy, 'Neutral');
            });

            it('should be neutral for DateLessThan current time condition ' +
                'with ISO time if do not meet condition',
            () => {
                policy.Statement.Condition = { DateLessThan:
                    { 'aws:CurrentTime':
                        '2016-06-30T19:42:23.431Z' } };
                check(requestContext, {}, policy, 'Neutral');
            });

            it('should be neutral for DateLessThan current time condition ' +
                'with epoch time if do not meet condition',
            () => {
                policy.Statement.Condition = { DateLessThan:
                    { 'aws:EpochTime':
                        '1467315743431' } };
                check(requestContext, {}, policy, 'Neutral');
            });

            it('should allow access for DateLessThan ISO token time ' +
                'condition if meet condition',
            () => {
                policy.Statement.Condition = { DateLessThan:
                    { 'aws:TokenIssueTime':
                    ['2016-06-30T19:42:23.431Z', '2017-06-30T19:42:23.431Z',
                        '2018-06-30T19:42:23.431Z'] },
                };
                const rcModifiers =
                        { _tokenIssueTime: '2016-06-30T19:42:23.331Z' };
                check(requestContext, rcModifiers, policy, 'Allow');
            });

            it('should allow access for DateLessThan ISO current time ' +
                'condition if meet condition',
            () => {
                policy.Statement.Condition = { DateLessThan:
                    { 'aws:CurrentTime':
                        '2099-06-30T19:42:23.431Z' } };
                check(requestContext, {}, policy, 'Allow');
                const rcModifiers = { _tokenIssueTime: '1467315743331' };
                check(requestContext, rcModifiers, policy, 'Allow');
            });

            it('should allow access for DateLessThan epoch current time ' +
                'condition if meet condition',
            () => {
                policy.Statement.Condition = { DateLessThan:
                    { 'aws:EpochTime':
                        '4086531743431' } };
                check(requestContext, {}, policy, 'Allow');
            });

            it('should be neutral for DateLessThanEquals token condition ' +
                'with ISO time if do not meet condition',
            () => {
                policy.Statement.Condition = { DateLessThanEquals:
                    { 'aws:TokenIssueTime':
                        '2016-06-30T19:42:23.431Z' } };
                const rcModifiers =
                        { _tokenIssueTime: '2016-06-30T19:42:23.531Z' };
                check(requestContext, rcModifiers, policy, 'Neutral');
            });

            it('should be neutral for DateLessThanEquals current time ' +
                'condition with ISO time if do not meet condition',
            () => {
                policy.Statement.Condition = { DateLessThanEquals:
                    { 'aws:CurrentTime':
                        '2016-06-30T19:42:23.431Z' } };
                check(requestContext, {}, policy, 'Neutral');
            });

            it('should allow access for DateLessThanEquals toekn condition ' +
                'with ISO time if meet condition',
            () => {
                policy.Statement.Condition = { DateLessThanEquals:
                    { 'aws:TokenIssueTime':
                        '2016-06-30T19:42:23.431Z' } };
                const rcModifiers =
                        { _tokenIssueTime: '2016-06-30T19:42:23.431Z' };
                check(requestContext, rcModifiers, policy, 'Allow');
            });

            it('should allow access for DateLessThanEquals current time ' +
                'condition with ISO time if meet condition',
            () => {
                policy.Statement.Condition = { DateLessThanEquals:
                    { 'aws:CurrentTime':
                        '2099-06-30T19:42:23.431Z' } };
                check(requestContext, {}, policy, 'Allow');
            });

            it('should be neutral for DateGreaterThan token condition ' +
                'with ISO time if do not meet condition',
            () => {
                policy.Statement.Condition = { DateGreaterThan:
                    { 'aws:TokenIssueTime':
                        '2016-06-30T19:42:23.431Z' } };
                const rcModifiers =
                        { _tokenIssueTime: '2016-06-30T19:42:23.331Z' };
                check(requestContext, rcModifiers, policy, 'Neutral');
            });

            it('should be neutral for DateGreaterThan current time ' +
                'condition with ISO time if do not meet condition',
            () => {
                policy.Statement.Condition = { DateGreaterThan:
                    { 'aws:CurrentTime':
                        '2099-06-30T19:42:23.431Z' } };
                check(requestContext, {}, policy, 'Neutral');
            });

            it('should allow access for DateGreaterThan token condition ' +
                'with ISO time if meet condition',
            () => {
                policy.Statement.Condition = { DateGreaterThan:
                    { 'aws:TokenIssueTime':
                        '2016-06-30T19:42:23.431Z' } };
                const rcModifiers =
                        { _tokenIssueTime: '2016-06-30T19:42:23.531Z' };
                check(requestContext, rcModifiers, policy, 'Allow');
            });

            it('should allow access for DateGreaterThan current time ' +
                'condition with ISO time if meet condition',
            () => {
                policy.Statement.Condition = { DateGreaterThan:
                    { 'aws:CurrentTime':
                        '2016-06-30T19:42:23.431Z' } };
                check(requestContext, {}, policy, 'Allow');
            });

            it('should be neutral for DateGreaterThanEquals token condition ' +
                'with ISO time if do not meet condition',
            () => {
                policy.Statement.Condition = { DateGreaterThanEquals:
                    { 'aws:TokenIssueTime':
                        '2016-06-30T19:42:23.431Z' } };
                const rcModifiers =
                        { _tokenIssueTime: '2016-06-30T19:42:23.331Z' };
                check(requestContext, rcModifiers, policy, 'Neutral');
            });

            it('should be neutral for DateGreaterThanEquals current time ' +
                'condition with ISO time if do not meet condition',
            () => {
                policy.Statement.Condition = { DateGreaterThanEquals:
                    { 'aws:CurrentTime':
                        '2099-06-30T19:42:23.431Z' } };
                check(requestContext, {}, policy, 'Neutral');
            });

            it('should allow access for DateGreaterThanEquals token ' +
                'condition with ISO time if meet condition',
            () => {
                policy.Statement.Condition = { DateGreaterThanEquals:
                    { 'aws:TokenIssueTime':
                        '2016-06-30T19:42:23.431Z' } };
                const rcModifiers =
                        { _tokenIssueTime: '2016-06-30T19:42:23.431Z' };
                check(requestContext, rcModifiers, policy, 'Allow');
            });

            it('should allow access for DateGreaterThanEquals current ' +
                'time condition with ISO time if meet condition',
            () => {
                policy.Statement.Condition = { DateGreaterThanEquals:
                    { 'aws:CurrentTime':
                        '2016-06-30T19:42:23.431Z' } };
                check(requestContext, {}, policy, 'Allow');
            });

            it('should be neutral for Bool condition ' +
                'if do not meet condition',
            () => {
                policy.Statement.Condition = { Bool:
                        { 'aws:SecureTransport': 'true' } };
                const rcModifiers = { _sslEnabled: false };
                check(requestContext, rcModifiers, policy, 'Neutral');
            });

            it('should allow access for Bool condition ' +
                'if meet condition',
            () => {
                policy.Statement.Condition = { Bool:
                        { 'aws:SecureTransport': 'true' } };
                const rcModifiers = { _sslEnabled: true };
                check(requestContext, rcModifiers, policy, 'Allow');
            });

            it('should be neutral for BinaryEquals condition ' +
                'if do not meet condition',
            () => {
                // Contrived example since applicability
                // of this operator to S3 is unclear
                policy.Statement.Condition = { BinaryEquals:
                        { 's3:x-amz-copy-source': 'ZnVja2V0L29iamVjdA==' } };
                const rcModifiers = { _headers: {
                    'x-amz-copy-source': 'bucket/object',
                } };
                check(requestContext, rcModifiers, policy, 'Neutral');
            });

            it('should allow access for BinaryEquals condition ' +
                'if meet condition',
            () => {
                policy.Statement.Condition = { BinaryEquals:
                        { 's3:x-amz-copy-source': 'YnVja2V0L29iamVjdA==' } };
                const rcModifiers = { _headers: {
                    'x-amz-copy-source': 'bucket/object',
                } };
                check(requestContext, rcModifiers, policy, 'Allow');
            });

            it('should be neutral for BinaryNotEquals condition ' +
                'if do not meet condition',
            () => {
                policy.Statement.Condition = { BinaryNotEquals:
                        { 's3:x-amz-copy-source': 'YnVja2V0L29iamVjdA==' } };
                const rcModifiers = { _headers: {
                    'x-amz-copy-source': 'bucket/object',
                } };
                check(requestContext, rcModifiers, policy, 'Neutral');
            });

            it('should allow access for BinaryNotEquals condition ' +
                'if meet condition',
            () => {
                policy.Statement.Condition = { BinaryNotEquals:
                        { 's3:x-amz-copy-source': 'ZnVja2V0L29iamVjdA==' } };
                const rcModifiers = { _headers: {
                    'x-amz-copy-source': 'bucket/object',
                } };
                check(requestContext, rcModifiers, policy, 'Allow');
            });

            it('should be neutral for IpAddress condition ' +
                'if do not meet condition',
            () => {
                policy.Statement.Condition = { IpAddress:
                        { 'aws:SourceIp': '203.0.113.0/24' } };
                const rcModifiers = { _requesterIp: '203.0.114.255' };
                check(requestContext, rcModifiers, policy, 'Neutral');
            });

            it('should allow access for IpAddress condition ' +
                'if meet condition',
            () => {
                policy.Statement.Condition = { IpAddress:
                        { 'aws:SourceIp': '203.0.113.0/24' } };
                const rcModifiers = { _requesterIp: '203.0.113.254' };
                check(requestContext, rcModifiers, policy, 'Allow');
            });

            it('should be neutral for IpAddress condition ' +
                'if do not meet condition even if ipv4 address is mapped',
            () => {
                policy.Statement.Condition = { IpAddress:
                        { 'aws:SourceIp': '203.0.113.0/24' } };
                const rcModifiers =
                        { _requesterIp: '::ffff:203.0.114.255' };
                check(requestContext, rcModifiers, policy, 'Neutral');
            });

            it('should allow access for IpAddress condition ' +
                'if meet condition even if ipv4 addres is mapped',
            () => {
                policy.Statement.Condition = { IpAddress:
                        { 'aws:SourceIp': '203.0.113.0/24' } };
                const rcModifiers =
                        { _requesterIp: '::ffff:203.0.113.254' };
                check(requestContext, rcModifiers, policy, 'Allow');
            });

            it('should be neutral for IpAddress condition ' +
                'if nonsense is given for ip address in request',
            () => {
                policy.Statement.Condition = { IpAddress:
                        { 'aws:SourceIp': '203.0.113.0/24' } };
                const rcModifiers =
                        { _requesterIp: 'nonsense' };
                check(requestContext, rcModifiers, policy, 'Neutral');
            });

            it('should be neutral for IpAddress condition ' +
                'if nonsense is given for ip address in condition',
            () => {
                policy.Statement.Condition = { IpAddress:
                        { 'aws:SourceIp': 'nonsense' } };
                const rcModifiers =
                        { _requesterIp: '203.0.113.254' };
                check(requestContext, rcModifiers, policy, 'Neutral');
            });

            it('should be neutral for NotIpAddress condition ' +
                'if do not meet condition',
            () => {
                policy.Statement.Condition = { NotIpAddress:
                        { 'aws:SourceIp': '203.0.113.0/24' } };
                const rcModifiers = { _requesterIp: '203.0.113.0' };
                check(requestContext, rcModifiers, policy, 'Neutral');
            });

            it('should allow access for NotIpAddress condition ' +
                'if meet condition',
            () => {
                policy.Statement.Condition = { NotIpAddress:
                        { 'aws:SourceIp': '203.0.113.0/24' } };
                const rcModifiers = { _requesterIp: '203.0.112.254' };
                check(requestContext, rcModifiers, policy, 'Allow');
            });

            it('should be neutral for NotIpAddress condition ' +
                'if do not meet condition even if ipv4 mapped address is used',
            () => {
                policy.Statement.Condition = { NotIpAddress:
                        { 'aws:SourceIp': '203.0.113.0/24' } };
                const rcModifiers =
                        { _requesterIp: '::ffff:203.0.113.254' };
                check(requestContext, rcModifiers, policy, 'Neutral');
            });

            it('should allow access for NotIpAddress condition ' +
                'if meet condition even if ipv4 mapped address is used',
            () => {
                policy.Statement.Condition = { NotIpAddress:
                        { 'aws:SourceIp': '203.0.113.0/24' } };
                const rcModifiers =
                        { _requesterIp: '::ffff:203.0.112.254' };
                check(requestContext, rcModifiers, policy, 'Allow');
            });

            it('should be neutral for Null condition ' +
                'if do not meet condition',
            () => {
                policy.Statement.Condition = { Null:
                        { 'aws:TokenIssueTime': 'true' } };
                const rcModifiers =
                        { _tokenIssueTime: '2016-06-30T23:26:36.642Z' };
                check(requestContext, rcModifiers, policy, 'Neutral');
            });

            it('should allow access for Null condition ' +
                'if meet condition',
            () => {
                policy.Statement.Condition = { Null:
                        { 'aws:TokenIssueTime': 'true' } };
                check(requestContext, {}, policy, 'Allow');
            });

            it('should allow policy arn if meet condition',
                () => {
                    policy.Statement.Condition = {
                        ArnLike: { 'iam:PolicyArn':
                           ['arn:aws:iam::012345678901:policy/dev/*'] },
                    };
                    requestContext.setRequesterInfo(
                        { accountid: '012345678901' });
                    const rcModifiers = {
                        _policyArn:
                            'arn:aws:iam::012345678901:policy/dev/devMachine1',
                    };
                    check(requestContext, rcModifiers, policy, 'Allow');
                });

            it('should not allow policy arn if do not meet condition',
                () => {
                    policy.Statement.Condition = {
                        ArnLike: { 'iam:PolicyArn':
                            ['arn:aws:iam::012345678901:policy/dev/*'] },
                    };
                    requestContext.setRequesterInfo(
                        { accountid: '012345678901' });
                    const rcModifiers = {
                        _policyArn:
                            'arn:aws:iam::012345678901:policy/admin/deleteUser',
                    };
                    check(requestContext, rcModifiers, policy, 'Neutral');
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
                const rcModifiers = {
                    _apiMethod: 'bucketGet',
                    _requesterInfo: { username: 'Pete' },
                    _query: {
                        'prefix': 'home/Pete',
                        'delimiter': 'ok',
                        'max-keys': '9',
                    },
                    _headers: { 'user-agent': 'CyberSquaw' },
                };
                check(requestContext, rcModifiers, policy, 'Allow');
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
                const rcModifiers = {
                    _apiMethod: 'bucketGet',
                    _requesterInfo: { username: 'Pete' },
                    _query: {
                        'prefix': 'home/Pete',
                        'delimiter': 'ok',
                        'max-keys': '11',
                    },
                    _headers: { 'user-agent': 'CyberSquaw' },
                };
                check(requestContext, rcModifiers, policy, 'Neutral');
            });

            it('should allow with ForAnyValue prefix if meet condition', () => {
                policy.Statement.Condition = {
                    'ForAnyValue:StringLike': { 's3:RequestObjectTagKeys': ['tagOne', 'tagTwo'] },
                };
                const rcModifiers = {
                    _requestObjTags: 'tagOne=keyOne&tagThree=keyThree',
                    _needTagEval: true,
                };
                check(requestContext, rcModifiers, policy, 'Allow');
            });

            it('should allow with ForAllValues prefix if meet condition', () => {
                policy.Statement.Condition = {
                    'ForAllValues:StringLike': { 's3:RequestObjectTagKeys': ['tagOne', 'tagTwo'] },
                };
                const rcModifiers = {
                    _requestObjTags: 'tagOne=keyOne&tagTwo=keyTwo',
                    _needTagEval: true,
                };
                check(requestContext, rcModifiers, policy, 'Allow');
            });

            it('should be neutral with ForAnyValue prefix if do not meet condition', () => {
                policy.Statement.Condition = {
                    'ForAnyValue:StringLike': { 's3:RequestObjectTagKeys': ['tagOne', 'tagTwo'] },
                };
                const rcModifiers = {
                    _requestObjTags: 'tagThree=keyThree&tagFour=keyFour',
                    _needTagEval: true,
                };
                check(requestContext, rcModifiers, policy, 'Neutral');
            });

            it('should be neutral with ForAllValues prefix if do not meet condition', () => {
                policy.Statement.Condition = {
                    'ForAllValues:StringLike': { 's3:RequestObjectTagKeys': ['tagOne', 'tagTwo'] },
                };
                const rcModifiers = {
                    _requestObjTags: 'tagOne=keyOne&tagThree=keyThree',
                    _needTagEval: true,
                };
                check(requestContext, rcModifiers, policy, 'Neutral');
            });

            it('should be neutral with StringEquals if condition key does not exist', () => {
                policy.Statement.Condition = {
                    StringEquals: { 's3:Foobar/tagKey': 'tagValue' },
                };
                const rcModifiers = {
                    _requestObjTags: 'tagKey=tagValue',
                    _needTagEval: true,
                };
                check(requestContext, rcModifiers, policy, 'Neutral');
            });
        });

        describe('with multiple statements', () => {
            beforeEach(() => {
                requestContext = new RequestContext({}, {}, 'bucket',
                    undefined, undefined, undefined, 'objectPut', 's3');
                requestContext.setRequesterInfo({});
            });

            const TestMatrix = [
                {
                    statementsToEvaluate: [],
                    expectedPolicyEvaluation: 'Neutral',
                },
                {
                    statementsToEvaluate: [
                        { effect: 'Allow', meetConditions: true },
                    ],
                    expectedPolicyEvaluation: 'Allow',
                },
                {
                    statementsToEvaluate: [
                        { effect: 'Allow', meetConditions: false },
                    ],
                    expectedPolicyEvaluation: 'Neutral',
                },
                {
                    statementsToEvaluate: [
                        { effect: 'Deny', meetConditions: true },
                    ],
                    expectedPolicyEvaluation: 'Deny',
                },
                {
                    statementsToEvaluate: [
                        { effect: 'Deny', meetConditions: false },
                    ],
                    expectedPolicyEvaluation: 'Neutral',
                },
                {
                    statementsToEvaluate: [
                        { effect: 'Allow', meetConditions: false },
                        { effect: 'Allow', meetConditions: true },
                    ],
                    expectedPolicyEvaluation: 'Allow',
                },
                {
                    statementsToEvaluate: [
                        { effect: 'Allow', meetConditions: false },
                        { effect: 'Allow', meetConditions: false },
                    ],
                    expectedPolicyEvaluation: 'Neutral',
                },
                {
                    statementsToEvaluate: [
                        { effect: 'Allow', meetConditions: false },
                        { effect: 'Deny', meetConditions: false },
                    ],
                    expectedPolicyEvaluation: 'Neutral',
                },
                {
                    statementsToEvaluate: [
                        { effect: 'Allow', meetConditions: true },
                        { effect: 'Deny', meetConditions: true },
                    ],
                    expectedPolicyEvaluation: 'Deny',
                },
                {
                    statementsToEvaluate: [
                        { effect: 'Deny', meetConditions: true },
                        { effect: 'Allow', meetConditions: true },
                    ],
                    expectedPolicyEvaluation: 'Deny',
                },
                {
                    statementsToEvaluate: [
                        { effect: 'Allow', meetConditions: true },
                        { effect: 'Deny', meetConditions: false },
                    ],
                    expectedPolicyEvaluation: 'Allow',
                },
                {
                    statementsToEvaluate: [
                        { effect: 'Allow', meetConditions: null },
                    ],
                    expectedPolicyEvaluation: 'AllowWithTagCondition',
                },
                {
                    statementsToEvaluate: [
                        { effect: 'Allow', meetConditions: null },
                        { effect: 'Allow', meetConditions: null },
                    ],
                    expectedPolicyEvaluation: 'AllowWithTagCondition',
                },
                {
                    statementsToEvaluate: [
                        { effect: 'Deny', meetConditions: null },
                    ],
                    expectedPolicyEvaluation: 'DenyWithTagCondition',
                },
                {
                    statementsToEvaluate: [
                        { effect: 'Deny', meetConditions: null },
                        { effect: 'Deny', meetConditions: null },
                    ],
                    expectedPolicyEvaluation: 'DenyWithTagCondition',
                },
                {
                    statementsToEvaluate: [
                        { effect: 'Allow', meetConditions: true },
                        { effect: 'Allow', meetConditions: null },
                    ],
                    expectedPolicyEvaluation: 'Allow',
                },
                {
                    statementsToEvaluate: [
                        { effect: 'Allow', meetConditions: false },
                        { effect: 'Allow', meetConditions: null },
                    ],
                    expectedPolicyEvaluation: 'AllowWithTagCondition',
                },
                {
                    statementsToEvaluate: [
                        { effect: 'Deny', meetConditions: true },
                        { effect: 'Deny', meetConditions: null },
                    ],
                    expectedPolicyEvaluation: 'Deny',
                },
                {
                    statementsToEvaluate: [
                        { effect: 'Deny', meetConditions: true },
                        { effect: 'Allow', meetConditions: null },
                    ],
                    expectedPolicyEvaluation: 'Deny',
                },
                {
                    statementsToEvaluate: [
                        { effect: 'Deny', meetConditions: false },
                        { effect: 'Deny', meetConditions: null },
                    ],
                    expectedPolicyEvaluation: 'DenyWithTagCondition',
                },
                {
                    statementsToEvaluate: [
                        { effect: 'Allow', meetConditions: true },
                        { effect: 'Deny', meetConditions: null },
                    ],
                    expectedPolicyEvaluation: 'DenyWithTagCondition',
                },
                {
                    statementsToEvaluate: [
                        { effect: 'Allow', meetConditions: null },
                        { effect: 'Deny', meetConditions: null },
                    ],
                    expectedPolicyEvaluation: 'DenyWithTagCondition',
                },
            ];

            TestMatrix.forEach(testCase => {
                const policyDesc = testCase.statementsToEvaluate
                    .map(statement => `${statement.effect}(met:${statement.meetConditions})`)
                    .join(', ');
                it(`policy with statements evaluating individually to [${policyDesc}] ` +
                `should return ${testCase.expectedPolicyEvaluation}`, () => {
                    const policy = {
                        Version: '2012-10-17',
                        Statement: testCase.statementsToEvaluate.map(statement => {
                            let condition;
                            if (statement.meetConditions === true) {
                                condition = {
                                    StringEquals: { 'aws:UserAgent': 'CyberSquaw' },
                                };
                            } else if (statement.meetConditions === false) {
                                condition = {
                                    StringEquals: { 'aws:UserAgent': 'OtherAgent' },
                                };
                            } else if (statement.meetConditions === null) {
                                condition = {
                                    StringEquals: { 's3:ExistingObjectTag/tagKey': 'tagValue' },
                                };
                            }
                            return {
                                Effect: statement.effect,
                                Action: 's3:PutObject',
                                Resource: 'arn:aws:s3:::bucket',
                                Condition: condition,
                            };
                        }),
                    };
                    requestContext.setHeaders({
                        'user-agent': 'CyberSquaw',
                    });
                    requestContext.setNeedTagEval(false);

                    const result = evaluatePolicy(requestContext, policy, log);
                    assert.strictEqual(result, testCase.expectedPolicyEvaluation);
                });
            });
        });
    });

    describe('evaluate multiple policies', () => {
        it('should deny access if any policy results in a Deny', () => {
            requestContext = new RequestContext({}, {},
                'my_favorite_bucket', undefined,
                undefined, undefined, 'bucketDelete', 's3');
            requestContext.setRequesterInfo({});
            const result = evaluateAllPolicies(requestContext,
                [samples['arn:aws:iam::aws:policy/AmazonS3FullAccess'],
                    samples['Deny Bucket Policy']], log);
            assert.strictEqual(result, 'Deny');
        });

        it('should deny access if request action is not in any policy', () => {
            requestContext = new RequestContext({}, {},
                'notVeryPrivate', undefined,
                undefined, undefined, 'bucketDelete', 's3');
            requestContext.setRequesterInfo({});
            const result = evaluateAllPolicies(requestContext,
                [samples['Multi-Statement Policy'],
                    samples['Variable Bucket Policy']], log);
            assert.strictEqual(result, 'Deny');
        });

        it('should deny access if request resource is not in any policy', () => {
            requestContext = new RequestContext({}, {},
                'notbucket', undefined,
                undefined, undefined, 'objectGet', 's3');
            requestContext.setRequesterInfo({});
            const result = evaluateAllPolicies(requestContext, [
                samples['Multi-Statement Policy'],
                samples['Variable Bucket Policy'],
            ], log);
            assert.strictEqual(result, 'Deny');
        });

        it('should deny access if any policy results in a Deny', () => {
            requestContext = new RequestContext({}, {},
                'my_favorite_bucket', undefined,
                undefined, undefined, 'bucketDelete', 's3');
            requestContext.setRequesterInfo({});
            const result = evaluateAllPoliciesNew(requestContext,
                [samples['arn:aws:iam::aws:policy/AmazonS3FullAccess'],
                    samples['Deny Bucket Policy']], log);
            assert.deepStrictEqual(result, {
                verdict: 'Deny',
                isImplicit: false,
            });
        });

        it('should deny access if request action is not in any policy', () => {
            requestContext = new RequestContext({}, {},
                'notVeryPrivate', undefined,
                undefined, undefined, 'bucketDelete', 's3');
            requestContext.setRequesterInfo({});
            const result = evaluateAllPoliciesNew(requestContext,
                [samples['Multi-Statement Policy'],
                    samples['Variable Bucket Policy']], log);
            assert.deepStrictEqual(result, {
                verdict: 'Deny',
                isImplicit: true,
            });
        });

        it('should deny access if request resource is not in any policy', () => {
            requestContext = new RequestContext({}, {},
                'notbucket', undefined,
                undefined, undefined, 'objectGet', 's3');
            requestContext.setRequesterInfo({});
            const result = evaluateAllPoliciesNew(requestContext, [
                samples['Multi-Statement Policy'],
                samples['Variable Bucket Policy'],
            ], log);
            assert.deepStrictEqual(result, {
                verdict: 'Deny',
                isImplicit: true,
            });
        });

        const TestMatrixPolicies = {
            Allow: {
                Version: '2012-10-17',
                Statement: {
                    Effect: 'Allow',
                    Action: 's3:*',
                    Resource: '*',
                },
            },
            Neutral: {
                Version: '2012-10-17',
                Statement: {
                    Effect: 'Allow',
                    Action: 's3:*',
                    Resource: 'arn:aws:s3:::other-bucket',
                },
            },
            Deny: {
                Version: '2012-10-17',
                Statement: {
                    Effect: 'Deny',
                    Action: 's3:*',
                    Resource: '*',
                },
            },
            AllowWithTagCondition: {
                Version: '2012-10-17',
                Statement: {
                    Effect: 'Allow',
                    Action: 's3:*',
                    Resource: '*',
                    Condition: {
                        StringEquals: {
                            's3:ExistingObjectTag/tagKey': 'tagValue',
                        },
                    },
                },
            },
            DenyWithTagCondition: {
                Version: '2012-10-17',
                Statement: {
                    Effect: 'Deny',
                    Action: 's3:*',
                    Resource: '*',
                    Condition: {
                        StringEquals: {
                            's3:ExistingObjectTag/tagKey': 'tagValue',
                        },
                    },
                },
            },
        };

        const TestMatrixV2 = [
            {
                policiesToEvaluate: [],
                expectedPolicyEvaluation: {
                    verdict: 'Deny',
                    isImplicit: true,
                },
            },
            {
                policiesToEvaluate: ['Allow'],
                expectedPolicyEvaluation: {
                    verdict: 'Allow',
                    isImplicit: false,
                },
            },
            {
                policiesToEvaluate: ['Neutral'],
                expectedPolicyEvaluation: {
                    verdict: 'Deny',
                    isImplicit: true,
                },
            },
            {
                policiesToEvaluate: ['Deny'],
                expectedPolicyEvaluation: {
                    verdict: 'Deny',
                    isImplicit: false,
                },
            },
            {
                policiesToEvaluate: ['Allow', 'Allow'],
                expectedPolicyEvaluation: {
                    verdict: 'Allow',
                    isImplicit: false,
                },
            },
            {
                policiesToEvaluate: ['Allow', 'Neutral'],
                expectedPolicyEvaluation: {
                    verdict: 'Allow',
                    isImplicit: false,
                },
            },
            {
                policiesToEvaluate: ['Neutral', 'Allow'],
                expectedPolicyEvaluation: {
                    verdict: 'Allow',
                    isImplicit: false,
                },
            },
            {
                policiesToEvaluate: ['Neutral', 'Neutral'],
                expectedPolicyEvaluation: {
                    verdict: 'Deny',
                    isImplicit: true,
                },
            },
            {
                policiesToEvaluate: ['Allow', 'Deny'],
                expectedPolicyEvaluation: {
                    verdict: 'Deny',
                    isImplicit: false,
                },
            },
            {
                policiesToEvaluate: ['AllowWithTagCondition'],
                expectedPolicyEvaluation: {
                    verdict: 'NeedTagConditionEval',
                    isImplicit: false,
                },
            },
            {
                policiesToEvaluate: ['Allow', 'AllowWithTagCondition'],
                expectedPolicyEvaluation: {
                    verdict: 'Allow',
                    isImplicit: false,
                },
            },
            {
                policiesToEvaluate: ['DenyWithTagCondition'],
                expectedPolicyEvaluation: {
                    verdict: 'Deny',
                    isImplicit: true,
                },
            },
            {
                policiesToEvaluate: ['Allow', 'DenyWithTagCondition'],
                expectedPolicyEvaluation: {
                    verdict: 'NeedTagConditionEval',
                    isImplicit: false,
                },
            },
            {
                policiesToEvaluate: ['AllowWithTagCondition', 'DenyWithTagCondition'],
                expectedPolicyEvaluation: {
                    verdict: 'NeedTagConditionEval',
                    isImplicit: false,
                },
            },
            {
                policiesToEvaluate: ['AllowWithTagCondition', 'DenyWithTagCondition', 'Deny'],
                expectedPolicyEvaluation: {
                    verdict: 'Deny',
                    isImplicit: false,
                },
            },
            {
                policiesToEvaluate: ['DenyWithTagCondition', 'AllowWithTagCondition', 'Allow'],
                expectedPolicyEvaluation: {
                    verdict: 'NeedTagConditionEval',
                    isImplicit: false,
                },
            },
        ];

        TestMatrixV2.forEach(testCase => {
            it(`policies evaluating individually to [${testCase.policiesToEvaluate.join(', ')}] `
            + `should return ${testCase.expectedPolicyEvaluation}`, () => {
                requestContext = new RequestContext({}, {},
                    'my_favorite_bucket', undefined,
                    undefined, undefined, 'objectGet', 's3');
                requestContext.setRequesterInfo({});
                const result = evaluateAllPoliciesNew(
                    requestContext,
                    testCase.policiesToEvaluate.map(policyName => TestMatrixPolicies[policyName]),
                    log);
                assert.deepStrictEqual(result, testCase.expectedPolicyEvaluation);
            });
        });

        const TestMatrix = [
            {
                policiesToEvaluate: [],
                expectedPolicyEvaluation: 'Deny',
            },
            {
                policiesToEvaluate: ['Allow'],
                expectedPolicyEvaluation: 'Allow',
            },
            {
                policiesToEvaluate: ['Neutral'],
                expectedPolicyEvaluation: 'Deny',
            },
            {
                policiesToEvaluate: ['Deny'],
                expectedPolicyEvaluation: 'Deny',
            },
            {
                policiesToEvaluate: ['Allow', 'Allow'],
                expectedPolicyEvaluation: 'Allow',
            },
            {
                policiesToEvaluate: ['Allow', 'Neutral'],
                expectedPolicyEvaluation: 'Allow',
            },
            {
                policiesToEvaluate: ['Neutral', 'Allow'],
                expectedPolicyEvaluation: 'Allow',
            },
            {
                policiesToEvaluate: ['Neutral', 'Neutral'],
                expectedPolicyEvaluation: 'Deny',
            },
            {
                policiesToEvaluate: ['Allow', 'Deny'],
                expectedPolicyEvaluation: 'Deny',
            },
            {
                policiesToEvaluate: ['AllowWithTagCondition'],
                expectedPolicyEvaluation: 'NeedTagConditionEval',
            },
            {
                policiesToEvaluate: ['Allow', 'AllowWithTagCondition'],
                expectedPolicyEvaluation: 'Allow',
            },
            {
                policiesToEvaluate: ['DenyWithTagCondition'],
                expectedPolicyEvaluation: 'Deny',
            },
            {
                policiesToEvaluate: ['Allow', 'DenyWithTagCondition'],
                expectedPolicyEvaluation: 'NeedTagConditionEval',
            },
            {
                policiesToEvaluate: ['AllowWithTagCondition', 'DenyWithTagCondition'],
                expectedPolicyEvaluation: 'NeedTagConditionEval',
            },
            {
                policiesToEvaluate: ['AllowWithTagCondition', 'DenyWithTagCondition', 'Deny'],
                expectedPolicyEvaluation: 'Deny',
            },
            {
                policiesToEvaluate: ['DenyWithTagCondition', 'AllowWithTagCondition', 'Allow'],
                expectedPolicyEvaluation: 'NeedTagConditionEval',
            },
        ];

        TestMatrix.forEach(testCase => {
            it(`policies evaluating individually to [${testCase.policiesToEvaluate.join(', ')}] `
            + `should return ${testCase.expectedPolicyEvaluation}`, () => {
                requestContext = new RequestContext({}, {},
                    'my_favorite_bucket', undefined,
                    undefined, undefined, 'objectGet', 's3');
                requestContext.setRequesterInfo({});
                const result = evaluateAllPolicies(
                    requestContext,
                    testCase.policiesToEvaluate.map(policyName => TestMatrixPolicies[policyName]),
                    log);
                assert.strictEqual(result, testCase.expectedPolicyEvaluation);
            });
        });
    });
});

describe('policyEvaluator for utapi', () => {
    it('should permit access to list metrics for bucket named in policy',
        () => {
            const requestContext = new RequestContext({}, {}, 'buckets', 'mine',
                undefined, undefined, 'ListMetrics', 'utapi');
            requestContext.setRequesterInfo({});
            check(requestContext, {},
                samples['utapi list metrics'], 'Allow');
        });

    it('should be neutral on access to list metrics for bucket not ' +
        'named in policy', () => {
        const requestContext = new RequestContext({}, {}, 'buckets', 'notMine',
            undefined, undefined, 'ListMetrics', 'utapi');
        requestContext.setRequesterInfo({});
        check(requestContext, {},
            samples['utapi list metrics'], 'Neutral');
    });

    it('should permit access to list metrics for bucket when accountid in ' +
        'requestContext', () => {
        const requestContext = new RequestContext({}, {}, 'buckets', 'mine',
            undefined, undefined, 'ListMetrics', 'utapi');
        requestContext.setRequesterInfo({ accountid: '012345678901' });
        check(requestContext, {}, samples['utapi list metrics'], 'Allow');
    });

    it('should permit access to list metrics for bucket and account ID named ' +
        'in policy', () => {
        const requestContext = new RequestContext({}, {}, 'buckets', 'mine',
            undefined, undefined, 'ListMetrics', 'utapi');
        requestContext.setRequesterInfo({ accountid: '012345678901' });
        check(requestContext, {},
            samples['utapi list metrics with account ID'], 'Allow');
    });

    it('should be neutral on access to list metrics when accountid in ' +
    'policy differs from accountid in requestContext', () => {
        const requestContext = new RequestContext({}, {}, 'buckets', 'mine',
            undefined, undefined, 'ListMetrics', 'utapi');
        requestContext.setRequesterInfo({ accountid: '000000000000' });
        check(requestContext, {},
            samples['utapi list metrics with account ID'], 'Neutral');
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

    /* eslint-disable no-useless-escape */
    it('should escape other regular expression special characters', () => {
        const result = handleWildcards('*^.+?()|[\]{}');
        assert.deepStrictEqual(result,
            '^.*?\\^\\.\\+.{1}\\(\\)\\|\\[\\\]\\{\\}$');
    });
    /* eslint-enable */
});

describe('substituteVariables', () => {
    const requestContext = new RequestContext({}, {},
        'bucket', undefined,
        undefined, undefined, 'bucketDelete', 's3');
    requestContext.setRequesterInfo({
        username: 'Peggy',
        userid: '123456789012',
    });
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
