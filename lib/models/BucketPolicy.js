const assert = require('assert');

const errors = require('../errors');
const { validateResourcePolicy } = require('../policy/policyValidator');

/**
 * Format of json policy:
 *  {
 *      "Id": "Policy id",
 *      "Version": "version date",
 *      "Statement": [
 *          {
 *              "Sid": "Statement id",
 *              "Effect": "Allow",
 *              "Principal": "*",
 *              "Action": "s3:*",
 *              "Resource": "arn:aws:s3:::examplebucket/bucket2/object"
 *          },
 *          {
 *              "Sid": "Statement id",
 *              "Effect": "Deny",
 *              "Principal": {
 *                  "AWS": ["arn:aws:iam::<account_id>", "different_account_id"]
 *              },
 *              "Action": [ "s3:*" ],
 *              "Resource": [
 *                  "arn:aws:s3:::examplebucket", "arn:aws:s3:::otherbucket/*"],
 *              "Condition": {
 *                 "StringNotLike": {
 *                      "aws:Referer": [
 *                          "http://www.example.com/", "http://example.com/*"]
 *                  }
 *              }
 *          }
 *      ]
 *  }
 */

class BucketPolicy {
    /**
     * Create a Bucket Policy instance
     * @param {string} json - the json policy
     * @return {object} - BucketPolicy instance
     */
    constructor(json) {
        this._json = json;
        this._policy = {};
    }

    /**
     * Get the bucket policy
     * @return {object} - the bucket policy or error
     */
    getBucketPolicy() {
        const policy = this._getPolicy();
        return policy;
    }

    /**
     * Get the bucket policy array
     * @return {object} - contains error if policy validation fails
     */
    _getPolicy() {
        if (!this._json || this._json === '') {
            return { error: errors.MalformedPolicy.customizeDescription(
                'request json is empty or undefined') };
        }
        const validSchema = validateResourcePolicy(this._json);
        if (validSchema.error) {
            return validSchema;
        }
        this._setStatementArray();
        const valAcRes = this._validateActionResource();
        if (valAcRes.error) {
            return valAcRes;
        }

        return this._policy;
    }

    _setStatementArray() {
        this._policy = JSON.parse(this._json);
        if (!Array.isArray(this._policy.Statement)) {
            const statement = this._policy.Statement;
            this._policy.Statement = [statement];
        }
    }

    /**
     * Validate action and resource are compatible
     * @return {error} - contains error or empty obj
     */
    _validateActionResource() {
        const invalid = this._policy.Statement.every(s => {
            const actions = typeof s.Action === 'string' ?
                [s.Action] : s.Action;
            const resources = typeof s.Resource === 'string' ?
                [s.Resource] : s.Resource;
            const objectAction = actions.some(a => a.includes('Object'));
            // wildcardObjectAction checks for actions such as 's3:*' or
            // 's3:Put*' but will return false for actions such as
            // 's3:PutBucket*'
            const wildcardObjectAction = actions.some(
                a => a.includes('*') && !a.includes('Bucket'));
            const objectResource = resources.some(r => r.includes('/'));
            return ((objectAction && !objectResource) ||
                (objectResource && !objectAction && !wildcardObjectAction));
        });
        if (invalid) {
            return { error: errors.MalformedPolicy.customizeDescription(
                'Action does not apply to any resource(s) in statement') };
        }
        return {};
    }

    /**
     * Call resource policy schema validation function
     * @param {object} policy - the bucket policy object to validate
     * @return {undefined}
     */
    static validatePolicy(policy) {
        // only the BucketInfo constructor calls this function
        // and BucketInfo will always be passed an object
        const validated = validateResourcePolicy(JSON.stringify(policy));
        assert.deepStrictEqual(validated, { error: null, valid: true });
    }
}

module.exports = BucketPolicy;
