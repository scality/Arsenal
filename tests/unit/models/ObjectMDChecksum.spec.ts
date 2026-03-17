import assert from 'assert';

import ObjectMDChecksum, { ChecksumAlgorithm } from '../../../lib/models/ObjectMDChecksum';
import ObjectMD from '../../../lib/models/ObjectMD';

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
        it('stores algorithm, value, and type', () => {
            const c = new ObjectMDChecksum('sha256', validDigest.sha256, 'FULL_OBJECT');
            assert.strictEqual(c.checksumAlgorithm, 'sha256');
            assert.strictEqual(c.checksumValue, validDigest.sha256);
            assert.strictEqual(c.checksumType, 'FULL_OBJECT');
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
            it(`uses <${xmlTag}> for algorithm "${algo}"`, () => {
                const c = new ObjectMDChecksum(algo, validDigest[algo], 'FULL_OBJECT');
                assert(c.toGetObjectAttributesXML().includes(`<${xmlTag}>`),
                    `expected <${xmlTag}> in XML`);
            });
        }

        it('wraps the checksum value inside the algorithm tag', () => {
            const c = new ObjectMDChecksum('crc64nvme', 'HyOpGHolkII=', 'FULL_OBJECT');
            assert(c.toGetObjectAttributesXML().includes('<ChecksumCRC64NVME>HyOpGHolkII=</ChecksumCRC64NVME>'));
        });

        it('wraps everything in a <Checksum> element', () => {
            const c = new ObjectMDChecksum('sha256', validDigest.sha256, 'FULL_OBJECT');
            const xml = c.toGetObjectAttributesXML();
            assert(xml.startsWith('<Checksum>'));
            assert(xml.endsWith('</Checksum>'));
        });

        it('appends <ChecksumType>FULL_OBJECT</ChecksumType>', () => {
            const c = new ObjectMDChecksum('sha256', validDigest.sha256, 'FULL_OBJECT');
            assert(c.toGetObjectAttributesXML().includes('<ChecksumType>FULL_OBJECT</ChecksumType>'));
        });

        it('appends <ChecksumType>COMPOSITE</ChecksumType> for composite type', () => {
            const c = new ObjectMDChecksum('crc32', validDigest.crc32, 'COMPOSITE');
            assert(c.toGetObjectAttributesXML().includes('<ChecksumType>COMPOSITE</ChecksumType>'));
        });
    });
});

describe('ObjectMDChecksum constructor validation', () => {
    it('throws on invalid checksumAlgorithm', () => {
        assert.throws(
            // @ts-expect-error intentionally invalid
            () => new ObjectMDChecksum('sha999', validDigest.sha256, 'FULL_OBJECT'),
            /invalid checksumAlgorithm/,
        );
    });

    it('throws on invalid checksumType', () => {
        assert.throws(
            // @ts-expect-error intentionally invalid
            () => new ObjectMDChecksum('sha256', validDigest.sha256, 'WRONG'),
            /invalid checksumType/,
        );
    });

    it('throws on invalid checksumValue (wrong length)', () => {
        assert.throws(
            () => new ObjectMDChecksum('sha256', 'tooshort=', 'FULL_OBJECT'),
            /invalid checksumValue/,
        );
    });

    it('throws on invalid checksumValue (not base64)', () => {
        assert.throws(
            () => new ObjectMDChecksum('sha256', '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!=', 'FULL_OBJECT'),
            /invalid checksumValue/,
        );
    });
});

describe('ObjectMDChecksum.isValid', () => {
    it('returns true for a valid checksum object', () => {
        assert.strictEqual(ObjectMDChecksum.isValid({
            checksumAlgorithm: 'sha256',
            checksumValue: validDigest.sha256,
            checksumType: 'FULL_OBJECT',
        }), true);
    });

    it('returns false for an invalid checksumAlgorithm', () => {
        assert.strictEqual(ObjectMDChecksum.isValid({
            // @ts-expect-error intentionally invalid
            checksumAlgorithm: 'sha999',
            checksumValue: validDigest.sha256,
            checksumType: 'FULL_OBJECT',
        }), false);
    });

    it('returns false for an invalid checksumType', () => {
        assert.strictEqual(ObjectMDChecksum.isValid({
            checksumAlgorithm: 'sha256',
            checksumValue: validDigest.sha256,
            // @ts-expect-error intentionally invalid
            checksumType: 'WRONG',
        }), false);
    });

    it('returns false for an invalid checksumValue', () => {
        assert.strictEqual(ObjectMDChecksum.isValid({
            checksumAlgorithm: 'sha256',
            checksumValue: 'tooshort=',
            checksumType: 'FULL_OBJECT',
        }), false);
    });
});

describe('ObjectMD checksum integration', () => {
    it('setChecksum with a plain valid object stores an ObjectMDChecksum instance', () => {
        const md = new ObjectMD();
        // @ts-expect-error passing plain object instead of instance
        md.setChecksum({
            checksumAlgorithm: 'sha256',
            checksumValue: validDigest.sha256,
            checksumType: 'FULL_OBJECT',
        });
        const c = md.getChecksum();
        assert(c instanceof ObjectMDChecksum);
        assert.doesNotThrow(() => c!.toGetObjectAttributesXML());
    });

    it('setChecksum throws when given an invalid object', () => {
        const md = new ObjectMD();
        assert.throws(() => {
            // @ts-expect-error intentionally passing invalid data
            md.setChecksum({ checksumAlgorithm: 'sha256' });
        }, /ObjectMDChecksum/);
    });

    it('getChecksum returns null when no checksum is set', () => {
        const md = new ObjectMD();
        assert.strictEqual(md.getChecksum(), null);
    });

    it('setChecksum / getChecksum round-trip preserves algorithm, value, and type', () => {
        const md = new ObjectMD();
        md.setChecksum(new ObjectMDChecksum('crc64nvme', 'HyOpGHolkII=', 'FULL_OBJECT'));
        const result = md.getChecksum();
        assert(result !== null);
        assert.strictEqual(result.checksumAlgorithm, 'crc64nvme');
        assert.strictEqual(result.checksumValue, 'HyOpGHolkII=');
        assert.strictEqual(result.checksumType, 'FULL_OBJECT');
    });

    it('getChecksum returns an ObjectMDChecksum instance after JSON round-trip', () => {
        const md = new ObjectMD();
        md.setChecksum(new ObjectMDChecksum('sha256', validDigest.sha256, 'FULL_OBJECT'));
        const { result } = ObjectMD.createFromBlob(md.getSerialized());
        assert(result !== undefined);
        const c = result!.getChecksum();
        assert(c instanceof ObjectMDChecksum);
    });

    it('JSON round-trip preserves algorithm, value, and type', () => {
        const md = new ObjectMD();
        md.setChecksum(new ObjectMDChecksum('sha256', validDigest.sha256, 'COMPOSITE'));
        const { result } = ObjectMD.createFromBlob(md.getSerialized());
        assert(result !== undefined);
        const c = result!.getChecksum()!;
        assert.strictEqual(c.checksumAlgorithm, 'sha256');
        assert.strictEqual(c.checksumValue, validDigest.sha256);
        assert.strictEqual(c.checksumType, 'COMPOSITE');
    });

    it('toGetObjectAttributesXML is callable after JSON round-trip', () => {
        const md = new ObjectMD();
        md.setChecksum(new ObjectMDChecksum('crc64nvme', 'HyOpGHolkII=', 'FULL_OBJECT'));
        const { result } = ObjectMD.createFromBlob(md.getSerialized());
        assert(result !== undefined);
        const xml = result!.getChecksum()!.toGetObjectAttributesXML();
        assert(xml.startsWith('<Checksum>'));
        assert(xml.includes('<ChecksumCRC64NVME>HyOpGHolkII=</ChecksumCRC64NVME>'));
        assert(xml.includes('<ChecksumType>FULL_OBJECT</ChecksumType>'));
        assert(xml.endsWith('</Checksum>'));
    });
});
