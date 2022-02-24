const assert = require('assert');
const routesUtils = require('../../../../lib/s3routes/routesUtils.js');

const validHosts = [
    'localhost',
    '127.0.0.1',
    's3.docker.test',
    '127.0.0.2',
    's3.amazonaws.com',
    's3-website-us-east-1.amazonaws.com',
    's3-website.us-east-2.amazonaws.com',
    's3-website-us-west-1.amazonaws.com',
    's3-website-us-west-2.amazonaws.com',
    's3-website.ap-south-1.amazonaws.com',
    's3-website.ap-northeast-2.amazonaws.com',
    's3-website-ap-southeast-1.amazonaws.com',
    's3-website-ap-southeast-2.amazonaws.com',
    's3-website-ap-northeast-1.amazonaws.com',
    's3-website.eu-central-1.amazonaws.com',
    's3-website-eu-west-1.amazonaws.com',
    's3-website-sa-east-1.amazonaws.com',
    's3-website.localhost',
    's3-website.scality.test',
];

describe('routesUtils.getBucketNameFromHost', () => {
    it('should extract valid buckets for one endpoint', () => {
        [
            'b', 'mybucket',
            'buck-et', '-buck-et', 'buck-et-',
            'buck_et', '_buck_et', 'buck_et_',
            'buck.et', 'bu.ck.et', 'bu.ck-et',
        ].forEach(bucket => {
            const headers = {
                host: `${bucket}.s3.amazonaws.com`,
            };
            const result =
                routesUtils.getBucketNameFromHost({ headers }, validHosts);
            assert.strictEqual(result, bucket);
        });
    });

    it('should also accept website endpoints', () => {
        [
            'in-french.bucket.is-seau.s3-website-eu-west-1.amazonaws.com',
            'in-french.bucket.is-seau.s3-website-us-east-1.amazonaws.com',
            'in-french.bucket.is-seau.s3-website-ap-southeast-2.amazonaws.com',
            'in-french.bucket.is-seau.s3-website.eu-central-1.amazonaws.com',
            'in-french.bucket.is-seau.s3-website-ap-northeast-1.amazonaws.com',
        ].forEach(host => {
            const headers = { host };
            const result =
                routesUtils.getBucketNameFromHost({ headers }, validHosts);
            assert.strictEqual(result, 'in-french.bucket.is-seau');
        });
    });

    it('should return undefined when non dns-style', () => {
        [
            's3.amazonaws.com',
        ].forEach(host => {
            const headers = { host };
            const result =
                routesUtils.getBucketNameFromHost({ headers }, validHosts);
            assert.strictEqual(result, undefined);
        });
    });

    it('should return undefined when IP addresses', () => {
        [
            '127.0.0.1',
            '8.8.8.8',
            '[::1]',
            '[2001:db8:a0b:12f0::1]',
            // IPv4-mapped IPv6 address
            '[::ffff:127.0.0.1]',
        ].forEach(host => {
            const headers = { host };
            const result =
                routesUtils.getBucketNameFromHost({ headers }, validHosts);
            assert.strictEqual(result, undefined);
        });
    });

    it('should throw when bad request', () => {
        [
            {},
            { host: '' },
            { host: 'not/a/valid/endpoint' },
            { host: 'this.domain.is.not.in.config' },
        ].forEach(headers => {
            assert.throws(() => {
                routesUtils.getBucketNameFromHost({ headers }, validHosts);
            });
        });
    });
});
