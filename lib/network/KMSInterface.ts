
import type * as werelogs from 'werelogs';
// Logger should probably by RequestLogger instead
import errors from "../errors";

export const SCAL_KMS_ARN = 'arn:scality:kms:';

export enum KmsType {
    /** Internal scality provider */
    internal = 'internal',
    /** External provider */
    external = 'external',
};

export enum KmsProtocol {
    /** For tests & dev */
    mem = 'mem',
    /** Default if no provider */
    file = 'file',
    /** (SafeNet from Gemalto/Thales using scality-kms) */
    scality = 'scality',
    aws_kms = 'aws_kms',
    kmip = 'kmip',
};

const kmsTypeProtocolMapping = {
    [KmsType.internal]: [KmsProtocol.mem, KmsProtocol.file] as const,
    [KmsType.external]: [KmsProtocol.scality, KmsProtocol.aws_kms, KmsProtocol.kmip] as const,
} as const;
export type KmsProtocolByType<T extends KmsType> = typeof kmsTypeProtocolMapping[T][number];

/**
 * Possible arn are:
 *
 * - `arn:scality:kms:internal:mem:scality:key/$keyId` (tests & dev)
 * - `arn:scality:kms:internal:file:scality:key/$keyId` (default if no provider)
 * - `arn:scality:kms:external:scality:safenet:key/$keyId` (deprecated provider)
 * - `arn:scality:kms:external:aws_kms:aws:key/$keyIdOrArn`
 * - `arn:scality:kms:external:aws_kms:custom:alias/$keyIdOrArn`
 * - `arn:scality:kms:external:kmip:thales:key/$keyId`
 * - `arn:scality:kms:external:kmip:hashicorp:key/$keyId`
 * - `arn:scality:kms:external:kmip:hytrust:key/$keyId`
 */
export type AwsLikeKmsArnPrefix<T extends KmsType = KmsType> =
    `${typeof SCAL_KMS_ARN}${T}:${KmsProtocolByType<T>}:${string}:${'key' | 'alias'}/`;
/** Scality arn prefixing KMS KeyId to keep track of KMS backend */
export type AwsLikeKmsArn<T extends KmsType = KmsType> = `${AwsLikeKmsArnPrefix<T>}${string}`;

export interface KmsBackend<T extends KmsType> {
    readonly type: T;
    readonly protocol: KmsProtocolByType<T>;
    readonly provider: string;
    readonly arnPrefix: AwsLikeKmsArnPrefix<T>;
}

export function makeScalityArnPrefix<T extends KmsType>(
    type: T, protocol: KmsProtocolByType<T>, provider: string
): AwsLikeKmsArnPrefix<T> {
    return `${SCAL_KMS_ARN}${type}:${protocol}:${provider}:key/`;
}

export function makeBackend<T extends KmsType>(
    type: T, protocol: KmsProtocolByType<T>, provider: string
): KmsBackend<T> {
    return {
        type,
        protocol,
        provider,
        arnPrefix: makeScalityArnPrefix(type, protocol, provider),
    }
}

export function isScalityKmsArn(kmsKey?: string | null) {
    return kmsKey?.startsWith(SCAL_KMS_ARN) ?? false;
}

/**
 * Drop scality arn prefix from a KMS Key so it can be sent to the backend KMS.
 * This is used in KMS clients as a safety but the key should be passed
 * without arnPrefix as it should be extract by a KMS wrapper using `extractDetailFromArn`.
 * For old key without arnPrefix this does nothing.
 * Can be used to return KeyId in HTTP headers as well.
 * @param kmsKeyIdOrArn KMS key coming from object metadata
 * @returns KeyId extracted from scality arn (for AWS can still be an aws arn)
 */
export function getKeyIdFromArn(kmsKeyIdOrArn: AwsLikeKmsArn | string) {
    if (isScalityKmsArn(kmsKeyIdOrArn)) {
        // Do not use full arnPrefix to allow for different providerName
        return kmsKeyIdOrArn.substring(kmsKeyIdOrArn.indexOf('/') + 1)
    }
    return kmsKeyIdOrArn;
}

// Functions used to validate configuration
const kmsTypes = Object.values(KmsType);
export function isValidType(type: KmsType | string): type is KmsType {
    return kmsTypes.includes(type as KmsType);
}
export function isValidProtocol<T extends KmsType = KmsType>(
    type: T, protocol: KmsProtocol | string
): protocol is KmsProtocolByType<T> {
    return (kmsTypeProtocolMapping[type] as unknown as KmsProtocol[] | undefined)
        ?.includes(protocol as KmsProtocol) || false;
}
/** must be lowercase alphanumeric */
export function isValidProvider(provider: string) {
    return /^[a-z0-9]+$/.test(provider);
}
// end of functions to validate configuration

export interface KmsArnDetail {
    type: KmsType,
    protocol: KmsProtocol,
    provider: string,
    arnType: 'key' | 'alias', // we don't support alias yet
    id: string,
}
type NotValidatedKmsArnDetail = { [Key in keyof KmsArnDetail]?: KmsArnDetail[Key] | string };

/**
 * Split the scality arn to extract KMS backend identifiers.
 * @param keyArn KMS Key prefixed with scality arn
 * @returns KMS Key id with KMS backend identifiers
 */
export function extractDetailFromArn(keyArn: AwsLikeKmsArn): NotValidatedKmsArnDetail {
    if (!isScalityKmsArn(keyArn)) {
        return { id: keyArn };
    }

    const [arnPrefix, ...keyIdOrArn] = keyArn.split('/');
    const [,,,type, protocol, provider, arnType] = arnPrefix.split(':');

    return {
        type,
        protocol,
        provider,
        arnType,
        id: keyIdOrArn?.join('/')
    }
}

/**
 * Validate arn detail provided as input from PutObject or retrieved from GetObject
 * List of backends should include the currently configured KMS.
 * Optionally the sseMigration can be included in backends for Get requests pulling key from DB
 * @returns error or null
 */
export function validateKeyDetail(keyDetail: NotValidatedKmsArnDetail, backends: KmsBackend<KmsType>[]) {
    const isValidBackend = backends.some(backend =>
        keyDetail.type === backend.type
        && keyDetail.protocol === backend.protocol
        && keyDetail.provider === backend.provider
    )
    // Produce error description to end user with detail of backend configuration for troubleshooting
    if (!isValidBackend) {
        return errors.InvalidArgument.customizeDescription(
            `KMS Scality KeyArn doesn't match any configured providers. Possible arn are: "${
                backends.map(b => b.arnPrefix).join('", "')}"`
        )
    }
    if (keyDetail.arnType !== 'key') {
        return errors.InvalidArgument.customizeDescription(
            `Invalid KMS Scality KeyArn, expected "key" instead of "${keyDetail.arnType}"`);
    }
    if (!keyDetail.id) {
        return errors.InvalidArgument.customizeDescription(`Invalid KMS Scality KeyArn, missing KeyId`);
    }

    return null;
}

export interface KMSInterface {
    readonly backend: KmsBackend<KmsType>;

    createBucketKey(
        bucketName: string,
        logger: werelogs.Logger,
        cb: (err?: Error | null, keyId?: string, keyArn?: string) => void,
    ): void

    destroyBucketKey(
        bucketKeyIdOrArn: string,
        logger: werelogs.Logger,
        cb: (err?: Error | null) => void,
    ): void

    generateDataKey?(
        cryptoScheme: number,
        masterKeyIdOrArn: string,
        logger: werelogs.Logger,
        cb: (err: Error | null, plainTextDataKey?: Buffer, cipheredDataKey?: Buffer) => void,
    ): void

    cipherDataKey(
        cryptoScheme: number,
        masterKeyIdOrArn: string,
        plainTextDataKey: Buffer,
        logger: werelogs.Logger,
        cb: (err: Error | null, cipheredDataKey?: Buffer) => void,
    ): void

    decipherDataKey(
        cryptoScheme: number,
        masterKeyIdOrArn: string,
        cipheredDataKey: Buffer,
        logger: werelogs.Logger,
        cb: (err: Error | null, plainTextDataKey?: Buffer) => void,
    ): void

    healthcheck?(
        logger: werelogs.Logger,
        cb: (err: Error | null) => void
    ): void
}
