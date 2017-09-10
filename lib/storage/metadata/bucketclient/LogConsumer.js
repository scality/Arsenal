'use strict'; // eslint-disable-line

const stream = require('stream');

const werelogs = require('werelogs');

const errors = require('../../../errors');

class ListRecordStream extends stream.Transform {
    constructor(logger) {
        super({ objectMode: true });
        this.logger = logger;
    }

    _transform(itemObj, encoding, callback) {
        itemObj.entries.forEach(entry => {
            // eslint-disable-next-line no-param-reassign
            entry.type = entry.type || 'put';
        });
        this.push(itemObj);
        callback();
    }
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
     */
    constructor(params) {
        this.setupLogging(params.logApi);
        this.bucketClient = params.bucketClient;
        this.raftSession = params.raftSession;
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
        const recordStream = new ListRecordStream(this.logger);
        const _params = params || {};

        this.bucketClient.getRaftLog(
            this.raftSession, _params.startSeq, _params.limit,
            false, null, (err, data) => {
                if (err) {
                    if (err.code === 404) {
                        // no such raft session, log and ignore
                        this.logger.warn('raft session does not exist yet',
                                         { raftId: this.raftSession });
                        return cb(null, { info: { start: null,
                            end: null } });
                    }
                    if (err.code === 416) {
                        // requested range not satisfiable
                        this.logger.debug('no new log record to process',
                                          { raftId: this.raftSession });
                        return cb(null, { info: { start: null,
                            end: null } });
                    }
                    this.logger.error(
                        'Error handling record log request', { error: err });
                    return cb(err);
                }
                let logResponse;
                try {
                    logResponse = JSON.parse(data);
                } catch (err) {
                    this.logger.error('received malformed JSON',
                                      { params });
                    return cb(errors.InternalError);
                }
                logResponse.log.forEach(entry => recordStream.write(entry));
                recordStream.end();
                return cb(null, { info: logResponse.info,
                    log: recordStream });
            }, this.logger.newRequestLogger());
    }
}

module.exports = LogConsumer;
