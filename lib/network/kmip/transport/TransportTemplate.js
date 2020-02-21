'use strict'; // eslint-disable-line

const assert = require('assert');

const DEFAULT_PIPELINE_DEPTH = 8;
const DEFAULT_KMIP_PORT = 5696;

class TransportTemplate {
    /**
     * Construct a new object of the TransportTemplate class
     * @param {Object} channel - Typically the tls object
     * @param {Object} options - Instance options
     * @param {Number} options.pipelineDepth - depth of the pipeline
     * @param {Object} options.tls - Standard TLS socket initialization
     *                               parameters
     * @param {Number} options.tls.port - TLS server port to connect to
     */
    constructor(channel, options) {
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
     * @param {Error} error - the error to call the callback function with.
     * @returns {undefined}
     */
    _drainQueuesWithError(error) {
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
     * @param {Function} handshakeFunction - (logger: Object, cb: Function(err))
     * @returns {undefined}
     */
    registerHandshakeFunction(handshakeFunction) {
        this.handshakeFunction = handshakeFunction;
    }

    /**
     * Create a new conversation (e.g. a socket) between the client
     * and the server.
     * @param {Object} logger - Werelogs logger object
     * @param {Function} readyCallback - callback function to call when the
     *                                   conversation is ready to be initiated
     *                                   func(err: Error)
     * @returns {undefined}
     */
    _createConversation(logger, readyCallback) {
        try {
            const socket = this.channel.connect(
                this.options.tls.port || DEFAULT_KMIP_PORT,
                this.options.tls,
                () => {
                    socket.on('data', data => {
                        const queuedCallback = this.callbackPipeline.shift();
                        queuedCallback(null, socket, data);

                        if (this.callbackPipeline.length <
                            this.pipelineDepth &&
                            this.deferedRequests.length > 0) {
                            const deferedRequest = this.deferedRequests.shift();
                            process.nextTick(() => {
                                this.send(logger,
                                          deferedRequest.encodedMessage,
                                          deferedRequest.cb);
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
                        this._drainQueuesWithError(error);
                        this.socket = null;
                    });
                    socket.on('error', err => {
                        this._drainQueuesWithError(err);
                    });
                    if (this.handshakeFunction) {
                        this.handshakeFunction(logger, readyCallback);
                    } else {
                        readyCallback(null);
                    }
                });
            this.socket = socket;
        } catch (err) {
            logger.error();
            readyCallback(err);
        }
    }

    _doSend(logger, encodedMessage, cb) {
        const socket = this.socket;
        if (!socket || socket.destroyed) {
            const error = new Error('Socket to server not available');
            logger.error('TransportTemplate::_doSend', { error });
            return cb(error);
        }
        this.callbackPipeline.push(cb);
        socket.cork();
        socket.write(encodedMessage);
        socket.uncork();
        return undefined;
    }

    /**
     * Send an encoded message to the server
     * @param {Object} logger - Werelogs logger object
     * @param {Buffer} encodedMessage - the encoded message to send to the
     *                                  server
     * @param {Function} cb - (err, conversation, rawResponse)
     * @returns {undefined}
     */
    send(logger, encodedMessage, cb) {
        if (this.callbackPipeline.length >= this.pipelineDepth) {
            return this.deferedRequests.push({ encodedMessage, cb });
        }
        assert(encodedMessage.length !== 0);
        if (this.socket === null || socket.destroyed) {
            return this._createConversation(logger, err => {
                if (err) {
                    return cb(err);
                }
                return this._doSend(logger, encodedMessage, cb);
            });
        }
        return this._doSend(logger, encodedMessage, cb);
    }

    /**
     * Gracefuly interrupt the conversation. If the caller keeps sending
     * message after calling this function, the conversation won't
     * converge to its end.
     * @returns {undefined}
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
     * @param {Object} conversation - the conversation to abort
     * @returns {undefined}
     */
    abortPipeline(conversation) {
        conversation.end();
    }
}

module.exports = TransportTemplate;
