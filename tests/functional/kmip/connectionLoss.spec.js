'use strict';

const assert = require('assert');
const tls = require('tls');
const TransportTemplate = require('../../../lib/network/kmip/transport/TransportTemplate').default;
const { logger } = require('../../utils/kmip/ersatz');
const { certs, startKmipTestServer } = require('../../utils/kmip/tlsServer');

const request = Buffer.alloc(10).fill(6);

describe('KMIP transport on a lost connection', () => {
    let server;

    beforeEach(async () => {
        server = await startKmipTestServer();
    });

    afterEach(async () => {
        await server.stop();
    });

    it('should answer a request sent after a connection error and before that connection closes', async () => {
        // the first connection is reset on its first request, the next one answers
        server.answerDelayMs = connection => {
            if (connection === 0) {
                server.connections[0].reset();
                return null;
            }
            return 0;
        };
        const transport = new TransportTemplate(tls, {
            pipelineDepth: 8,
            tls: { host: '127.0.0.1', port: server.port, ca: certs.ca },
        });

        let failedError;
        const next = await new Promise(resolve => {
            transport.send(logger, request, err => {
                failedError = err;
                // the reset connection reports its close after this
                setImmediate(() =>
                    transport.send(logger, request, (nextErr, conversation, response) =>
                        resolve({ err: nextErr, response }),
                    ),
                );
            });
        });

        assert.strictEqual(failedError.code, 'ECONNRESET');
        assert.ifError(next.err);
        assert.ok(next.response.equals(request));
    });
});
