'use strict'; // eslint-disable-line

const assert = require('assert');
const Logger = require('werelogs').Logger;
const constants = require('../../../constants');

const levelNet = require('../../../network/rpc/level-net');
const { RecordLogProxy } = require('./RecordLog.js');

class MetadataFileClient {

    /**
     * Construct a metadata client
     *
     * @param {Object} params - constructor params
     * @param {String} params.host - name or IP address of metadata
     *   server host
     * @param {Number} params.port - TCP port to connect to the metadata
     *   server
     * @param {Object} [params.log] - logging configuration
     * @param {Number} [params.callTimeoutMs] - timeout for remote calls
     */
    constructor(params) {
        assert.notStrictEqual(params.host, undefined);
        assert.notStrictEqual(params.port, undefined);
        this.host = params.host;
        this.port = params.port;
        this.callTimeoutMs = params.callTimeoutMs;
        this.setupLogging(params.log);
    }

    setupLogging(config) {
        let options = undefined;
        if (config !== undefined) {
            options = {
                level: config.logLevel,
                dump: config.dumpLevel,
            };
        }
        this.logger = new Logger('MetadataFileClient', options);
    }

    /**
     * Open the remote metadata database (backed by leveldb)
     *
     * @param {function} [done] called when done
     * @return {Object} handle to the remote database
     */
    openDB(done) {
        const url = `http://${this.host}:${this.port}` +
                  `${constants.metadataFileNamespace}/metadata`;
        this.logger.info(`connecting to metadata service at ${url}`);
        const dbClient = new levelNet.LevelDbClient({
            url,
            logger: this.logger,
            callTimeoutMs: this.callTimeoutMs,
        });
        dbClient.connect(done);
        return dbClient;
    }

    /**
     * Open a new or existing record log and access its API through
     * RPC calls.
     *
     * @param {String} [params] - open params
     * @param {String} [params.logName] - name of log to open (default
     *   "main")
     * @param {Function} done - callback expecting an error argument,
     *   or null and the opened log proxy object on success
     * @return {undefined}
     */
    openRecordLog(params, done) {
        const _params = params || {};
        const url = `http://${this.host}:${this.port}` +
                  `${constants.metadataFileNamespace}/recordLog`;
        this.logger.info('connecting to record log service', { url });
        const logProxy = new RecordLogProxy({
            url,
            name: _params.logName,
            logger: this.logger,
            callTimeoutMs: this.callTimeoutMs,
        });
        logProxy.connect(err => {
            if (err) {
                this.logger.error('error connecting to record log service',
                                  { url, error: err.stack });
                return done(err);
            }
            this.logger.info('connected to record log service', { url });
            return done();
        });
        return logProxy;
    }
}

module.exports = MetadataFileClient;
