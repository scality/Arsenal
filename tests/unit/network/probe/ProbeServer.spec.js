/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('assert');
const http = require('http');
const index = require('../../../../');
const { ProbeServer } = index.network.probe.ProbeServer;

function makeRequest(method, uri, cb) {
    const params = {
        hostname: 'localhost',
        port: 4042,
        path: uri,
        method,
    };
    const req = http.request(params);
    req.setNoDelay(true);
    req.on('response', res => {
        cb(undefined, res);
    });
    req.on('error', err => {
        assert.ifError(err);
        cb(err);
    }).end();
}

describe('network.probe.ProbeServer', () => {
    /** @type {ProbeServer} */
    let server;

    beforeEach(done => {
        server = new ProbeServer({ port: 4042 });
        server._cbOnListening = done;
        server.start();
    });

    afterEach(done => {
        server.stop();
        done();
    });

    it('error on bad method', done => {
        makeRequest('POST', '/unused', (err, res) => {
            assert.ifError(err);
            assert.strictEqual(res.statusCode, 405);
            done();
        });
    });

    it('error on invalid route', done => {
        makeRequest('GET', '/unused', (err, res) => {
            assert.ifError(err);
            assert.strictEqual(res.statusCode, 400);
            done();
        });
    });

    it('does nothing if probe successful', done => {
        server.addHandler('/check', res => {
            res.writeHead(200);
            res.end();
        });
        makeRequest('GET', '/check', (err, res) => {
            assert.ifError(err);
            assert.strictEqual(res.statusCode, 200);
            done();
        });
    });

    it('accepts array of paths', done => {
        server.addHandler(['/check', '/probe'], res => {
            res.writeHead(200);
            res.end();
        });
        let calls = 0;
        makeRequest('GET', '/check', (err, res) => {
            assert.ifError(err);
            assert.strictEqual(res.statusCode, 200);
            calls++;
            if (calls === 2) {
                done();
            }
        });
        makeRequest('GET', '/probe', (err, res) => {
            assert.ifError(err);
            assert.strictEqual(res.statusCode, 200);
            calls++;
            if (calls === 2) {
                done();
            }
        });
    });

    it('500 response on bad probe', done => {
        const failedMessage = 'failed_message';
        server.addHandler('/check', res => {
            res.writeHead(500);
            res.end(failedMessage);
        });
        makeRequest('GET', '/check', (err, res) => {
            assert.ifError(err);
            assert.strictEqual(res.statusCode, 500);
            res.setEncoding('utf8');
            res.on('data', body => {
                assert.strictEqual(body, failedMessage);
                done();
            });
        });
    });

    it('500 response on bad async probe', done => {
        const failedMessage = 'failed_message';
        server.addHandler('/check', async res => {
            res.writeHead(500);
            res.end(failedMessage);
        });
        makeRequest('GET', '/check', (err, res) => {
            assert.ifError(err);
            assert.strictEqual(res.statusCode, 500);
            res.setEncoding('utf8');
            res.on('data', body => {
                assert.strictEqual(body, failedMessage);
                done();
            });
        });
    });
});
