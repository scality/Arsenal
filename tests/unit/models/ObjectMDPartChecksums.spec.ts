import assert from 'assert';

import { CHECKSUM_ALGORITHMS, ChecksumAlgorithm } from '../../../lib/models/ObjectMDChecksum';
import { MAX_PART_NUMBER, PartChecksum, isValidPartChecksums } from '../../../lib/models/ObjectMDPartChecksums';

// Valid base64 digest values of the correct length for each algorithm.
const validDigest: Record<ChecksumAlgorithm, string> = {
    crc32: 'AAAAAA==', // 8 chars
    crc32c: 'AAAAAA==', // 8 chars
    crc64nvme: 'AAAAAAAAAAA=', // 12 chars
    sha1: 'AAAAAAAAAAAAAAAAAAAAAAAAAAA=', // 28 chars
    sha256: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', // 44 chars
};

// Real per-part SHA256 digests and sizes of a 3-part MPU.
const part1 = '3AyUPBM2N2sY3QjN2J9wYUzQpOWWybOVJUp6LuJEMf0=';
const part2 = 'sgad/t6kdx5RjCEaYWRKlxFEJBzQE6Zz+cDhA72e3m4=';
const part3 = '6xvj56XlEPtCZATsAFHleo2Rw1/rC88oQoRzQTCbb24=';
const partSize = 5242880;
const threeParts: PartChecksum[] = [
    { partNumber: 1, size: partSize, checksumValue: part1 },
    { partNumber: 2, size: partSize, checksumValue: part2 },
    { partNumber: 3, size: partSize, checksumValue: part3 },
];
const threePartsSize = partSize * 3;

describe('isValidPartChecksums', () => {
    it('should accept a well-formed multi-part list', () => {
        assert.strictEqual(isValidPartChecksums(threeParts, 'sha256', threePartsSize), null);
    });

    it('should accept a single part', () => {
        const parts = [{ partNumber: 1, size: 10, checksumValue: validDigest.sha256 }];
        assert.strictEqual(isValidPartChecksums(parts, 'sha256', 10), null);
    });

    it('should accept a zero-byte part', () => {
        const parts = [{ partNumber: 1, size: 0, checksumValue: validDigest.sha256 }];
        assert.strictEqual(isValidPartChecksums(parts, 'sha256', 0), null);
    });

    CHECKSUM_ALGORITHMS.forEach(algorithm => {
        it(`should accept a valid ${algorithm} digest`, () => {
            const parts = [{ partNumber: 1, size: 1, checksumValue: validDigest[algorithm] }];
            assert.strictEqual(isValidPartChecksums(parts, algorithm, 1), null);
        });

        it(`should reject a digest of the wrong length for ${algorithm}`, () => {
            const parts = [{ partNumber: 1, size: 1, checksumValue: `${validDigest[algorithm]}AAAA` }];
            assert.match(isValidPartChecksums(parts, algorithm, 1) ?? '', /invalid checksumValue for part 1/);
        });
    });

    it('should reject a non-array', () => {
        assert.match(isValidPartChecksums(undefined, 'sha256', 0) ?? '', /must be an array/);
        assert.match(isValidPartChecksums({ partNumber: 1 }, 'sha256', 0) ?? '', /must be an array/);
    });

    it('should reject an empty list', () => {
        assert.match(isValidPartChecksums([], 'sha256', 0) ?? '', /must not be empty/);
    });

    it(`should reject more than ${MAX_PART_NUMBER} parts`, () => {
        const parts = Array.from({ length: MAX_PART_NUMBER + 1 }, (_, i) => ({
            partNumber: i + 1,
            size: 1,
            checksumValue: validDigest.sha256,
        }));
        assert.match(isValidPartChecksums(parts, 'sha256', parts.length) ?? '', /at most 10000 parts/);
    });

    it(`should accept exactly ${MAX_PART_NUMBER} parts`, () => {
        const parts = Array.from({ length: MAX_PART_NUMBER }, (_, i) => ({
            partNumber: i + 1,
            size: 1,
            checksumValue: validDigest.sha256,
        }));
        assert.strictEqual(isValidPartChecksums(parts, 'sha256', parts.length), null);
    });

    it('should reject an entry that is not an object', () => {
        assert.match(isValidPartChecksums([null], 'sha256', 0) ?? '', /at index 0: not an object/);
        assert.match(isValidPartChecksums(['nope'], 'sha256', 0) ?? '', /at index 0: not an object/);
    });

    it('should reject a list that does not start at 1', () => {
        const parts = [{ partNumber: 2, size: 1, checksumValue: validDigest.sha256 }];
        assert.match(isValidPartChecksums(parts, 'sha256', 1) ?? '', /expected 1, got 2/);
    });

    it('should reject a gap in the part numbers', () => {
        const parts = [
            { partNumber: 1, size: 1, checksumValue: validDigest.sha256 },
            { partNumber: 3, size: 1, checksumValue: validDigest.sha256 },
        ];
        assert.match(isValidPartChecksums(parts, 'sha256', 2) ?? '', /at index 1: expected 2, got 3/);
    });

    it('should reject part numbers that are out of order', () => {
        const parts = [
            { partNumber: 2, size: 1, checksumValue: validDigest.sha256 },
            { partNumber: 1, size: 1, checksumValue: validDigest.sha256 },
        ];
        assert.match(isValidPartChecksums(parts, 'sha256', 2) ?? '', /at index 0: expected 1, got 2/);
    });

    it('should reject a missing part number', () => {
        const parts = [{ size: 1, checksumValue: validDigest.sha256 }];
        assert.match(isValidPartChecksums(parts, 'sha256', 1) ?? '', /expected 1, got undefined/);
    });

    it('should reject a non-integer or negative size', () => {
        const bad = [1.5, -1, NaN, '5', undefined];
        bad.forEach(size => {
            const parts = [{ partNumber: 1, size, checksumValue: validDigest.sha256 }];
            assert.match(isValidPartChecksums(parts, 'sha256', 1) ?? '', /invalid size for part 1/);
        });
    });

    it('should reject a non-base64 digest', () => {
        const parts = [{ partNumber: 1, size: 1, checksumValue: `${'A'.repeat(43)}!` }];
        assert.match(isValidPartChecksums(parts, 'sha256', 1) ?? '', /invalid checksumValue for part 1/);
    });

    it('should reject a digest carrying a composite "-N" suffix', () => {
        const parts = [{ partNumber: 1, size: 1, checksumValue: `${validDigest.sha256}-1` }];
        assert.match(isValidPartChecksums(parts, 'sha256', 1) ?? '', /invalid checksumValue for part 1/);
    });

    it('should reject a missing digest', () => {
        const parts = [{ partNumber: 1, size: 1 }];
        assert.match(isValidPartChecksums(parts, 'sha256', 1) ?? '', /invalid checksumValue for part 1/);
    });

    it('should reject a digest valid for another algorithm', () => {
        const parts = [{ partNumber: 1, size: 1, checksumValue: validDigest.crc32 }];
        assert.match(isValidPartChecksums(parts, 'sha256', 1) ?? '', /invalid checksumValue for part 1/);
    });

    it('should reject sizes that do not add up to the object size', () => {
        assert.match(
            isValidPartChecksums(threeParts, 'sha256', threePartsSize - 1) ?? '',
            /part sizes add up to 15728640, but the object is 15728639 bytes/,
        );
    });

    it('should report the first problem found', () => {
        const parts = [
            { partNumber: 1, size: 1, checksumValue: validDigest.sha256 },
            { partNumber: 9, size: -1, checksumValue: 'nope' },
        ];
        assert.match(isValidPartChecksums(parts, 'sha256', 999) ?? '', /at index 1: expected 2, got 9/);
    });
});
