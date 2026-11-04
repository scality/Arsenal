const assert = require('assert');

const NotificationDestination = require('../../../lib/models/NotificationDestination');
const { models } = require('../../../index');

describe('NotificationDestination', () => {
    describe('parseArn', () => {
        it('should parse a global destination ARN', () => {
            const destination = NotificationDestination.parseArn('arn:scality:bucketnotif:::target1');

            assert.deepStrictEqual(destination, { accountId: null, name: 'target1' });
            assert.strictEqual(NotificationDestination.isGlobal(destination), true);
        });

        it('should parse a tenant destination ARN', () => {
            const destination = NotificationDestination.parseArn('arn:scality:bucketnotif::123456789012:prod-events');

            assert.deepStrictEqual(destination, { accountId: '123456789012', name: 'prod-events' });
            assert.strictEqual(NotificationDestination.isGlobal(destination), false);
        });

        it('should parse a name with a space and every allowed sign', () => {
            const destination = NotificationDestination.parseArn('arn:scality:bucketnotif::123456789012:a b+=,.@-_9');

            assert.deepStrictEqual(destination, { accountId: '123456789012', name: 'a b+=,.@-_9' });
        });

        [
            ['a name outside the tenant grammar', 'arn:scality:bucketnotif:::kafka/orders', 'kafka/orders'],
            ['a region', 'arn:scality:bucketnotif:us-east-1::destination1', 'destination1'],
        ].forEach(([label, arn, name]) => {
            it(`should read a global destination ARN with ${label} as before`, () => {
                assert.deepStrictEqual(NotificationDestination.parseArn(arn), { accountId: null, name });
            });
        });

        it('should read a stored ARN with an account and a name outside the tenant grammar as null', () => {
            // before tenant destinations, readers used only the name field
            assert.strictEqual(
                NotificationDestination.parseArn('arn:scality:bucketnotif::123456789012:kafka/orders'),
                null,
            );
        });

        [
            ['a non-string', 42],
            ['undefined', undefined],
            ['an account that is not 12 digits', 'arn:scality:bucketnotif::abc:target1'],
            ['an empty string', ''],
            ['another partition', 'arn:aws:bucketnotif:::target1'],
            ['another service', 'arn:scality:utapi:::target1'],
            ['a global destination with an empty name', 'arn:scality:bucketnotif:::'],
            ['a tenant destination with a region', 'arn:scality:bucketnotif:us-east-1:123456789012:target1'],
            ['an 11-digit account', 'arn:scality:bucketnotif::12345678901:target1'],
            ['a 13-digit account', 'arn:scality:bucketnotif::1234567890123:target1'],
            ['a wildcard account', 'arn:scality:bucketnotif::*:target1'],
            ['five fields', 'arn:scality:bucketnotif::target1'],
            ['seven fields', 'arn:scality:bucketnotif::123456789012:target1:extra'],
            ['an empty name', 'arn:scality:bucketnotif::123456789012:'],
            ['a name with |', 'arn:scality:bucketnotif::123456789012:a|b'],
            ['a wildcard name', 'arn:scality:bucketnotif::123456789012:*'],
            ['a name of 129 characters', `arn:scality:bucketnotif::123456789012:${'a'.repeat(129)}`],
        ].forEach(([label, arn]) => {
            it(`should return null for ${label}`, () => {
                assert.strictEqual(NotificationDestination.parseArn(arn), null);
            });
        });
    });

    describe('isValidName', () => {
        [
            ['one character', 'a'],
            ['128 characters', 'a'.repeat(128)],
            ['a space', 'my destination'],
            ['surrounding spaces, as Vault does', ' a '],
            ['every allowed sign', 'a+=,.@-_'],
        ].forEach(([label, name]) => {
            it(`should accept ${label}`, () => {
                assert.strictEqual(NotificationDestination.isValidName(name), true);
            });
        });

        [
            ['an empty name', ''],
            ['129 characters', 'a'.repeat(129)],
            ['a |', 'a|b'],
            ['a *', 'a*'],
            ['a /', 'a/b'],
            ['a :', 'a:b'],
            ['a trailing newline', 'a\n'],
            ['a non-ASCII letter', 'café'],
            ['a non-string', 42],
            ['undefined', undefined],
        ].forEach(([label, name]) => {
            it(`should reject ${label}`, () => {
                assert.strictEqual(NotificationDestination.isValidName(name), false);
            });
        });

        it('should export the name length limit', () => {
            assert.strictEqual(NotificationDestination.nameMaxLength, 128);
        });
    });

    describe('public export', () => {
        it('should be reachable from the models of the package', () => {
            assert.strictEqual(models.NotificationDestination.parseArn, NotificationDestination.parseArn);
            assert.strictEqual(models.NotificationDestination.isValidName, NotificationDestination.isValidName);
            assert.strictEqual(models.NotificationDestination.isGlobal, NotificationDestination.isGlobal);
        });

        it('should leave the existing models in place', () => {
            assert.strictEqual(typeof models.ARN, 'function');
            assert.strictEqual(typeof models.NotificationConfiguration, 'function');
        });
    });
});
