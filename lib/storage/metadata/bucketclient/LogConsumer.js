'use strict'; // eslint-disable-line

const stream = require('stream');
const jsonStream = require('JSONStream');

const werelogs = require('werelogs');

const errors = require('../../../errors').default;
const jsutil = require('../../../jsutil');

class ListRecordStream extends stream.Transform {
    constructor(logger, metrics) {
        if (+process.env.TEST_ARSENAL_LOG_RECORD_HWM) {
            super({ objectMode: true, highWaterMark: +process.env.TEST_ARSENAL_LOG_RECORD_HWM || 16 });
        } else {
            super({ objectMode: true });
        }
        this.logger = logger;
        this.metrics = metrics;
    }

    _transform(itemObj, encoding, callback) {
        itemObj.entries.forEach(entry => {
            // eslint-disable-next-line no-param-reassign
            entry.type = entry.type || 'put';
        });
        this.push(itemObj);
        this.metrics.record.readBufferLength.observe(this.readableLength);
        this.metrics.record.readFlowing[+this.readableFlowing || 0].inc();
        this.metrics.record.writeBufferLength.observe(this.writableLength);
        this.metrics.record.writeDrain[+this.writableNeedDrain || 0].inc();
        this.metrics.record.writeCorked.observe(this.writableCorked);
        callback();
    }
}

// Internal Stream
const defaultLabels = ['session_id', 'stream'];
let readStreamBufferLength;
let readStreamFlowing;
let readStreamOn;
let writeStreamBufferLength;
let writeStreamNeedDrain;
let writeStreamCorked;

function makePromMetrics(promClient) {
    if (readStreamBufferLength) return;
    readStreamBufferLength = new promClient.Histogram({
        name: 'arsenal_raft_log_read_stream_buffer_length',
        help: 'arsenal Readable stream internal buffer length',
        labelNames: defaultLabels,
        // handle both object mode and not
        buckets: [0, 1, 10, 16, 32, 64, ...promClient.exponentialBuckets(128, 2, 13)],
    });

    readStreamFlowing = new promClient.Counter({
        name: 'arsenal_raft_log_reader_stream_flowing',
        help: 'arsenal Reader stream flowing boolean counter',
        labelNames: [...defaultLabels, 'flowing'],
    });

    readStreamOn = new promClient.Counter({
        name: 'arsenal_raft_log_reader_stream_on_event',
        help: 'arsenal Reader stream on event counter',
        labelNames: [...defaultLabels, 'event'],
    });

    writeStreamBufferLength = new promClient.Histogram({
        name: 'arsenal_raft_log_write_stream_buffer_length',
        help: 'arsenal Writable stream internal buffer length',
        labelNames: defaultLabels,
        // handle both object mode and not
        buckets: [0, 1, 10, 16, 32, 64, ...promClient.exponentialBuckets(128, 2, 13)],
    });

    writeStreamNeedDrain = new promClient.Counter({
        name: 'arsenal_raft_log_write_stream_need_drain',
        help: 'arsenal Writable stream need drain boolean counter',
        labelNames: [...defaultLabels, 'drain'],
    });

    writeStreamCorked = new promClient.Histogram({
        name: 'arsenal_raft_log_write_stream_corked',
        help: 'arsenal Writable stream corked counter',
        labelNames: defaultLabels,
        buckets: promClient.linearBuckets(0, 1, 5),
    });
}

/**
 * @class
 * @classdesc Proxy object to access raft log API
 */
class LogConsumer {
    /**
     * @constructor
     *
     * @param {Object} params - constructor params
     * @param {bucketclient.RESTClient} params.bucketClient - client
     *   object to bucketd
     * @param {Number} params.raftSession - raft session ID to query
     * @param {werelogs.API} [params.logApi] - object providing a constructor
     *                                         function for the Logger object
     * @param {Object} promClient - prom client
     */
    constructor(params, promClient) {
        this.setupLogging(params.logApi);
        this.bucketClient = params.bucketClient;
        this.raftSession = params.raftSession;
        makePromMetrics(promClient);
        // eslint-disable-next-line camelcase
        const labels = { session_id: this.raftSession };
        const stream = Object.assign({ stream: 'stream' }, labels);
        const json = Object.assign({ stream: 'json' }, labels);
        const record = Object.assign({ stream: 'record' }, labels);

        this.metrics = {
            stream: {
                readBufferLength: readStreamBufferLength.labels(stream),
                readFlowing: {
                    0: readStreamFlowing.labels(Object.assign({ flowing: 0 }, stream)),
                    1: readStreamFlowing.labels(Object.assign({ flowing: 1 }, stream)),
                },
                readOn: {
                    pause: readStreamOn.labels(Object.assign({ event: 'pause' }, stream)),
                    resume: readStreamOn.labels(Object.assign({ event: 'resume' }, stream)),
                    readable: readStreamOn.labels(Object.assign({ event: 'readable' }, stream)),
                    data: readStreamOn.labels(Object.assign({ event: 'data' }, stream)),
                },
            },
            json: {
                writeBufferLength: writeStreamBufferLength.labels(json),
                writeDrain: {
                    0: writeStreamNeedDrain.labels(Object.assign({ drain: 0 }, json)),
                    1: writeStreamNeedDrain.labels(Object.assign({ drain: 1 }, json)),
                },
                writeCorked: writeStreamCorked.labels(json),
                readBufferLength: readStreamBufferLength.labels(json),
                readFlowing: {
                    0: readStreamFlowing.labels(Object.assign({ flowing: 0 }, json)),
                    1: readStreamFlowing.labels(Object.assign({ flowing: 1 }, json)),
                },
                readOn: {
                    pause: readStreamOn.labels(Object.assign({ event: 'pause' }, json)),
                    resume: readStreamOn.labels(Object.assign({ event: 'resume' }, json)),
                    readable: readStreamOn.labels(Object.assign({ event: 'readable' }, json)),
                    data: readStreamOn.labels(Object.assign({ event: 'data' }, json)),
                },
            },
            record: {
                writeBufferLength: writeStreamBufferLength.labels(record),
                writeDrain: {
                    0: writeStreamNeedDrain.labels(Object.assign({ drain: 0 }, record)),
                    1: writeStreamNeedDrain.labels(Object.assign({ drain: 1 }, record)),
                },
                writeCorked: writeStreamCorked.labels(record),
                readBufferLength: readStreamBufferLength.labels(record),
                readFlowing: {
                    0: readStreamFlowing.labels(Object.assign({ flowing: 0 }, record)),
                    1: readStreamFlowing.labels(Object.assign({ flowing: 1 }, record)),
                },
                readOn: {
                    pause: readStreamOn.labels(Object.assign({ event: 'pause' }, record)),
                    resume: readStreamOn.labels(Object.assign({ event: 'resume' }, record)),
                    readable: readStreamOn.labels(Object.assign({ event: 'readable' }, record)),
                    data: readStreamOn.labels(Object.assign({ event: 'data' }, record)),
                },
            },
        };
    }

    /**
     * Create a dedicated logger for LogConsumer, from the provided werelogs
     * API instance.
     *
     * @param {werelogs.API} logApi - object providing a constructor
     *                                function for the Logger object
     * @return {undefined}
     */
    setupLogging(logApi) {
        const api = logApi || werelogs;
        this.logger = new api.Logger('LogConsumer');
    }

    /**
     * Prune the oldest records in the record log
     *
     * Note: not implemented yet
     *
     * @param {Object} params - params object
     * @param {Function} cb - callback when done
     * @return {undefined}
     */
    pruneRecords(params, cb) {
        setImmediate(() => cb(errors.NotImplemented));
    }

    /**
     * Read a series of log records from raft
     *
     * @param {Object} [params] - params object
     * @param {Number} [params.startSeq] - fetch starting from this
     *   sequence number
     * @param {Number} [params.limit] - maximum number of log records
     *   to return
     * @param {function} cb - callback function, called with an error
     *   object or null and an object as 2nd parameter
     * @return {undefined}
     */
    readRecords(params, cb) {
        const recordStream = new ListRecordStream(this.logger, this.metrics);
        const _params = params || {};
        const cbOnce = jsutil.once(cb);

        this.bucketClient.getRaftLog(
            this.raftSession, _params.startSeq, _params.limit,
            false, null, (err, stream) => {
                if (err) {
                    if (err.code === 404) {
                        // no such raft session, log and ignore
                        this.logger.warn('raft session does not exist yet',
                            { raftId: this.raftSession });
                        return cbOnce(null, { info: { start: null,
                            end: null } });
                    }
                    if (err.code === 416) {
                        // requested range not satisfiable
                        this.logger.debug('no new log record to process',
                            { raftId: this.raftSession });
                        return cbOnce(null, { info: { start: null,
                            end: null } });
                    }
                    this.logger.error(
                        'Error handling record log request', { error: err });
                    return cbOnce(err);
                }
                // setup a temporary listener until the 'header' event
                // is emitted
                recordStream.on('error', err => {
                    this.logger.error('error receiving raft log',
                        { error: err.message });
                    return cbOnce(errors.InternalError);
                });
                const jsonResponse = stream.pipe(jsonStream.parse('log.*'));

                /** Debug internal buffers */
                stream.on('data', () => {
                    this.metrics.stream.readOn.data.inc();
                    this.metrics.stream.readBufferLength.observe(stream.readableLength);
                    this.metrics.stream.readFlowing[+stream.readableFlowing || 0].inc();
                    this.metrics.json.writeBufferLength.observe(jsonResponse.buffer.length);
                });
                stream.on('pause', () => {
                    this.metrics.stream.readOn.pause.inc();
                    this.metrics.stream.readBufferLength.observe(stream.readableLength);
                    this.metrics.json.writeBufferLength.observe(jsonResponse.buffer.length);
                });
                stream.on('resume', () => {
                    this.metrics.stream.readOn.resume.inc();
                    this.metrics.stream.readBufferLength.observe(stream.readableLength);
                    this.metrics.json.writeBufferLength.observe(jsonResponse.buffer.length);
                });

                jsonResponse.pipe(recordStream);
                /** debug internal buffers */
                jsonResponse.on('data', () => {
                    this.metrics.json.readOn.data.inc();
                    this.metrics.json.writeBufferLength.observe(jsonResponse.buffer.length);
                    this.metrics.json.readFlowing[+!jsonResponse.paused].inc();
                });
                jsonResponse.on('resume', () => {
                    this.metrics.json.readOn.resume.inc();
                    this.metrics.json.writeBufferLength.observe(jsonResponse.buffer.length);
                });

                stream.on('error', err => recordStream.emit('error', err));
                jsonResponse
                    .on('header', header => {
                        // remove temporary listener
                        recordStream.removeAllListeners('error');
                        return cbOnce(null, { info: header.info,
                            log: recordStream });
                    })
                    .on('error', err => recordStream.emit('error', err));
                return undefined;
            }, this.logger.newRequestLogger());
    }
}

module.exports = LogConsumer;
