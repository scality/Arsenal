const assert = require('assert');
const routesUtils = require('../../../../lib/s3routes/routesUtils.js');

const bannedStr = 'banned';
const prefixBlacklist = [];

describe('routesUtils.isValidBucketName', () => {
    it('should return false if bucketname is fewer than ' +
        '3 characters long', () => {
        const result = routesUtils.isValidBucketName('no', prefixBlacklist);
        assert.strictEqual(result, false);
    });

    it('should return false if bucketname is greater than ' +
        '63 characters long', () => {
        const longString = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' +
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
        const result =
            routesUtils.isValidBucketName(longString, prefixBlacklist);
        assert.strictEqual(result, false);
    });

    it('should return false if bucketname contains capital letters', () => {
        const result =
            routesUtils.isValidBucketName('noSHOUTING', prefixBlacklist);
        assert.strictEqual(result, false);
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
});
