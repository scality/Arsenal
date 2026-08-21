import { ChecksumAlgorithm, isValidDigestValue } from './ObjectMDChecksum';

export const MAX_PART_NUMBER = 10000;

export type PartChecksum = {
    /** Part number: starts at 1 and must be contiguous (1..N). */
    partNumber: number;
    /** Byte length of the part. */
    size: number;
    /** Raw base64 digest of the part. */
    checksumValue: string;
};

/**
 * Validate the per-part checksums of a completed COMPOSITE MPU: one entry per
 * part of the object, in part-number order.
 *
 * @param parts - the per-part checksums to validate
 * @param algorithm - the MPU checksum algorithm
 * @param contentLength - size of the whole object, which the part sizes must
 *   add up to
 * @return null if valid, else a description of the first problem found
 */
export function isValidPartChecksums(
    parts: unknown,
    algorithm: ChecksumAlgorithm,
    contentLength: number,
): string | null {
    if (!Array.isArray(parts)) {
        return 'partChecksums must be an array';
    }
    if (parts.length === 0) {
        return 'partChecksums must not be empty';
    }
    if (parts.length > MAX_PART_NUMBER) {
        return `partChecksums must hold at most ${MAX_PART_NUMBER} parts, got ${parts.length}`;
    }
    let totalSize = 0;
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part === null || typeof part !== 'object') {
            return `invalid part checksum at index ${i}: not an object`;
        }
        const { partNumber, size, checksumValue } = part as PartChecksum;
        if (partNumber !== i + 1) {
            return `invalid partNumber at index ${i}: expected ${i + 1}, got ${partNumber}`;
        }
        if (!Number.isInteger(size) || size < 0) {
            return `invalid size for part ${partNumber}: ${size}`;
        }
        if (!isValidDigestValue(algorithm, checksumValue)) {
            return `invalid checksumValue for part ${partNumber}: ${checksumValue}`;
        }
        totalSize += size;
    }
    if (totalSize !== contentLength) {
        return `part sizes add up to ${totalSize}, but the object is ${contentLength} bytes`;
    }
    return null;
}
