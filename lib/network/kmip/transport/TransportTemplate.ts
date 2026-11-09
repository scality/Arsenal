import assert from 'assert';
import tls from 'tls';
import * as werelogs from 'werelogs';

const DEFAULT_PIPELINE_DEPTH = 8;
const DEFAULT_KMIP_PORT = 5696;

export type Options = {
    pipelineDepth: number;
    /** Time limit of a request, from its submission to its response. No limit when not set */
    requestTimeoutMs?: number;
    tls: {
        port: number;
    };
};

interface KmipLatencies {
    /** Timestamp when request was defered */
    defered?: number;
    /** Timestamp when request was sent. Missing if defered queue is drained with error */
    req?: number;
}
interface QueueSizes {
    /** Number of messages in the defered queue */
    deferred: number;
    /** Number of messages sent waiting for response */
    req: number;
}
type KmipCallback = (
    error: Error | null,
    socket: tls.TLSSocket | undefined,
    data: Buffer | undefined,
    latencies: KmipLatencies,
    queues: QueueSizes,
) => void;

export default class TransportTemplate {
    channel: typeof tls;
    options: Options;
    pipelineDepth: number;
    callbackPipeline: { cb: KmipCallback; latencies: KmipLatencies }[];
    deferedRequests: Array<{
        encodedMessage: Buffer;
        timestamp: number;
        cb: KmipCallback;
    }>;
    pipelineDrainedCallback: any | null;
    onEndCallback: any | null;
    handshakeFunction: any | null;
    socket: any;

    /**
     * Construct a new object of the TransportTemplate class
     * @param channel - Typically the tls object
     * @param options - Instance options
     * @param options.pipelineDepth - depth of the pipeline
     * @param options.tls - Standard TLS socket initialization
     *                               parameters
     * @param options.tls.port - TLS server port to connect to
     */
    constructor(channel: typeof tls, options: Options) {
        this.channel = channel;
        this.options = options;
        this.pipelineDepth = Math.max(1, options.pipelineDepth || DEFAULT_PIPELINE_DEPTH);
        this.callbackPipeline = [];
        this.deferedRequests = [];
        this.pipelineDrainedCallback = null;
        this.onEndCallback = null;
        this.handshakeFunction = null;
        this.socket = null;
    }

    /**
     * Drain the outstanding and defered request queues by
     * calling the associated callback with an error
     * @param error - the error to call the callback function with.
     */
    _drainQueuesWithError(error: Error) {
        // On log the same queue size for each message for simplicity
        const queueSizes = {
            req: this.callbackPipeline.length,
            deferred: this.deferedRequests.length,
        };
        this.callbackPipeline.forEach(({ cb, latencies }) => {
            cb(error, undefined, undefined, latencies, queueSizes);
        });
        this.deferedRequests.forEach(({ cb, timestamp }) => {
            cb(error, undefined, undefined, { defered: timestamp }, queueSizes);
        });
        this.callbackPipeline = [];
        this.deferedRequests = [];
    }

    /**
     * Register a higher level handshake function to be called
     * after the connection is initialized and before the first
     * message is sent.
     * @param handshakeFunction - (logger: Object, cb: Function(err))
     */
    registerHandshakeFunction(handshakeFunction: (logger: werelogs.Logger, cb: (error: Error | null) => void) => void) {
        this.handshakeFunction = handshakeFunction;
    }

    /**
     * Create a new conversation (e.g. a socket) between the client
     * and the server.
     * @param logger - Werelogs logger object
     * @param readyCallback - callback function to call when the
     *                                   conversation is ready to be initiated
     *                                   func(err: Error)
     */
    _createConversation(
        logger: werelogs.Logger,
        readyCallback: (error: Error | null) => void,
        skipHandshake: boolean = false,
    ) {
        try {
            const socket = this.channel.connect(this.options.tls.port || DEFAULT_KMIP_PORT, this.options.tls, () => {
                if (!skipHandshake && this.handshakeFunction) {
                    this.handshakeFunction(logger, readyCallback);
                } else {
                    readyCallback(null);
                }
            });
            socket.on('data', data => {
                const queuedCallback = this.callbackPipeline.shift();
                if (queuedCallback) {
                    queuedCallback.cb(null, socket, data, queuedCallback.latencies, {
                        deferred: this.deferedRequests.length,
                        req: this.callbackPipeline.length,
                    });
                }

                if (this.callbackPipeline.length < this.pipelineDepth && this.deferedRequests.length > 0) {
                    const deferedRequest = this.deferedRequests.shift();
                    process.nextTick(() => {
                        if (deferedRequest) {
                            this._doSend(
                                logger,
                                deferedRequest.encodedMessage,
                                deferedRequest.cb,
                                deferedRequest.timestamp,
                            );
                        }
                    });
                } else if (
                    this.callbackPipeline.length === 0 &&
                    this.deferedRequests.length === 0 &&
                    this.pipelineDrainedCallback
                ) {
                    this.pipelineDrainedCallback();
                    this.pipelineDrainedCallback = null;
                }
            });
            // prefer close event from end event as it also trigger when tls session
            // is not established, like failure to connect, invalid cert
            socket.on('close', () => {
                // A failed socket can close after the next one is open: the
                // queued requests are then those of the next socket
                if (this.socket === socket) {
                    const error = Error('Conversation interrupted');
                    this.socket = null;
                    this._drainQueuesWithError(error);
                }
                const onEnd = this.onEndCallback;
                if (onEnd) {
                    this.onEndCallback = null;
                    onEnd();
                }
            });
            socket.on('error', err => {
                // Since node v17 dns.lookup (and other network calls) will prioritize ipv6
                // and fallback to ipv4 for errors on dual-stack.
                // (You can test by adding both ipv4 & ipv6 for localhost in your /etc/hosts)
                // An error (ECONNREFUSED) can be AggregateError having both ipv6 & ipv4 errors
                // but message can be empty, so set it to all aggregated error's message.
                // (weird but in jest@29 err is not an instance of AggregateError)
                if (err.name === AggregateError.name && !err.message && err.errors) {
                    err.message = (err as AggregateError).errors.map(e => e.toString()).join(', ');
                }
                this._drainQueuesWithError(err);
            });
            this.socket = socket;
        } catch (err: any) {
            logger.error(err);
            this._drainQueuesWithError(err);
            readyCallback(err);
        }
    }

    _doSend(logger: werelogs.Logger, encodedMessage: Buffer, cb: KmipCallback, deferedTimestamp?: number) {
        this.callbackPipeline.push({ cb, latencies: { req: Date.now(), defered: deferedTimestamp } });
        if (this.socket === null || this.socket.destroyed) {
            this._createConversation(logger, () => {});
        }
        const socket = this.socket;
        if (socket) {
            socket.cork();
            socket.write(encodedMessage);
            socket.uncork();
        }
        return undefined;
    }

    /**
     * Send an encoded message to the server
     * @param logger - Werelogs logger object
     * @param encodedMessage - the encoded message to send to the
     *                                  server
     * @param cb - (err, conversation, rawResponse)
     */
    send(logger: werelogs.Logger, encodedMessage: Buffer, cb: KmipCallback) {
        assert(encodedMessage.length !== 0);
        const limitedCb = this._limitRequestTime(cb);
        if (this.callbackPipeline.length >= this.pipelineDepth) {
            return this.deferedRequests.push({ encodedMessage, cb: limitedCb, timestamp: Date.now() });
        }
        return this._doSend(logger, encodedMessage, limitedCb);
    }

    /**
     * Apply the request time limit to a request callback. When the limit
     * passes, the conversation is dropped, since responses are matched to
     * requests by order: the request fails with an ETIMEDOUT error, and the
     * other requests as interrupted.
     * @param cb - the callback of the request
     * @returns the callback to queue for the request
     */
    _limitRequestTime(cb: KmipCallback): KmipCallback {
        const { requestTimeoutMs } = this.options;
        if (!requestTimeoutMs) {
            return cb;
        }
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            this._dropConversation();
        }, requestTimeoutMs);
        return (error, socket, data, latencies, queues) => {
            clearTimeout(timer);
            const requestError = timedOut
                ? Object.assign(new Error(`KMIP request timed out after ${requestTimeoutMs} ms`), { code: 'ETIMEDOUT' })
                : error;
            cb(requestError, socket, data, latencies, queues);
        };
    }

    /**
     * Destroy the socket and fail the outstanding and deferred requests at
     * once, without waiting for the socket to close.
     */
    _dropConversation() {
        const socket = this.socket;
        this.socket = null;
        this._drainQueuesWithError(Error('Conversation interrupted'));
        socket?.destroy();
    }

    /**
     * Gracefuly interrupt the conversation. If the caller keeps sending
     * message after calling this function, the conversation won't
     * converge to its end.
     * @param onEndCallback - callback called once the socket is ended and pipelines are drained
     */
    end(onEndCallback?: any) {
        if (!this.socket) {
            onEndCallback?.();
            return;
        }
        if (onEndCallback) {
            this.onEndCallback = onEndCallback;
        }
        if (this.callbackPipeline.length !== 0 || this.deferedRequests.length !== 0) {
            this.pipelineDrainedCallback = this.socket.end.bind(this.socket);
        } else {
            this.socket.end();
        }
    }

    /**
     * Abruptly interrupt the conversation and cancel the outstanding and
     * defered requests
     * @param conversation - the conversation to abort
     * @param onEndCallback - callback called once the socket is ended and pipelines are drained
     */
    abortPipeline(conversation: any, onEndCallback: any) {
        this.onEndCallback = onEndCallback;
        conversation.end();
    }
}
