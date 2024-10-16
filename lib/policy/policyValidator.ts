import Ajv from 'ajv';
import userPolicySchema from './userPolicySchema.json';
import resourcePolicySchema from './resourcePolicySchema.json';
import errors, { ArsenalError } from '../errors';
import draft6 from 'ajv/lib/refs/json-schema-draft-06.json';
const ajValidate = new Ajv({ allErrors: true });
ajValidate.addMetaSchema(draft6);
// compiles schema to functions and caches them for all cases
const userPolicyValidate = ajValidate.compile(userPolicySchema);
const resourcePolicyValidate = ajValidate.compile(resourcePolicySchema);

/**
 * @property error - list of validation errors or null
 * @property valid - true/false depending on the validation result
 */
export type ValidationResult = {
    error: ArsenalError | null
    valid: boolean
}

export type PolicyType = 'user' | 'resource'

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
function _parseErrors(ajvErrors: Ajv.ErrorObject[], policyType: PolicyType) {
    let parsedErr: ArsenalError | undefined;
    if (policyType === 'user') {
        // deep copy is needed as we have to assign custom error description
        parsedErr = errors.MalformedPolicyDocument;
    }
    if (policyType === 'resource') {
        parsedErr = errors.MalformedPolicy;
    }
    ajvErrors.some(err => {
        const resource = err.dataPath;
        const field = (err.params as Ajv.RequiredParams | undefined)?.missingProperty;
        const errType = err.keyword;
        if (errType === 'type' && (resource === '.Statement' ||
            resource.includes('.Resource') ||
            resource.includes('.NotResource'))) {
            // skip this as this doesn't have enough error context
            return false;
        }
        if (err.keyword === 'required' && field && errDict.required[field]) {
            parsedErr = parsedErr?.customizeDescription(errDict.required[field]);
        } else if (err.keyword === 'pattern' &&
            (resource.includes('.Action') ||
                resource.includes('.NotAction'))) {
            parsedErr = parsedErr?.customizeDescription(errDict.pattern.Action);
        } else if (err.keyword === 'pattern' &&
            (resource.includes('.Resource') ||
                resource.includes('.NotResource'))) {
            parsedErr = parsedErr?.customizeDescription(errDict.pattern.Resource);
        } else if (err.keyword === 'minItems' &&
            (resource.includes('.Resource') ||
                resource.includes('.NotResource'))) {
            parsedErr = parsedErr?.customizeDescription(errDict.minItems.Resource);
        }
        return true;
    });
    return parsedErr ?? null;
}

// parse JSON safely without throwing an exception
function _safeJSONParse(s: string) {
    try {
        return JSON.parse(s);
    } catch (e) {
        return e;
    }
}

// validates policy using the validation schema
function _validatePolicy(type: PolicyType, policy: string): ValidationResult {
    if (type === 'user') {
        const parseRes = _safeJSONParse(policy);
        if (parseRes instanceof Error) {
            return { error: errors.MalformedPolicyDocument, valid: false };
        }
        userPolicyValidate(parseRes);
        if (userPolicyValidate.errors) {
            return { error: _parseErrors(userPolicyValidate.errors, 'user'),
                valid: false };
        }
        return { error: null, valid: true };
    }
    if (type === 'resource') {
        const parseRes = _safeJSONParse(policy);
        if (parseRes instanceof Error) {
            return { error: errors.MalformedPolicy, valid: false };
        }
        resourcePolicyValidate(parseRes);
        if (resourcePolicyValidate.errors) {
            return { error: _parseErrors(resourcePolicyValidate.errors,
                'resource'), valid: false };
        }
        return { error: null, valid: true };
    }
    return { error: errors.NotImplemented, valid: false };
}
/**
* Validates user policy
* @param policy - policy json
* @returns - returns object with properties error and value
* @returns - result of the validation
*/
export function validateUserPolicy(policy: string) {
    return _validatePolicy('user', policy);
}

/**
* Validates resource policy
* @param policy - policy json
* @returns - returns object with properties error and value
* @returns - result of the validation
*/
export function validateResourcePolicy(policy: string) {
    return _validatePolicy('resource', policy);
}
