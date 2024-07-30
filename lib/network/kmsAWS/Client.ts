'use strict'; // eslint-disable-line
/* eslint new-cap: "off" */

import errors from '../../errors';
import { Agent } from "https";
import { SecureVersion } from "tls";
import * as werelogs from 'werelogs';
import { KMSClient, CreateKeyCommand, ScheduleKeyDeletionCommand, EncryptCommand, DecryptCommand, GenerateDataKeyCommand, DataKeySpec } from "@aws-sdk/client-kms";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { AwsCredentialIdentity } from "@smithy/types";
import assert from 'assert';

/**
 * Normalize errors according to arsenal definitions
 * @param err - an Error instance or a message string
 * @returns - arsenal error
 *
 * @note Copied from the KMIP implementation
 */
function _arsenalError(err: string | Error) {
    const messagePrefix = 'AWS_KMS:';
    if (typeof err === 'string') {
        return errors.InternalError
            .customizeDescription(`${messagePrefix} ${err}`);
    } else if (
        err instanceof Error ||
        // INFO: The second part is here only for Jest, to remove when we'll be
        //   fully migrated to TS
        // @ts-expect-error
        (err && typeof err.message === 'string')
    ) {
        return errors.InternalError
            .customizeDescription(`${messagePrefix} ${err.message}`);
    }
    return errors.InternalError
        .customizeDescription(`${messagePrefix} Unspecified error`);
}

export default class Client {
    client: KMSClient;
    options: any;

    /**
     * Construct a high level KMIP driver suitable for cloudserver
     * @param options - Instance options
     * @param options.kmsAWS - AWS client options
     * @param options.kmsAWS.region - KMS region
     * @param options.kmsAWS.endpoint - Endpoint URL of the KMS service
     * @param options.kmsAWS.ak - Application Key
     * @param options.kmsAWS.sk - Secret Key
     * @param options.kmsAWS.tls.rejectUnauthorized - default to true, reject unauthenticated TLS connections (set to false to accept auto-signed certificates, useful in development ONLY)
     * @param options.kmsAWS.tls.ca - override CA definition(s)
     * @param options.kmsAWS.tls.cert - certificate or list of certificates
     * @param options.kmsAWS.tls.minVersion - min TLS version accepted, One of 'TLSv1.3', 'TLSv1.2', 'TLSv1.1', or 'TLSv1' (see https://nodejs.org/api/tls.html#tlscreatesecurecontextoptions)
     * @param options.kmsAWS.tls.maxVersion - max TLS version accepted, One of 'TLSv1.3', 'TLSv1.2', 'TLSv1.1', or 'TLSv1' (see https://nodejs.org/api/tls.html#tlscreatesecurecontextoptions)
     * @param options.kmsAWS.tls.key - private key or list of private keys
     * 
     * This client also looks in the standard AWS configuration files (https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html).
     * If no option is passed to this constructor, the client will try to get it from the configuration file.
     * 
     * TLS configuration options are those of nodejs, you can refere to https://nodejs.org/api/tls.html#tlsconnectoptions and https://nodejs.org/api/tls.html#tlscreatesecurecontextoptions
     */
    constructor(
        options: {
            kmsAWS: {
                region?: string,
                endpoint?: string,
                ak?: string,
                sk?: string,
                tls?: {
                    rejectUnauthorized?: boolean,
                    ca?: [Buffer] | Buffer,
                    cert?: [Buffer] | Buffer,
                    minVersion?: string,
                    maxVersion?: string,
                    key?: [Buffer] | Buffer,
                }
            }
        },
    ) {
        let requestHandler: {requestHandler: NodeHttpHandler} | null = null;
        const tlsOpts = options.kmsAWS.tls;
        if (tlsOpts) {
            const agent = new Agent({
                rejectUnauthorized: tlsOpts?.rejectUnauthorized,
                ca: tlsOpts?.ca,
                cert: tlsOpts?.cert,
                minVersion: <SecureVersion>tlsOpts?.minVersion,
                maxVersion: <SecureVersion>tlsOpts?.maxVersion,
                key: tlsOpts?.key,
            });

            requestHandler = {requestHandler: new NodeHttpHandler({
                httpAgent: agent,
                httpsAgent: agent,
            })}
        }

        let credentials: {credentials: AwsCredentialIdentity} | null = null;
        if (options.kmsAWS.ak && options.kmsAWS.sk) {
            credentials = {credentials: {
                accessKeyId: options.kmsAWS.ak,
                secretAccessKey: options.kmsAWS.sk,
            }};
        }

        this.client = new KMSClient({
            region: options.kmsAWS.region,
            endpoint: options.kmsAWS.endpoint,
            ...credentials,
            ...requestHandler
        });
    }

    /**
     * Create a new cryptographic key managed by the server,
     * for a specific bucket
     * @param bucketName - The bucket name
     * @param logger - Werelog logger object
     * @param cb - The callback(err: Error, bucketKeyId: String)
     */
    createBucketKey(bucketName: string, logger: werelogs.Logger, cb: any) {
        logger.debug("AWS KMS: createBucketKey", {bucketName});

        const command = new CreateKeyCommand({});
        this.client.send(command, (err, data) => {
            if (err) {
                const error = _arsenalError(err);
                logger.error("AWS_KMS::createBucketKey", {err, bucketName});
                cb (error);
            } else {
                logger.debug("AWS KMS: createBucketKey", {bucketName, KeyMetadata: data?.KeyMetadata});
                cb(null, data?.KeyMetadata?.KeyId);
            }
          });
    }

    /**
     * Destroy a cryptographic key managed by the server, for a specific bucket.
     * @param bucketKeyId - The bucket key Id
     * @param logger - Werelog logger object
     * @param cb - The callback(err: Error)
     */
    destroyBucketKey(bucketKeyId: string, logger: werelogs.Logger, cb: any) {
        logger.debug("AWS KMS: destroyBucketKey", {bucketKeyId: bucketKeyId});

        // Schedule a deletion in 7 days (the minimum value on this API)
        const command = new ScheduleKeyDeletionCommand({KeyId: bucketKeyId, PendingWindowInDays: 7});
        this.client.send(command, (err, data) => {
            if (err) {
                const error = _arsenalError(err);
                logger.error("AWS_KMS::destroyBucketKey", {err});
                cb (error);
            } else {
                // Sanity check
                if (data?.KeyState != "PendingDeletion") {
                    const error = _arsenalError("Key is not in PendingDeletion state")
                    logger.error("AWS_KMS::destroyBucketKey", {err, data});
                    cb(error);
                } else {
                    cb();
                }
            }
        });
    }

    /**
     * @param cryptoScheme - crypto scheme version number
     * @param masterKeyId - key to retrieve master key
     * @param logger - werelog logger object
     * @param cb - callback
     * @callback called with (err, plainTextDataKey: Buffer, cipheredDataKey: Buffer)
     */
    generateDataKey(
        cryptoScheme: number,
        masterKeyId: string,
        logger: werelogs.Logger,
        cb: any,
    ) {
        logger.debug("AWS KMS: generateDataKey", {cryptoScheme, masterKeyId});

        // Only support cryptoScheme v1
        assert.strictEqual (cryptoScheme, 1);

        const command = new GenerateDataKeyCommand({KeyId: masterKeyId, KeySpec: DataKeySpec.AES_256});
        this.client.send(command, (err, data) => {
            if (err) {
                const error = _arsenalError(err);
                logger.error("AWS_KMS::generateDataKey", {err});
                cb (error);
            } else if (!data) {
                const error = _arsenalError("generateDataKey: empty response");
                logger.error("AWS_KMS::generateDataKey empty reponse");
                cb (error);
            } else {
                // Convert to a buffer. This allows the wrapper to use .toString("base64")
                cb(null, Buffer.from(data.Plaintext!), Buffer.from(data.CiphertextBlob!));
            }
        });
    }

    /**
     *
     * @param cryptoScheme - crypto scheme version number
     * @param masterKeyId - key to retrieve master key
     * @param plainTextDataKey - data key
     * @param logger - werelog logger object
     * @param cb - callback
     * @callback called with (err, cipheredDataKey: Buffer)
     */
    cipherDataKey(
        cryptoScheme: number,
        masterKeyId: string,
        plainTextDataKey: Buffer,
        logger: werelogs.Logger,
        cb: any,
    ) {
        logger.debug("AWS KMS: cipherDataKey", {cryptoScheme, masterKeyId});

        // Only support cryptoScheme v1
        assert.strictEqual (cryptoScheme, 1);

        const command = new EncryptCommand({KeyId: masterKeyId, Plaintext: plainTextDataKey});
        this.client.send(command, (err, data) => {
            if (err) {
                const error = _arsenalError(err);
                logger.error("AWS_KMS::cipherDataKey", {err});
                cb (error);
            } else if (!data) {
                const error = _arsenalError("cipherDataKey: empty response");
                logger.error("AWS_KMS::cipherDataKey empty reponse");
                cb (error);
            } else {
                // Convert to a buffer. This allows the wrapper to use .toString("base64")
                cb(null, Buffer.from(data.CiphertextBlob!));
            }
        });
    }

    /**
     *
     * @param cryptoScheme - crypto scheme version number
     * @param masterKeyId - key to retrieve master key
     * @param cipheredDataKey - data key
     * @param logger - werelog logger object
     * @param cb - callback
     * @callback called with (err, plainTextDataKey: Buffer)
     */
    decipherDataKey(
        cryptoScheme: number,
        masterKeyId: string,
        cipheredDataKey: Buffer,
        logger: werelogs.Logger,
        cb: any,
    ) {
        logger.debug("AWS KMS: decipherDataKey", {cryptoScheme, masterKeyId});

        // Only support cryptoScheme v1
        assert.strictEqual (cryptoScheme, 1);

        const command = new DecryptCommand({CiphertextBlob: cipheredDataKey});
        this.client.send(command, (err, data) => {
            if (err) {
                const error = _arsenalError(err);
                logger.error("AWS_KMS::decipherDataKey", {err});
                cb (error);
            } else if (!data) {
                const error = _arsenalError("decipherDataKey: empty response");
                logger.error("AWS_KMS::decipherDataKey empty reponse");
                cb (error);
            } else {
                cb(null, Buffer.from(data?.Plaintext!));
            }
        });
    }
}
