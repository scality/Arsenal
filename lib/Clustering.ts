'use strict'; // eslint-disable-line

import * as cluster from 'cluster';


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
    size: number;
    shutdownTimeout: number;
    logger: any; // TODO logger ???
    shutdown: boolean;
    workers: cluster.Worker[];
    workersTimeout: NodeJS.Timeout[]; // TODO array of worker timeouts
    workersStatus: number[];
    status: number;
    exitCb?: Function;
    index?: number;

    constructor(size: number, logger: any, shutdownTimeout=5000) {
        if (size < 1) {
            throw new Error('Cluster size must be greater than or equal to 1');
        }
        this.size = size;
        this.shutdownTimeout = shutdownTimeout || 5000;
        this.logger = logger;
        this.shutdown = false;
        this.workers = new Array(size).fill(undefined);
        this.workersTimeout = new Array(size).fill(undefined);
        this.workersStatus = new Array(size).fill(undefined);
        this.status = 0;
        this.exitCb = undefined; // Exit callback
        this.index = undefined;
    }

    /**
     * Method called after a stop() call
     *
     * @private
     * @return {undefined}
     */
    _afterStop(): undefined {
        // Asuming all workers shutdown gracefully
        this.status = 0;
        const size = this.size;
        for (let i = 0; i < size; ++i) {
            // If the process return an error code or killed by a signal,
            // set the status
            if (typeof this.workersStatus[i] === 'number') {
                this.status = this.workersStatus[i];
                break;
            } else if (typeof this.workersStatus[i] === 'string') {
                this.status = 1;
                break;
            }
        }
        if (this.exitCb) {
            return this.exitCb(this);
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
    _workerExited(
        worker: cluster.Worker, index: number, code: number, signal: number
    ): undefined {
        // If the worker:
        //   - was killed by a signal
        //   - return an error code
        //   - or just stopped
        if (signal) {
            this.logger.info('Worker killed by signal', {
                signal,
                id: index,
                childPid: worker.process.pid,
            });
            this.workersStatus[index] = signal;
        } else if (code !== 0) {
            this.logger.error('Worker exit with code', {
                code,
                id: index,
                childPid: worker.process.pid,
            });
            this.workersStatus[index] = code;
        } else {
            this.logger.info('Worker shutdown gracefully', {
                id: index,
                childPid: worker.process.pid,
            });
            this.workersStatus[index] = undefined;
        }
        this.workers[index] = undefined;
        if (this.workersTimeout[index]) {
            clearTimeout(this.workersTimeout[index]);
            this.workersTimeout[index] = undefined;
        }
        // If we don't trigger the stop method, the watchdog
        // will autorestart the worker
        if (this.shutdown === false) {
            return process.nextTick(() => this.startWorker(index));
        }
        // Check if an worker is still running
        if (!this.workers.every(cur => cur === undefined)) {
            return;
        }
        return this._afterStop();
    }

    /**
     * Method to start a worker
     *
     * @param {number} i Index of the starting worker
     * @return {undefined}
     */
    startWorker(index: number): undefined {
        if (!cluster.isMaster) {
            return;
        }
        // Fork a new worker
        this.workers[index] = cluster.fork();
        // Listen for message from the worker
        this.workers[index].on('message', msg => {
            // If the worker is ready, send him his id
            if (msg === 'ready') {
                this.workers[index].send({ msg: 'setup', id: index });
            }
        });
        this.workers[index].on('exit', (code, signal) =>
            this._workerExited(this.workers[index], index, code, signal));
        // Trigger when the worker was started
        this.workers[index].on('online', () => {
            this.logger.info('Worker started', {
                id: index,
                childPid: this.workers[index].process.pid,
            });
        });
    }

    /**
     * Method to put handler on cluster exit
     *
     * @param {function} cb - Callback(Clustering, [exitSignal])
     * @return {Clustering} Itself
     */
    onExit(cb: Function): Clustering {
        this.exitCb = cb;
        return this;
    }

    /**
     * Method to start the cluster (if master) or to start the callback
     * (worker)
     *
     * @param {function} cb - Callback to run the worker
     * @return {Clustering} itself
     */
    start(cb: Function): Clustering {
        process.on('SIGINT', () => this.stop('SIGINT'));
        process.on('SIGHUP', () => this.stop('SIGHUP'));
        process.on('SIGQUIT', () => this.stop('SIGQUIT'));
        process.on('SIGTERM', () => this.stop('SIGTERM'));
        process.on('SIGPIPE', () => {});
        process.on('exit', (code, signal) => {
            if (this.exitCb) {
                this.status = code || 0;
                return this.exitCb(this, signal);
            }
            return process.exit(code || 0);
        });
        process.on('uncaughtException', err => {
            this.logger.fatal('caught error', {
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
                    this.index = msg.id;
                    cb(this);
                }
            });
            // Send message to the master, to let him know
            // the worker has started
            process.send('ready');
        } else {
            for (let i = 0; i < this.size; ++i) {
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
    getWorkers(): cluster.Worker[] {
        return this.workers;
    }

    /**
     * Method to get the status of the cluster
     *
     * @return {number} Status code
     */
    getStatus(): number {
        return this.status;
    }

    /**
     * Method to return if it's the master process
     *
     * @return {boolean} - True if master, false otherwise
     */
    isMaster(): boolean {
        return this.index === undefined;
    }

    /**
     * Method to get index of the worker
     *
     * @return {number|undefined} Worker index, undefined if it's master
     */
    getIndex(): number {
        return this.index;
    }

    /**
     * Method to stop the cluster
     *
     * @param {string} signal - Set internally when processes killed by signal
     * @return {undefined}
     */
    stop(signal: string): undefined {
        if (!cluster.isMaster) {
            if (this.exitCb) {
                return this.exitCb(this, signal);
            }
            return process.exit(0);
        }
        this.shutdown = true;
        return this.workers.forEach((worker, index) => {
            if (!worker) {
                return undefined;
            }
            this.workersTimeout[index] = setTimeout(() => {
                // Kill the worker if the sigterm was ignored or take too long
                process.kill(worker.process.pid, 'SIGKILL');
            }, this.shutdownTimeout);
            // Send sigterm to the process, allowing to release ressources
            // and save some states
            return process.kill(worker.process.pid, 'SIGTERM');
        });
    }
}

export default Clustering;
