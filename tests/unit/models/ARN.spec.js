const assert = require('assert');

const ARN = require('../../../lib/models/ARN');

describe('ARN object model', () => {
    describe('valid ARNs', () => {
        [{ arn: 'arn:aws:iam::123456789012:role/backbeat',
           service: 'iam',
           accountId: '123456789012',
           resource: 'role/backbeat',
           isIAMAccount: false,
           isIAMUser: false,
           isIAMRole: true,
         },
         { arn: 'arn:aws:iam::*:role/backbeat',
           service: 'iam',
           accountId: '*',
           resource: 'role/backbeat',
           isIAMAccount: false,
           isIAMUser: false,
           isIAMRole: true,
         },
         { arn: 'arn:aws:iam:::role/backbeat',
           service: 'iam',
           accountId: null,
           resource: 'role/backbeat',
           isIAMAccount: false,
           isIAMUser: false,
           isIAMRole: false, // not a valid role without an account ID
         },
         { arn: 'arn:aws:iam::123456789012:user/bart',
           service: 'iam',
           accountId: '123456789012',
           resource: 'user/bart',
           isIAMAccount: false,
           isIAMUser: true,
           isIAMRole: false,
         },
         { arn: 'arn:aws:iam:::user/bart',
           service: 'iam',
           accountId: null,
           resource: 'user/bart',
           isIAMAccount: false,
           isIAMUser: false, // not a valid user without an account ID
           isIAMRole: false,
         },
         { arn: 'arn:aws:iam::123456789012:root',
           service: 'iam',
           accountId: '123456789012',
           resource: 'root',
           isIAMAccount: true,
           isIAMUser: false,
           isIAMRole: false,
         },
         { arn: 'arn:aws:iam:::root',
           service: 'iam',
           accountId: null,
           resource: 'root',
           isIAMAccount: false, // not a valid account without an account ID
           isIAMUser: false,
           isIAMRole: false,
         },
         { arn: 'arn:aws:s3::123456789012:foo/bar/baz/qux',
           service: 's3',
           accountId: '123456789012',
           resource: 'foo/bar/baz/qux',
           isIAMAccount: false,
           isIAMUser: false,
           isIAMRole: false,
         },
         { arn: 'arn:aws:s3::123456789012:foo:bar/baz/qux',
           service: 's3',
           accountId: '123456789012',
           resource: 'foo:bar/baz/qux',
           isIAMAccount: false,
           isIAMUser: false,
           isIAMRole: false,
         },
         { arn: 'arn:aws:sts::123456789012:foobar',
           service: 'sts',
           accountId: '123456789012',
           resource: 'foobar',
           isIAMAccount: false,
           isIAMUser: false,
           isIAMRole: false,
         },
         { arn: 'arn:aws:ring::123456789012:foobar',
           service: 'ring',
           accountId: '123456789012',
           resource: 'foobar',
           isIAMAccount: false,
           isIAMUser: false,
           isIAMRole: false,
         },
         { arn: 'arn:scality:utapi::123456789012:foobar',
           service: 'utapi',
           accountId: '123456789012',
           resource: 'foobar',
           isIAMAccount: false,
           isIAMUser: false,
           isIAMRole: false,
         },
         { arn: 'arn:scality:sso::123456789012:foobar',
           service: 'sso',
           accountId: '123456789012',
           resource: 'foobar',
           isIAMAccount: false,
           isIAMUser: false,
           isIAMRole: false,
         },
        ].forEach(arnTest => it(`should accept ARN "${arnTest.arn}"`, () => {
            const arnObj = ARN.createFromString(arnTest.arn);
            assert(arnObj instanceof ARN);
            assert.strictEqual(arnObj.getService(), arnTest.service);
            assert.strictEqual(arnObj.getAccountId(), arnTest.accountId);
            assert.strictEqual(arnObj.getResource(), arnTest.resource);
            assert.strictEqual(arnObj.isIAMAccount(), arnTest.isIAMAccount);
            assert.strictEqual(arnObj.isIAMUser(), arnTest.isIAMUser);
            assert.strictEqual(arnObj.isIAMRole(), arnTest.isIAMRole);
            assert.strictEqual(arnObj.toString(), arnTest.arn);
        }));
    });
    describe('bad ARNs', () => {
        ['',
         ':',
         'foo:',
         'arn::iam::123456789012:role/backbeat',
         'arn:aws:xxx::123456789012:role/backbeat',
         'arn:aws:s3::123456789012345:role/backbeat',
         'arn:aws:s3::12345678901b:role/backbeat',
        ].forEach(arn => it(`should fail with invalid ARN "${arn}"`, () => {
            const res = ARN.createFromString(arn);
            assert.notStrictEqual(res.error, undefined);
        }));
    });
});
