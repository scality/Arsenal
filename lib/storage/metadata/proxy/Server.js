'use strict'; // eslint-disable-line strict

const cluster = require('cluster');

const HttpServer = require('../../../network/http/server');
const BucketdRoutes = require('./BucketdRoutes');

const requiresOneWorker = {
    // in memory kvs storage is not shared across processes
    memorybucket: true,
};

class Server {

    /**
     * Create a new Metadata Proxy Server instance
     *
     * The Metadata Proxy Server is an HTTP server that translates
     * requests of the bucketd sub-protocol into function calls to
     * a properly configured MetadataWrapper instance. Such instance
     * can use any of the available metadata backends available.
     *
     * @param {arsenal.storage.metadata.MetadataWrapper} metadataWrapper -
     * @param {Object} configuration -
     * @param {number} configuration.port -
     * @param {number} configuration.workers -
     * @param {werelogs.Logger} logger -
     */
    constructor(metadataWrapper, configuration, logger) {
        this._configuration = configuration;
        if (requiresOneWorker[metadataWrapper.implName] &&
            this._configuration.workers !== 1) {
            logger.warn('This metadata backend requires only one worker',
                        { metadataBackend: metadataWrapper.implName });
            this._configuration.workers = 1;
        }
        this._logger = logger;
        this._metadataWrapper = metadataWrapper;

        this._proxyRoutes = new BucketdRoutes(metadataWrapper, this._logger);
        this._httpServer = null;
        this._installSignalHandlers();
    }

    _cleanup() {
        if (cluster.isWorker) {
            this._logger.info('Server worker shutting down...');
            this._httpServer.stop();
        } else {
            this._logger.info('Server shutting down...');
        }
        return process.exit(0);
    }

    _installSignalHandlers() {
        process.on('SIGINT', () => { this._cleanup(); });
        process.on('SIGHUP', () => { this._cleanup(); });
        process.on('SIGQUIT', () => { this._cleanup(); });
        process.on('SIGTERM', () => { this._cleanup(); });
        process.on('SIGPIPE', () => {});
    }

    /**
     * Start the Metadata Proxy Server instance
     *
     * @param {Function} cb - called with no argument when the onListening event
     *                        is triggered
     * @return {undefined}
     */
    start(cb) {
        if (cluster.isMaster) {
            for (let i = 0; i < this._configuration.workers; ++i) {
                cluster.fork();
            }
            cluster.on('disconnect', worker => {
                this._logger
                    .info(`worker ${worker.process.pid} exited, respawning.`);
                cluster.fork();
            });
        } else {
            this._httpServer = new HttpServer(this._configuration.port,
                                              this._logger);
            if (this._configuration.bindAddress) {
                this._httpServer.setBindAddress(
                    this._configuration.bindAddress);
            }
            this._httpServer
                .onRequest((req, res) => this._proxyRoutes.dispatch(req, res))
                .onListening(() => {
                    this._logger.info(
                        'Metadata Proxy Server now listening on' +
                        ` port ${this._configuration.port}`);
                    if (cb) {
                        return this._metadataWrapper.setup(cb);
                    }
                    return this._metadataWrapper.setup(() => {
                        this._logger.info('MetadataWrapper setup complete.');
                    });
                })
                .start();
        }
    }
}

module.exports = Server;
