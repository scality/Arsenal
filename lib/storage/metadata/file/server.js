'use strict'; // eslint-disable-line

const fs = require('fs');
const os = require('os');
const assert = require('assert');
const uuid = require('uuid');
const level = require('level');
const sublevel = require('level-sublevel');

const Logger = require('werelogs').Logger;

const constants = require('../../../constants');
const errors = require('../../../errors');
const storageUtils = require('../../utils');
const rpc = require('../../../network/rpc/rpc');
const levelNet = require('../../../network/rpc/level-net');

const WGM = require('../../../versioning/WriteGatheringManager');
const WriteCache = require('../../../versioning/WriteCache');
const VRP = require('../../../versioning/VersioningRequestProcessor');

const ROOT_DB = 'rootDB';
const SYNC_OPTIONS = { sync: true };
const SUBLEVEL_SEP = '::';

class MetadataFileServer {

    /**
     * Construct a metadata server
     *
     * @param {Object} params - constructor params
     * @param {String} params.metadataPath - local path where the root
     *   database is stored
     * @param {Number} params.metadataPort - TCP port that listens to
     *   incoming connections
     * @param {Number} [params.streamMaxPendingAck] - max number of
     *   in-flight output stream packets sent to the client without an
     *   ack received yet
     * @param {Number} [params.streamAckTimeoutMs] - timeout for
     *   receiving an ack after an output stream packet is sent to the
     *   client
     * @param {Object} [params.log] - logging configuration
     */
    constructor(params) {
        assert.notStrictEqual(params.metadataPath, undefined);
        assert.notStrictEqual(params.metadataPort, undefined);
        assert(params.versioning && params.versioning.replicationGroupId);
        this.metadataPath = params.metadataPath;
        this.metadataPort = params.metadataPort;
        this.streamMaxPendingAck = params.streamMaxPendingAck;
        this.streamAckTimeoutMs = params.streamAckTimeoutMs;
        this.versioning = params.versioning;
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

        this.logger.info('starting metadata file backend server');
        /* We start a server that will serve the sublevel capable
           db to clients */
        this.server = new rpc.RPCServer(
            { logger: this.logger,
              streamMaxPendingAck: this.streamMaxPendingAck,
              streamAckTimeoutMs: this.streamAckTimeoutMs });

        this.initMetadataService();
        this.server.listen(this.metadataPort);

        this.genUUIDIfNotExists();
        this.printUUID();
    }

    initMetadataService() {
        // all metadata operations executed by leveldb go through the
        // /metadata namespace
        const namespace = `${constants.metadataFileNamespace}/metadata`;
        this.logger.info(`creating RPC service at ${namespace}`);
        const dbService = new levelNet.LevelDbService({
            server: this.server,
            rootDb: sublevel(level(`${this.metadataPath}/${ROOT_DB}`)),
            namespace,
            logger: this.logger,
        });

        /* provide an API compatible with MetaData API */
        const metadataAPI = {
            get: (request, logger, callback) => {
                const dbPath = request.db.split(SUBLEVEL_SEP);
                const subDb = dbService.lookupSubLevel(dbPath);
                subDb.get(request.key, (err, data) => {
                    if (err && err.notFound) {
                        return callback(errors.ObjNotFound);
                    }
                    return callback(err, data);
                });
            },
            list: (request, logger, callback) => {
                const dbPath = request.db.split(SUBLEVEL_SEP);
                const subDb = dbService.lookupSubLevel(dbPath);
                const stream = subDb.createReadStream(request.params);
                const res = [];
                let done = false;
                stream.on('data', data => res.push(data));
                stream.on('error', err => {
                    if (done === false) {
                        done = true;
                        callback(err);
                    }
                });
                stream.on('end', () => {
                    if (done === false) {
                        done = true;
                        callback(null, res);
                    }
                });
            },
            batch: (request, logger, callback) => {
                const dbPath = request.db.split(SUBLEVEL_SEP);
                const subDb = dbService.lookupSubLevel(dbPath);
                subDb.batch(request.array, SYNC_OPTIONS,
                            err => callback(err));
            },
        };

        Object.keys(metadataAPI).forEach(k => {
            metadataAPI[k] = metadataAPI[k].bind(dbService);
        });

        const wgm = new WGM(metadataAPI);
        const writeCache = new WriteCache(wgm);
        const vrp = new VRP(writeCache, wgm, this.versioning);

        dbService.registerAsyncAPI({
            put: (env, key, value, options, cb) => {
                const dbName = env.subLevel.join(SUBLEVEL_SEP);
                vrp.put({ db: dbName, key, value, options },
                        env.requestLogger, cb);
            },
            del: (env, key, options, cb) => {
                const dbName = env.subLevel.join(SUBLEVEL_SEP);
                vrp.del({ db: dbName, key, options },
                        env.requestLogger, cb);
            },
            get: (env, key, options, cb) => {
                const dbName = env.subLevel.join(SUBLEVEL_SEP);
                vrp.get({ db: dbName, key, options },
                        env.requestLogger, cb);
            },
        });
        dbService.registerSyncAPI({
            createReadStream:
            (env, options) => env.subDb.createReadStream(options),
        });
    }
}

module.exports = MetadataFileServer;
