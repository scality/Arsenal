const assert = require('assert');
const net = require('net');
const tls = require('tls');
const TransportTemplate =
      require('../../../lib/network/kmip/transport/TransportTemplate').default;
const { logger } = require('../../utils/kmip/ersatz');

describe('KMIP Connection Management', () => {
    let server;
    beforeAll(done => {
        server = net.createServer(conn => {
            // abort the connection as soon as it is accepted
            conn.destroy();
        });
        server.listen(5696);
        server.on('listening', done);
    });
    afterAll(done => {
        server.close(done);
    });

    it('should gracefully handle connection errors', done => {
        const transport = new TransportTemplate(
            tls,
            {
                pipelineDepth: 1,
                tls: {
                    port: 5696,
                },
            });
        const request = Buffer.alloc(10).fill(6);
        /* Using a for loop here instead of anything
         * asynchronous, the callbacks get stuck in
         * the conversation queue and are unwind with
         * an error. It is the purpose of this test */
        transport.send(logger, request, (err, conversation, response) => {
            assert(err);
            assert(!response);
            done();
        });
        transport.end();
    });
});
