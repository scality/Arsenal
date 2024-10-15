'use strict';
/* eslint-disable @typescript-eslint/no-require-imports */

const Logger = require('werelogs').Logger;
const http = require('http');
const Clustering = require('../../../../lib/Clustering').default;
const Cluster = require('cluster');

const log = new Logger('S3', {
    level: 'trace',
    dump: 'warn',
});

const ErrorCodes = {
    noError: 0,
    WorkerNotStarted: 1,
    WorkerNotExited: 2,
};
let result = ErrorCodes.noError;

const clusters = new Clustering(4, log);
clusters.start(current => {
    http.createServer(() => {}).listen(14000, () => {
        log.info('listening', {
            id: current.getIndex(),
        });
    });
}).onExit(current => {
    if (current.isMaster()) {
        return setTimeout(() => {
            if (result !== ErrorCodes.noError) {
                return process.exit(result);
            }
            current.getWorkers().forEach(worker => {
                if (worker) {
                    result = ErrorCodes.WorkerNotExited;
                }
            });
            return process.exit(result);
        }, 500);
    }
    log.info('exiting', {
        id: current.getIndex(),
    });
    return process.exit(0);
});

if (Cluster.isMaster) {
    setTimeout(() => {
        clusters.getWorkers().forEach((worker, i) => {
            if (!worker) {
                log.error('Worker not started', {
                    id: i,
                });
                result = ErrorCodes.WorkerNotStarted;
                return undefined;
            }
            try {
                return process.kill(worker.process.pid, 0);
            } catch {
                log.error('Worker not started', {
                    id: i,
                });
                result = ErrorCodes.WorkerNotStarted;
                return undefined;
            }
        });
        clusters.stop();
    }, 500);
}
