'use strict'; // eslint-disable-line

const assert = require('assert');
const Logger = require('werelogs').Logger;

const level = require('level');
const levelNet = require('../../../network/level-net');
const sublevel = require('level-sublevel');

const ROOT_DB = 'rootDB';

class MetadataFileServer {

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
        this.logger = new Logger('MetadataFileServer', options)
            .newRequestLogger();
    }

    /**
     * Start the server
     * @return {undefined}
     */
    startServer() {
        const rootDB = level(this.metadataPath + ROOT_DB);
        this.db = sublevel(rootDB);
        this.logger.info('starting metadata file backend server');
        /* We start a server that will serve the sublevel
           capable rootDB to clients */
        const server = levelNet.createServer(this.db);
        server.listen(this.metadataPort);
    }

    getDB() {
        return this.db;
    }
}

module.exports = MetadataFileServer;
