'use strict';

const assert = require('assert');
const tls = require('tls');
const TransportTemplate = require('../../../lib/network/kmip/transport/TransportTemplate').default;
const KMIPClient = require('../../../lib/network/kmip/Client').default;
const { logger } = require('../../utils/kmip/ersatz');
const { certs, startKmipTestServer } = require('../../utils/kmip/tlsServer');

const REQUEST_TIMEOUT_MS = 100;
const request = Buffer.alloc(10).fill(6);

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

describe('KMIP request time limit', () => {
    let server;

    beforeEach(async () => {
        server = await startKmipTestServer();
    });

    afterEach(async () => {
        await server.stop();
    });

    function transportOptions(requestTimeoutMs) {
        return {
            pipelineDepth: 8,
            requestTimeoutMs,
            tls: { host: '127.0.0.1', port: server.port, ca: certs.ca },
        };
    }

    /**
     * Send a request
     * @param {TransportTemplate} transport - the transport to send it on
     * @param {Buffer} [message] - the request, sent back by the server
     * @returns {Promise<object>} the error and response of its first callback,
     * and `calls()`, how many times the callback was called so far
     */
    function send(transport, message = request) {
        let calls = 0;
        return new Promise(resolve => {
            transport.send(logger, message, (err, conversation, response) => {
                calls += 1;
                resolve({ err, response, calls: () => calls });
            });
        });
    }

    describe('transport', () => {
        it('should time out an unanswered request, and fail the requests sent with it as interrupted', async () => {
            server.answerDelayMs = () => null;
            const transport = new TransportTemplate(tls, transportOptions(REQUEST_TIMEOUT_MS));

            const start = Date.now();
            const first = send(transport);
            await sleep(REQUEST_TIMEOUT_MS / 2);
            const second = send(transport);
            const [firstResult, secondResult] = await Promise.all([first, second]);
            const elapsed = Date.now() - start;

            assert.strictEqual(firstResult.err.code, 'ETIMEDOUT');
            assert.strictEqual(firstResult.err.message, `KMIP request timed out after ${REQUEST_TIMEOUT_MS} ms`);
            assert.ok(
                elapsed >= REQUEST_TIMEOUT_MS - 10,
                `The request should fail after its time limit of ${REQUEST_TIMEOUT_MS} ms, failed after ${elapsed} ms`,
            );
            assert.strictEqual(secondResult.err.message, 'Conversation interrupted');

            // responses are matched to requests by order, so the connection is closed
            await server.connections[0].closed;
            assert.strictEqual(firstResult.calls(), 1);
            assert.strictEqual(secondResult.calls(), 1);
        });

        it('should send a request made right after a timed out one on a new connection', async () => {
            server.answerDelayMs = () => null;
            const transport = new TransportTemplate(tls, transportOptions(REQUEST_TIMEOUT_MS));

            const timedOut = await send(transport);
            assert.strictEqual(timedOut.err.code, 'ETIMEDOUT');

            // sent before the closed connection reports its end
            server.answerDelayMs = () => 0;
            const next = await send(transport);

            assert.ifError(next.err);
            assert.ok(next.response.equals(request));
            assert.strictEqual(server.connections.length, 2);
        });

        it('should not pass the late answer of a timed out request to the next request', async () => {
            // the first connection answers after the time limit, the next one within it
            server.answerDelayMs = connection => (connection === 0 ? 1.5 : 0.8) * REQUEST_TIMEOUT_MS;
            const transport = new TransportTemplate(tls, transportOptions(REQUEST_TIMEOUT_MS));

            const timedOut = await send(transport, Buffer.from('timed out'));
            assert.strictEqual(timedOut.err.code, 'ETIMEDOUT');
            // pending while the late answer arrives
            const next = await send(transport, Buffer.from('next'));

            assert.ifError(next.err);
            assert.strictEqual(next.response.toString(), 'next');
        });

        it('should count the wait for a free slot on the connection in the time limit', async () => {
            const requestTimeoutMs = 2 * REQUEST_TIMEOUT_MS;
            // the first request is answered within the time limit, the second never
            server.answerDelayMs = (connection, requestIndex) => (requestIndex === 0 ? 0.4 * requestTimeoutMs : null);
            const transport = new TransportTemplate(tls, { ...transportOptions(requestTimeoutMs), pipelineDepth: 1 });

            // Timers fire in the order of their deadlines, even when the event loop is late
            let referencePassed = false;
            const reference = setTimeout(() => {
                referencePassed = true;
            }, 1.2 * requestTimeoutMs);
            const [first, queued] = await Promise.all([send(transport), send(transport)]);
            clearTimeout(reference);

            assert.ifError(first.err);
            assert.strictEqual(queued.err.code, 'ETIMEDOUT');
            assert.strictEqual(
                referencePassed,
                false,
                `The queued request should fail ${requestTimeoutMs} ms after submission, not after its wait`,
            );
        });

        it('should keep the connection of a request answered within the time limit', async () => {
            const transport = new TransportTemplate(tls, transportOptions(REQUEST_TIMEOUT_MS));

            const first = await send(transport);
            assert.ifError(first.err);
            await sleep(2 * REQUEST_TIMEOUT_MS);
            const second = await send(transport);
            assert.ifError(second.err);

            assert.strictEqual(server.connections.length, 1);
        });

        it('should let a request wait for its answer without a time limit', async () => {
            server.answerDelayMs = () => null;
            const transport = new TransportTemplate(tls, transportOptions(undefined));

            let answered = false;
            transport.send(logger, request, () => {
                answered = true;
            });
            await sleep(2 * REQUEST_TIMEOUT_MS);

            assert.strictEqual(answered, false);
        });
    });

    describe('client', () => {
        it('should fail the health check of an unresponsive KMIP server with an internal error', async () => {
            server.answerDelayMs = () => null;
            const client = new KMIPClient({
                kmip: {
                    providerName: 'tests',
                    client: {},
                    codec: {},
                    transport: transportOptions(REQUEST_TIMEOUT_MS),
                },
            });

            const err = await new Promise(resolve => client.healthcheck(logger, resolve));

            assert.strictEqual(err.code, 500);
            assert.ok(err.is.InternalError);
            assert.ok(err.description.includes('ETIMEDOUT'), err.description);
        });
    });
});
