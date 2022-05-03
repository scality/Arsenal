import cluster, { Worker } from 'cluster';
import * as werelogs from 'werelogs';

export default class Clustering {
    _size: number;
    _shutdownTimeout: number;
    _logger: werelogs.Logger;
    _shutdown: boolean;
    _workers: (Worker | undefined)[];
    _workersTimeout: (NodeJS.Timeout | undefined)[];
    _workersStatus: (number | string | undefined)[];
    _status: number;
    _exitCb?: (clustering: Clustering, exitSignal?: string) => void;
    _index?: number;

    /**
     * Constructor
     *
     * @param size Cluster size
     * @param logger Logger object
     * @param [shutdownTimeout=5000] Change default shutdown timeout
     * releasing ressources
     * @return itself
     */
    constructor(size: number, logger: werelogs.Logger, shutdownTimeout?: number) {
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
     */
    _afterStop() {
        // Asuming all workers shutdown gracefully
        this._status = 0;
        const size = this._size;
        for (let i = 0; i < size; ++i) {
            // If the process return an error code or killed by a signal,
            // set the status
            const status = this._workersStatus[i];
            if (typeof status === 'number') {
                this._status = status;
                break;
            } else if (typeof status === 'string') {
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
     * @param worker - Current worker
     * @param i - Worker index
     * @param code - Exit code
     * @param signal - Exit signal
     */
    _workerExited(
        worker: Worker,
        i: number,
        code: number,
        signal: string,
    ) {
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
        const timeout = this._workersTimeout[i];
        if (timeout) {
            clearTimeout(timeout);
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
     * @param i Index of the starting worker
     */
    startWorker(i: number) {
        if (!cluster.isPrimary) {
            return;
        }
        // Fork a new worker
        this._workers[i] = cluster.fork();
        // Listen for message from the worker
        this._workers[i]!.on('message', msg => {
            // If the worker is ready, send him his id
            if (msg === 'ready') {
                this._workers[i]!.send({ msg: 'setup', id: i });
            }
        });
        this._workers[i]!.on('exit', (code, signal) =>
            this._workerExited(this._workers[i]!, i, code, signal));
        // Trigger when the worker was started
        this._workers[i]!.on('online', () => {
            this._logger.info('Worker started', {
                id: i,
                childPid: this._workers[i]!.process.pid,
            });
        });
    }

    /**
     * Method to put handler on cluster exit
     *
     * @param cb - Callback(Clustering, [exitSignal])
     * @return Itself
     */
    onExit(cb: (clustering: Clustering, exitSignal?: string) => void) {
        this._exitCb = cb;
        return this;
    }

    /**
     * Method to start the cluster (if master) or to start the callback
     * (worker)
     *
     * @param cb - Callback to run the worker
     * @return itself
     */
    start(cb: (clustering: Clustering) => void) {
        process.on('SIGINT', () => this.stop('SIGINT'));
        process.on('SIGHUP', () => this.stop('SIGHUP'));
        process.on('SIGQUIT', () => this.stop('SIGQUIT'));
        process.on('SIGTERM', () => this.stop('SIGTERM'));
        process.on('SIGPIPE', () => {});
        process.on('exit', (code?: number, signal?: string) => {
            if (this._exitCb) {
                this._status = code || 0;
                return this._exitCb(this, signal);
            }
            return process.exit(code || 0);
        });
        process.on('uncaughtException', (err: Error) => {
            this._logger.fatal('caught error', {
                error: err.message,
                stack: err.stack?.split('\n')?.map(str => str.trim()),
            });
            process.exit(1);
        });
        if (!cluster.isPrimary) {
            // Waiting for message from master to
            // know the id of the slave cluster
            process.on('message', (msg: any) => {
                if (msg.msg === 'setup') {
                    this._index = msg.id;
                    cb(this);
                }
            });
            // Send message to the master, to let him know
            // the worker has started
            process.send?.('ready');
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
     * @return Workers
     */
    getWorkers() {
        return this._workers;
    }

    /**
     * Method to get the status of the cluster
     *
     * @return Status code
     */
    getStatus() {
        return this._status;
    }

    /**
     * Method to return if it's the master process
     *
     * @return - True if master, false otherwise
     */
    isMaster() {
        return this._index === undefined;
    }

    /**
     * Method to get index of the worker
     *
     * @return Worker index, undefined if it's master
     */
    getIndex() {
        return this._index;
    }

    /**
     * Method to stop the cluster
     *
     * @param signal - Set internally when processes killed by signal
     */
    stop(signal?: string) {
        if (!cluster.isPrimary) {
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
                if (worker.process.pid) {
                  process.kill(worker.process.pid, 'SIGKILL');
                }
            }, this._shutdownTimeout);
            // Send sigterm to the process, allowing to release ressources
            // and save some states
            if (worker.process.pid) {
              return process.kill(worker.process.pid, 'SIGTERM');
            } else {
              return true;
            }
        });
    }
}
