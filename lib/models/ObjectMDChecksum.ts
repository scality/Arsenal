export const CHECKSUM_ALGORITHMS = ['crc32', 'crc32c', 'crc64nvme', 'sha1', 'sha256'] as const;
export const CHECKSUM_TYPES = ['FULL_OBJECT', 'COMPOSITE'] as const;

export type ChecksumAlgorithm = typeof CHECKSUM_ALGORITHMS[number];
export type ChecksumType = typeof CHECKSUM_TYPES[number];

const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;

type AlgoSpec = {
    xmlTag: string;
    digestLength: number;
};

const algoSpecs: Record<ChecksumAlgorithm, AlgoSpec> = {
    crc32:     { xmlTag: 'ChecksumCRC32',    digestLength: 8  },
    crc32c:    { xmlTag: 'ChecksumCRC32C',   digestLength: 8  },
    crc64nvme: { xmlTag: 'ChecksumCRC64NVME', digestLength: 12 },
    sha1:      { xmlTag: 'ChecksumSHA1',     digestLength: 28 },
    sha256:    { xmlTag: 'ChecksumSHA256',   digestLength: 44 },
};

function isValidDigest(algorithm: ChecksumAlgorithm, value: string): boolean {
    const { digestLength } = algoSpecs[algorithm];
    return typeof value === 'string' && value.length === digestLength && base64Regex.test(value);
}

/**
 * Represents an object checksum stored in object metadata.
 *
 * Internal representation uses plain algorithm/value/type fields.
 * The toGetObjectAttributesXML() method produces the wire XML fragment
 * expected inside a GetObjectAttributesResponse Checksum element.
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

    /**
     * Returns the XML fragment for the Checksum element in a
     * GetObjectAttributes response, e.g.:
     *   <ChecksumSHA256>abc=</ChecksumSHA256>
     *   <ChecksumType>FULL_OBJECT</ChecksumType>
     */
    toGetObjectAttributesXML(): string {
        const { xmlTag } = algoSpecs[this.checksumAlgorithm];
        return '<Checksum>' +
            `<${xmlTag}>${this.checksumValue}</${xmlTag}>` +
            `<ChecksumType>${this.checksumType}</ChecksumType>` +
            '</Checksum>';
    }
}
