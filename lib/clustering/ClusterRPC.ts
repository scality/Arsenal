import cluster, { Worker } from 'cluster';
import * as werelogs from 'werelogs';

import { default as errors } from '../../lib/errors';

const rpcLogger = new werelogs.Logger('ClusterRPC');

/**
 * Remote procedure calls support between cluster workers.
 *
 * When using the cluster module, new processes are forked and are
 * dispatched workloads, usually HTTP requests. The ClusterRPC module
 * implements a RPC system to send commands to all cluster worker
 * processes at once from any particular worker, and retrieve their
 * individual command results, like a distributed map operation.
 *
 * The existing nodejs cluster IPC channel is setup from the primary
 * to each worker, but not between workers, so there has to be a hop
 * by the primary.
 *
 * How a command is treated:
 *
 * - a worker sends a command message to the primary
 *
 * - the primary then forwards that command to each existing worker
 *   (including the requestor)
 *
 * - each worker then executes the command and returns a result or an
 *   error
 *
 * - the primary gathers all workers results into an array
 *
 * - finally, the primary dispatches the results array to the original
 *   requesting worker
 *
 *
 * Limitations:
 *
 * - The command payload must be serializable, which means that:
 *   - it should not contain circular references
 *   - it should be of a reasonable size to be sent in a single RPC message
 *
 * - The "toWorkers" parameter of value "*" targets the set of workers
 *   that are available at the time the command is dispatched. Any new
 *   worker spawned after the command has been dispatched for
 *   processing, but before the command completes, don't execute
 *   the command and hence are not part of the results array.
 *
 *
 * To set it up:
 *
 * - On the primary:
 *     if (cluster.isPrimary) {
 *         setupRPCPrimary();
 *     }
 *
 * - On the workers:
 *     if (!cluster.isPrimary) {
 *         setupRPCWorker({
 *             handler1: (payload: object, uids: string, callback: HandlerCallback) => void,
 *             handler2: ...
 *         });
 *     }
 *     Handler functions will be passed the command payload, request
 *     serialized uids, and must call the callback when the worker is done
 *     processing the command:
 *         callback(error: Error | null | undefined, result?: any)
 *
 * When this setup is done, any worker can start sending commands by calling
 * the async function sendWorkerCommand().
 */

// exported types

export type ResultObject = {
    error: Error | null;
    result: any;
};

/**
 * saved Promise for sendWorkerCommand
 */
export type CommandPromise = {
    resolve: (results?: ResultObject[]) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timer | null;
};
export type HandlerCallback = (error: (Error & { code?: number }) | null | undefined, result?: any) => void;
export type HandlerFunction = (payload: object, uids: string, callback: HandlerCallback) => void;
export type HandlersMap = {
    [index: string]: HandlerFunction;
};
export type PrimaryHandlerFunction = (worker: Worker, payload: object, uids: string, callback: HandlerCallback) => void;
export type PrimaryHandlersMap = Record<string, PrimaryHandlerFunction>;

// private types

type RPCMessage<T extends string, P> = {
    type: T;
    uids: string;
    payload: P;
};

type RPCCommandMessage = RPCMessage<'cluster-rpc:command', any> & {
    toWorkers: string;
    toHandler: string;
};

type MarshalledResultObject = {
    error: string | null;
    errorCode?: number;
    result: any;
};

type RPCCommandResultMessage = RPCMessage<'cluster-rpc:commandResult', MarshalledResultObject>;

type RPCCommandResultsMessage = RPCMessage<'cluster-rpc:commandResults', {
    results: MarshalledResultObject[];
}>;

type RPCCommandErrorMessage = RPCMessage<'cluster-rpc:commandError', {
    error: string;
}>;

interface RPCSetupOptions {
    /**
     * As werelogs is not a peerDependency, arsenal and a parent project
     * might have their own separate versions duplicated in dependencies.
     * The config are therefore not shared.
     * Use this to propagate werelogs config to arsenal's ClusterRPC.
     */
    werelogsConfig?: Parameters<typeof werelogs.configure>[0];
};

/**
 * In primary: store worker IDs that are waiting to be dispatched
 * their command's results, as a mapping.
 */
const uidsToWorkerId: {
    [index: string]: number;
} = {};


/**
 * In primary: store worker responses for commands in progress as a
 * mapping.
 *
 * Result objects are 'null' while the worker is still processing the
 * command. When a worker finishes processing it stores the result as:
 *    {
 *        error: string | null,
 *        result: any
 *    }
 */
const uidsToCommandResults: {
    [index: string]: {
        [index: number]: MarshalledResultObject | null;
    };
} = {};

/**
 * In workers: store promise callbacks for commands waiting to be
 * dispatched, as a mapping.
 */
const uidsToCommandPromise: {
    [index: string]: CommandPromise;
} = {};


function _isRpcMessage(message) {
    return (message !== null &&
            typeof message === 'object' &&
            typeof message.type === 'string' &&
            message.type.startsWith('cluster-rpc:'));
}

/**
 * Setup cluster RPC system on the primary
 *
 * @param {object} [handlers] - mapping of handler names to handler functions
 *     handler function:
 *         `handler({Worker} worker, {object} payload, {string} uids, {function} callback)`
 *     handler callback must be called when worker is done with the command:
 *         `callback({Error|null} error, {any} [result])`
 * @return {undefined}
 */
export function setupRPCPrimary(handlers?: PrimaryHandlersMap, options?: RPCSetupOptions) {
    if (options?.werelogsConfig) {
        werelogs.configure(options.werelogsConfig);
    }
    cluster.on('message', (worker, message) => {
        if (_isRpcMessage(message)) {
            _handlePrimaryMessage(worker, message, handlers);
        }
    });
}

/**
 * Setup RPCs on a cluster worker process
 *
 * @param {object} handlers - mapping of handler names to handler functions
 *     handler function:
 *         handler({object} payload, {string} uids, {function} callback)
 *     handler callback must be called when worker is done with the command:
 *         callback({Error|null} error, {any} [result])
 * @return {undefined}
 * }
 */
export function setupRPCWorker(handlers: HandlersMap, options?: RPCSetupOptions) {
    if (!process.send) {
        throw new Error('fatal: cannot setup cluster RPC: "process.send" is not available');
    }
    if (options?.werelogsConfig) {
        werelogs.configure(options.werelogsConfig);
    }
    process.on('message', (message: RPCCommandMessage | RPCCommandResultsMessage) => {
        if (_isRpcMessage(message)) {
            _handleWorkerMessage(message, handlers);
        }
    });
}

/**
 * Send a command for workers to execute in parallel, and wait for results
 *
 * @param {string} toWorkers - which workers should execute the command
 *     Currently the supported values are:
 *         - "*", meaning all workers will execute the command
 *         - "PRIMARY", meaning primary process will execute the command
 * @param {string} toHandler - name of handler that will execute the
 * command in workers, as declared in setupRPCWorker() parameter object
 * @param {string} uids - unique identifier of the command, must be
 * unique across all commands in progress
 * @param {object} payload - message payload, sent as-is to the handler
 * @param {number} [timeoutMs=60000] - timeout the command with a
 * "RequestTimeout" error after this number of milliseconds - set to 0
 * to disable timeouts (the command may then hang forever)
 * @returns {Promise}
 */
export async function sendWorkerCommand(
    toWorkers: string,
    toHandler: string,
    uids: string,
    payload: object,
    timeoutMs: number = 60000
) {
    if (typeof uids !== 'string') {
        rpcLogger.error('missing or invalid "uids" field', { uids });
        throw errors.MissingParameter;
    }
    if (uidsToCommandPromise[uids] !== undefined) {
        rpcLogger.error('a command is already in progress with same uids', { uids });
        throw errors.OperationAborted;
    }
    rpcLogger.info('sending command', { toWorkers, toHandler, uids, payload });
    return new Promise((resolve, reject) => {
        let timeout: NodeJS.Timer | null = null;
        if (timeoutMs) {
            timeout = setTimeout(() => {
                delete uidsToCommandPromise[uids];
                reject(errors.RequestTimeout);
            }, timeoutMs);
        }
        uidsToCommandPromise[uids] = { resolve, reject, timeout };
        const message: RPCCommandMessage = {
            type: 'cluster-rpc:command',
            toWorkers,
            toHandler,
            uids,
            payload,
        };
        return process.send?.(message);
    });
}

/**
 * Get the number of commands in flight
 * @returns {number}
 */
export function getPendingCommandsCount() {
    return Object.keys(uidsToCommandPromise).length;
}


function _dispatchCommandResultsToWorker(
    worker: Worker,
    uids: string,
    resultsArray: MarshalledResultObject[]
): void {
    const message: RPCCommandResultsMessage = {
        type: 'cluster-rpc:commandResults',
        uids,
        payload: {
            results: resultsArray,
        },
    };
    worker.send(message);
}

function _dispatchCommandErrorToWorker(
    worker: Worker,
    uids: string,
    error: Error,
): void {
    const message: RPCCommandErrorMessage = {
        type: 'cluster-rpc:commandError',
        uids,
        payload: {
            error: error.message,
        },
    };
    worker.send(message);
}

function _sendPrimaryCommandResult(
    worker: Worker,
    uids: string,
    error: (Error & { code?: number }) | null | undefined,
    result?: any
): void {
    const message: RPCCommandResultsMessage = {
        type: 'cluster-rpc:commandResults',
        uids,
        payload: {
            results: [{ error: error?.message || null, errorCode: error?.code, result }],
        },
    };
    worker.send?.(message);
}

function _handlePrimaryCommandMessage(
    fromWorker: Worker,
    logger: any,
    message: RPCCommandMessage,
    handlers?: PrimaryHandlersMap
): void {
    const { toWorkers, toHandler, uids, payload } = message;
    if (toWorkers === '*') {
        if (uidsToWorkerId[uids] !== undefined) {
            logger.warn('new command already has a waiting worker with same uids', {
                uids, workerId: uidsToWorkerId[uids],
            });
            return undefined;
        }
        const commandResults = {};
        for (const workerId of Object.keys(cluster.workers || {})) {
            commandResults[workerId] = null;
        }
        uidsToWorkerId[uids] = fromWorker?.id;
        uidsToCommandResults[uids] = commandResults;

        for (const [workerId, worker] of Object.entries(cluster.workers || {})) {
            logger.debug('sending command message to worker', {
                workerId, toHandler, payload,
            });
            if (worker) {
                worker.send(message);
            }
        }
    } else if (toWorkers === 'PRIMARY') {
        const { toHandler, uids, payload } = message;
        const cb: HandlerCallback = (err, result) => _sendPrimaryCommandResult(fromWorker, uids, err, result);

        if (toHandler in (handlers || {})) {
            return handlers![toHandler](fromWorker, payload, uids, cb);
        }
        logger.error('no such handler in "toHandler" field from worker command message', {
            toHandler,
        });
        return cb(errors.NotImplemented);
    } else {
        logger.error('unsupported "toWorkers" field from worker command message', {
            toWorkers,
        });
        if (fromWorker) {
            _dispatchCommandErrorToWorker(fromWorker, uids, errors.NotImplemented);
        }
    }
}

function _handlePrimaryCommandResultMessage(
    fromWorkerId: number,
    logger: any,
    message: RPCCommandResultMessage
): void {
    const { uids, payload } = message;
    const commandResults = uidsToCommandResults[uids];
    if (!commandResults) {
        logger.warn('received command response message from worker for command not in flight', {
            workerId: fromWorkerId,
            uids,
        });
        return undefined;
    }
    if (commandResults[fromWorkerId] === undefined) {
        logger.warn('received command response message with unexpected worker ID', {
            workerId: fromWorkerId,
            uids,
        });
        return undefined;
    }
    if (commandResults[fromWorkerId] !== null) {
        logger.warn('ignoring duplicate command response from worker', {
            workerId: fromWorkerId,
            uids,
        });
        return undefined;
    }
    commandResults[fromWorkerId] = payload;
    const commandResultsArray = Object.values(commandResults);
    if (commandResultsArray.every(response => response !== null)) {
        logger.debug('all workers responded to command', { uids });
        const completeCommandResultsArray = <MarshalledResultObject[]> commandResultsArray;
        const toWorkerId = uidsToWorkerId[uids];
        const toWorker = cluster.workers?.[toWorkerId];

        delete uidsToCommandResults[uids];
        delete uidsToWorkerId[uids];

        if (!toWorker) {
            logger.warn('worker shut down while its command was executing', {
                workerId: toWorkerId, uids,
            });
            return undefined;
        }
        // send back response to original worker
        _dispatchCommandResultsToWorker(toWorker, uids, completeCommandResultsArray);
    }
}

function _handlePrimaryMessage(
    fromWorker: Worker,
    message: RPCCommandMessage | RPCCommandResultMessage,
    handlers?: PrimaryHandlersMap
): void {
    const { type: messageType, uids } = message;
    const logger = rpcLogger.newRequestLoggerFromSerializedUids(uids);
    logger.debug('primary received message from worker', {
        workerId: fromWorker?.id, rpcMessage: message,
    });
    if (messageType === 'cluster-rpc:command') {
        return _handlePrimaryCommandMessage(fromWorker, logger, message, handlers);
    }
    if (messageType === 'cluster-rpc:commandResult') {
        return _handlePrimaryCommandResultMessage(fromWorker?.id, logger, message);
    }
    logger.error('unsupported message type', {
        workerId: fromWorker?.id, messageType, uids,
    });
    return undefined;
}

function _sendWorkerCommandResult(
    uids: string,
    error: Error | null | undefined,
    result?: any
): void {
    const message: RPCCommandResultMessage = {
        type: 'cluster-rpc:commandResult',
        uids,
        payload: {
            error: error ? error.message : null,
            result,
        },
    };
    process.send?.(message);
}

function _handleWorkerCommandMessage(
    logger: any,
    message: RPCCommandMessage,
    handlers: HandlersMap
): void {
    const { toHandler, uids, payload } = message;
    const cb: HandlerCallback = (err, result) => _sendWorkerCommandResult(uids, err, result);

    if (toHandler in handlers) {
        return handlers[toHandler](payload, uids, cb);
    }
    logger.error('no such handler in "toHandler" field from worker command message', {
        toHandler,
    });
    return cb(errors.NotImplemented);
}

function _handleWorkerCommandResultsMessage(
    logger: any,
    message: RPCCommandResultsMessage,
): void {
    const { uids, payload } = message;
    const { results } = payload;
    const commandPromise: CommandPromise = uidsToCommandPromise[uids];
    if (commandPromise === undefined) {
        logger.error('missing promise for command results', { uids, payload });
        return undefined;
    }
    if (commandPromise.timeout) {
        clearTimeout(commandPromise.timeout);
    }
    delete uidsToCommandPromise[uids];
    const unmarshalledResults = results.map(workerResult => {
        let workerError: Error | null = null;
        if (workerResult.error) {
            if (workerResult.error in errors) {
                workerError = errors[workerResult.error];
            } else {
                workerError = new Error(workerResult.error);
            }
        }
        if (workerError && workerResult.errorCode) {
            (workerError as Error & { code: number }).code = workerResult.errorCode;
        }
        const unmarshalledResult: ResultObject = {
            error: workerError,
            result: workerResult.result,
        };
        return unmarshalledResult;
    });
    return commandPromise.resolve(unmarshalledResults);
}

function _handleWorkerCommandErrorMessage(
    logger: any,
    message: RPCCommandErrorMessage,
): void {
    const { uids, payload } = message;
    const { error } = payload;
    const commandPromise: CommandPromise = uidsToCommandPromise[uids];
    if (commandPromise === undefined) {
        logger.error('missing promise for command results', { uids, payload });
        return undefined;
    }
    if (commandPromise.timeout) {
        clearTimeout(commandPromise.timeout);
    }
    delete uidsToCommandPromise[uids];
    let commandError: Error | null = null;
    if (error in errors) {
        commandError = errors[error];
    } else {
        commandError = new Error(error);
    }
    return commandPromise.reject(<Error> commandError);
}

function _handleWorkerMessage(
    message: RPCCommandMessage | RPCCommandResultsMessage | RPCCommandErrorMessage,
    handlers: HandlersMap
): void {
    const { type: messageType, uids } = message;
    const workerId = cluster.worker?.id;
    const logger = rpcLogger.newRequestLoggerFromSerializedUids(uids);
    logger.debug('worker received message from primary', {
        workerId, rpcMessage: message,
    });
    if (messageType === 'cluster-rpc:command') {
        return _handleWorkerCommandMessage(logger, message, handlers);
    }
    if (messageType === 'cluster-rpc:commandResults') {
        return _handleWorkerCommandResultsMessage(logger, message);
    }
    if (messageType === 'cluster-rpc:commandError') {
        return _handleWorkerCommandErrorMessage(logger, message);
    }
    logger.error('unsupported message type', {
        workerId, messageType,
    });
    return undefined;
}
