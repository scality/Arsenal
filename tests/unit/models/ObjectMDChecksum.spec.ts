import assert from 'assert';

import ObjectMDChecksum, { ChecksumAlgorithm } from '../../../lib/models/ObjectMDChecksum';

// Valid base64 digest values of the correct length for each algorithm.
const validDigest: Record<ChecksumAlgorithm, string> = {
    crc32:     'AAAAAA==',                                           // 8 chars
    crc32c:    'AAAAAA==',                                           // 8 chars
    crc64nvme: 'AAAAAAAAAAA=',                                       // 12 chars
    sha1:      'AAAAAAAAAAAAAAAAAAAAAAAAAAA=',                       // 28 chars
    sha256:    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',       // 44 chars
};

describe('ObjectMDChecksum', () => {
    describe('constructor', () => {
        it('should store algorithm, value, and type', () => {
            const c = new ObjectMDChecksum('sha256', validDigest.sha256, 'FULL_OBJECT');
            assert.strictEqual(c.checksumAlgorithm, 'sha256');
            assert.strictEqual(c.checksumValue, validDigest.sha256);
            assert.strictEqual(c.checksumType, 'FULL_OBJECT');
        });

        it('should throw on invalid checksumAlgorithm', () => {
            assert.throws(
                // @ts-expect-error intentionally invalid
                () => new ObjectMDChecksum('sha999', validDigest.sha256, 'FULL_OBJECT'),
                /invalid checksumAlgorithm/,
            );
        });

        it('should throw on invalid checksumType', () => {
            assert.throws(
                // @ts-expect-error intentionally invalid
                () => new ObjectMDChecksum('sha256', validDigest.sha256, 'WRONG'),
                /invalid checksumType/,
            );
        });

        it('should throw on invalid checksumValue (wrong length)', () => {
            assert.throws(
                () => new ObjectMDChecksum('sha256', 'tooshort=', 'FULL_OBJECT'),
                /invalid checksumValue/,
            );
        });

        it('should throw on invalid checksumValue (not base64)', () => {
            assert.throws(
                () => new ObjectMDChecksum('sha256', '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!=', 'FULL_OBJECT'),
                /invalid checksumValue/,
            );
        });
    });

    describe('isValid', () => {
        it('should return null for a valid checksum object', () => {
            assert.strictEqual(ObjectMDChecksum.isValid({
                checksumAlgorithm: 'sha256',
                checksumValue: validDigest.sha256,
                checksumType: 'FULL_OBJECT',
            }), null);
        });

        it('should return an error string for an invalid checksumAlgorithm', () => {
            const result = ObjectMDChecksum.isValid({
                // @ts-expect-error intentionally invalid
                checksumAlgorithm: 'sha999',
                checksumValue: validDigest.sha256,
                checksumType: 'FULL_OBJECT',
            });
            assert.match(result!, /invalid checksumAlgorithm/);
        });

        it('should return an error string for an invalid checksumType', () => {
            const result = ObjectMDChecksum.isValid({
                checksumAlgorithm: 'sha256',
                checksumValue: validDigest.sha256,
                // @ts-expect-error intentionally invalid
                checksumType: 'WRONG',
            });
            assert.match(result!, /invalid checksumType/);
        });

        it('should return an error string for an invalid checksumValue', () => {
            const result = ObjectMDChecksum.isValid({
                checksumAlgorithm: 'sha256',
                checksumValue: 'tooshort=',
                checksumType: 'FULL_OBJECT',
            });
            assert.match(result!, /invalid checksumValue/);
        });
    });
});
