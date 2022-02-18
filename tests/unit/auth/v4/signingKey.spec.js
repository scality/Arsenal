'use strict'; // eslint-disable-line strict

const assert = require('assert');

const calculateSigningKey =
    require('../../../../lib/auth/in_memory/vaultUtilities')
        .calculateSigningKey;

describe('v4 signing key calculation', () => {
    it('should calculate a signing key in accordance with AWS rules', () => {
        const secretKey = 'verySecretKey1';
        const region = 'us-east-1';
        const scopeDate = '20160209';
        const expectedOutput = '5c19fe2935aa4f967549048b6daa85635fb47' +
            'be2938b0899177e5906d4b17221';
        const actualOutput = calculateSigningKey(secretKey, region, scopeDate);
        const buff = Buffer.from(actualOutput, 'binary').toString('hex');
        assert.strictEqual(buff, expectedOutput);
    });
});
