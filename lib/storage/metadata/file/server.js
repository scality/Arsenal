'use strict'; // eslint-disable-line

const assert = require('assert');
const Logger = require('werelogs').Logger;
const constants = require('../../../constants');

const level = require('level');
const levelNet = require('../../../network/level-net');
const sublevel = require('level-sublevel');

const ROOT_DB = 'rootDB';

class MetadataFileServer {

    /**
     * Construct a metadata server
     *
     * @param {Object} params constructor params
     * @param {String} params.metadataPath local path where the root
     *   database is stored
     * @param {Number} params.metadataPort TCP port that listens to
     *   incoming connections
     * @param {Number} [params.streamMaxPendingAck] max number of
     *   in-flight output stream packets sent to the client without an
     *   ack received yet
     * @param {Number} [params.streamAckTimeoutMs] timeout for
     *   receiving an ack after an output stream packet is sent to the
     *   client
     * @param {Object} [params.log] logging configuration
     */
    constructor(params) {
        assert.notStrictEqual(params.metadataPath, undefined);
        assert.notStrictEqual(params.metadataPort, undefined);
        this.metadataPath = params.metadataPath;
        this.metadataPort = params.metadataPort;
        this.streamMaxPendingAck = params.streamMaxPendingAck;
        this.streamAckTimeoutMs = params.streamAckTimeoutMs;

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
        this.logger = new Logger('MetadataFileServer', options);
    }

    /**
     * Start the metadata server and listen to incoming connections
     *
     * @return {undefined}
     */
    startServer() {
        const rootDB = level(`${this.metadataPath}/${ROOT_DB}`);
        this.db = sublevel(rootDB);
        this.logger.info('starting metadata file backend server');
        /* We start a server that will serve the sublevel capable
           rootDB to clients */
        const server = levelNet.createServer(
            this.db, { logger: this.logger,
                       streamMaxPendingAck: this.streamMaxPendingAck,
                       streamAckTimeoutMs: this.streamAckTimeoutMs });
        server.initMetadataService(constants.metadataFileNamespace);
        server.listen(this.metadataPort);
    }
}

module.exports = MetadataFileServer;
