'use strict'; // eslint-disable-line

const fs = require('fs');
const assert = require('assert');
const http = require('http');
const https = require('https');
const dhparam = require('../../../../lib/https/dh2048').dhparam;
const ciphers = require('../../../../lib/https/ciphers').ciphers;
const werelogs = require('werelogs');
const Server = require('../../../../lib/network/http/server');
werelogs.configure({
    level: 'info',
    dump: 'error',
});
const log = new werelogs.Logger('TestHTTPServer');

function request(server, uri, cb, unsafeCa, cert, key) {
    const transport = server.isHttps() ? https : http;
    const ca = server.isHttps() && !!server.getAuthorityCertificate();
    let reject = ca;
    if (unsafeCa) {
        reject = false;
    }
    const options = {
        dhparam,
        ciphers,
        method: 'get',
        hostname: '127.0.0.1',
        port: 3000,
        path: uri,
        ca: ca ? server.getAuthorityCertificate()[0] : undefined,
        rejectUnauthorized: reject,
        requestCert: ca,
    };
    if (cert && key) {
        options.cert = cert;
        options.key = key;
    }
    options.agent = new transport.Agent(options);
    const req = transport.request(options, res => {
        const body = [];
        res.on('data', chunk => body.push(chunk));
        res.on('error', cb);
        res.on('end', () => cb(null, {
            res,
            body: body.join(''),
        }));
    });
    req.on('error', err => {
        if (err.code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
            return request(server, uri, cb, true);
        }
        return cb(err);
    });
    req.end();
}

const httpsRef = {
    cert: fs.readFileSync(`${__dirname}/../../../utils/test.crt`, 'ascii'),
    key: fs.readFileSync(`${__dirname}/../../../utils/test.key`, 'ascii'),
    ca: fs.readFileSync(`${__dirname}/../../../utils/ca.crt`, 'ascii'),
};

describe('network.Server: ', () => {
    [
        ['http', {}],
        ['https', {
            cert: httpsRef.cert,
            key: httpsRef.key,
        }],
        ['https with ca', {
            cert: httpsRef.cert,
            key: httpsRef.key,
            ca: httpsRef.ca,
        }],
    ].forEach(test => {
        function createServer() {
            const ws = new Server(3000, log);
            ws.setHttps(test[1].cert, test[1].key, test[1].ca, false);
            return ws;
        }

        describe(test[0], () => {
            it('should start', done => {
                const ws = createServer().onError(done).onListening(() => {
                    ws.onStop(done);
                    ws.stop();
                }).start();
            });

            it('should return EADDRINUSE on binding port already taken',
                done => {
                    const ws = createServer().onError(done)
                    .onListening(() => {
                        const bindingTimeout = setTimeout(() => {
                            const err =
                                'Server does not send an binding error';
                            ws.onStop(() => done(new Error(err))).stop();
                        }, 5000);
                        const ws2 = new Server(3000, log).onError(err => {
                            if (err.code === 'EADDRINUSE') {
                                clearTimeout(bindingTimeout);
                                return ws.onStop(done).stop();
                            }
                            clearTimeout(bindingTimeout);
                            return ws.onStop(() => done(err)).stop();
                        });
                        ws2.start();
                    }).start();
                });

            it('should return InternalError when no request handler', done => {
                const ws = createServer().onError(done).onListening(() => {
                    const requestTimeout = setTimeout(() => {
                        ws.onStop(() => done('No response received')).stop();
                    }, 1000);
                    request(ws, '/', (err, res) => {
                        if (err) {
                            clearTimeout(requestTimeout);
                            return ws.onStop(() => done(err)).stop();
                        }
                        clearTimeout(requestTimeout);
                        return ws.onStop(() => {
                            assert.strictEqual(res.res.statusCode, 500);
                            assert.strictEqual(res.body,
                                'InternalError: No handler in Server');
                            done();
                        }).stop();
                    });
                }).start();
            });

            it('should return 200 OK with "done" as content', done => {
                const ws = createServer().onError(done).onListening(() => {
                    const requestTimeout = setTimeout(() => {
                        ws.onStop(() => done('No response received')).stop();
                    }, 1000);
                    request(ws, '/', (err, res) => {
                        if (err) {
                            clearTimeout(requestTimeout);
                            return ws.onStop(() => done(err)).stop();
                        }
                        clearTimeout(requestTimeout);
                        return ws.onStop(() => {
                            assert.strictEqual(res.res.statusCode, 200);
                            assert.strictEqual(res.body, 'done');
                            done();
                        }).stop();
                    });
                }).onRequest((req, res) => {
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end('done');
                }).start();
            });
        });
    });

    it('should fail when the server is twoWay', done => {
        const ws = new Server(3000, log);
        ws.setHttps(httpsRef.cert, httpsRef.key, httpsRef.ca, true);
        ws.onError(done).onListening(() => {
            const requestTimeout = setTimeout(() => {
                ws.onStop(() => done('No response received')).stop();
            }, 1000);
            request(ws, '/', err => {
                if (err) {
                    return ws.onStop(() => {
                        clearTimeout(requestTimeout);
                        if (err.code === 'EPROTO') {
                            return done();
                        }
                        return done(err);
                    }).stop();
                }
                clearTimeout(requestTimeout);
                return ws.onStop(() => done(new Error('should failed'))).stop();
            });
        }).onRequest((req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('done');
        }).start();
    });
});
