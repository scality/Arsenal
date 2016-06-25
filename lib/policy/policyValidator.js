'use strict'; // eslint-disable-line strict

const Ajv = require('ajv');
const userPolicySchema = require('./userPolicySchema');
const errors = require('../errors');

const ajValidate = new Ajv({ allErrors: true });
// compiles schema to functions and caches them for all cases
const userPolicyValidate = ajValidate.compile(userPolicySchema);

// parse ajv errors and build list of erros
function _parseErrors(ajvErrors) {
    let parsedErr;
    ajvErrors.some(err => {
        const resource = err.dataPath.replace('.', '');
        if (err.keyword === 'required' && err.params) {
            const field = err.params.missingProperty;
            if (field === 'Version') {
                parsedErr = errors.MissingPolicyVersion;
            } else if (field === 'Statement') {
                parsedErr = errors.MissingPolicyStatement;
            } else if (field === 'Action') {
                parsedErr = errors.MissingPolicyAction;
            } else if (field === 'Effect') {
                parsedErr = errors.MissingPolicyEffect;
            } else if (field === 'Resource') {
                parsedErr = errors.MissingPolicyResource;
            } else {
                parsedErr = errors.InvalidPolicyDocument;
            }
        } else if (err.keyword === 'minItems' && resource === 'Statement') {
            parsedErr = errors.InvalidPolicyStatement;
        } else if (err.keyword === 'pattern') {
            parsedErr = errors.InvalidPolicyDocument;
        } else if (err.keyword === 'type') {
            // skip if it's Statement as it does not have enough
            // error context
            if (resource === 'Version') {
                parsedErr = errors.PolicyInvalidVersion;
            }
        } else {
            parsedErr = errors.InvalidPolicyDocument;
        }
        return parsedErr instanceof Error;
    });
    return parsedErr;
}


// parse JSON safely without throwing an exception
function _safeJSONParse(s) {
    let res;
    try {
        res = JSON.parse(s);
    } catch (e) {
        return e;
    }
    return res;
}


// validates policy using the validation schema
function _validatePolicy(type, policy) {
    if (type === 'user') {
        const parseRes = _safeJSONParse(policy);
        if (parseRes instanceof Error) {
            return { error: errors.PolicyInvalidJSON, valid: false };
        }
        userPolicyValidate(parseRes);
        if (userPolicyValidate.errors) {
            return { error: _parseErrors(userPolicyValidate.errors),
                valid: false };
        }
        return { error: null, valid: true };
    }
    // todo: add support for resource policies
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
