'use strict'; // eslint-disable-line

const fs = require('fs');
const os = require('os');
const assert = require('assert');
const uuid = require('uuid');
const level = require('level');
const sublevel = require('level-sublevel');

const Logger = require('werelogs').Logger;

const constants = require('../../../constants');
const storageUtils = require('../../utils');
const levelNet = require('../../../network/rpc/level-net');

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

    genUUIDIfNotExists() {
        const uuidFile = `${this.metadataPath}/uuid`;

        try {
            fs.accessSync(uuidFile, fs.F_OK | fs.R_OK);
        } catch (e) {
            if (e.code === 'ENOENT') {
                const v = uuid.v4();
                const fd = fs.openSync(uuidFile, 'w');
                fs.writeSync(fd, v.toString());
                fs.closeSync(fd);
            } else {
                throw e;
            }
        }
    }

    printUUID() {
        const uuidFile = `${this.metadataPath}/uuid`;
        const uuidValue = fs.readFileSync(uuidFile);
        this.logger.info(`This deployment's identifier is ${uuidValue}`);
    }

    /**
     * Start the metadata server and listen to incoming connections
     *
     * @return {undefined}
     */
    startServer() {
        fs.accessSync(this.metadataPath, fs.F_OK | fs.R_OK | fs.W_OK);

        const warning =
                  'WARNING: Synchronization directory updates are not ' +
                  'supported on this platform. Newly written data could ' +
                  'be lost if your system crashes before the operating ' +
                  'system is able to write directory updates.';
        if (os.type() === 'Linux' && os.endianness() === 'LE') {
            try {
                storageUtils.setDirSyncFlag(this.metadataPath);
            } catch (err) {
                this.logger.warn(warning, { error: err.message,
                                            errorStack: err.stack });
            }
        } else {
            this.logger.warn(warning);
        }

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

        this.genUUIDIfNotExists();
        this.printUUID();
    }
}

module.exports = MetadataFileServer;
