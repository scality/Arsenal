/**
 * VeeamSOSApiSchema is the schema for the capabilities in the
 * BucketInfo class.
 * The capcity-related field accept numbers, but will be treated as
 * bigints internally.
 */
export type VeeamSOSApiSchema = {
    SystemInfo?: {
        ProtocolVersion: string,
        ModelName: string,
        ProtocolCapabilities: {
            CapacityInfo: boolean,
            UploadSessions: boolean,
            IAMSTS?: boolean,
        },
        APIEndpoints?: {
            IAMEndpoint: string,
            STSEndpoint: string,
        },
        SystemRecommendations?: {
            S3ConcurrentTaskLimit: number,
            S3MultiObjectDelete: number,
            StorageCurrentTasksLimit: number,
            KbBlockSize: number,
        }
        LastModified?: string,
    },
    CapacityInfo?: {
        Capacity: bigint | number,
        Available: bigint | number,
        Used: bigint | number,
        LastModified?: string,
    },
};

/**
 * VeeamSOSApiSerializable is the serializable version of the
 * VeeamSOSApiSchema, where the capacity-related fields are
 * strings.
 */
export type VeeamSOSApiSerializable = Omit<VeeamSOSApiSchema, 'CapacityInfo'> & {
    CapacityInfo?: {
        Capacity: string,
        Available: string,
        Used: string,
        LastModified?: string,
    },
}

/**
 * The Veeam capacity for an S3 Bucket adds the
 * ability to use the proprietary SOSAPI feature.
 */
export class VeeamCapacityInfo {
    static serialize(capacity: VeeamSOSApiSchema['CapacityInfo']): VeeamSOSApiSerializable['CapacityInfo'] {
        return {
            Capacity: capacity?.Capacity?.toString() || '0',
            Available: capacity?.Available?.toString() || '0',
            Used: capacity?.Used?.toString() || '0',
            LastModified: capacity?.LastModified,
        };
    }

    static parse(capacity: VeeamSOSApiSerializable['CapacityInfo']): VeeamSOSApiSchema['CapacityInfo'] {
        return {
            Capacity: BigInt(capacity?.Capacity || 0),
            Available: BigInt(capacity?.Available || 0),
            Used: BigInt(capacity?.Used || 0),
            LastModified: capacity?.LastModified,
        };
    }

    static toBigInt(capacity: VeeamSOSApiSchema['CapacityInfo']): VeeamSOSApiSchema['CapacityInfo'] {
        return {
            Capacity: BigInt(capacity?.Capacity || 0),
            Available: BigInt(capacity?.Available || 0),
            Used: BigInt(capacity?.Used || 0),
            LastModified: capacity?.LastModified,
        };
    }
}

export class VeeamCapability {
    static serialize(veeamCapability: VeeamSOSApiSchema): VeeamSOSApiSerializable {
        return {
            ...veeamCapability,
            CapacityInfo: veeamCapability.CapacityInfo &&
                VeeamCapacityInfo.serialize(veeamCapability.CapacityInfo),
        };
    }

    static parse(veeamCapability: VeeamSOSApiSerializable): VeeamSOSApiSchema {
        return {
            ...veeamCapability,
            CapacityInfo: veeamCapability?.CapacityInfo &&
                VeeamCapacityInfo.parse(veeamCapability?.CapacityInfo),
        };
    }

    static toBigInt(veeamCapability: VeeamSOSApiSchema): VeeamSOSApiSchema {
        return {
            ...veeamCapability,
            CapacityInfo: veeamCapability.CapacityInfo &&
                VeeamCapacityInfo.toBigInt(veeamCapability.CapacityInfo),
        };
    }
}
