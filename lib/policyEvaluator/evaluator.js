'use strict'; // eslint-disable-line strict

const substituteVariables = require('./utils/variables.js');
const handleWildcards = require('./utils/wildcards.js').handleWildcards;
const conditions = require('./utils/conditions.js');
const findConditionKey = conditions.findConditionKey;
const convertConditionOperator = conditions.convertConditionOperator;
const checkArnMatch = require('./utils/checkArnMatch.js');

const evaluators = {};

const operatorsWithVariables = ['StringEquals', 'StringNotEquals',
    'StringEqualsIgnoreCase', 'StringNotEqualsIgnoreCase',
    'StringLike', 'StringNotLike', 'ArnEquals', 'ArnNotEquals',
    'ArnLike', 'ArnNotLike'];
const operatorsWithNegation = ['StringNotEquals',
    'StringNotEqualsIgnoreCase', 'StringNotLike', 'ArnNotEquals',
    'ArnNotLike', 'NumericNotEquals'];


/**
 * Check whether resource in policy statement applies to request resource
 * @param {object} requestContext - info about request
 * @param {string | [string]} statementResource - Resource(s) impacted
 * by policy statement
 * @param {object} log - logger
 * @return {boolean} true if applicable, false if not
 */
function isResourceApplicable(requestContext, statementResource, log) {
    const resource = requestContext.getResource();
    if (!Array.isArray(statementResource)) {
        // eslint-disable-next-line no-param-reassign
        statementResource = [statementResource];
    }
    // ARN format:
    // arn:partition:service:region:namespace:relative-id
    const requestResourceArr = resource.split(':');
    // Pull just the relative id because there is no restriction that it
    // does not contain ":"
    const requestRelativeId = requestResourceArr.slice(5).join(':');
    for (let i = 0; i < statementResource.length; i++) {
        // Handle variables (must handle BEFORE wildcards)
        const policyResource =
            substituteVariables(statementResource[i], requestContext);
        // Handle wildcards
        const arnSegmentsMatch =
            checkArnMatch(policyResource, requestRelativeId,
                requestResourceArr, true);
        if (arnSegmentsMatch) {
            log.trace('policy resource is applicable to request',
            { requestResource: resource, policyResource });
            return true;
        }
        continue;
    }
    log.trace('no policy resource is applicable to request',
        { requestResource: resource });
    // If no match found, no resource is applicable
    return false;
}

/**
 * Check whether action in policy statement applies to request
 * @param {Object} requestAction - Type of client request
 * @param {string | [string]} statementAction - Action(s) impacted
 * by policy statement
 * @param {Object} log - logger
 * @return {boolean} true if applicable, false if not
 */
function isActionApplicable(requestAction, statementAction, log) {
    if (!Array.isArray(statementAction)) {
        // eslint-disable-next-line no-param-reassign
        statementAction = [statementAction];
    }
    const length = statementAction.length;
    for (let i = 0; i < length; i++) {
        // No variables in actions so no need to handle
        const regExStrOfStatementAction =
            handleWildcards(statementAction[i]);
        const actualRegEx = new RegExp(regExStrOfStatementAction, 'i');
        if (actualRegEx.test(requestAction)) {
            log.trace('policy action is applicable to request action', {
                requestAction, policyAction: statementAction[i],
            });
            return true;
        }
    }
    log.trace('no action in policy applicable to request action',
        { requestAction });
    // If no match found, return false
    return false;
}

/**
 * Check whether request meets policy conditions
 * @param {RequestContext} requestContext - info about request
 * @param {Object} statementCondition - Condition statement from policy
 * @param {Object} log - logger
 * @return {boolean} true if meet conditions, false if not
 */
evaluators.meetConditions = (requestContext, statementCondition, log) => {
    // The Condition portion of a policy is an object with different
    // operators as keys
    const operators = Object.keys(statementCondition);
    const length = operators.length;
    for (let i = 0; i < length; i++) {
        const operator = operators[i];
        const hasIfExistsCondition = operator.endsWith('IfExists');
        // If has "IfExists" added to operator name, find operator name
        // without "IfExists"
        const bareOperator = hasIfExistsCondition ? operator.slice(0, -8) :
            operator;
        const operatorCanHaveVariables =
            operatorsWithVariables.indexOf(bareOperator) > -1;
        const isNegationOperator =
            operatorsWithNegation.indexOf(bareOperator) > -1;
        // Loop through conditions with the same operator
        // Note: this should be the actual operator name, not the bareOperator
        const conditionsWithSameOperator = statementCondition[operator];
        const conditionKeys = Object.keys(conditionsWithSameOperator);
        const conditionKeysLength = conditionKeys.length;
        for (let j = 0; j < conditionKeysLength; j++) {
            const key = conditionKeys[j];
            let value = conditionsWithSameOperator[key];
            if (!Array.isArray(value)) {
                value = [value];
            }
            // Handle variables
            if (operatorCanHaveVariables) {
                value = value.map(item =>
                    substituteVariables(item, requestContext));
            }
            // Pull key using requestContext
            // TODO: If applicable to S3, handle policy set operations
            // where a keyBasedOnRequestContext returns multiple values and
            // condition has "ForAnyValue" or "ForAllValues".
            // (see http://docs.aws.amazon.com/IAM/latest/UserGuide/
            // reference_policies_multi-value-conditions.html)
            const keyBasedOnRequestContext =
                findConditionKey(key, requestContext);
            // Handle IfExists and negation operators
            if ((keyBasedOnRequestContext === undefined ||
                keyBasedOnRequestContext === null) &&
                (hasIfExistsCondition || isNegationOperator)) {
                log.trace('satisfies condition due to IfExists operator or ' +
                'negation operator', { method: 'evaluators.evaluatePolicy' });
                continue;
            }
            // If no IfExists qualifier, the key does not exist and the
            // condition operator is not Null, the
            // condition is not met so return false.
            if ((keyBasedOnRequestContext === null ||
                keyBasedOnRequestContext === undefined) &&
                bareOperator !== 'Null') {
                log.trace('condition not satisfied due to ' +
                'missing info', { operator,
                    conditionKey: key, policyValue: value });
                return false;
            }
            // Transalate operator into function using bareOperator
            const operatorFunction = convertConditionOperator(bareOperator);
            // Note: Wildcards are handled in the comparison operator function
            // itself since StringLike, StringNotLike, ArnLike and ArnNotLike
            // are the only operators where wildcards are allowed
            if (!operatorFunction(keyBasedOnRequestContext, value)) {
                log.trace('did not satisfy condition', { operator: bareOperator,
                    keyBasedOnRequestContext, policyValue: value });
                return false;
            }
        }
    }
    return true;
};

/**
 * Evaluate whether a request is permitted under a policy.
 * @param {RequestContext} requestContext - Info necessary to
 * evaluate permission
 * See http://docs.aws.amazon.com/IAM/latest/UserGuide/
 * reference_policies_evaluation-logic.html#policy-eval-reqcontext
 * @param {object} policy - An IAM or resource policy
 * @param {object} log - logger
 * @return {string} Allow if permitted, Deny if not permitted or Neutral
 * if not applicable
 */
evaluators.evaluatePolicy = (requestContext, policy, log) => {
    // TODO: For bucket policies need to add Principal evaluation
    let verdict = 'Neutral';

    if (!Array.isArray(policy.Statement)) {
        // eslint-disable-next-line no-param-reassign
        policy.Statement = [policy.Statement];
    }
    for (let i = 0; i < policy.Statement.length; i++) {
        const currentStatement = policy.Statement[i];
        // If affirmative resource is in policy and request resource is
        // not applicable, move on to next statement
        if (currentStatement.Resource && !isResourceApplicable(requestContext,
            currentStatement.Resource, log)) {
            continue;
        }
        // If NotResource is in policy and resource matches NotResource
        // in policy, move on to next statement
        if (currentStatement.NotResource &&
            isResourceApplicable(requestContext,
            currentStatement.NotResource, log)) {
            continue;
        }
        // If affirmative action is in policy and request action is not
        // applicable, move on to next statement
        if (currentStatement.Action &&
            !isActionApplicable(requestContext.getAction(),
            currentStatement.Action, log)) {
            continue;
        }
        // If NotAction is in policy and action matches NotAction in policy,
        // move on to next statement
        if (currentStatement.NotAction &&
            isActionApplicable(requestContext.getAction(),
            currentStatement.NotAction, log)) {
            continue;
        }
        // If do not meet conditions move on to next statement
        if (currentStatement.Condition &&
            !evaluators.meetConditions(requestContext,
            currentStatement.Condition, log)) {
            continue;
        }
        if (currentStatement.Effect === 'Deny') {
            log.trace('Deny statement applies');
            // Once have Deny, return Deny since deny overrides an allow
            return 'Deny';
        }
        log.trace('Allow statement applies');
        // If statement is applicable, conditions are met and Effect is
        // to Allow, set verdict to Allow
        verdict = 'Allow';
    }
    log.trace('result of evaluating single policy', { verdict });
    return verdict;
};

/**
 * Evaluate whether a request is permitted under a policy.
 * @param {RequestContext} requestContext - Info necessary to
 * evaluate permission
 * See http://docs.aws.amazon.com/IAM/latest/UserGuide/
 * reference_policies_evaluation-logic.html#policy-eval-reqcontext
 * @param {[object]} allPolicies - all applicable IAM or resource policies
 * @param {object} log - logger
 * @return {string} Allow if permitted, Deny if not permitted.
 * Default is to Deny. Deny overrides an Allow
 */
evaluators.evaluateAllPolicies = (requestContext, allPolicies, log) => {
    log.trace('evaluating all policies');
    let verdict = 'Deny';
    for (let i = 0; i < allPolicies.length; i++) {
        const singlePolicyVerdict =
            evaluators.evaluatePolicy(requestContext, allPolicies[i], log);
        // If there is any Deny, just return Deny
        if (singlePolicyVerdict === 'Deny') {
            return 'Deny';
        }
        if (singlePolicyVerdict === 'Allow') {
            verdict = 'Allow';
        }
    }
    log.trace('result of evaluating all pollicies', { verdict });
    return verdict;
};

module.exports = evaluators;
