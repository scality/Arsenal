const assert = require('assert');
const HealthProbeServer =
    require('../../../../lib/network/probe/HealthProbeServer');
const http = require('http');

function makeRequest(meth, uri) {
    const params = {
        hostname: 'localhost',
        port: 4042,
        method: meth,
        path: uri,
    };
    const req = http.request(params);
    req.setNoDelay(true);
    return req;
}

const endpoints = [
    '/_/health/liveness',
    '/_/health/readiness',
];

const badEndpoints = [
    '/_/health/liveness_thisiswrong',
    '/_/health/readiness_thisiswrong',
];

describe('network.probe.HealthProbeServer', () => {
    describe('service is "up"', () => {
        let server;
        function setup(done) {
            server = new HealthProbeServer({ port: 4042 });
            server._cbOnListening = done;
            server.start();
        }

        before(done => {
            setup(done);
        });

        after(done => {
            server.stop();
            done();
        });
        endpoints.forEach(ep => {
            it('should perform a GET and ' +
                'return 200 OK', done => {
                makeRequest('GET', ep)
                    .on('response', res => {
                        assert(res.statusCode === 200);
                        done();
                    })
                    .on('error', err => {
                        assert.ifError(err);
                        done();
                    }).end();
            });
        });
    });

    describe('service is "down"', () => {
        let server;
        function setup(done) {
            function falseStub() {
                return false;
            }
            server = new HealthProbeServer({
                port: 4042,
                livenessCheck: falseStub,
                readinessCheck: falseStub,
            });
            server.start();
            done();
        }

        before(done => {
            setup(done);
        });

        after(done => {
            server.stop();
            done();
        });

        endpoints.forEach(ep => {
            it('should perform a GET and ' +
                'return 503 ServiceUnavailable', done => {
                makeRequest('GET', ep)
                    .on('response', res => {
                        assert(res.statusCode === 503);
                        done();
                    })
                    .on('error', err => {
                        assert.ifError(err);
                        done();
                    }).end();
            });
        });
    });

    describe('Invalid Methods', () => {
        let server;
        function setup(done) {
            server = new HealthProbeServer({
                port: 4042,
            });
            server.start();
            done();
        }

        before(done => {
            setup(done);
        });

        after(done => {
            server.stop();
            done();
        });

        endpoints.forEach(ep => {
            it('should perform a POST and ' +
                'return 405 MethodNotAllowed', done => {
                makeRequest('POST', ep)
                    .on('response', res => {
                        assert(res.statusCode === 405);
                        done();
                    })
                    .on('error', err => {
                        assert.ifError(err);
                        done();
                    }).end();
            });
        });
    });

    describe('Invalid URI', () => {
        let server;
        function setup(done) {
            server = new HealthProbeServer({
                port: 4042,
            });
            server.start();
            done();
        }

        before(done => {
            setup(done);
        });

        after(done => {
            server.stop();
            done();
        });

        badEndpoints.forEach(ep => {
            it('should perform a GET and ' +
                'return 400 InvalidURI', done => {
                makeRequest('GET', ep)
                    .on('response', res => {
                        assert(res.statusCode === 400);
                        done();
                    })
                    .on('error', err => {
                        assert.ifError(err);
                        done();
                    }).end();
            });
        });
    });
});
