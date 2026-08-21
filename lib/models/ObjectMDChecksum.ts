export const CHECKSUM_ALGORITHMS = ['crc32', 'crc32c', 'crc64nvme', 'sha1', 'sha256'] as const;
export const CHECKSUM_TYPES = ['FULL_OBJECT', 'COMPOSITE'] as const;

export type ChecksumAlgorithm = (typeof CHECKSUM_ALGORITHMS)[number];
export type ChecksumType = (typeof CHECKSUM_TYPES)[number];

export const CHECKSUM_XML_TAGS: Record<ChecksumAlgorithm, string> = {
    crc32: 'ChecksumCRC32',
    crc32c: 'ChecksumCRC32C',
    crc64nvme: 'ChecksumCRC64NVME',
    sha1: 'ChecksumSHA1',
    sha256: 'ChecksumSHA256',
};

const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;

const digestLengths: Record<ChecksumAlgorithm, number> = {
    crc32: 8,
    crc32c: 8,
    crc64nvme: 12,
    sha1: 28,
    sha256: 44,
};

/**
 * Validate a raw base64 digest for an algorithm.
 */
export function isValidDigestValue(algorithm: ChecksumAlgorithm, value: string): boolean {
    const digestLength = digestLengths[algorithm];
    return typeof value === 'string' && value.length === digestLength && base64Regex.test(value);
}

/**
 * Extract the part count from a value ending in "-<partCount>". A multipart
 * object carries that suffix on both its ETag and, for a COMPOSITE MPU, on its checksum
 * value. Returns null when there is no such suffix.
 */
export function partCountFromSuffix(value: string): number | null {
    const match = /-([1-9][0-9]*)$/.exec(value);
    return match === null ? null : Number.parseInt(match[1], 10);
}

function isValidDigest(algorithm: ChecksumAlgorithm, value: string, checksumType: ChecksumType): boolean {
    if (checksumType === 'COMPOSITE') {
        if (isValidDigestValue(algorithm, value)) {
            return true;
        }

        // Composite MPU checksums are stored as "<base64 digest>-<part count>",
        // so validate the raw digest portion while requiring a positive suffix.
        const compositeMatch = typeof value === 'string' ? value.match(/^([A-Za-z0-9+/]*={0,2})-([1-9][0-9]*)$/) : null;
        if (!compositeMatch) {
            return false;
        }

        return isValidDigestValue(algorithm, compositeMatch[1]);
    }

    return isValidDigestValue(algorithm, value);
}

/**
 * Represents an object checksum stored in object metadata.
 *
 * Internal representation uses plain algorithm/value/type fields.
 */
export default class ObjectMDChecksum {
    checksumAlgorithm: ChecksumAlgorithm;
    checksumValue: string;
    checksumType: ChecksumType;

    static isValid(data: {
        checksumAlgorithm: ChecksumAlgorithm;
        checksumValue: string;
        checksumType: ChecksumType;
    }): string | null {
        if (!CHECKSUM_ALGORITHMS.includes(data.checksumAlgorithm)) {
            return `invalid checksumAlgorithm: ${data.checksumAlgorithm}`;
        }
        if (!CHECKSUM_TYPES.includes(data.checksumType)) {
            return `invalid checksumType: ${data.checksumType}`;
        }
        if (!isValidDigest(data.checksumAlgorithm, data.checksumValue, data.checksumType)) {
            return `invalid checksumValue for ${data.checksumAlgorithm}: ${data.checksumValue}`;
        }
        return null;
    }

    constructor(checksumAlgorithm: ChecksumAlgorithm, checksumValue: string, checksumType: ChecksumType) {
        const error = ObjectMDChecksum.isValid({ checksumAlgorithm, checksumValue, checksumType });
        if (error !== null) {
            throw new Error(error);
        }
        this.checksumAlgorithm = checksumAlgorithm;
        this.checksumValue = checksumValue;
        this.checksumType = checksumType;
    }
}
