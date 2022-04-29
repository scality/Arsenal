import assert from 'assert';
import tls from 'tls';
import * as werelogs from 'werelogs';

const DEFAULT_PIPELINE_DEPTH = 8;
const DEFAULT_KMIP_PORT = 5696;

export type Options = {
    pipelineDepth: number;
    tls: {
        port: number;
    };
}

export default class TransportTemplate {
    channel: typeof tls;
    options: Options;
    pipelineDepth: number;
    callbackPipeline: ((error: Error | null, socket?: any, data?: any) => void)[];
    deferedRequests: Array<{
        encodedMessage: Buffer;
        cb: ((error: Error | null, data?: any) => void)
    }>;
    pipelineDrainedCallback: any | null;
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
        this.pipelineDepth = Math.max(1, options.pipelineDepth ||
                                      DEFAULT_PIPELINE_DEPTH);
        this.callbackPipeline = [];
        this.deferedRequests = [];
        this.pipelineDrainedCallback = null;
        this.handshakeFunction = null;
        this.socket = null;
    }

    /**
     * Drain the outstanding and defered request queues by
     * calling the associated callback with an error
     * @param error - the error to call the callback function with.
     */
    _drainQueuesWithError(error: Error) {
        this.callbackPipeline.forEach(queuedCallback => {
            queuedCallback(error);
        });
        this.deferedRequests.forEach(deferedRequest => {
            deferedRequest.cb(error);
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
    registerHandshakeFunction(
        handshakeFunction: (
            logger: werelogs.Logger,
            cb: (error: Error | null) => void,
        ) => void,
    ) {
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
    ) {
        try {
            const socket = this.channel.connect(
                this.options.tls.port || DEFAULT_KMIP_PORT,
                this.options.tls,
                () => {
                    if (this.handshakeFunction) {
                        this.handshakeFunction(logger, readyCallback);
                    } else {
                        readyCallback(null);
                    }
                });
            socket.on('data', data => {
                const queuedCallback = this.callbackPipeline.shift();
                queuedCallback?.(null, socket, data);

                if (this.callbackPipeline.length <
                    this.pipelineDepth &&
                    this.deferedRequests.length > 0) {
                    const deferedRequest = this.deferedRequests.shift();
                    process.nextTick(() => {
                        if (deferedRequest) {
                            this.send(logger,
                                deferedRequest.encodedMessage,
                                deferedRequest.cb);
                        }
                    });
                } else if (this.callbackPipeline.length === 0 &&
                           this.deferedRequests.length === 0 &&
                           this.pipelineDrainedCallback) {
                    this.pipelineDrainedCallback();
                    this.pipelineDrainedCallback = null;
                }
            });
            socket.on('end', () => {
                const error = Error('Conversation interrupted');
                this.socket = null;
                this._drainQueuesWithError(error);
            });
            socket.on('error', err => {
                this._drainQueuesWithError(err);
            });
            this.socket = socket;
        } catch (err: any) {
            logger.error(err);
            this._drainQueuesWithError(err);
            readyCallback(err);
        }
    }

    _doSend(
        logger: werelogs.Logger,
        encodedMessage: Buffer,
        cb: (error: Error | null, socket?: any, data?: any) => void,
    ) {
        this.callbackPipeline.push(cb);
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
    send(
        logger: werelogs.Logger,
        encodedMessage: Buffer,
        cb: (error: Error | null, conversation?: any, rawResponse?: any) => void,
    ) {
        if (this.callbackPipeline.length >= this.pipelineDepth) {
            return this.deferedRequests.push({ encodedMessage, cb });
        }
        assert(encodedMessage.length !== 0);
        return this._doSend(logger, encodedMessage, cb);
    }

    /**
     * Gracefuly interrupt the conversation. If the caller keeps sending
     * message after calling this function, the conversation won't
     * converge to its end.
     */
    end() {
        if (!this.socket) {
            return;
        }
        if (this.callbackPipeline.length !== 0 ||
            this.deferedRequests.length !== 0) {
            this.pipelineDrainedCallback = this.socket.end.bind(this.socket);
        } else {
            this.socket.end();
        }
    }

    /**
     * Abruptly interrupt the conversation and cancel the outstanding and
     * defered requests
     * @param conversation - the conversation to abort
     */
    abortPipeline(conversation: any) {
        conversation.end();
    }
}
