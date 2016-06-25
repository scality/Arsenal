'use strict'; // eslint-disable-line strict

const Ajv = require('ajv');
const userPolicySchema = require('./userPolicySchema');
const errors = require('../errors');

const ajValidate = new Ajv({ allErrors: true });
// compiles schema to functions and caches them for all cases
const userPolicyValidate = ajValidate.compile(userPolicySchema);

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

// parse ajv errors and return early with the first relevant error
function _parseErrors(ajvErrors) {
    // deep copy is needed as we have to assign custom error description
    const parsedErr = Object.assign({}, errors.MalformedPolicyDocument);
    parsedErr.description = 'Syntax errors in policy.';
    ajvErrors.some(err => {
        const resource = err.dataPath;
        const field = err.params ? err.params.missingProperty : undefined;
        const errType = err.keyword;
        if (errType === 'type' && (resource === '.Statement' ||
            resource === '.Statement.Resource' ||
            resource === '.Statement.NotResource')) {
            // skip this as this doesn't have enough error context
            return false;
        }
        if (err.keyword === 'required' && field && errDict.required[field]) {
            parsedErr.description = errDict.required[field];
        } else if (err.keyword === 'pattern' &&
            (resource === '.Statement.Action' ||
                resource === '.Statement.NotAction')) {
            parsedErr.description = errDict.pattern.Action;
        } else if (err.keyword === 'pattern' &&
            (resource === '.Statement.Resource' ||
                resource === '.Statement.NotResource')) {
            parsedErr.description = errDict.pattern.Resource;
        } else if (err.keyword === 'minItems' &&
            (resource === '.Statement.Resource' ||
                resource === '.Statement.NotResource')) {
            parsedErr.description = errDict.minItems.Resource;
        }
        return true;
    });
    return parsedErr;
}

// parse JSON safely without throwing an exception
function _safeJSONParse(s) {
    try {
        return JSON.parse(s);
    } catch (e) {
        return e;
    }
}

// validates policy using the validation schema
function _validatePolicy(type, policy) {
    if (type === 'user') {
        const parseRes = _safeJSONParse(policy);
        if (parseRes instanceof Error) {
            return { error: Object.assign({}, errors.MalformedPolicyDocument),
                valid: false };
        }
        userPolicyValidate(parseRes);
        if (userPolicyValidate.errors) {
            return { error: _parseErrors(userPolicyValidate.errors),
                valid: false };
        }
        return { error: null, valid: true };
    }
    // TODO: add support for resource policies
    return { error: errors.NotImplemented, valid: false };
}
/**
* @typedef ValidationResult
* @type Object
* @property {Array|null} error - list of validation errors or null
* @property {Bool} valid - true/false depending on the validation result
*/
/**
* Validates user policy
* @param {String} policy - policy json
* @returns {Object} - returns object with properties error and value
* @returns {ValidationResult} - result of the validation
*/
function validateUserPolicy(policy) {
    return _validatePolicy('user', policy);
}

/**
* Validates resource policy
* @param {String} policy - policy json
* @returns {Object} - returns object with properties error and value
* @returns {ValidationResult} - result of the validation
*/
function validateResourcePolicy(policy) {
    return _validatePolicy('resource', policy);
}

module.exports = {
    validateUserPolicy,
    validateResourcePolicy,
};
