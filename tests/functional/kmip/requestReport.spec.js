'use strict';

const assert = require('assert');
const net = require('net');
const util = require('util');
const sinon = require('sinon');
const TTLVCodec = require('../../../lib/network/kmip/codec/ttlv').default;
const TlsTransport = require('../../../lib/network/kmip/transport/tls').default;
const KMIPClient = require('../../../lib/network/kmip/Client').default;
const KMIPClusterClient = require('../../../lib/network/kmip/ClusterClient').default;
const KMIP = require('../../../lib/network/kmip').default;
const LoopbackServerTransport = require('../../utils/kmip/LoopbackServerTransport');
const { logger } = require('../../utils/kmip/ersatz');
const { certs, startKmipTestServer } = require('../../utils/kmip/tlsServer');

const REQUEST_TIMEOUT_MS = 100;

/**
 * @param {object} transport - transport options, or an array of them for a cluster
 * @param {object[]} reports - receives every request report
 * @returns {object} the options of a KMIP client
 */
function clientOptions(transport, reports) {
    return {
        kmip: {
            providerName: 'tests',
            client: {},
            codec: {},
            transport,
            onRequestDone: report => reports.push(report),
        },
    };
}

/**
 * @param {object[]} reports - request reports
 * @param {string} operation - a KMIP operation
 * @returns {object[]} the reports of that operation
 */
function reportsOf(reports, operation) {
    return reports.filter(report => report.operation === operation);
}

/**
 * @returns {Promise<number>} a port of 127.0.0.1 nothing listens on
 */
async function getClosedPort() {
    const server = net.createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    await new Promise(resolve => server.close(resolve));
    return port;
}

describe('KMIP request report', () => {
    let client;
    let reports;

    beforeEach(() => {
        reports = [];
    });

    afterEach(async () => {
        sinon.restore();
        await util.promisify(client.stop.bind(client))();
    });

    describe('with a KMS that answers', () => {
        const transportOptions = { pipelineDepth: 8, tls: { port: 5696 } };

        /**
         * Create the client, on a KMIP server in the test process, and a key
         * @param {object} [transport] - transport options
         * @returns {Promise<string>} the ID of the key
         */
        function createClientAndKey(transport = transportOptions) {
            client = new KMIPClient(clientOptions(transport, reports), TTLVCodec, LoopbackServerTransport);
            return util.promisify(client.createBucketKey.bind(client))('bucket', logger);
        }

        /**
         * @param {string} keyId - ID of a key of the client's KMS
         * @returns {Promise<Buffer>} a data key ciphered with the key
         */
        function cipherDataKey(keyId) {
            return util.promisify(client.cipherDataKey.bind(client))(1, keyId, Buffer.alloc(32), logger);
        }

        it('should report each request as a success, with its KMIP operation and duration', async () => {
            const keyId = await createClientAndKey();
            const ciphered = await cipherDataKey(keyId);
            await util.promisify(client.decipherDataKey.bind(client))(1, keyId, ciphered, logger);
            await util.promisify(client.destroyBucketKey.bind(client))(keyId, logger);

            // the handshake of the new connection runs next to the first requests
            const handshakeOperations = ['Discover Versions', 'Query'];
            assert.strictEqual(reportsOf(reports, 'Discover Versions').length, 1);
            assert.deepStrictEqual(
                reports.map(report => report.operation).filter(operation => !handshakeOperations.includes(operation)),
                ['Create', 'Activate', 'Encrypt', 'Decrypt', 'Revoke', 'Destroy'],
            );
            reports.forEach(report => {
                assert.strictEqual(report.outcome, 'success', JSON.stringify(report));
                assert.ok(Number.isInteger(report.durationMs) && report.durationMs >= 0, JSON.stringify(report));
            });
        });

        it('should keep the outcome of a request whose report fails, and log the failure', async () => {
            const keyId = await createClientAndKey();
            const error = new Error('report failed');
            // onRequestDone pushes each report
            sinon.stub(reports, 'push').throws(error);
            const logError = sinon.stub(logger, 'error');

            await cipherDataKey(keyId);

            sinon.assert.calledWith(
                logError,
                'KMS request report failed',
                sinon.match({ error, report: sinon.match({ operation: 'Encrypt', outcome: 'success' }) }),
            );
        });

        it('should report a request the KMS answers with an error as an error', async () => {
            const keyId = await createClientAndKey();
            const channel = client.kmip.transport.channel;
            sinon
                .stub(channel, 'routeEncrypt')
                .callsFake((_request, cb) => cb(channel.errorResponse('Item Not Found', 'no such key')));

            await assert.rejects(cipherDataKey(keyId));

            assert.deepStrictEqual(
                reportsOf(reports, 'Encrypt').map(({ outcome }) => outcome),
                ['error'],
            );
        });

        it('should report a request answered as a success of another operation as an error', async () => {
            const keyId = await createClientAndKey();
            const channel = client.kmip.transport.channel;
            // the server names the operation of its answer with its KMIP class
            class OtherOperationKMIP extends KMIP {
                static Enumeration(tagName, value) {
                    return super.Enumeration(tagName, tagName === 'Operation' ? 'Decrypt' : value);
                }
            }
            sinon.stub(channel, 'KMIP').value(OtherOperationKMIP);

            await assert.rejects(cipherDataKey(keyId));

            assert.deepStrictEqual(
                reportsOf(reports, 'Encrypt').map(({ outcome }) => outcome),
                ['error'],
            );
        });

        it('should count the wait for a free slot on the connection in the duration of a request', async () => {
            const answerDelayMs = 100;
            const keyId = await createClientAndKey({ ...transportOptions, pipelineDepth: 1 });
            const channel = client.kmip.transport.channel;
            const routeEncrypt = channel.routeEncrypt.bind(channel);
            sinon
                .stub(channel, 'routeEncrypt')
                .callsFake((request, cb) => setTimeout(() => routeEncrypt(request, cb), answerDelayMs));

            // the second request waits for the answer to the first before it is sent
            await Promise.all([cipherDataKey(keyId), cipherDataKey(keyId)]);

            const [first, queued] = reportsOf(reports, 'Encrypt');
            assert.strictEqual(first.outcome, 'success');
            assert.strictEqual(queued.outcome, 'success');
            assert.ok(
                queued.durationMs >= 2 * answerDelayMs - 1,
                `The queued request should take its wait and its answer, ${2 * answerDelayMs} ms, ` +
                    `took ${queued.durationMs} ms`,
            );
        });

        it('should report a request resent on a new connection after a revoked session token as two', async () => {
            const keyId = await createClientAndKey();
            const channel = client.kmip.transport.channel;
            sinon
                .stub(channel, 'routeEncrypt')
                .onFirstCall()
                .callsFake((_request, cb) =>
                    cb(channel.errorResponse('General Failure', '[NCERRUnauthorizedAccess]: Token has been revoked')),
                )
                .callThrough();

            await cipherDataKey(keyId);

            assert.deepStrictEqual(
                reportsOf(reports, 'Encrypt').map(({ outcome }) => outcome),
                ['error', 'success'],
            );
        });

        it('should report the requests of every host of a cluster', async () => {
            client = new KMIPClusterClient(
                { ...clientOptions([transportOptions, transportOptions], reports), logger },
                TTLVCodec,
                LoopbackServerTransport,
            );

            // round robin: one key on each host
            await util.promisify(client.createBucketKey.bind(client))('bucket', logger);
            await util.promisify(client.createBucketKey.bind(client))('bucket', logger);

            assert.strictEqual(reportsOf(reports, 'Discover Versions').length, 2);
            assert.strictEqual(reportsOf(reports, 'Create').length, 2);
        });
    });

    it('should report a request to a KMS that refuses the connection as an error', async () => {
        const port = await getClosedPort();
        client = new KMIPClient(clientOptions({ tls: { host: '127.0.0.1', port } }, reports), TTLVCodec, TlsTransport);

        await assert.rejects(util.promisify(client.createBucketKey.bind(client))('bucket', logger));

        assert.deepStrictEqual(
            reports.map(({ operation, outcome }) => ({ operation, outcome })),
            [{ operation: 'Create', outcome: 'error' }],
        );
    });

    describe('with a KMS that does not answer', () => {
        let server;

        beforeEach(async () => {
            server = await startKmipTestServer();
            server.answerDelayMs = () => null;
        });

        afterEach(async () => {
            await server.stop();
        });

        it(
            'should report a request over the time limit as a timeout, after the time limit, and the requests ' +
                'interrupted with it as errors',
            async () => {
                client = new KMIPClient(
                    clientOptions(
                        {
                            pipelineDepth: 8,
                            requestTimeoutMs: REQUEST_TIMEOUT_MS,
                            tls: { host: '127.0.0.1', port: server.port, ca: certs.ca },
                        },
                        reports,
                    ),
                    TTLVCodec,
                    TlsTransport,
                );

                await assert.rejects(util.promisify(client.createBucketKey.bind(client))('bucket', logger));

                const [timedOut, interrupted, ...others] = reports;
                assert.strictEqual(timedOut.operation, 'Create');
                assert.strictEqual(timedOut.outcome, 'timeout');
                assert.ok(
                    timedOut.durationMs >= REQUEST_TIMEOUT_MS - 1,
                    `The request should be reported after its time limit, was after ${timedOut.durationMs} ms`,
                );
                // the handshake of the connection, sent once it is open
                assert.deepStrictEqual(
                    { operation: interrupted?.operation, outcome: interrupted?.outcome },
                    { operation: 'Discover Versions', outcome: 'error' },
                );
                assert.deepStrictEqual(others, []);
            },
        );
    });
});
