'use strict'; // eslint-disable-line

const fs = require('fs');
const assert = require('assert');
const uuid = require('uuid');
const level = require('level');
const sublevel = require('level-sublevel');
const debug = require('debug')('MetadataFileServer');
const diskusage = require('diskusage');
const werelogs = require('werelogs');

const constants = require('../../../constants');
const errors = require('../../../errors');
const storageUtils = require('../../utils');
const rpc = require('../../../network/rpc/rpc');
const levelNet = require('../../../network/rpc/level-net');
const { RecordLogService } = require('./RecordLog.js');

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
     * @param {Number} params.port - TCP port that listens to incoming
     *   connections
     * @param {String} params.path - local path where the root
     *   database is stored
     * @param {String} [params.bindAddress='localhost'] - address
     * bound to the socket
     * @param {Number} [params.streamMaxPendingAck] - max number of
     *   in-flight output stream packets sent to the client without an
     *   ack received yet
     * @param {Number} [params.streamAckTimeoutMs] - timeout for
     *   receiving an ack after an output stream packet is sent to the
     *   client
     * @param {Boolean} [params.restEnabled=false] - set to
     *   <tt>true</tt> to enable a debug HTTP interface for accessing
     *   raw metadata info (based on JSON-enabled POST
     *   requests/responses mapping socket.io transfers)
     * @param {Number} [params.restPort] - if <tt>restEnabled</tt> is
     *   <tt>true</tt>, set the port to which the interface listens to
     * @param {werelogs.API} [params.logApi] - object providing a constructor
     *                                         function for the Logger object
     */
    constructor(params) {
        assert.notStrictEqual(params.path, undefined);
        assert.notStrictEqual(params.port, undefined);
        assert(params.versioning && params.versioning.replicationGroupId);
        this.path = params.path;
        this.port = params.port;
        this.bindAddress = params.bindAddress || 'localhost';
        this.restEnabled = params.restEnabled || false;
        this.restPort = params.restPort;
        this.streamMaxPendingAck = params.streamMaxPendingAck;
        this.streamAckTimeoutMs = params.streamAckTimeoutMs;
        this.versioning = params.versioning;
        if (params.recordLog) {
            this.recordLog = Object.assign({}, params.recordLog);
        } else {
            this.recordLog = { enabled: false };
        }
        this.setupLogging(params.logApi);
        this.servers = [];
        this.services = [];
    }

    /**
     * Create a dedicated logger for MetadataFileServer, from the provided
     * werelogs API instance.
     *
     * @param {werelogs.API} logApi - object providing a constructor
     *                                function for the Logger object
     * @return {undefined}
     */
    setupLogging(logApi) {
        const api = logApi || werelogs;
        this.logger = new api.Logger('MetadataFileServer');
    }

    genUUIDIfNotExists() {
        const uuidFile = `${this.path}/uuid`;

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

    readUUID() {
        if (this.uuid === undefined) {
            this.uuid = fs.readFileSync(`${this.path}/uuid`, 'ascii');
        }
        return this.uuid;
    }

    printUUID() {
        const uuidValue = this.readUUID();
        this.logger.info(`This deployment's identifier is ${uuidValue}`);
    }

    /**
     * Start the metadata server and listen to incoming connections
     *
     * @return {undefined}
     */
    startServer() {
        fs.accessSync(this.path, fs.F_OK | fs.R_OK | fs.W_OK);
        storageUtils.setDirSyncFlag(this.path, this.logger);

        this.initMetadataService();
        if (this.recordLog.enabled) {
            this.initRecordLogService();
        }

        this.logger.info('starting metadata file backend server');
        /* We start a server that will serve the sublevel capable
           db to clients */
        this.server = new rpc.RPCServer(
            { logger: this.logger,
                streamMaxPendingAck: this.streamMaxPendingAck,
                streamAckTimeoutMs: this.streamAckTimeoutMs });
        this.server.listen(this.port, this.bindAddress);
        this.servers.push(this.server);

        if (this.restEnabled) {
            this.logger.info(`starting REST server on port ${this.restPort}`);
            this.restServer = new rpc.RESTServer({ logger: this.logger });
            this.restServer.listen(this.restPort, this.bindAddress);
            this.servers.push(this.restServer);
        }

        this.servers.forEach(server => {
            server.registerServices(...this.services);
        });

        this.genUUIDIfNotExists();
        this.printUUID();
    }

    initMetadataService() {
        // all metadata operations executed by leveldb go through the
        // /metadata namespace
        const namespace = `${constants.metadataFileNamespace}/metadata`;
        this.logger.info(`creating metadata service at ${namespace}`);
        this.baseDb = level(`${this.path}/${ROOT_DB}`);
        this.rootDb = sublevel(this.baseDb);
        const dbService = new levelNet.LevelDbService({
            rootDb: this.rootDb,
            namespace,
            logger: this.logger,
        });
        this.services.push(dbService);

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
                const ops = request.array.map(
                    op => Object.assign({}, op, { prefix: dbPath }));
                if (this.recordLog.enabled) {
                    this.recordLogService
                        .withRequestParams(
                            { logName: this.recordLog.recordLogName })
                        .createLogRecordOps(
                            ops, (err, logEntries) => {
                                debug('ops to batch:', ops);
                                debug('log entries:', logEntries);
                                return this.rootDb.batch(
                                    ops.concat(logEntries), SYNC_OPTIONS,
                                    err => callback(err));
                            });
                } else {
                    this.rootDb.batch(ops, SYNC_OPTIONS,
                                      err => callback(err));
                }
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
            getDiskUsage: (env, cb) => diskusage.check(this.path, cb),
        });
        dbService.registerSyncAPI({
            createReadStream:
            (env, options) => env.subDb.createReadStream(options),
            rawListKeys:
            (env, options) => this.baseDb.createKeyStream(options),
            getUUID: () => this.readUUID(),
        });
    }

    initRecordLogService() {
        const namespace = `${constants.metadataFileNamespace}/recordLog`;
        this.logger.info(`creating record log service at ${namespace}`);
        this.recordLogService = new RecordLogService({
            namespace,
            rootDb: this.rootDb,
            logger: this.logger,
        });
        this.services.push(this.recordLogService);
    }
}

module.exports = MetadataFileServer;
