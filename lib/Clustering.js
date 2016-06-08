'use strict'; // eslint-disable-line

const cluster = require('cluster');

class Clustering {
    /**
     * Constructor
     *
     * @param {number} size Cluster size
     * @param {Logger} logger Logger object
     * @return {Clustering} itself
     */
    constructor(size, logger) {
        this._size = size;
        if (size < 1) {
            throw new Error('Cluster size must superior or equal to 1');
        }
        this._logger = logger;
        this._shutdown = false;
        this._workers = new Array(size).fill(undefined);
        this._workersTimeout = new Array(size).fill(undefined);
        this._workersStatus = new Array(size).fill(undefined);
    }

    /**
     * Function to start a worker
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
        this._workers[i].on('exit', (code, signal) => {
            // If the worker:
            //   - was killed by a signal
            //   - return an error code
            //   - or just stopped
            if (signal) {
                this._logger.info('Worker killed by signal', {
                    signal,
                    id: i,
                });
                this._workersStatus[i] = signal;
            } else if (code !== 0) {
                this._logger.error('Worker exit with code', {
                    code,
                    id: i,
                });
                this._workersStatus[i] = code;
            } else {
                this._logger.info('Worker shutdown gracefully', {
                    id: i,
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
            const size = this._size;
            for (let i = 0; i < size; ++i) {
                // If the process return an error code or killed by a signal
                if (typeof this._workersStatus[i] === 'number') {
                    return process.exit(this._workersStatus[i]);
                } else if (typeof this._workersStatus[i] === 'string') {
                    return process.exit(1);
                }
            }
            // All workers shutdown gracefully
            return process.exit(0);
        });
        // Trigger when the worker was started
        this._workers[i].on('online', () => {
            this._logger.info('Worker started', {
                id: i,
            });
        });
    }

    /**
     * Function to start cluster (if master) or to start the callback
     * (worker)
     *
     * @param {function} cb - Callback to run the worker
     * @return {undefined}
     */
    start(cb) {
        if (!cluster.isMaster) {
            // Waiting for message from master to
            // know the id of the slave cluster
            process.on('message', msg => {
                if (msg.msg === 'setup') {
                    cb(msg.id);
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
    }

    /**
     * Function to stop the cluster
     *
     * @return {undefined}
     */
    stop() {
        if (!cluster.isMaster) {
            return;
        }
        this._shutdown = true;
        this._workers.forEach((worker, i) => {
            this._workersTimeout[i] = setTimeout(() => {
                // Kill the worker if the sigterm was ignored or take too long
                worker.kill('SIGKILL');
            }, 5000);
            // Send sigterm to the process, allowing to release ressources
            // and save some states
            worker.kill('SIGTERM');
        });
    }
}

module.exports = Clustering;
