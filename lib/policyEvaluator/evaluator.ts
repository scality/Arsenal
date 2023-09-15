import substituteVariables from './utils/variables';
import { handleWildcards } from './utils/wildcards';
import { findConditionKey, convertConditionOperator } from './utils/conditions';
import checkArnMatch from './utils/checkArnMatch';
import { transformTagKeyValue } from './utils/objectTags';
import RequestContext from './RequestContext';
import { Logger } from 'werelogs';

const operatorsWithVariables = ['StringEquals', 'StringNotEquals',
    'StringEqualsIgnoreCase', 'StringNotEqualsIgnoreCase',
    'StringLike', 'StringNotLike', 'ArnEquals', 'ArnNotEquals',
    'ArnLike', 'ArnNotLike'];
const operatorsWithNegation = ['StringNotEquals',
    'StringNotEqualsIgnoreCase', 'StringNotLike', 'ArnNotEquals',
    'ArnNotLike', 'NumericNotEquals'];
const tagConditions = new Set([
    's3:ExistingObjectTag',
    's3:RequestObjectTagKey',
    's3:RequestObjectTagKeys',
]);


/**
 * Check whether resource in policy statement applies to request resource
 * @param requestContext - info about request
 * @param statementResource - Resource(s) impacted
 * by policy statement
 * @param log - logger
 * @return true if applicable, false if not
 */
export function isResourceApplicable(
    requestContext: RequestContext,
    statementResource: string | string[],
    log: Logger,
): boolean {
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
 * @param requestAction - Type of client request
 * @param statementAction - Action(s) impacted
 * by policy statement
 * @param log - logger
 * @return true if applicable, false if not
 */
export function isActionApplicable(
    requestAction: string,
    statementAction: string | string[],
    log: Logger,
): boolean {
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
 * @param {object} statementCondition - Condition statement from policy
 * @param {Logger} log - logger
 * @return {boolean|null} a condition evaluation result, one of:
 * - true: condition is met
 * - false: condition is not met
 * - null: condition evaluation requires additional info to be
 *   provided (namely, for tag conditions, request tags and/or object
 *   tags have to be provided to evaluate the condition)
 */
export function meetConditions(
    requestContext: RequestContext,
    statementCondition: any,
    log: Logger,
): boolean | null {
    let hasTagConditions = false;
    // The Condition portion of a policy is an object with different
    // operators as keys
    for (const operator of Object.keys(statementCondition)) {
        const hasPrefix = operator.includes(':');
        const hasIfExistsCondition = operator.endsWith('IfExists');
        // If has "IfExists" added to operator name, or operator has "ForAnyValue" or
        // "ForAllValues" prefix, find operator name without "IfExists" or prefix
        let bareOperator = hasIfExistsCondition ? operator.slice(0, -8) :
            operator;
        let prefix: string | undefined;
        if (hasPrefix) {
            [prefix, bareOperator] = bareOperator.split(':');
        }
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
                value = value.map((item: any) =>
                    substituteVariables(item, requestContext));
            }
            // if condition key is RequestObjectTag or ExistingObjectTag,
            // tag key is included in condition key and needs to be
            // moved to value for evaluation, otherwise key/value are unchanged
            const [transformedKey, transformedValue] = transformTagKeyValue(key, value);
            if (tagConditions.has(transformedKey) && !requestContext.getNeedTagEval()) {
                hasTagConditions = true;
                continue;
            }
            // Pull key using requestContext
            // TODO: If applicable to S3, handle policy set operations
            // where a keyBasedOnRequestContext returns multiple values and
            // condition has "ForAnyValue" or "ForAllValues".
            // (see http://docs.aws.amazon.com/IAM/latest/UserGuide/
            // reference_policies_multi-value-conditions.html)
            let keyBasedOnRequestContext =
                findConditionKey(transformedKey, requestContext);
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
                    conditionKey: transformedKey, policyValue: transformedValue });
                return false;
            }
            // If condition operator prefix is included, the key should be an array
            if (prefix && !Array.isArray(keyBasedOnRequestContext)) {
                keyBasedOnRequestContext = [keyBasedOnRequestContext];
            }
            // Transalate operator into function using bareOperator
            const operatorFunction = convertConditionOperator(bareOperator);
            // Note: Wildcards are handled in the comparison operator function
            // itself since StringLike, StringNotLike, ArnLike and ArnNotLike
            // are the only operators where wildcards are allowed
            // @ts-expect-error
            if (!operatorFunction(keyBasedOnRequestContext, transformedValue, prefix)) {
                log.trace('did not satisfy condition', { operator: bareOperator,
                    keyBasedOnRequestContext, policyValue: transformedValue });
                return false;
            }
        }
    }
    // one or more conditions required tag info to be evaluated
    if (hasTagConditions) {
        return null;
    }
    return true;
}

/**
 * Evaluate whether a request is permitted under a policy.
 * @param requestContext - Info necessary to
 * evaluate permission
 * See http://docs.aws.amazon.com/IAM/latest/UserGuide/
 * reference_policies_evaluation-logic.html#policy-eval-reqcontext
 * @param policy - An IAM or resource policy
 * @param log - logger
 * @return Allow if permitted, Deny if not permitted or Neutral
 * if not applicable
 */
export function evaluatePolicy(
    requestContext: RequestContext,
    policy: any,
    log: Logger,
): string {
    // TODO: For bucket policies need to add Principal evaluation
    let allow = false;
    let allowWithTagCondition = false;
    let denyWithTagCondition = false;

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
        const conditionEval = currentStatement.Condition ?
            meetConditions(requestContext, currentStatement.Condition, log) :
            true;
        // If do not meet conditions move on to next statement
        if (conditionEval === false) {
            continue;
        }
        // If condition needs tag info to be evaluated, mark and move on to next statement
        if (conditionEval === null) {
            if (currentStatement.Effect === 'Deny') {
                denyWithTagCondition = true;
            } else {
                allowWithTagCondition = true;
            }
            continue;
        }
        if (currentStatement.Effect === 'Deny') {
            log.trace('Deny statement applies');
            // Once have Deny, return Deny since deny overrides an allow
            return 'Deny';
        }
        log.trace('Allow statement applies');
        // statement is applicable, conditions are met and Effect is
        // to Allow
        allow = true;
    }
    let verdict;
    if (denyWithTagCondition) {
        // priority is on checking tags to potentially deny
        verdict = 'DenyWithTagCondition';
    } else if (allow) {
        // at least one statement is an allow
        verdict = 'Allow';
    } else if (allowWithTagCondition) {
        // all allow statements need tag checks
        verdict = 'AllowWithTagCondition';
    } else {
        // no statement matched to allow or deny
        verdict = 'Neutral';
    }
    log.trace('result of evaluating single policy', { verdict });
    return verdict;
}

/**
 * @deprecated Upgrade to evaluateAllPoliciesNew
 * Evaluate whether a request is permitted under a policy.
 * @param requestContext - Info necessary to
 * evaluate permission
 * See http://docs.aws.amazon.com/IAM/latest/UserGuide/
 * reference_policies_evaluation-logic.html#policy-eval-reqcontext
 * @param allPolicies - all applicable IAM or resource policies
 * @param log - logger
 * @return Allow if permitted, Deny if not permitted.
 * Default is to Deny. Deny overrides an Allow
 */
export function evaluateAllPolicies(
    requestContext: RequestContext,
    allPolicies: any[],
    log: Logger,
): string {
    return evaluateAllPoliciesNew(requestContext, allPolicies, log).verdict;
}
export function evaluateAllPoliciesNew(
    requestContext: RequestContext,
    allPolicies: any[],
    log: Logger,
): {
    verdict: string;
    isImplicit: boolean;
} {
    log.trace('evaluating all policies');
    let allow = false;
    let allowWithTagCondition = false;
    let denyWithTagCondition = false;
    for (let i = 0; i < allPolicies.length; i++) {
        const singlePolicyVerdict = evaluatePolicy(requestContext, allPolicies[i], log);
        // If there is any Deny, just return Deny
        if (singlePolicyVerdict === 'Deny') {
            return {
                verdict: 'Deny',
                isImplicit: false,
            };
        }
        if (singlePolicyVerdict === 'Allow') {
            allow = true;
        } else if (singlePolicyVerdict === 'AllowWithTagCondition') {
            allowWithTagCondition = true;
        } else if (singlePolicyVerdict === 'DenyWithTagCondition') {
            denyWithTagCondition = true;
        } // else 'Neutral'
    }
    let verdict;
    let isImplicit = false;
    if (allow) {
        if (denyWithTagCondition) {
            verdict = 'NeedTagConditionEval';
        } else {
            verdict = 'Allow';
        }
    } else {
        if (allowWithTagCondition) {
            verdict = 'NeedTagConditionEval';
        } else {
            verdict = 'Deny';
            isImplicit = true;
        }
    }
    log.trace('result of evaluating all policies', { verdict, isImplicit });
    return { verdict, isImplicit };
}
