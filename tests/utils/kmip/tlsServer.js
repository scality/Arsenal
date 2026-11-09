'use strict';

const fs = require('fs');
const path = require('path');
const tls = require('tls');

const certsDir = path.join(__dirname, '../../../.github/pykmip/certs');

/** The pykmip test certificates, valid for 127.0.0.1 to 127.0.0.50 */
const certs = {
    serverKey: fs.readFileSync(path.join(certsDir, 'kmip-key.pem')),
    serverCert: fs.readFileSync(path.join(certsDir, 'kmip-cert.pem')),
    ca: fs.readFileSync(path.join(certsDir, 'kmip-ca.pem')),
};

/**
 * Start a TLS server on 127.0.0.1 that sends every request back as its
 * response. `answerDelayMs(connection, request)`, given the index of the
 * connection and of the request on that connection, returns the delay before
 * the response, or null to never answer; by default every request is answered
 * at once.
 * @returns {Promise<object>} the server: `port`, `answerDelayMs`,
 * `connections` (one per accepted connection, with `reset()` to reset it) and
 * `stop()`
 */
function startKmipTestServer() {
    const state = { answerDelayMs: () => 0, connections: [] };
    const server = tls.createServer({ key: certs.serverKey, cert: certs.serverCert }, socket => {
        const connectionIndex = state.connections.length;
        state.connections.push({
            socket,
            // only the TCP socket under the TLS one can be reset
            reset: () => socket._parent.resetAndDestroy(),
        });
        let requestIndex = 0;
        socket.on('data', data => {
            const delayMs = state.answerDelayMs(connectionIndex, requestIndex);
            requestIndex += 1;
            if (delayMs === null) {
                return;
            }
            setTimeout(() => {
                if (!socket.destroyed) {
                    socket.write(data);
                }
            }, delayMs);
        });
        // the client closing a connection abruptly is expected
        socket.on('error', () => {});
    });
    state.stop = () =>
        new Promise(resolve => {
            state.connections.forEach(({ socket }) => socket.destroy());
            server.close(resolve);
        });
    return new Promise((resolve, reject) => {
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            state.port = server.address().port;
            resolve(state);
        });
    });
}

module.exports = { certs, startKmipTestServer };
