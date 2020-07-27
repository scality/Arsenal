const assert = require('assert');
const routesUtils = require('../../../../lib/s3routes/routesUtils.js');

const bannedStr = 'banned';
const prefixBlacklist = [];
const validBucketNamesWithDotsAndHyphens = [
    'my-bucket',
    'my.bucket',
    'my-bucket-01',
    '01-my-bucket',
    'my.bucket.01',
    '01.my.bucket',
    'my.bucket-01',
    'my-bucket.01',
    'my--bucket--01',
    'my--bucket.01',
    'my.bucket--01',
];
const invalidBucketNamesWithDotsAndHyphens = [
    '-my-bucket',
    '.my.bucket',
    'my-bucket-',
    'my.bucket.',
    'my..bucket',
    'my-.bucket',
    'my.-bucket',
];

describe('routesUtils.isValidBucketName', () => {
    it('should return false if bucketname is fewer than ' +
        '3 characters long', () => {
        const result = routesUtils.isValidBucketName('no', prefixBlacklist);
        assert.strictEqual(result, false);
    });

    it('should return false if bucketname is greater than ' +
        '255 characters long', () => {
        const longString = 'a'.repeat(256);
        const result =
            routesUtils.isValidBucketName(longString, prefixBlacklist);
        assert.strictEqual(result, false);
    });

    it('should return false if bucketname contains capital letters ' +
        'and is not whitelisted', () => {
        const result =
            routesUtils.isValidBucketName('noSHOUTING', prefixBlacklist);
        assert.strictEqual(result, false);
    });

    it('should return true if bucketname contains capital letters ' +
        'but is whitelisted', () => {
        const result =
            routesUtils.isValidBucketName('METADATA', prefixBlacklist);
        assert.strictEqual(result, true);
    });

    it('should return false if bucketname starts w/ blacklisted prefix', () => {
        const result =
            routesUtils.isValidBucketName('bannedbucket', [bannedStr]);
        assert.strictEqual(result, false);
    });

    it('should return false if bucketname is an IP address', () => {
        const result =
            routesUtils.isValidBucketName('172.16.254.1', prefixBlacklist);
        assert.strictEqual(result, false);
    });

    it('should return false if bucketname is not DNS compatible', () => {
        const result =
            routesUtils.isValidBucketName('*notvalid*', prefixBlacklist);
        assert.strictEqual(result, false);
    });

    it('should return true if bucketname does not break rules', () => {
        const result = routesUtils.isValidBucketName('okay', prefixBlacklist);
        assert.strictEqual(result, true);
    });

    it('should return true if bucketname is greater than 63 characters ' +
        'but less than 256', () => {
        const longString = 'a'.repeat(64);
        const result =
            routesUtils.isValidBucketName(longString, prefixBlacklist);
        assert.strictEqual(result, true);
    });

    describe('should return true when bucket name has valid' +
        ' combination of dots and hyphens', () => {
        validBucketNamesWithDotsAndHyphens.forEach(bucketName => {
            it(`should return true if bucketname is '${bucketName}'`,
                () => {
                    const result =
                        routesUtils.isValidBucketName(bucketName,
                            prefixBlacklist);
                    assert.strictEqual(result, true);
                });
        });
    });

    describe('should return false when bucket name has invalid' +
        ' combination of dots and hyphens', () => {
        invalidBucketNamesWithDotsAndHyphens.forEach(bucketName => {
            it(`should return false if bucketname is '${bucketName}'`,
                () => {
                    const result =
                        routesUtils.isValidBucketName(bucketName,
                            prefixBlacklist);
                    assert.strictEqual(result, false);
                });
        });
    });
});
