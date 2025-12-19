'use strict';  

import { arsenalErrorAWSKMS } from '../utils';
import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';
import {
    KMSClient,
    CreateKeyCommand,
    ScheduleKeyDeletionCommand,
    GenerateDataKeyCommand,
    EncryptCommand,
    DecryptCommand,
    NotFoundException,
    KMSInvalidStateException,
} from '@aws-sdk/client-kms';
const { NodeHttpHandler } = require('@smithy/node-http-handler');
import * as werelogs from 'werelogs';
import assert from 'assert';
import { KMSInterface, KmsBackend, getKeyIdFromArn, KmsProtocol, KmsType, makeBackend } from '../KMSInterface';

type TLSVersion = 'TLSv1.3' | 'TLSv1.2' | 'TLSv1.1' | 'TLSv1';

interface KMSOptions {
    /** To be included in KMS key arn */
    providerName: string;
    region?: string;
    endpoint?: string;
    ak?: string;
    sk?: string;
    tls?: {
        rejectUnauthorized?: boolean;
        ca?: Buffer | Buffer[];
        cert?: Buffer | Buffer[];
        minVersion?: TLSVersion;
        maxVersion?: TLSVersion;
        key?: Buffer | Buffer[];
    };
    /**
     * Do not use AWS KMS Key arn but id (to keep backward compatibility).
     *
     * Some providers (okms) might not have accountId in their arn and don't need cross-account.
     *
     * Not set or false by default to use arn to be future-proof (multi account, region).
     *
     * Difference in kms key returned:
     *  - `arn:scality:kms:external:aws_kms:custom:key/arn:aws:kms:region:accountId:key/cbd69d33-ba8e-4b56-8cfe`
     *  - `arn:scality:kms:external:aws_kms:custom:key/cbd69d33-ba8e-4b56-8cfe`
     */
    noAwsArn?: boolean;
}

interface ClientOptions {
    kmsAWS: KMSOptions;
}

export default class Client implements KMSInterface {
    private _supportsDefaultKeyPerAccount: boolean;
    private client: KMSClient;
    public readonly backend: KmsBackend<KmsType.external>;
    public readonly noAwsArn?: boolean;

    constructor(options: ClientOptions) {
        this._supportsDefaultKeyPerAccount = true;
        const { providerName, tls, ak, sk, region, endpoint, noAwsArn } = options.kmsAWS;

        const requestHandler = new NodeHttpHandler({
            httpAgent: !tls ? new HttpAgent({
                keepAlive: true,
            }) : undefined,
            httpsAgent: tls ? new HttpsAgent({
                keepAlive: true,
                rejectUnauthorized: tls.rejectUnauthorized,
                ca: tls.ca,
                cert: tls.cert,
                minVersion: tls.minVersion,
                maxVersion: tls.maxVersion,
                key: tls.key,
            }) : undefined,
        });

        const credentials = (ak && sk) ? {
            accessKeyId: ak,
            secretAccessKey: sk,
        } : undefined;

        this.client = new KMSClient({
            region,
            endpoint,
            credentials,
            requestHandler,
        });
        this.backend = makeBackend(KmsType.external, KmsProtocol.aws_kms, providerName);
        this.noAwsArn = noAwsArn;
    }

    get supportsDefaultKeyPerAccount(): boolean {
        return this._supportsDefaultKeyPerAccount;
    }

    /**
     * Safely handles the plaintext buffer by copying it to an isolated buffer
     * and zeroing out the original buffer to prevent unauthorized access.
     *
     * @param plaintext - The original plaintext buffer from AWS KMS.
     * @returns A new Buffer containing the isolated plaintext data.
     */
    private safePlaintext(plaintext: Buffer): Buffer {
        // allocate a new buffer and initialize it directly with plaintext data
        const isolatedPlaintext = Buffer.alloc(plaintext.length, plaintext);
        // zero out the original plaintext buffer to prevent data leakage
        plaintext.fill(0);
    
        return isolatedPlaintext;
    }

    // createBucketKey is a method used by CloudServer to create a default master encryption key per bucket.
    // New KMS backends like AWS KMS now allow the customer to use the default master encryption key per account.
    // To achieve this, Vault will call createMasterKey and store the master encryption ID in the account metadata.
    createBucketKey(bucketName: string, logger: werelogs.Logger,
        cb: (err: Error | null, keyId?: string, keyArn?: string) => void): void {
        logger.debug('AWS KMS: creating encryption key managed at the bucket level',
            { bucketName });
        this.createMasterKey(logger, cb);
    }

    createMasterKey(logger: werelogs.Logger, cb: (err: Error | null, keyId?: string, keyArn?: string) => void): void {
        logger.debug('AWS KMS: creating master encryption key');
        this.client.send(new CreateKeyCommand({})).then(data => {
            const keyMetadata = data?.KeyMetadata;
            logger.debug("AWS KMS: master encryption key created", { KeyMetadata: keyMetadata });
            let keyId: string;
            if (this.noAwsArn) {
                keyId = keyMetadata?.KeyId || '';
            } else {
                // Prefer ARN, but fall back to KeyId if ARN is missing
                // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
                keyId = keyMetadata?.Arn ?? keyMetadata?.KeyId!;
            }
            // May produce double arn prefix: scality arn + aws arn
            // arn:scality:kms:external:aws_kms:custom:key/arn:aws:kms:region:accountId:key/cbd69d33-ba8e-4b56-8cfe
            // If this is a problem, a config flag should be used to hide the scality arn when returning the KMS KeyId
            // or aws arn when creating the KMS Key
            const arn = `${this.backend.arnPrefix}${keyId}`;
            cb(null, keyId, arn);
        }).catch((err: Error) => {
            const error = arsenalErrorAWSKMS(err);
            logger.error('AWS KMS: failed to create master encryption key', { err });
            cb(error);
        });
    }

    // destroyBucketKey is a method used by CloudServer to remove the default master encryption key for a bucket.
    // New KMS backends like AWS KMS allow customers to delete the default master encryption key at the account level.
    // To achieve this, Vault will call deleteMasterKey before deleting the account.
    destroyBucketKey(bucketKeyIdOrArn: string, logger: werelogs.Logger, cb: (err: Error | null) => void): void {
        const bucketKeyId = getKeyIdFromArn(bucketKeyIdOrArn);
        logger.debug("AWS KMS: deleting encryption key managed at the bucket level",
            { bucketKeyId, bucketKeyIdOrArn });
        this.deleteMasterKey(bucketKeyId, logger, cb);
    }

    deleteMasterKey(masterKeyIdOrArn: string, logger: werelogs.Logger, cb: (err: Error | null) => void): void {
        const masterKeyId = getKeyIdFromArn(masterKeyIdOrArn);
        logger.debug("AWS KMS: deleting master encryption key", { masterKeyId, masterKeyIdOrArn });
        const params = {
            KeyId: masterKeyId,
            PendingWindowInDays: 7,
        };
        const command = new ScheduleKeyDeletionCommand(params);

        this.client.send(command).then(data => {
            if (data?.KeyState && data.KeyState !== 'PendingDeletion') {
                const error = arsenalErrorAWSKMS('key is not in PendingDeletion state');
                logger.error('AWS KMS: failed to delete master encryption key', { data });
                cb(error);
                return;
            }
            cb(null);
        }).catch((err: Error) => {
            if (err instanceof NotFoundException || err instanceof KMSInvalidStateException) {
                // master key does not exist or is already pending deletion
                logger.warn('AWS KMS: key does not exist or is already pending deletion', { masterKeyId, error: err });
                return cb(null);
            }
            const error = arsenalErrorAWSKMS(err);
            logger.error('AWS KMS: failed to delete master encryption key', { err });
            return cb(error);
        });
    }

    generateDataKey(
        cryptoScheme: number,
        masterKeyIdOrArn: string,
        logger: werelogs.Logger,
        cb: (err: Error | null, plainTextDataKey?: Buffer, cipheredDataKey?: Buffer) => void
    ): void {
        const masterKeyId = getKeyIdFromArn(masterKeyIdOrArn);
        logger.debug("AWS KMS: generating data key", { cryptoScheme, masterKeyId, masterKeyIdOrArn });
        assert.strictEqual(cryptoScheme, 1);
        const params = {
            KeyId: masterKeyId,
            KeySpec: 'AES_256' as const,
        };
        this.client.send(new GenerateDataKeyCommand(params)).then(data => {
            if (!data) {
                const error = arsenalErrorAWSKMS("failed to generate data key: empty response");
                logger.error("AWS KMS: failed to generate data key: empty response");
                cb(error);
                return;
            }
            const isolatedPlaintext = this.safePlaintext(data.Plaintext as Buffer);
            logger.debug('AWS KMS: data key generated');
            cb(null, isolatedPlaintext, Buffer.from(data.CiphertextBlob as Uint8Array));
        }).catch((err: Error) => {
            const error = arsenalErrorAWSKMS(err);
            logger.error('AWS KMS: failed to generate data key', { err });
            cb(error);
        });
    }

    cipherDataKey(
        cryptoScheme: number,
        masterKeyIdOrArn: string,
        plainTextDataKey: Buffer,
        logger: werelogs.Logger,
        cb: (err: Error | null, cipheredDataKey?: Buffer) => void
    ): void {
        const masterKeyId = getKeyIdFromArn(masterKeyIdOrArn);

        logger.debug("AWS KMS: ciphering data key", { cryptoScheme, masterKeyId, masterKeyIdOrArn });
        assert.strictEqual(cryptoScheme, 1);

        const params = {
            KeyId: masterKeyId,
            Plaintext: plainTextDataKey,
        };

        this.client.send(new EncryptCommand(params)).then(data => {
            if (!data) {
                const error = arsenalErrorAWSKMS("failed to cipher data key: empty response");
                logger.error("AWS KMS: failed to cipher data key: empty response");
                cb(error);
                return;
            }

            logger.debug('AWS KMS: data key ciphered');
            cb(null, Buffer.from(data.CiphertextBlob as Uint8Array));
        }).catch((err: Error) => {
            const error = arsenalErrorAWSKMS(err);
            logger.error('AWS KMS: failed to cipher data key', { err });
            cb(error);
        });
    }

    decipherDataKey(
        cryptoScheme: number,
        masterKeyIdOrArn: string,
        cipheredDataKey: Buffer,
        logger: werelogs.Logger,
        cb: (err: Error | null, plainTextDataKey?: Buffer) => void
    ): void {
        const masterKeyId = getKeyIdFromArn(masterKeyIdOrArn);

        logger.debug("AWS KMS: deciphering data key", { cryptoScheme, masterKeyId, masterKeyIdOrArn });
        assert.strictEqual(cryptoScheme, 1);

        const params = {
            CiphertextBlob: cipheredDataKey,
        };

        this.client.send(new DecryptCommand(params)).then(data => {
            if (!data) {
                const error = arsenalErrorAWSKMS("failed to decipher data key: empty response");
                logger.error("AWS KMS: failed to decipher data key: empty response");
                cb(error);
                return;
            }

            const isolatedPlaintext = this.safePlaintext(data.Plaintext as Buffer);

            logger.debug('AWS KMS: data key deciphered');
            cb(null, isolatedPlaintext);
        }).catch((err: Error) => {
            const error = arsenalErrorAWSKMS(err);
            logger.error('AWS KMS: failed to decipher data key', { err });
            cb(error);
        });
    }

    /**
     * NOTE1: S3C-4833 KMS healthcheck is disabled in CloudServer.
     *
     * For the Arsenal client library we intentionally keep this as a no-op
     * to avoid making extra AWS KMS calls (which can incur costs and require
     * additional permissions). Callers should rely on higher-level health
     * checks provided by their services instead of this method.
     */
    /*
    healthcheck(logger: werelogs.Logger, cb: (err: Error | null) => void): void {
        logger.debug("AWS KMS: performing healthcheck");

        const command = new ListKeysCommand({
            Limit: 1,
        });

        this.client.send(command).then(() => {
            logger.debug("AWS KMS healthcheck: list keys succeeded");
            cb(null);
        }).catch(err => {
            const error = arsenalErrorAWSKMS(err);
            logger.error("AWS KMS healthcheck: failed to list keys", { err });
            cb(error);
        });
    }
    */
}
