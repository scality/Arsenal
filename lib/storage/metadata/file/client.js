'use strict'; // eslint-disable-line

const assert = require('assert');
const Logger = require('werelogs').Logger;

const levelNet = require('../../../network/level-net');

class MetadataFileClient {

    /**
     * Construct a metadata client
     *
     * @param {Object} params the following parameters are used:

     * - metadataHost {String} [mandatory] name or IP address of
         metadata server host
     * - metadataPort {Number} [mandatory] TCP port to connect to the
         metadata server
     * - log [optional] logging configuration
     */
    constructor(params) {
        assert.notStrictEqual(params.metadataHost, undefined);
        assert.notStrictEqual(params.metadataPort, undefined);
        this.metadataHost = params.metadataHost;
        this.metadataPort = params.metadataPort;
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
        this.logger = new Logger('MetadataFileClient', options)
            .newRequestLogger();
    }

    /**
     * Open the remote metadata database (backed by leveldb)
     *
     * @return {Object} handle to the remote database
     */
    openDB() {
        this.client = levelNet.client(this.logger);
        this.client.connect(this.metadataHost, this.metadataPort);
        return this.client;
    }
}

module.exports = MetadataFileClient;
