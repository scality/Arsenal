
import type * as werelogs from 'werelogs';
// Logger should probably by RequestLogger instead

export interface KMSInterface {
    createBucketKey(
        bucketName: string,
        logger: werelogs.Logger,
        cb: (err?: Error | null, keyId?: string) => void,
    ): void

    destroyBucketKey(
        bucketKeyId: string,
        logger: werelogs.Logger,
        cb: (err?: Error | null) => void,
    ): void

    generateDataKey?(
        cryptoScheme: number,
        masterKeyId: string,
        logger: werelogs.Logger,
        cb: (err: Error | null, plainTextDataKey?: Buffer, cipheredDataKey?: Buffer) => void,
    ): void

    cipherDataKey(
        cryptoScheme: number,
        masterKeyId: string,
        plainTextDataKey: Buffer,
        logger: werelogs.Logger,
        cb: (err: Error | null, cipheredDataKey?: Buffer) => void,
    ): void

    decipherDataKey(
        cryptoScheme: number,
        masterKeyId: string,
        cipheredDataKey: Buffer,
        logger: werelogs.Logger,
        cb: (err: Error | null, plainTextDataKey?: Buffer) => void,
    ): void

    healthcheck?(
        logger: werelogs.Logger,
        cb: (err: Error | null) => void
    ): void
}
