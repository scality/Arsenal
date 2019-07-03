const assert = require('assert');

const BucketPolicy = require('../../../lib/models/BucketPolicy');

const testBucketPolicy = {
    Version: '2012-10-17',
    Statement: [
        {
            Effect: 'Allow',
            Principal: '*',
            Resource: 'arn:aws:s3:::examplebucket',
            Action: 's3:GetBucketLocation',
        },
    ],
};
const mismatchErr = 'Action does not apply to any resource(s) in statement';

function createPolicy(key, value) {
    const newPolicy = Object.assign({}, testBucketPolicy);
    newPolicy.Statement[0][key] = value;
    return newPolicy;
}

function checkErr(policy, err, message) {
    assert.strictEqual(policy.error[err], true);
    assert.strictEqual(policy.error.description, message);
}

describe('BucketPolicy class getBucketPolicy', () => {
    beforeEach(() => {
        testBucketPolicy.Statement[0].Resource = 'arn:aws:s3:::examplebucket';
        testBucketPolicy.Statement[0].Action = 's3:GetBucketLocation';
    });

    it('should return MalformedPolicy error if request json is empty', done => {
        const bucketPolicy = new BucketPolicy('').getBucketPolicy();
        const errMessage = 'request json is empty or undefined';
        checkErr(bucketPolicy, 'MalformedPolicy', errMessage);
        done();
    });

    it('should return MalformedPolicy error if request action is for objects ' +
    'but resource refers to bucket', done => {
        const newPolicy = createPolicy('Action', 's3:GetObject');
        const bucketPolicy = new BucketPolicy(JSON.stringify(newPolicy))
            .getBucketPolicy();
        checkErr(bucketPolicy, 'MalformedPolicy', mismatchErr);
        done();
    });

    it('should return MalformedPolicy error if request resource refers to ' +
    'object but action is for buckets', done => {
        const newPolicy = createPolicy('Resource',
            'arn:aws:s3:::examplebucket/*');
        const bucketPolicy = new BucketPolicy(JSON.stringify(newPolicy))
            .getBucketPolicy();
        checkErr(bucketPolicy, 'MalformedPolicy', mismatchErr);
        done();
    });

    it('should successfully get a valid policy', done => {
        const bucketPolicy = new BucketPolicy(JSON.stringify(testBucketPolicy))
            .getBucketPolicy();
        assert.deepStrictEqual(bucketPolicy, testBucketPolicy);
        done();
    });
});
