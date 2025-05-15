'use strict';
/* eslint new-cap: "off" */
/* eslint prefer-spread: "off" */

import TTLVCodec from './codec/ttlv';
import TlsTransport from './transport/tls';
import KMIPClient, { KmipClientOptions } from './Client';
import { KmsBackend, KMSInterface, KmsType } from '../KMSInterface';
import type { Logger } from 'werelogs';
import async from 'async';

export default class ClusterClient implements KMSInterface {
    private readonly clients: KMIPClient[];
    private roundRobinIndex = 0;
    public readonly backend: KmsBackend<KmsType.external>;

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
        options: KmipClientOptions,
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
    }

    next() {
        if (this.roundRobinIndex >= this.clients.length) {
            this.roundRobinIndex = 0;
        }
        return this.clients[this.roundRobinIndex++];
    }


    createBucketKey(...args: Parameters<KMSInterface['createBucketKey']>) {
        const client = this.next();
        client.createBucketKey.apply(client, args);
    }

    destroyBucketKey(...args: Parameters<KMSInterface['destroyBucketKey']>) {
        const client = this.next();
        client.destroyBucketKey.apply(client, args);
    }

    cipherDataKey(...args: Parameters<KMSInterface['cipherDataKey']>) {
        const client = this.next();
        client.cipherDataKey.apply(client, args);
    }

    decipherDataKey(...args: Parameters<KMSInterface['decipherDataKey']>) {
        const client = this.next();
        client.decipherDataKey.apply(client, args);
    }

    clusterHealthcheck(logger: Logger, cb: (err: Error | null) => void) {
        async.parallel<any, Error>(
            this.clients.map(c => next => c.healthcheck(logger, next)),
            err => {
                cb(err ?? null);
            },
        );
    }

    healthcheck(...args: Parameters<Required<KMSInterface>['healthcheck']>) {
        // for now check health of every member
        this.clusterHealthcheck.apply(this, args);
    }
}
