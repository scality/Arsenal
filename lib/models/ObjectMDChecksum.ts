export const CHECKSUM_ALGORITHMS = ['crc32', 'crc32c', 'crc64nvme', 'sha1', 'sha256'] as const;
export const CHECKSUM_TYPES = ['FULL_OBJECT', 'COMPOSITE'] as const;

export type ChecksumAlgorithm = typeof CHECKSUM_ALGORITHMS[number];
export type ChecksumType = typeof CHECKSUM_TYPES[number];

const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;

const digestLengths: Record<ChecksumAlgorithm, number> = {
    crc32:     8,
    crc32c:    8,
    crc64nvme: 12,
    sha1:      28,
    sha256:    44,
};

function isValidDigest(algorithm: ChecksumAlgorithm, value: string): boolean {
    const digestLength = digestLengths[algorithm];
    return typeof value === 'string' && value.length === digestLength && base64Regex.test(value);
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
        if (!isValidDigest(data.checksumAlgorithm, data.checksumValue)) {
            return `invalid checksumValue for ${data.checksumAlgorithm}: ${data.checksumValue}`;
        }
        return null;
    }

    constructor(
        checksumAlgorithm: ChecksumAlgorithm,
        checksumValue: string,
        checksumType: ChecksumType,
    ) {
        const error = ObjectMDChecksum.isValid({ checksumAlgorithm, checksumValue, checksumType });
        if (error !== null) {
            throw new Error(error);
        }
        this.checksumAlgorithm = checksumAlgorithm;
        this.checksumValue = checksumValue;
        this.checksumType = checksumType;
    }
}
