'use strict'; // eslint-disable-line

const cluster = require('cluster');

class Clustering {
    /**
     * Constructor
     *
     * @param {number} size Cluster size
     * @param {Logger} logger Logger object
     * @param {number} [shutdownTimeout=5000] Change default shutdown timeout
     * releasing ressources
     * @return {Clustering} itself
     */
    constructor(size, logger, shutdownTimeout) {
        this._size = size;
        if (size < 1) {
            throw new Error('Cluster size must be greater than or equal to 1');
        }
        this._shutdownTimeout = shutdownTimeout || 5000;
        this._logger = logger;
        this._shutdown = false;
        this._workers = new Array(size).fill(undefined);
        this._workersTimeout = new Array(size).fill(undefined);
        this._workersStatus = new Array(size).fill(undefined);
        this._status = 0;
        this._exitCb = undefined; // Exit callback
        this._index = undefined;
    }

    /**
     * Method called after a stop() call
     *
     * @private
     * @return {undefined}
     */
    _afterStop() {
        // Asuming all workers shutdown gracefully
        this._status = 0;
        const size = this._size;
        for (let i = 0; i < size; ++i) {
            // If the process return an error code or killed by a signal,
            // set the status
            if (typeof this._workersStatus[i] === 'number') {
                this._status = this._workersStatus[i];
                break;
            } else if (typeof this._workersStatus[i] === 'string') {
                this._status = 1;
                break;
            }
        }
        if (this._exitCb) {
            return this._exitCb(this);
        }
        return process.exit(this.getStatus());
    }

    /**
     * Method called when a worker exited
     *
     * @param {Cluster.worker} worker - Current worker
     * @param {number} i - Worker index
     * @param {number} code - Exit code
     * @param {string} signal - Exit signal
     * @return {undefined}
     */
    _workerExited(worker, i, code, signal) {
        // If the worker:
        //   - was killed by a signal
        //   - return an error code
        //   - or just stopped
        if (signal) {
            this._logger.info('Worker killed by signal', {
                signal,
                id: i,
                childPid: worker.process.pid,
            });
            this._workersStatus[i] = signal;
        } else if (code !== 0) {
            this._logger.error('Worker exit with code', {
                code,
                id: i,
                childPid: worker.process.pid,
            });
            this._workersStatus[i] = code;
        } else {
            this._logger.info('Worker shutdown gracefully', {
                id: i,
                childPid: worker.process.pid,
            });
            this._workersStatus[i] = undefined;
        }
        this._workers[i] = undefined;
        if (this._workersTimeout[i]) {
            clearTimeout(this._workersTimeout[i]);
            this._workersTimeout[i] = undefined;
        }
        // If we don't trigger the stop method, the watchdog
        // will autorestart the worker
        if (this._shutdown === false) {
            return process.nextTick(() => this.startWorker(i));
        }
        // Check if an worker is still running
        if (!this._workers.every(cur => cur === undefined)) {
            return undefined;
        }
        return this._afterStop();
    }

    /**
     * Method to start a worker
     *
     * @param {number} i Index of the starting worker
     * @return {undefined}
     */
    startWorker(i) {
        if (!cluster.isMaster) {
            return;
        }
        // Fork a new worker
        this._workers[i] = cluster.fork();
        // Listen for message from the worker
        this._workers[i].on('message', msg => {
            // If the worker is ready, send him his id
            if (msg === 'ready') {
                this._workers[i].send({ msg: 'setup', id: i });
            }
        });
        this._workers[i].on('exit', (code, signal) =>
            this._workerExited(this._workers[i], i, code, signal));
        // Trigger when the worker was started
        this._workers[i].on('online', () => {
            this._logger.info('Worker started', {
                id: i,
                childPid: this._workers[i].process.pid,
            });
        });
    }

    /**
     * Method to put handler on cluster exit
     *
     * @param {function} cb - Callback(Clustering, [exitSignal])
     * @return {Clustering} Itself
     */
    onExit(cb) {
        this._exitCb = cb;
        return this;
    }

    /**
     * Method to start the cluster (if master) or to start the callback
     * (worker)
     *
     * @param {function} cb - Callback to run the worker
     * @return {Clustering} itself
     */
    start(cb) {
        process.on('SIGINT', () => this.stop('SIGINT'));
        process.on('SIGHUP', () => this.stop('SIGHUP'));
        process.on('SIGQUIT', () => this.stop('SIGQUIT'));
        process.on('SIGTERM', () => this.stop('SIGTERM'));
        process.on('SIGPIPE', () => {});
        process.on('exit', (code, signal) => {
            if (this._exitCb) {
                this._status = code || 0;
                return this._exitCb(this, signal);
            }
            return process.exit(code || 0);
        });
        process.on('uncaughtException', err => {
            this._logger.fatal('caught error', {
                error: err.message,
                stack: err.stack.split('\n').map(str => str.trim()),
            });
            process.exit(1);
        });
        if (!cluster.isMaster) {
            // Waiting for message from master to
            // know the id of the slave cluster
            process.on('message', msg => {
                if (msg.msg === 'setup') {
                    this._index = msg.id;
                    cb(this);
                }
            });
            // Send message to the master, to let him know
            // the worker has started
            process.send('ready');
        } else {
            for (let i = 0; i < this._size; ++i) {
                this.startWorker(i);
            }
        }
        return this;
    }

    /**
     * Method to get workers
     *
     * @return {Cluster.Worker[]} Workers
     */
    getWorkers() {
        return this._workers;
    }

    /**
     * Method to get the status of the cluster
     *
     * @return {number} Status code
     */
    getStatus() {
        return this._status;
    }

    /**
     * Method to return if it's the master process
     *
     * @return {boolean} - True if master, false otherwise
     */
    isMaster() {
        return this._index === undefined;
    }

    /**
     * Method to get index of the worker
     *
     * @return {number|undefined} Worker index, undefined if it's master
     */
    getIndex() {
        return this._index;
    }

    /**
     * Method to stop the cluster
     *
     * @param {string} signal - Set internally when processes killed by signal
     * @return {undefined}
     */
    stop(signal) {
        if (!cluster.isMaster) {
            if (this._exitCb) {
                return this._exitCb(this, signal);
            }
            return process.exit(0);
        }
        this._shutdown = true;
        return this._workers.forEach((worker, i) => {
            if (!worker) {
                return undefined;
            }
            this._workersTimeout[i] = setTimeout(() => {
                // Kill the worker if the sigterm was ignored or take too long
                process.kill(worker.process.pid, 'SIGKILL');
            }, this._shutdownTimeout);
            // Send sigterm to the process, allowing to release ressources
            // and save some states
            return process.kill(worker.process.pid, 'SIGTERM');
        });
    }
}

module.exports = Clustering;
