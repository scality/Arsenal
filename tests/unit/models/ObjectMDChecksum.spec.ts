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

    describe('toGetObjectAttributesXML', () => {
        const cases: [ChecksumAlgorithm, string][] = [
            ['crc32',     'ChecksumCRC32'],
            ['crc32c',    'ChecksumCRC32C'],
            ['crc64nvme', 'ChecksumCRC64NVME'],
            ['sha1',      'ChecksumSHA1'],
            ['sha256',    'ChecksumSHA256'],
        ];

        for (const [algo, xmlTag] of cases) {
            it(`should use <${xmlTag}> for algorithm "${algo}"`, () => {
                const c = new ObjectMDChecksum(algo, validDigest[algo], 'FULL_OBJECT');
                assert(c.toGetObjectAttributesXML().includes(`<${xmlTag}>`),
                    `expected <${xmlTag}> in XML`);
            });
        }

        it('should wrap the checksum value inside the algorithm tag', () => {
            const c = new ObjectMDChecksum('crc64nvme', 'HyOpGHolkII=', 'FULL_OBJECT');
            assert(c.toGetObjectAttributesXML().includes('<ChecksumCRC64NVME>HyOpGHolkII=</ChecksumCRC64NVME>'));
        });

        it('should wrap everything in a <Checksum> element', () => {
            const c = new ObjectMDChecksum('sha256', validDigest.sha256, 'FULL_OBJECT');
            const xml = c.toGetObjectAttributesXML();
            assert(xml.startsWith('<Checksum>'));
            assert(xml.endsWith('</Checksum>'));
        });

        it('should append <ChecksumType>FULL_OBJECT</ChecksumType>', () => {
            const c = new ObjectMDChecksum('sha256', validDigest.sha256, 'FULL_OBJECT');
            assert(c.toGetObjectAttributesXML().includes('<ChecksumType>FULL_OBJECT</ChecksumType>'));
        });

        it('should append <ChecksumType>COMPOSITE</ChecksumType> for composite type', () => {
            const c = new ObjectMDChecksum('crc32', validDigest.crc32, 'COMPOSITE');
            assert(c.toGetObjectAttributesXML().includes('<ChecksumType>COMPOSITE</ChecksumType>'));
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
