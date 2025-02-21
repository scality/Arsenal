import assert from 'assert';
import { ArsenalError, errorInstances } from '../errors';
import { validateResourcePolicy } from '../policy/policyValidator';

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

const objectActions = [
    's3:AbortMultipartUpload',
    's3:DeleteObject',
    's3:DeleteObjectTagging',
    's3:GetObject',
    's3:GetObjectAcl',
    's3:GetObjectTagging',
    's3:ListMultipartUploadParts',
    's3:PutObject',
    's3:PutObjectAcl',
    's3:PutObjectTagging',
];

export type BucketPolicyMetadata = {
    Id: string;
    Version: string;
    Statement: {
        Sid: string;
        Effect: string;
        Principal: string | { AWS: string[] };
        Action: string | string[];
        Resource: string | string[];
        Condition?: { [key: string]: string | string[] };
    }[],
};

export default class BucketPolicy {
    private json: string;
    private policy: BucketPolicyMetadata | null = null;

    /**
     * Create a Bucket Policy instance
     * @param json - the json policy
     * @return - BucketPolicy instance
     */
    constructor(json: string) {
        this.json = json;
    }

    /**
     * Get the bucket policy
     * @return - the bucket policy or error
     */
    getBucketPolicy() {
        const policy = this.getPolicy();
        return policy;
    }

    /**
     * Get the bucket policy array
     * @return - contains error if policy validation fails
     */
    private getPolicy(): { error: ArsenalError } | any {
        if (!this.json || this.json === '') {
            return { error: errorInstances.MalformedPolicy.customizeDescription(
                'request json is empty or undefined') };
        }
        const validSchema = validateResourcePolicy(this.json);
        if (validSchema.error) {
            return validSchema;
        }
        this.setStatementArray();
        const valAcRes = this.validateActionResource();
        if (valAcRes.error) {
            return valAcRes;
        }

        return this.policy;
    }

    private setStatementArray() {
        this.policy = <BucketPolicyMetadata>JSON.parse(this.json);
        if (!Array.isArray(this.policy.Statement)) {
            const statement = this.policy.Statement;
            this.policy.Statement = [statement];
        }
    }

    /**
     * Validate action and resource are compatible
     * @return - contains error or empty obj
     */
    private validateActionResource(): { error?: ArsenalError } {
        const invalid = this.policy?.Statement.every((s: any) => {
            const actions: string[] = typeof s.Action === 'string' ?
                [s.Action] : s.Action;
            const resources: string[] = typeof s.Resource === 'string' ?
                [s.Resource] : s.Resource;
            const objectAction = actions.some(a =>
                a.includes('Object') || objectActions.includes(a));
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
            return { error: errorInstances.MalformedPolicy.customizeDescription(
                'Action does not apply to any resource(s) in statement') };
        }
        return {};
    }

    /**
     * Call resource policy schema validation function
     * @param policy - the bucket policy object to validate
     */
    static validatePolicy(policy: BucketPolicyMetadata) {
        // only the BucketInfo constructor calls this function
        // and BucketInfo will always be passed an object
        const validated = validateResourcePolicy(JSON.stringify(policy));
        assert.deepStrictEqual(validated, { error: null, valid: true });
    }
}
