'use strict'; // eslint-disable-line

const assert = require('assert');
const Logger = require('werelogs').Logger;

const levelNet = require('../../../network/level-net');

class MetadataFileClient {

    constructor(params) {
        assert.notStrictEqual(params.metadataPath, undefined);
        assert.notStrictEqual(params.metadataPort, undefined);
        this.metadataPath = params.metadataPath;
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
     * Setup the leveldb server
     * @return {undefined}
     */
    openDB() {
        this.client = levelNet.client(this.logger);
        this.client.connect('localhost', this.metadataPort);
        return this.client;
    }
}

module.exports = MetadataFileClient;
