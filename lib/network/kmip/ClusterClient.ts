'use strict'; // eslint-disable-line
/* eslint new-cap: "off" */

import TTLVCodec from './codec/ttlv';
import TlsTransport from './transport/tls';
import KMIPClient, { KmipClientOptions } from './Client';
import { KmsBackend, KMSInterface, KmsType } from '../KMSInterface';
import { Logger } from 'werelogs';
import async from 'async';
import { ArsenalError, errorInstances } from '../../errors';
import { kmipMsg } from './errorMapping';

interface UnhealthyClient {
    client: KMIPClient,
    healthcheckTimeout: ReturnType<typeof setTimeout>,
};

/** Array without last item */
type ArrayPopped<Type extends unknown[]> = Type extends [...infer R, unknown] ? R : never;
/** Array's last item */
type ArrayLast<Type extends unknown[]> = Type extends [...unknown[], infer R] ? R : never

interface actions {
    createBucketKey: Parameters<ClusterClient['createBucketKey']>;
    destroyBucketKey: Parameters<ClusterClient['destroyBucketKey']>;
    cipherDataKey: Parameters<ClusterClient['cipherDataKey']>;
    decipherDataKey: Parameters<ClusterClient['decipherDataKey']>;
    healthcheck: Parameters<ClusterClient['healthcheck']>;
};

interface ClusterClientOptions {
    logger: Logger;
    retries?: number;
};

const UNHEALTHY_DURATION = 30_000; // 30s

export default class ClusterClient implements KMSInterface {
    /** Healthy clients */
    private readonly clients: KMIPClient[];
    private readonly unhealthyClients: UnhealthyClient[] = [];
    private roundRobinIndex = 0;
    public readonly backend: KmsBackend<KmsType.external>;
    private readonly logger: Logger;
    private readonly retries: number;

    /**
     * Construct a high level cluster of KMIP drivers suitable for cloudserver
     * @param options - Instance options
     * @param options.kmip - Low level driver options
     * @param options.kmip.providerName - Name of kmip provider
     * @param options.kmip.client - This high level driver options
     * @param options.kmip.client.compoundCreateActivate -
     *                 Depends on the server's ability. False offers the best
     *                 compatibility. True does not offer a significant
     *                 performance gain, but can be useful in case of unreliable
     *                 time synchronization between the client and the server.
     * @param options.kmip.client.bucketNameAttributeName -
     *                 Depends on the server's ability. Not specifying this
     *                 offers the best compatibility and disable the attachement
     *                 of the bucket name as a key attribute.
     * @param options.kmip.codec - KMIP Codec options
     * @param options.kmip.transport - KMIP Transport options
     * @param CodecClass - diversion for the Codec class,
     *                             defaults to TTLVCodec
     * @param TransportClass - diversion for the Transport class,
     *                                 defaults to TlsTransport
     */
    constructor(
        options: KmipClientOptions & ClusterClientOptions,
        CodecClass: any,
        TransportClass: any,
    ) {
        const { codec, client, providerName } = options.kmip;
        this.clients = options.kmip.transport.map(transport => new KMIPClient(
            { kmip: { codec, transport, client, providerName } },
            CodecClass || TTLVCodec,
            TransportClass || TlsTransport,
        ));
        this.backend = this.clients[0].backend;
        this.logger = options.logger;
        // if retries is not configured, we retry as much host there are in the cluster
        this.retries = typeof options.retries === 'number' ? options.retries : this.clients.length - 1;
    }

    next() {
        if (this.roundRobinIndex >= this.clients.length) {
            this.roundRobinIndex = 0;
        }
        return this.clients[this.roundRobinIndex++];
    }

    checkUnhealthyClient(unhealthyClient: UnhealthyClient) {
        const client = unhealthyClient.client;
        const healthyIndex = this.clients.indexOf(client);
        if (healthyIndex === -1) {
            this.clients.push(client);
        } else {
            // should not happen (S3C-9956)
            this.logger.warn('checkUnhealthyClient: already moved in healthy', { unhealthyHost: client.host });
        }

        const unhealthyIndex = this.unhealthyClients.indexOf(unhealthyClient);
        if (unhealthyIndex === -1) {
            // should not happen (S3C-9956)
            this.logger.warn('checkUnhealthyClient: already moved out of unhealthy', { unhealthyHost: client.host });
        } else {
            this.unhealthyClients.splice(unhealthyIndex, 1);
        }
        this.logger.info('kmip host healthy again', {
            unhealthyHost: client.host,
            unhealthy: this.unhealthyClients.length,
            healthy: this.clients.length,
        });
    }

    markUnhealthyClient(clientUsed: KMIPClient, logger: Logger, err: Error) {
        logger.info('mark kmip host unhealthy', {
            err,
            msg: err?.toString?.(),
            unhealthyHost: clientUsed.host,
            unhealthy: this.unhealthyClients.length,
            healthy: this.clients.length,
        });
        const index = this.clients.indexOf(clientUsed);
        if (index === -1) {
            // should not happen (S3C-9956)
            logger.warn('already marked unhealthy');
            return;
        }
        const spliced = this.clients.splice(index, 1);
        const unhealthy = {
            client: spliced[0],
            healthcheckTimeout: setTimeout(() => this.checkUnhealthyClient(unhealthy), UNHEALTHY_DURATION),
        };
        this.unhealthyClients.push(unhealthy);
        // the current index was removed
        // decrease so next roundrobin uses current index again with new client
        this.roundRobinIndex--;
    }

    callback<T extends keyof actions>(
        clientUsed: KMIPClient,
        funcName: T,
        args: ArrayPopped<actions[T]>,
        logger: ArrayLast<typeof args>,
        originalCallback: ArrayLast<actions[T]>,
    ) {
        let retries = 0;
        const newCB = (err: (ArsenalError | Error | null) & { code?: number }, ...rest: any[]) => {
            if (!err) {
                // @ts-expect-error ts2556 typescript won't accept the spread on args array
                return originalCallback(err, ...rest);
            }
            if (err.code && err.code >= 400 && err.code <= 499) {
                // @ts-expect-error ts2556 typescript won't accept the spread on args array
                return originalCallback(err, ...rest);
            }

            if (retries === this.retries) {
                logger.warn(`kmip max retries reached: ${retries} / ${this.retries}`);
                // @ts-expect-error ts2556 typescript won't accept the spread on args array
                return originalCallback(err, ...rest);
            }
            retries++;

            this.markUnhealthyClient(clientUsed, logger, err);

            if (this.clients.length === 0) {
                logger.warn('kmip cluster has no healthy hosts');
                // @ts-expect-error ts2556 typescript won't accept the spread on args array
                return originalCallback(err, ...rest);
            }

            const nextClient = this.next();
            // @ts-expect-error ts2556 typescript won't accept the spread on args array
            nextClient[funcName](...args, newCB);
            return undefined;
        };
        return newCB;
    }

    createBucketKey(...args: Parameters<KMSInterface['createBucketKey']>) {
        const originalCallback = args.pop() as ArrayLast<typeof args>;
        const poppedArgs = args as unknown as ArrayPopped<typeof args>;
        const logger = args[args.length - 1] as ArrayLast<typeof poppedArgs>;

        if (this.clients.length === 0) {
            logger.warn('kmip cluster has no healthy hosts');
            return originalCallback(errorInstances.InternalError.customizeDescription(
                kmipMsg('Create', args[0], `no healthy host in the cluster`)));
        }

        const client = this.next();

        client.createBucketKey(
            ...poppedArgs,
            this.callback(client, 'createBucketKey', poppedArgs, logger, originalCallback),
        );
        return undefined;
    }

    destroyBucketKey(...args: Parameters<KMSInterface['destroyBucketKey']>) {
        const originalCallback = args.pop() as ArrayLast<typeof args>;
        const poppedArgs = args as unknown as ArrayPopped<typeof args>;
        const logger = args[args.length - 1] as ArrayLast<typeof poppedArgs>;

        if (this.clients.length === 0) {
            logger.warn('kmip cluster has no healthy hosts');
            return originalCallback(errorInstances.InternalError.customizeDescription(
                kmipMsg('Destroy', args[0], `no healthy host in the cluster`)));
        }

        const client = this.next();

        client.destroyBucketKey(
            ...poppedArgs,
            this.callback(client, 'destroyBucketKey', poppedArgs, logger, originalCallback),
        );
        return undefined;
    }

    cipherDataKey(...args: Parameters<KMSInterface['cipherDataKey']>) {
        const originalCallback = args.pop() as ArrayLast<typeof args>;
        const poppedArgs = args as unknown as ArrayPopped<typeof args>;
        const logger = args[args.length - 1] as ArrayLast<typeof poppedArgs>;

        if (this.clients.length === 0) {
            logger.warn('kmip cluster has no healthy hosts');
            return originalCallback(errorInstances.InternalError.customizeDescription(
                kmipMsg('Encrypt', args[1], `no healthy host in the cluster`)));
        }

        const client = this.next();

        client.cipherDataKey(
            ...poppedArgs,
            this.callback(client, 'cipherDataKey', poppedArgs, logger, originalCallback),
        );
        return undefined;
    }

    decipherDataKey(...args: Parameters<KMSInterface['decipherDataKey']>) {
        const originalCallback = args.pop() as ArrayLast<typeof args>;
        const poppedArgs = args as unknown as ArrayPopped<typeof args>;
        const logger = args[args.length - 1] as ArrayLast<typeof poppedArgs>;

        if (this.clients.length === 0) {
            logger.warn('kmip cluster has no healthy hosts');
            return originalCallback(errorInstances.InternalError.customizeDescription(
                kmipMsg('Decrypt', args[1], `no healthy host in the cluster`)));
        }

        const client = this.next();

        client.decipherDataKey(
            ...poppedArgs,
            this.callback(client, 'decipherDataKey', poppedArgs, logger, originalCallback),
        );
        return undefined;
    }

    clusterHealthcheck(logger: Logger, cb: (err: Error | null) => void) {
        async.parallel<any, Error>(
            this.clients.map(c => (next) => c.healthcheck(logger, next)),
            (err, results) => {
                cb(err ?? null);
            }
        )
    }

    healthcheck(...args: Parameters<Required<KMSInterface>['healthcheck']>) {
        // for now check health of every member
        this.clusterHealthcheck.apply(this, args);
    }
}
