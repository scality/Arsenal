/* eslint-disable @typescript-eslint/no-explicit-any */

import { v4 as uuid } from 'uuid';
import * as stream from 'stream';
import debug_ from 'debug';
import assert from 'assert';
import async from 'async';
import { flattenError, reconstructError } from './utils';
import { Logger } from 'werelogs';

const debug = debug_('sio-stream');

const DEFAULT_MAX_PENDING_ACK = 4;
const DEFAULT_ACK_TIMEOUT_MS = 5000;

class SIOOutputStream extends stream.Writable {
    socket: SIOStreamSocket;
    streamId: string;
    maxPendingAck: number;
    ackTimeoutMs: number;
    nPendingAck: number;

    constructor(
        socket: SIOStreamSocket,
        streamId: string,
        maxPendingAck: number,
        ackTimeoutMs: number,
    ) {
        super({ objectMode: true });
        this.socket = socket;
        this.streamId = streamId;
        this.on('finish', () => {
            this.socket._finish(this.streamId, (err: Error | null) => {
                // no-op on client ack, it's not excluded we add
                // things later here
                debug('ack finish', this.streamId, 'err', err);
            });
        });
        this.on('error', err => {
            debug('output stream error', this.streamId);
            // notify remote of the error
            this.socket._error(this.streamId, err);
        });

        // This is used for queuing flow control, don't issue more
        // than maxPendingAck requests (events) that have not been
        // acked yet
        this.maxPendingAck = maxPendingAck;
        this.ackTimeoutMs = ackTimeoutMs;

        this.nPendingAck = 0;
    }

    _write(chunk: any, _encoding: string, callback: any) {
        return this._writev([{ chunk }], callback);
    }

    _writev(chunks: { chunk: any }[], callback: any) {
        const payload = chunks.map(chunk => chunk.chunk);

        debug(`_writev(${JSON.stringify(payload)}, ...)`);
        this.nPendingAck += 1;
        const timeoutInfo =
            `stream timeout: did not receive ack after ${this.ackTimeoutMs}ms`;
        async.timeout((cb: any) => {
            this.socket._write(this.streamId, payload, cb);
        }, this.ackTimeoutMs, timeoutInfo)(
            err => {
                debug(`ack stream-data ${this.streamId}
                      (${JSON.stringify(payload)}):`, err);
                if (this.nPendingAck === this.maxPendingAck) {
                    callback();
                }
                this.nPendingAck -= 1;
                if (err) {
                    // notify remote of the error (timeout notably)
                    debug('stream error:', err);
                    this.socket._error(this.streamId, err);
                    // stop the producer
                    this.socket.destroyStream(this.streamId);
                }
            });
        if (this.nPendingAck < this.maxPendingAck) {
            callback();
        }
    }
}

class SIOInputStream extends stream.Readable {
    socket: SIOStreamSocket;
    streamId: string;
    _destroyed: boolean;
    _readState: {
        pushBuffer: any[];
        readable: boolean;
    };

    constructor(socket: SIOStreamSocket, streamId: string) {
        super({ objectMode: true });
        this.socket = socket;
        this.streamId = streamId;
        this._destroyed = false;
        this._readState = {
            pushBuffer: [],
            readable: false,
        };
    }

    destroy() {
        debug('destroy called', this.streamId);
        this._destroyed = true;
        this.pause();
        this.removeAllListeners('data');
        this.removeAllListeners('end');
        this._readState = {
            pushBuffer: [],
            readable: false,
        };
        // do this in case the client piped this stream to other ones
        this.unpipe();
        // emit 'stream-hangup' event to notify the remote producer
        // that we're not interested in further results
        this.socket._hangup(this.streamId);
        this.emit('close');
        return this;
    }

    _pushData() {
        debug('pushData _readState:', this._readState);
        if (this._destroyed) {
            return;
        }
        while (this._readState.pushBuffer.length > 0) {
            const item = this._readState.pushBuffer.shift();
            debug('pushing item', item);
            if (!this.push(item)) {
                this._readState.readable = false;
                break;
            }
        }
    }

    _read(size: number) {
        debug(`_read(${size})`);
        this._readState.readable = true;
        this._pushData();
    }

    _ondata(data: any[]) {
        debug('_ondata', this.streamId, data);
        if (this._destroyed) {
            return;
        }
        this._readState.pushBuffer.push(...data);
        if (this._readState.readable) {
            this._pushData();
        }
    }

    _onend() {
        debug('_onend', this.streamId);
        this._readState.pushBuffer.push(null);
        if (this._readState.readable) {
            this._pushData();
        }
        this.emit('close');
    }

    _onerror(receivedErr: Error) {
        debug('_onerror', this.streamId, 'error', receivedErr);
        const err = reconstructError(receivedErr);
        // @ts-expect-error property 'remote' doesn't exist on type 'Error'
        err.remote = true;
        this.emit('error', err);
    }
}

/**
 * @class
 * @classdesc manage a set of user streams over a socket.io connection
 */
class SIOStreamSocket {
    socket: any;
    logger: Logger;
    maxPendingAck: number;
    ackTimeoutMs: number;
    remoteStreams: any;
    localStreams: any;

    constructor(
        socket: any,
        logger: Logger,
        maxPendingAck: number,
        ackTimeoutMs: number,
    ) {
        assert(socket);
        assert(logger);

        /** @member {Object} socket.io connection */
        this.socket = socket;

        /** @member {Object} logger object */
        this.logger = logger;

        /** @member {Number} max number of in-flight output stream
         *   packets sent to the client without an ack received yet */
        this.maxPendingAck = maxPendingAck;

        /** @member {Number} timeout for receiving an ack after an
         *   output stream packet is sent to the client */
        this.ackTimeoutMs = ackTimeoutMs;

        /** @member {Object} map of stream proxies initiated by the
         * remote side */
        this.remoteStreams = {};

        /** @member {Object} map of stream-like objects initiated
         * locally and connected to the remote side */
        this.localStreams = {};

        const log = logger;

        // stream data message, contains an array of one or more data objects
        this.socket.on('stream-data', (payload: any, cb: any) => {
            const { streamId, data } = payload;
            log.debug('received \'stream-data\' event',
                { streamId, size: data.length });
            const stream = this.remoteStreams[streamId];
            if (!stream) {
                log.debug('no such remote stream registered', { streamId });
                return;
            }
            stream._ondata(data);
            cb(null);
        });

        // signals normal end of stream to the consumer
        this.socket.on('stream-end', (payload: any, cb: any) => {
            const { streamId } = payload;
            log.debug('received \'stream-end\' event', { streamId });
            const stream = this.remoteStreams[streamId];
            if (!stream) {
                log.debug('no such remote stream registered', { streamId });
                return;
            }
            stream._onend();
            cb(null);
        });

        // error message sent by the stream producer to the consumer
        this.socket.on('stream-error', (payload: any) => {
            const { streamId, error } = payload;
            log.debug('received \'stream-error\' event', { streamId, error });
            const stream = this.remoteStreams[streamId];
            if (!stream) {
                log.debug('no such remote stream registered', { streamId });
                return;
            }
            stream._onerror(error);
        });

        // hangup message sent by the stream consumer to the producer
        this.socket.on('stream-hangup', (payload: any) => {
            const { streamId } = payload;
            log.debug('received \'stream-hangup\' event', { streamId });
            const stream = this.localStreams[streamId];
            if (!stream) {
                log.debug('no such local stream registered' +
                          '(may have already reached the end)', { streamId });
                return;
            }
            this.destroyStream(streamId);
        });
    }

    /**
     * @brief encode all stream-like objects found inside a user
     * object into a serialized form that can be tramsmitted through a
     * socket.io connection, then decoded back to a stream proxy
     * object by the other end with decodeStreams()
     *
     * @param arg any flat object or value that may be or
     * contain stream-like objects
     * @return an object of the same nature than <tt>arg</tt> with
     * streams encoded for transmission to the remote side
     */
    encodeStreams(arg?: any | null) {
        if (!arg) {
            return arg;
        }
        const log = this.logger;
        const isReadStream = (typeof arg.pipe === 'function'
                              && typeof (arg.read) === 'function');
        let isWriteStream = (typeof arg.write === 'function');

        if (isReadStream || isWriteStream) {
            if (isReadStream && isWriteStream) {
                // For now, consider that duplex streams are input
                // streams for the purpose of supporting Transform
                // streams in server -> client direction. If the need
                // arises, we can implement full duplex streams later.
                isWriteStream = false;
            }
            const streamId = uuid();
            const encodedStream = {
                $streamId: streamId,
                readable: isReadStream,
                writable: isWriteStream,
            };
            let transportStream;
            if (isReadStream) {
                transportStream = new SIOOutputStream(this, streamId,
                    this.maxPendingAck,
                    this.ackTimeoutMs);
            } else {
                transportStream = new SIOInputStream(this, streamId);
            }
            this.localStreams[streamId] = arg;
            arg.once('close', () => {
                log.debug('stream closed, removing from local streams',
                    { streamId });
                delete this.localStreams[streamId];
            });
            arg.on('error', error => {
                log.error('stream error', { streamId, error });
            });
            if (isReadStream) {
                arg.pipe(transportStream);
            }
            if (isWriteStream) {
                transportStream.pipe(arg);
            }
            return encodedStream;
        }
        if (typeof arg === 'object') {
            let encodedObj;
            if (Array.isArray(arg)) {
                encodedObj = [];
                for (let k = 0; k < arg.length; ++k) {
                    encodedObj.push(this.encodeStreams(arg[k]));
                }
            } else {
                encodedObj = {};
                // user objects are simple flat objects and we want to
                // copy all their properties
                for (const k in arg) {
                    encodedObj[k] = this.encodeStreams(arg[k]);
                }
            }
            return encodedObj;
        }
        return arg;
    }

    /**
     * @brief decode all encoded stream markers (produced by
     * encodeStreams()) found inside the object received from the
     * remote side, turn them into actual readable/writable stream
     * proxies that are forwarding data from/to the remote side stream
     *
     * @param arg the object as received from the remote side
     * @return an object of the same nature than <tt>arg</tt> with
     * stream markers decoded into actual readable/writable stream
     * objects
     */
    decodeStreams(arg?: any | null) {
        if (!arg) {
            return arg;
        }
        const log = this.logger;

        if (arg.$streamId !== undefined) {
            if (arg.readable && arg.writable) {
                throw new Error('duplex streams not supported');
            }
            const streamId = arg.$streamId;
            let stream;
            if (arg.readable) {
                stream = new SIOInputStream(this, streamId);
            } else if (arg.writable) {
                stream = new SIOOutputStream(this, streamId,
                    this.maxPendingAck,
                    this.ackTimeoutMs);
            } else {
                throw new Error('can\'t decode stream neither readable ' +
                                'nor writable');
            }
            this.remoteStreams[streamId] = stream;
            if (arg.readable) {
                stream.once('close', () => {
                    log.debug('stream closed, removing from remote streams',
                        { streamId });
                    delete this.remoteStreams[streamId];
                });
            }
            if (arg.writable) {
                stream.once('finish', () => {
                    log.debug('stream finished, removing from remote streams',
                        { streamId });
                    delete this.remoteStreams[streamId];
                });
            }
            stream.on('error', error => {
                log.error('stream error', { streamId, error });
            });
            return stream;
        }
        if (typeof arg === 'object') {
            let decodedObj;
            if (Array.isArray(arg)) {
                decodedObj = [];
                for (let k = 0; k < arg.length; ++k) {
                    decodedObj.push(this.decodeStreams(arg[k]));
                }
            } else {
                decodedObj = {};
                // user objects are simple flat objects and we want to
                // copy all their properties
                for (const k in arg) {
                    decodedObj[k] = this.decodeStreams(arg[k]);
                }
            }
            return decodedObj;
        }
        return arg;
    }

    _write(streamId: string, data: any, cb: any) {
        this.logger.debug('emit \'stream-data\' event',
            { streamId, size: data.length });
        this.socket.emit('stream-data', { streamId, data }, cb);
    }

    _finish(streamId: string, cb: any) {
        this.logger.debug('emit \'stream-end\' event', { streamId });
        this.socket.emit('stream-end', { streamId }, cb);
    }

    _error(streamId: string, error: Error) {
        this.logger.debug('emit \'stream-error\' event', { streamId, error });
        this.socket.emit('stream-error', { streamId,
            error: flattenError(error) });
    }

    _hangup(streamId: string) {
        this.logger.debug('emit \'stream-hangup\' event', { streamId });
        this.socket.emit('stream-hangup', { streamId });
    }

    destroyStream(streamId: string) {
        this.logger.debug('destroyStream', { streamId });
        if (!this.localStreams[streamId]) {
            return;
        }
        if (this.localStreams[streamId].destroy) {
            // a 'close' event shall be emitted by destroy()
            this.localStreams[streamId].destroy();
        }
        // if no destroy function exists in the input stream, let it
        // go through the end
    }
}

export function createSocket(
    socket: any,
    logger: Logger,
    maxPendingAck = DEFAULT_MAX_PENDING_ACK,
    ackTimeoutMs = DEFAULT_ACK_TIMEOUT_MS,
) {
    return new SIOStreamSocket(socket, logger, maxPendingAck, ackTimeoutMs);
};
