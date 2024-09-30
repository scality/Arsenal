'use strict'; // eslint-disable-line
/* eslint new-cap: "off" */

import errors from '../../errors';
import { arsenalErrorAWSKMS } from '../utils'
import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';
import { KMS, AWSError } from 'aws-sdk';
import * as werelogs from 'werelogs';
import assert from 'assert';

type TLSVersion = 'TLSv1.3' | 'TLSv1.2' | 'TLSv1.1' | 'TLSv1';

interface KMSOptions {
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
}

interface ClientOptions {
    kmsAWS: KMSOptions;
}

export default class Client {
    private _supportsDefaultKeyPerAccount: boolean;
    private client: KMS;

    constructor(options: ClientOptions) {
        this._supportsDefaultKeyPerAccount = true;
        const { tls, ak, sk, region, endpoint } = options.kmsAWS;

        const httpOptions = tls ? {
            agent: new HttpsAgent({
                keepAlive: true,
                rejectUnauthorized: tls.rejectUnauthorized,
                ca: tls.ca,
                cert: tls.cert,
                minVersion: tls.minVersion,
                maxVersion: tls.maxVersion,
                key: tls.key,
            }),
        } : {
            agent: new HttpAgent({
                keepAlive: true,
            }),
        };

        const credentials = (ak && sk) ? {
            credentials: {
                accessKeyId: ak,
                secretAccessKey: sk,
            },
        } : undefined;

        this.client = new KMS({
            region,
            endpoint,
            httpOptions,
            ...credentials,
        });
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
    createBucketKey(bucketName: string, logger: werelogs.Logger, cb: (err: Error | null, keyId?: string) => void): void {
        logger.debug("AWS KMS: creating encryption key managed at the bucket level", { bucketName });
        this.createMasterKey(logger, cb);
    }

    createMasterKey(logger: werelogs.Logger, cb: (err: Error | null, keyId?: string) => void): void {
        logger.debug("AWS KMS: creating master encryption key");
        this.client.createKey({}, (err: AWSError, data) => {
            if (err) {
                const error = arsenalErrorAWSKMS(err);
                logger.error("AWS KMS: failed to create master encryption key", { err });
                cb(error);
                return;
            }
            logger.debug("AWS KMS: master encryption key created", { KeyMetadata: data?.KeyMetadata });
            cb(null, data?.KeyMetadata?.KeyId);
        });
    }

    // destroyBucketKey is a method used by CloudServer to remove the default master encryption key for a bucket.
    // New KMS backends like AWS KMS allow customers to delete the default master encryption key at the account level.
    // To achieve this, Vault will call deleteMasterKey before deleting the account.
    destroyBucketKey(bucketKeyId: string, logger: werelogs.Logger, cb: (err: Error | null) => void): void {
        logger.debug("AWS KMS: deleting encryption key managed at the bucket level", { bucketKeyId });
        this.deleteMasterKey(bucketKeyId, logger, cb);
    }

    deleteMasterKey(masterKeyId: string, logger: werelogs.Logger, cb: (err: Error | null) => void): void {
        logger.debug("AWS KMS: deleting master encryption key", { masterKeyId });
        const params = {
            KeyId: masterKeyId,
            PendingWindowInDays: 7,
        };
        this.client.scheduleKeyDeletion(params, (err: AWSError, data) => {
            if (err) {
                const error = arsenalErrorAWSKMS(err);
                logger.error("AWS KMS: failed to delete master encryption key", { err });
                cb(error);
                return;
            }

            if (data?.KeyState && data.KeyState !== "PendingDeletion") {
                const error = arsenalErrorAWSKMS("key is not in PendingDeletion state");
                logger.error("AWS KMS: failed to delete master encryption key", { err, data });
                cb(error);
                return;
            }

            cb(null);
        });
    }

    generateDataKey(
        cryptoScheme: number,
        masterKeyId: string,
        logger: werelogs.Logger,
        cb: (err: Error | null, plainTextDataKey?: Buffer, cipheredDataKey?: Buffer) => void
    ): void {
        logger.debug("AWS KMS: generating data key", { cryptoScheme, masterKeyId });
        assert.strictEqual(cryptoScheme, 1);

        const params = {
            KeyId: masterKeyId,
            KeySpec: 'AES_256',
        };

        this.client.generateDataKey(params, (err: AWSError, data) => {
            if (err) {
                const error = arsenalErrorAWSKMS(err);
                logger.error("AWS KMS: failed to generate data key", { err });
                cb(error);
                return;
            }

            if (!data) {
                const error = arsenalErrorAWSKMS("failed to generate data key: empty response");
                logger.error("AWS KMS: failed to generate data key: empty response");
                cb(error);
                return;
            }

            const isolatedPlaintext = this.safePlaintext(data.Plaintext as Buffer);

            logger.debug("AWS KMS: data key generated");
            cb(null, isolatedPlaintext, Buffer.from(data.CiphertextBlob as Uint8Array));
        });
    }

    cipherDataKey(
        cryptoScheme: number,
        masterKeyId: string,
        plainTextDataKey: Buffer,
        logger: werelogs.Logger,
        cb: (err: Error | null, cipheredDataKey?: Buffer) => void
    ): void {
        logger.debug("AWS KMS: ciphering data key", { cryptoScheme, masterKeyId });
        assert.strictEqual(cryptoScheme, 1);

        const params = {
            KeyId: masterKeyId,
            Plaintext: plainTextDataKey,
        };

        this.client.encrypt(params, (err: AWSError, data) => {
            if (err) {
                const error = arsenalErrorAWSKMS(err);
                logger.error("AWS KMS: failed to cipher data key", { err });
                cb(error);
                return;
            }

            if (!data) {
                const error = arsenalErrorAWSKMS("failed to cipher data key: empty response");
                logger.error("AWS KMS: failed to cipher data key: empty response");
                cb(error);
                return;
            }

            logger.debug("AWS KMS: data key ciphered");
            cb(null, Buffer.from(data.CiphertextBlob as Uint8Array));
            return;
        });
    }

    decipherDataKey(
        cryptoScheme: number,
        masterKeyId: string,
        cipheredDataKey: Buffer,
        logger: werelogs.Logger,
        cb: (err: Error | null, plainTextDataKey?: Buffer) => void
    ): void {
        logger.debug("AWS KMS: deciphering data key", { cryptoScheme, masterKeyId });
        assert.strictEqual(cryptoScheme, 1);

        const params = {
            CiphertextBlob: cipheredDataKey,
        };

        this.client.decrypt(params, (err: AWSError, data) => {
            if (err) {
                const error = arsenalErrorAWSKMS(err);
                logger.error("AWS KMS: failed to decipher data key", { err });
                cb(error);
                return;
            }

            if (!data) {
                const error = arsenalErrorAWSKMS("failed to decipher data key: empty response");
                logger.error("AWS KMS: failed to decipher data key: empty response");
                cb(error);
                return;
            }

            const isolatedPlaintext = this.safePlaintext(data.Plaintext as Buffer);

            logger.debug("AWS KMS: data key deciphered");
            cb(null, isolatedPlaintext);
        });
    }

    /**
     * NOTE1: S3C-4833 KMS healthcheck is disabled in CloudServer
     * NOTE2: The best approach for implementing the AWS KMS health check is still under consideration.
     * In the meantime, this method is commented out to prevent potential issues related to costs or permissions.
     *
     * Reasons for commenting out:
     * - frequent API calls can lead to increased expenses.
     * - access key secret key used must have `kms:ListKeys` permissions
     *
     * Future potential actions:
     * - implement caching mechanisms to reduce the number of API calls.
     * - differentiate between error types (e.g., 500 vs. 403) for more effective error handling.
     */
    /*
    healthcheck(logger: werelogs.Logger, cb: (err: Error | null) => void): void {
        logger.debug("AWS KMS: performing healthcheck");
    
        const params = {
            Limit: 1,
        };
    
        this.client.listKeys(params, (err, data) => {
            if (err) {
                const error = arsenalErrorAWSKMS(err);
                logger.error("AWS KMS healthcheck: failed to list keys", { err });
                cb(error);
                return;
            }
    
            logger.debug("AWS KMS healthcheck: list keys succeeded");
            cb(null);
        });
    }
    */
}
