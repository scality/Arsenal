'use strict'; // eslint-disable-line strict

const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const sinon = require('sinon');
const util = require('util');

const KmipClient = require('../../../lib/network/kmip/Client').default;
const ClusterClient = require('../../../lib/network/kmip/ClusterClient').default;
const {
    logger,
} = require('../../utils/kmip/ersatz');

jest.setTimeout(5000);

const tlsKey = fs.readFileSync(path.join(__dirname, '../../../.github/pykmip/certs/kmip-client-key.pem'));
const tlsCert = fs.readFileSync(path.join(__dirname, '../../../.github/pykmip/certs/kmip-client-cert.pem'));
const tlsCA = fs.readFileSync(path.join(__dirname, '../../../.github/pykmip/certs/kmip-ca.pem'));
const port = 5696;
const host = '127.0.0.1';

const NB_OF_ENCRYPTION = 100;
const NB_OF_HOSTS = 10;

const transport = {
    pipelineDepth: 8,
    tls: {
        port,
        host,
        key: tlsKey,
        cert: tlsCert,
        ca: tlsCA,
    },
};

const options = {
    kmip: {
        providerName: 'tests',
        client: {
            bucketNameAttributeName: null,
            compoundCreateActivate: false,
        },
        codec: {},
        transport,
    },
};

const dataKey = Buffer.from('a'.repeat(16));

function promisify(client) {
    return {
        healthcheck: util.promisify(client.healthcheck.bind(client)),
        clusterHealthcheck: client.clusterHealthcheck && util.promisify(client.clusterHealthcheck.bind(client)),
        createBucketKey: util.promisify(client.createBucketKey.bind(client)),
        destroyBucketKey: util.promisify(client.destroyBucketKey.bind(client)),
        cipherDataKey: util.promisify(client.cipherDataKey.bind(client)),
        decipherDataKey: util.promisify(client.decipherDataKey.bind(client)),
        stop: util.promisify(client.stop.bind(client)),
    };
}

function clusterSpys(clusterInternalClients) {
    return {
        healthchecks: clusterInternalClients.map(c => sinon.spy(c, 'healthcheck')),
        cipherDataKeys: clusterInternalClients.map(c => sinon.spy(c, 'cipherDataKey')),
    };
}

/**
 * Helper to print the error descriptin message
 * @param {Error|ArsenalError} err - error
 * @returns {undefined}
 */
function showArsenalErr(err) {
    try {
        assert.fail(err && err.toString());
    } catch (err) {
        // Drop this function from the top of stacktrace to see real error line
        Error.captureStackTrace(err, showArsenalErr);
        throw err;
    }
}

function assertClusterHealthcheck(healthy, unhealthy, spysHealthchecks) {
    assert.strictEqual(healthy.actual, healthy.expected);
    assert.strictEqual(unhealthy.actual, unhealthy.expected);
    assert.ok(spysHealthchecks.every(spy => spy.callCount === 1),
        `All ${spysHealthchecks.length} hosts should be healthchecked. Instead got ${
            spysHealthchecks.map(spy => spy.callCount)}`);
}

function assertHealthcheck(healthy, unhealthy, spysHealthchecks) {
    // healthy and unhealthy depends on round robin
    const maxHealthy = healthy.expected + unhealthy.expected;
    assert.ok(healthy.actual >= healthy.expected && healthy.actual <= spysHealthchecks.length,
        `There can be between ${healthy.expected} and ${maxHealthy} healthy hosts. Got ${healthy.actual}`);
    assert.ok(unhealthy.actual <= unhealthy.expected,
        `There can be up to ${unhealthy.expected} unhealthy. Instead got ${unhealthy.actual}`);

    const callCount = spysHealthchecks.map(spy => spy.callCount);
    const called = callCount.filter(x => x === 1).length;
    const expectedCalled = unhealthy.actual + (healthy.actual ? 1 : 0);

    assert.strictEqual(called, expectedCalled,
        `With round robin and ${unhealthy.actual} unhealthy and ${healthy.actual} healthy.
        Instead got calls ${callCount}.`);
}

/** Authorize a approximation of +- 2 executions */
const APPROX = 2;
async function cipherAndAssert(cipherPromiseFct, executions, actual, expected, spysCipher, triggerUnhealthy) {
    const encryptedList = await Promise.all(
        new Array(executions)
            .fill()
            .map(async () => {
                let ciphered;
                await assert.doesNotReject(async () => {
                    ciphered = await cipherPromiseFct();
                }, showArsenalErr);
                return ciphered;
            }),
    );

    assert.ok(encryptedList.every(e => e.equals(encryptedList[0])),
        `All ${executions} encrypt requests must return the same value`);

    assert.strictEqual(actual.healthy.length, expected.healthy,
        `There should be ${expected.healthy} healthy clients instead of ${actual.healthy.length}`);
    assert.strictEqual(actual.unhealthy.length, expected.unhealthy,
        `There should be ${expected.unhealthy} unhealthy clients instead of ${actual.unhealthy.length}`);

    const { spysCipherHealthy, spysCipherUnhealthy } = spysCipher;

    const healthyHosts = expected.healthy;
    const allHosts = healthyHosts + expected.unhealthy;
    const expectedCalls = healthyHosts !== 0 ? executions / healthyHosts : 0;
    const expectedCallsUnhealthy = triggerUnhealthy && allHosts !== 0 ? Math.floor(executions / allHosts) : 0;

    assert.ok(
        spysCipherHealthy.every(
            spy => Math.abs(spy.callCount - expectedCalls) <= APPROX),
        `Each healthy hosts should have been called ${expectedCalls} (+-${APPROX}). Instead got ${
            spysCipherHealthy.map(spy => spy.callCount)
        }`);
    if (spysCipherUnhealthy) {
        assert.ok(
            spysCipherUnhealthy.every(
                spy => Math.abs(spy.callCount - expectedCallsUnhealthy) <= APPROX),
            `Each unhealthy hosts should have been called ${expectedCalls} (+-${APPROX}). Instead got ${
                spysCipherUnhealthy.map(spy => spy.callCount)
            }. ${triggerUnhealthy
                ? 'Because it received request in parallel, beore being marked unhealthy'
                : 'Because it was already marked unhealthy'
            }`);
    }
}

// Make sure to always clean keys and disconnect any client
async function teardownClient(kmsKey, client, promises) {
    if (kmsKey) {
        await assert.doesNotReject(promises.destroyBucketKey(kmsKey, logger), showArsenalErr);
    }
    if (client) {
        await assert.doesNotReject(util.promisify(client.stop.bind(client))(), showArsenalErr);
    }
    sinon.restore();
}

function simpleTestKMIP(KmipClientClass, options) {
    let client;
    let promises;
    let kmsKey;

    beforeEach(() => {
        client = new KmipClientClass(options);
        promises = promisify(client);
        kmsKey = null;
    });

    afterEach(async () => teardownClient(kmsKey, client, promises));

    it('should connect and healthcheck', async () => {
        await assert.doesNotReject(promises.healthcheck(logger), showArsenalErr);
    });

    it('should createBucketKey, encrypt, decrypt, destroyBucketKey', async () => {
        await assert.doesNotReject(async () => {
            kmsKey = await promises.createBucketKey('testBucket', logger);
        }, showArsenalErr);

        let ciphered;
        await assert.doesNotReject(async () => {
            ciphered = await promises.cipherDataKey(1, kmsKey, dataKey, logger);
        }, showArsenalErr);

        let deciphered;
        await assert.doesNotReject(async () => {
            deciphered = await promises.decipherDataKey(1, kmsKey, ciphered, logger);
        }, showArsenalErr);

        assert.ok(dataKey.equals(deciphered),
            `Deciphered key should equal dataKey. ${deciphered.toString('hex')} !== ${dataKey.toString('hex')}`);

        await assert.doesNotReject(promises.destroyBucketKey(kmsKey, logger), showArsenalErr);
        kmsKey = null;
    });
}

describe('KMIP with pykmip', () => {
    describe('simple KmipClient', () => simpleTestKMIP(KmipClient, options));
    describe('simple ClusterClient with 1 host only', () => simpleTestKMIP(ClusterClient, {
        logger,
        kmip: Object.assign({}, options.kmip, { transport: [transport] }),
    }));
});

describe('KMIP ClusterClient with pykmip', () => {
    let client;
    let healthyClients;
    let unhealthyClients;
    let promises;
    let spys;

    let kmsKey;

    beforeEach(() => {
        kmsKey = null;
    });

    afterEach(async () => teardownClient(kmsKey, client, promises));

    const hostsToTest = new Array(NB_OF_HOSTS).fill().map((_, i) => i + 1);

    describe.each(hostsToTest)('for %i hosts', (nb) => {
        const transports = new Array(nb).fill().map((_, i) =>
            Object.assign({}, transport,
                { tls: Object.assign({}, transport.tls, { host: `127.0.0.${i + 1}` }) }),
        );
        const clusterOptions = {
            logger,
            kmip: Object.assign({}, options.kmip, { transport: transports }),
        };

        beforeEach(() => {
            client = new ClusterClient(clusterOptions);
            healthyClients = client.clients;
            unhealthyClients = client.unhealthyClients;
            promises = promisify(client);
            spys = clusterSpys(client.clients);
        });

        it(`should connect and healthcheck in round robin on ${nb} hosts`, async () => {
            await assert.doesNotReject(promises.healthcheck(logger), showArsenalErr);
            assertHealthcheck(
                { actual: healthyClients.length, expected: nb },
                { actual: unhealthyClients.length, expected: 0 },
                spys.healthchecks,
            );
        });

        it(`should connect and clusterHealthcheck each ${nb} hosts`, async () => {
            await assert.doesNotReject(promises.clusterHealthcheck(logger), showArsenalErr);
            assertClusterHealthcheck(
                { actual: healthyClients.length, expected: nb },
                { actual: unhealthyClients.length, expected: 0 },
                spys.healthchecks,
            );
        });

        it(`should encrypt x${NB_OF_ENCRYPTION} in round robin on each ${nb} hosts`, async () => {
            await assert.doesNotReject(async () => {
                kmsKey = await promises.createBucketKey('testBucket', logger);
            }, showArsenalErr);

            await cipherAndAssert(
                promises.cipherDataKey.bind(null, 1, kmsKey, dataKey, logger),
                NB_OF_ENCRYPTION,
                { healthy: healthyClients, unhealthy: unhealthyClients },
                { healthy: nb, unhealthy: 0 },
                { spysCipherHealthy: spys.cipherDataKeys },
                false,
            );
        });
    });

    describe.each(hostsToTest)('for %i hosts + 1 unhealthy at start', (nb) => {
        const transports = new Array(nb).fill().map((_, i) =>
            Object.assign({}, transport,
                { tls: Object.assign({}, transport.tls, { host: `127.0.0.${i + 1}` }) }),
        );
        transports.push(Object.assign({}, transport,
            // Host not in TLS cert, used to simulate connection failure and trigger fallback logic
            { tls: Object.assign({}, transport.tls, { host: '127.0.0.200' }) }));
        const clusterOptions = {
            logger,
            kmip: Object.assign({}, options.kmip, { transport: transports }),
        };

        beforeEach(() => {
            client = new ClusterClient(clusterOptions);
            healthyClients = client.clients;
            unhealthyClients = client.unhealthyClients;
            promises = promisify(client);
            spys = clusterSpys(client.clients);
        });

        it('should succeed round robin healthcheck', async () => {
            await assert.doesNotReject(promises.healthcheck(logger));
            assertHealthcheck(
                { actual: healthyClients.length, expected: nb },
                { actual: unhealthyClients.length, expected: 1 },
                spys.healthchecks,
            );
        });

        it('should fail clusterHealthcheck', async () => {
            await assert.rejects(promises.clusterHealthcheck(logger));
            assertClusterHealthcheck(
                // TODO S3C-9763 healthcheck should mark hosts unhealthy
                { actual: healthyClients.length, expected: nb + 1 },
                { actual: unhealthyClients.length, expected: 0 },
                spys.healthchecks,
            );
        });

        it(`should encrypt x${NB_OF_ENCRYPTION} in round robin on each ${nb + 1} hosts. With unhealthy having`
            + ' many parallel request before being marked and fallback retry', async () => {
            await assert.doesNotReject(async () => {
                kmsKey = await promises.createBucketKey('testBucket', logger);
            }, showArsenalErr);

            // extract unhealthy spy from healthy
            const spysCipherUnhealthy = spys.cipherDataKeys.splice(spys.cipherDataKeys.length - 1, 1);

            await cipherAndAssert(
                promises.cipherDataKey.bind(null, 1, kmsKey, dataKey, logger),
                NB_OF_ENCRYPTION,
                { healthy: healthyClients, unhealthy: unhealthyClients },
                { healthy: nb, unhealthy: 1 },
                { spysCipherHealthy: spys.cipherDataKeys, spysCipherUnhealthy },
                true,
            );
        });

        it(`should encrypt x${NB_OF_ENCRYPTION} in round robin on each ${nb} hosts. With unhealthy being`
            + ' marked early, avoiding all parallel requests', async () => {
            await assert.doesNotReject(async () => {
                kmsKey = await promises.createBucketKey('testBucket', logger);
            }, showArsenalErr);

            await cipherAndAssert(
                promises.cipherDataKey.bind(null, 1, kmsKey, dataKey, logger),
                nb + 1,
                { healthy: healthyClients, unhealthy: unhealthyClients },
                { healthy: nb, unhealthy: 1 },
                // consider unhealthy like healthy as it should receive 1 request
                { spysCipherHealthy: spys.cipherDataKeys },
                true,
            );

            spys.cipherDataKeys.forEach(spy => spy.resetHistory());

            // extract unhealthy spy from healthy
            const spysCipherUnhealthy = spys.cipherDataKeys.splice(spys.cipherDataKeys.length - 1, 1);

            await cipherAndAssert(
                promises.cipherDataKey.bind(null, 1, kmsKey, dataKey, logger),
                NB_OF_ENCRYPTION,
                { healthy: healthyClients, unhealthy: unhealthyClients },
                { healthy: nb, unhealthy: 1 },
                { spysCipherHealthy: spys.cipherDataKeys, spysCipherUnhealthy },
                false,
            );
        });
    });

    describe.each(hostsToTest)('for %i hosts + 1 host disconnecting and reconnecting', (nb) => {
        const transports = new Array(nb).fill().map((_, i) =>
            Object.assign({}, transport,
                { tls: Object.assign({}, transport.tls, { host: `127.0.0.${i + 1}` }) }),
        );
        transports.push(Object.assign({}, transport,
            // socat port that relays connection to pykmip
            { tls: Object.assign({}, transport.tls, { host: 'localhost', port: 5797 }) }));
        const clusterOptions = {
            logger,
            kmip: Object.assign({}, options.kmip, { transport: transports }),
        };

        let socatProcess;
        let clock;

        async function spawnSocat() {
            return new Promise((resolve, reject) => {
                const child = spawn(
                    'socat',
                    // no fork to have only 1 connection possible and to be able to kill the process
                    ['tcp-listen:5797,reuseaddr', 'tcp:localhost:5696'],
                    // ignored stdin and stdout but print stderr for potential error like address already used
                    { stdio: ['ignore', 'ignore', 'pipe'] },
                );
                let stderr = '';
                child.stderr.on('data', data => {
                    stderr += data.toString();
                });

                /** Let a small 10ms timeout for socat to trigger a potential error and close */
                let spawnTimeout;
                child.on('spawn', () => {
                    spawnTimeout = setTimeout(() => {
                        if (child.exitCode !== null || child.signalCode !== null) {
                            const err = `socat closed after spawn with code ${
                                child.exitCode} and signal ${child.signalCode}.\nStderr: ${stderr}`;
                            reject(err);
                        } else {
                            resolve(child);
                        }
                    }, 10);
                });
                child.on('error', err => {
                    if (spawnTimeout) {
                        clearTimeout(spawnTimeout);
                    }
                    reject(`${err.toString()}\nStderr: ${stderr}`);
                });
                child.on('close', (code, signal) => {
                    if (spawnTimeout) {
                        clearTimeout(spawnTimeout);
                    }
                    reject(new Error(`socat closed with code ${code} and signal ${signal}.\nStderr: ${stderr}`));
                });
            });
        }

        async function stopSocat(socat) {
            await new Promise((resolve) => {
                socat.on('close', resolve);
                socat.kill('SIGKILL');
            });
        }

        beforeEach(async () => {
            socatProcess = await spawnSocat();
            client = new ClusterClient(clusterOptions);
            healthyClients = client.clients;
            unhealthyClients = client.unhealthyClients;
            promises = promisify(client);
            spys = clusterSpys(client.clients);
            clock = sinon.useFakeTimers({ shouldAdvanceTime: true });
        });

        afterEach(async () => {
            if (socatProcess) {
                await stopSocat(socatProcess);
                socatProcess = null;
            }
            if (clock) {
                clock.restore();
                clock = null;
            }
        });

        it('should succeed healthcheck', async () => {
            await assert.doesNotReject(promises.healthcheck(logger), showArsenalErr);
            assertHealthcheck(
                { actual: healthyClients.length, expected: nb + 1 },
                { actual: unhealthyClients.length, expected: 0 },
                spys.healthchecks,
            );
        });

        it(`should encrypt x${NB_OF_ENCRYPTION} in round robin on each ${nb + 1} hosts or ${nb} hosts.`
            + ' With 1 host disconnecting and reconnecting', async () => {
            await assert.doesNotReject(async () => {
                kmsKey = await promises.createBucketKey('testBucket', logger);
            }, showArsenalErr);

            await cipherAndAssert(
                promises.cipherDataKey.bind(null, 1, kmsKey, dataKey, logger),
                nb + 1,
                { healthy: healthyClients, unhealthy: unhealthyClients },
                { healthy: nb + 1, unhealthy: 0 },
                { spysCipherHealthy: spys.cipherDataKeys },
                false,
            );

            spys.cipherDataKeys.forEach(spy => spy.resetHistory());

            await stopSocat(socatProcess);

            // extract unhealthy spy from healthy
            const spysCipherUnhealthy = spys.cipherDataKeys.splice(spys.cipherDataKeys.length - 1, 1);

            await cipherAndAssert(
                promises.cipherDataKey.bind(null, 1, kmsKey, dataKey, logger),
                nb + 1,
                { healthy: healthyClients, unhealthy: unhealthyClients },
                { healthy: nb, unhealthy: 1 },
                { spysCipherHealthy: spys.cipherDataKeys, spysCipherUnhealthy },
                true,
            );

            // pass the 30s unhealthy timeout
            clock.tick(31000);
            assert.strictEqual(healthyClients.length, nb + 1,
                `There should be ${nb + 1} healthy clients instead of ${healthyClients.length}`);
            assert.strictEqual(unhealthyClients.length, 0,
                `There should be 0 unhealthy clients instead of ${unhealthyClients.length}`);

            spys.cipherDataKeys.forEach(spy => spy.resetHistory());
            spysCipherUnhealthy.forEach(spy => spy.resetHistory());

            // host not reconnected will go back to unhealthy
            await cipherAndAssert(
                promises.cipherDataKey.bind(null, 1, kmsKey, dataKey, logger),
                nb + 1,
                { healthy: healthyClients, unhealthy: unhealthyClients },
                { healthy: nb, unhealthy: 1 },
                { spysCipherHealthy: spys.cipherDataKeys, spysCipherUnhealthy },
                true,
            );

            // pass the 30s unhealthy timeout
            clock.tick(31000);
            assert.strictEqual(healthyClients.length, nb + 1,
                `There should be ${nb + 1} healthy clients instead of ${healthyClients.length}`);
            assert.strictEqual(unhealthyClients.length, 0,
                `There should be 0 unhealthy clients instead of ${unhealthyClients.length}`);

            socatProcess = await spawnSocat();
            spys.cipherDataKeys.forEach(spy => spy.resetHistory());
            spysCipherUnhealthy.forEach(spy => spy.resetHistory());

            // now host is reconnected
            await cipherAndAssert(
                promises.cipherDataKey.bind(null, 1, kmsKey, dataKey, logger),
                nb + 1,
                { healthy: healthyClients, unhealthy: unhealthyClients },
                { healthy: nb + 1, unhealthy: 0 },
                { spysCipherHealthy: spys.cipherDataKeys, spysCipherUnhealthy },
                true,
            );
        });
    });
});
