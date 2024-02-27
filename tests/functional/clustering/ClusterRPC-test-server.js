const async = require('async');
const assert = require('assert');
const cluster = require('cluster');
const http = require('http');

const errors = require('../../../build/lib/errors').default;

const {
    setupRPCPrimary,
    setupRPCWorker,
    sendWorkerCommand,
    getPendingCommandsCount,
} = require('../../../build/lib/clustering/ClusterRPC');

/* eslint-disable prefer-const */
let SERVER_PORT;
let N_WORKERS;
/* eslint-enable prefer-const */

/* eslint-disable no-console */

function genUIDS() {
    return Math.trunc(Math.random() * 0x10000).toString(16);
}

// for testing robustness: regularly pollute the message channel with
// unrelated IPC messages
function sendPollutionMessage(message) {
    if (cluster.isPrimary) {
        const randomWorker = Math.trunc(Math.random() * cluster.workers.length);
        const worker = cluster.workers[randomWorker];
        if (worker) {
            worker.send(message);
        }
    } else {
        process.send(message);
    }
}
const ipcPolluterIntervals = [
    setInterval(
        () => sendPollutionMessage('string pollution'), 1500),
    setInterval(
        () => sendPollutionMessage({ pollution: 'bar' }), 2321),
    setInterval(
        () => sendPollutionMessage({ type: 'pollution', foo: { bar: 'baz' } }), 2777),
];

function someTestHandlerFunc(payload, uids, callback) {
    setTimeout(() => callback(null, { someResponsePayload: 'bar' }), 10);
}

function testHandlerWithFailureFunc(payload, uids, callback) {
    setTimeout(() => {
        // exactly one of the workers fails to execute this command
        if (cluster.worker.id === 1) {
            callback(errors.ServiceFailure);
        } else {
            callback(null, { someResponsePayload: 'bar' });
        }
    }, 10);
}

const rpcHandlers = {
    SomeTestHandler: someTestHandlerFunc,
    TestHandlerWithFailure: testHandlerWithFailureFunc,
    TestHandlerWithNoResponse: () => {},
};

const primaryHandlers = {
    echoHandler: (worker, payload, uids, callback) => {
        callback(null, { workerId: worker.id, payload, uids });
    },
    errorWithHttpCodeHandler: (_worker, _payload, _uids, callback) => {
        callback({ name: 'ErrorMock', code: 418, message: 'An error message from primary' });
    },
};

function respondOnTestFailure(message, error, results) {
    console.error('After sendWorkerCommand() resolve/reject: ' +
                  `${message}, error=${error}, results=${JSON.stringify(results)}`);
    console.trace();
    throw errors.InternalError;
}

async function successfulCommandTestGeneric(nWorkers) {
    try {
        const results = await sendWorkerCommand('*', 'SomeTestHandler', genUIDS(), {});
        if (results.length !== nWorkers) {
            return respondOnTestFailure(
                `expected ${nWorkers} worker results, got ${results.length}`,
                null, results);
        }
        for (const result of results) {
            if (typeof result !== 'object' || result === null) {
                return respondOnTestFailure('not all results are objects', null, results);
            }
            if (result.error !== null) {
                return respondOnTestFailure(
                    'one or more workers had an unexpected error',
                    null, results);
            }
            if (typeof result.result !== 'object' || result.result === null) {
                return respondOnTestFailure(
                    'one or more workers did not return a result object',
                    null, results);
            }
            if (result.result.someResponsePayload !== 'bar') {
                return respondOnTestFailure(
                    'one or more workers did not return the expected payload',
                    null, results);
            }
        }
        return undefined;
    } catch (err) {
        return respondOnTestFailure(`returned unexpected error ${err}`, err, null);
    }
}

async function successfulCommandTest() {
    return successfulCommandTestGeneric(N_WORKERS);
}

async function successfulCommandWithExtraWorkerTest() {
    return successfulCommandTestGeneric(N_WORKERS + 1);
}

async function unsupportedToWorkersTest() {
    try {
        const results = await sendWorkerCommand('badToWorkers', 'SomeTestHandler', genUIDS(), {});
        return respondOnTestFailure('expected an error', null, results);
    } catch (err) {
        if (!err.is.NotImplemented) {
            return respondOnTestFailure('expected a NotImplemented error', err, null);
        }
        return undefined;
    }
}

async function unsupportedHandlerTest() {
    try {
        const results = await sendWorkerCommand('*', 'AWrongTestHandler', genUIDS(), {});
        if (results.length !== N_WORKERS) {
            return respondOnTestFailure(
                `expected ${N_WORKERS} worker results, got ${results.length}`,
                null, results);
        }
        for (const result of results) {
            if (typeof result !== 'object' || result === null) {
                return respondOnTestFailure('not all results are objects', null, results);
            }
            if (result.error === null || !result.error.is.NotImplemented) {
                return respondOnTestFailure(
                    'one or more workers did not return the expected NotImplemented error',
                    null, results);
            }
        }
        return undefined;
    } catch (err) {
        return respondOnTestFailure(`returned unexpected error ${err}`, err, null);
    }
}

async function missingUidsTest() {
    try {
        const results = await sendWorkerCommand('*', 'SomeTestHandler', undefined, {});
        return respondOnTestFailure('expected an error', null, results);
    } catch (err) {
        if (!err.is.MissingParameter) {
            return respondOnTestFailure('expected a MissingParameter error', err, null);
        }
        return undefined;
    }
}

async function duplicateUidsTest() {
    const dupUIDS = genUIDS();
    const promises = [
        sendWorkerCommand('*', 'SomeTestHandler', dupUIDS, {}),
        sendWorkerCommand('*', 'SomeTestHandler', dupUIDS, {}),
    ];
    const results = await Promise.allSettled(promises);
    if (results[1].status !== 'rejected') {
        return respondOnTestFailure('expected an error from the second call', null, null);
    }
    if (!results[1].reason.is.OperationAborted) {
        return respondOnTestFailure(
            'expected a OperationAborted error', results[1].reason, null);
    }
    return undefined;
}

async function unsuccessfulWorkerTest() {
    try {
        const results = await sendWorkerCommand('*', 'TestHandlerWithFailure', genUIDS(), {});
        if (results.length !== N_WORKERS) {
            return respondOnTestFailure(
                `expected ${N_WORKERS} worker results, got ${results.length}`,
                null, results);
        }
        const nServiceFailures = results.filter(result => (
            result.error && result.error.is.ServiceFailure
        )).length;
        if (nServiceFailures !== 1) {
            return respondOnTestFailure(
                'expected exactly one worker result to be ServiceFailure error',
                null, results);
        }
        return undefined;
    } catch (err) {
        return respondOnTestFailure(`returned unexpected error ${err}`, err, null);
    }
}

async function workerTimeoutTest() {
    try {
        const results = await sendWorkerCommand(
            '*', 'TestHandlerWithNoResponse', genUIDS(), {}, 1000);
        return respondOnTestFailure('expected an error', null, results);
    } catch (err) {
        if (!err.is.RequestTimeout) {
            return respondOnTestFailure('expected a RequestTimeout error', err, null);
        }
        return undefined;
    }
}

async function workerToPrimaryEcho() {
    const uids = genUIDS();
    const payload = { testing: true };
    const expected = { workerId: cluster.worker.id, payload, uids };

    const results = await sendWorkerCommand('PRIMARY', 'echoHandler', uids, payload);
    assert.strictEqual(results.length, 1, 'There is 1 and only 1 primary');
    assert.ifError(results[0].error);
    assert.deepStrictEqual(results[0].result, expected);
}

async function workerToPrimaryErrorWithHttpCode() {
    const uids = genUIDS();
    const payload = { testing: true };
    const results = await sendWorkerCommand('PRIMARY', 'errorWithHttpCodeHandler', uids, payload);
    assert.strictEqual(results.length, 1, 'There is 1 and only 1 primary');
    assert.ok(results[0].error);
    assert.strictEqual(results[0].error.message, 'An error message from primary');
    assert.strictEqual(results[0].error.code, 418);
}

const TEST_URLS = {
    '/successful-command': successfulCommandTest,
    '/successful-command-with-extra-worker': successfulCommandWithExtraWorkerTest,
    '/unsupported-to-workers': unsupportedToWorkersTest,
    '/unsupported-handler': unsupportedHandlerTest,
    '/missing-uids': missingUidsTest,
    '/duplicate-uids': duplicateUidsTest,
    '/unsuccessful-worker': unsuccessfulWorkerTest,
    '/worker-timeout': workerTimeoutTest,
    '/worker-to-primary/echo': workerToPrimaryEcho,
    '/worker-to-primary/error-with-http-code': workerToPrimaryErrorWithHttpCode,
};

if (process.argv.length !== 4) {
    console.error('ClusterRPC test server: GET requests on test URLs trigger test runs\n\n' +
                  'Usage: node ClusterRPC-test-server.js <port> <nb-workers>\n\n' +
                  'Available test URLs:');
    console.error(`${Object.keys(TEST_URLS).map(url => `- ${url}\n`).join('')}`);
    process.exit(2);
}

/* eslint-disable prefer-const */
[
    SERVER_PORT,
    N_WORKERS,
] = process.argv.slice(2, 4).map(value => Number.parseInt(value, 10));
/* eslint-enable prefer-const */

let server;

if (cluster.isPrimary) {
    async.timesSeries(
        N_WORKERS,
        (i, wcb) => cluster.fork().on('online', wcb),
        () => {
            setupRPCPrimary(primaryHandlers);
        },
    );
} else {
    // in worker
    server = http.createServer((req, res) => {
        if (req.url in TEST_URLS) {
            return TEST_URLS[req.url]().then(() => {
                if (getPendingCommandsCount() !== 0) {
                    console.error(`There are still ${getPendingCommandsCount()} pending ` +
                                  `RPC commands after test ${req.url} completed`);
                    throw errors.InternalError;
                }
                res.writeHead(200);
                res.end();
            }).catch(err => {
                // serialize AssertionError to be displayed nicely in jest
                if (err instanceof assert.AssertionError) {
                    const serializedErr = JSON.stringify({
                        code: err.code,
                        message: err.message,
                        stack: err.stack,
                        actual: err.actual,
                        expected: err.expected,
                        operator: err.operator,
                    });
                    res.writeHead(500);
                    res.end(serializedErr);
                } else {
                    res.writeHead(err.code);
                    res.end(err.message);
                }
            });
        }
        console.error(`Invalid test URL ${req.url}`);
        res.writeHead(400);
        res.end();
        return undefined;
    });
    server.listen(SERVER_PORT);
    server.on('listening', () => {
        console.log('Worker is listening');
    });

    setupRPCWorker(rpcHandlers);
}

function stop(signal) {
    if (cluster.isPrimary) {
        console.log(`Handling signal ${signal}`);
        for (const worker of Object.values(cluster.workers)) {
            worker.kill(signal);
            worker.on('exit', () => {
                console.log(`Worker ${worker.id} exited`);
            });
        }
    }
    for (const interval of ipcPolluterIntervals) {
        clearInterval(interval);
    }
}

process.on('SIGTERM', stop);
process.on('SIGINT', stop);
process.on('SIGPIPE', () => {});

// for testing: spawn a new worker each time SIGUSR1 is received
function spawnNewWorker() {
    if (cluster.isPrimary) {
        cluster.fork();
    }
}

process.on('SIGUSR1', spawnNewWorker);
