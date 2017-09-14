const { meetConditions } = require('./evaluator');

/**
 * Class with methods to manage the policy 'principal' validation
 */
class Principal {
    /**
     * Function to evaluate conditions if needed
     *
     * @param {object} params - Evaluation parameters
     * @param {object} statement - Statement policy field
     * @return {boolean} True if meet conditions
     */
    static _evaluateCondition(params, statement) {
        if (statement.Condition) {
            return meetConditions(params.rc, statement.Condition, params.log);
        }
        return true;
    }

    /**
     * Checks principal field against valid principals array
     *
     * @param {object} params - Evaluation parameters
     * @param {object} statement - Statement policy field
     * @param {object} valids - Valid principal fields
     * @return {string} result of principal evaluation, either 'Neutral',
     *  'Allow' or 'Deny'
     */
    static _evaluatePrincipalField(params, statement, valids) {
        const reverse = !!statement.NotPrincipal;
        const principal = statement.Principal || statement.NotPrincipal;
        if (typeof principal === 'string' && principal === '*') {
            if (reverse) {
                // In case of anonymous NotPrincipal, this will neutral everyone
                return 'Neutral';
            }
            if (!Principal._evaluateCondition(params, statement)) {
                return 'Neutral';
            }
            return statement.Effect;
        } else if (typeof principal === 'string') {
            return 'Deny';
        }
        let ref = [];
        let toCheck = [];
        if (valids.Federated && principal.Federated) {
            ref = valids.Federated;
            toCheck = principal.Federated;
        } else if (valids.AWS && principal.AWS) {
            ref = valids.AWS;
            toCheck = principal.AWS;
        } else if (valids.Service && principal.Service) {
            ref = valids.Service;
            toCheck = principal.Service;
        } else {
            if (reverse) {
                return statement.Effect;
            }
            return 'Neutral';
        }
        toCheck = Array.isArray(toCheck) ? toCheck : [toCheck];
        ref = Array.isArray(ref) ? ref : [ref];
        if (toCheck.indexOf('*') !== -1) {
            if (reverse) {
                return 'Neutral';
            }
            if (!Principal._evaluateCondition(params, statement)) {
                return 'Neutral';
            }
            return statement.Effect;
        }
        const len = ref.length;
        for (let i = 0; i < len; ++i) {
            if (toCheck.indexOf(ref[i]) !== -1) {
                if (reverse) {
                    return 'Neutral';
                }
                if (!Principal._evaluateCondition(params, statement)) {
                    return 'Neutral';
                }
                return statement.Effect;
            }
        }
        if (reverse) {
            return statement.Effect;
        }
        return 'Neutral';
    }

    /**
     * Function to evaluate principal of statements against a valid principal
     * array
     *
     * @param {object} params - Evaluation parameters
     * @param {object} valids - Valid principal fields
     * @return {string} result of principal evaluation, either 'Allow' or 'Deny'
     */
    static _evaluatePrincipal(params, valids) {
        const doc = params.trustedPolicy;
        let statements = doc.Statement;
        if (!Array.isArray(statements)) {
            statements = [statements];
        }
        const len = statements.length;
        let authorized = 'Deny';
        for (let i = 0; i < len; ++i) {
            const statement = statements[i];
            const result = Principal._evaluatePrincipalField(params,
                statement, valids);
            if (result === 'Deny') {
                return 'Deny';
            } else if (result === 'Allow') {
                authorized = 'Allow';
            }
        }
        return authorized;
    }

    /**
     * Function to evaluate principal for a policy
     *
     * @param {object} params - Evaluation parameters
     * @return {object} {
     *  result: 'Allow' or 'Deny',
     *  checkAction: true or false,
     * }
     */
    static evaluatePrincipal(params) {
        let valids = null;
        let checkAction = false;
        const account = params.rc.getRequesterAccountId();
        const targetAccount = params.targetAccountId;
        const accountArn = `arn:aws:iam::${account}:root`;
        const requesterArn = params.rc.getRequesterPrincipalArn();
        const requesterEndArn = params.rc.getRequesterEndArn();
        const requesterType = params.rc.getRequesterType();
        if (account !== targetAccount) {
            valids = {
                AWS: [
                    account,
                    accountArn,
                ],
            };
            checkAction = true;
        } else {
            if (requesterType === 'User' || requesterType === 'AssumedRole' ||
                requesterType === 'Federated') {
                valids = {
                    AWS: [
                        account,
                        accountArn,
                    ],
                };
                if (requesterType === 'User' ||
                    requesterType === 'AssumedRole') {
                    valids.AWS.push(requesterArn);
                    if (requesterEndArn !== requesterArn) {
                        valids.AWS.push(requesterEndArn);
                    }
                } else {
                    valids.Federated = [requesterArn];
                }
            } else if (requesterType === 'Service') {
                valids = { Service: requesterArn };
            }
        }
        const result = Principal._evaluatePrincipal(params, valids);
        return {
            result,
            checkAction,
        };
    }
}

module.exports = Principal;
