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

const healthcheckEndpoints = [
    '/_/health/liveness',
    '/_/health/readiness',
];

const badHealthcheckEndpoints = [
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
        healthcheckEndpoints.forEach(ep => {
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

        healthcheckEndpoints.forEach(ep => {
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

        healthcheckEndpoints.forEach(ep => {
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

        badHealthcheckEndpoints.forEach(ep => {
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

    describe('metrics route', () => {
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
        it('should expose metrics in prometheus format', done => {
            const counter = server.createCounter(
                'gizmo_counter', 'Count gizmos');
            counter.inc();
            counter.inc(10);
            const gauge = server.createGauge(
                'gizmo_gauge', 'Measure gizmos');
            gauge.set(42);
            gauge.inc();
            gauge.dec(10);

            const savedCounter = server.getMetric('gizmo_counter');
            // check we get the same original counter object
            assert.strictEqual(savedCounter, counter);

            const savedGauge = server.getMetric('gizmo_gauge');
            // check we get the same original gauge object
            assert.strictEqual(savedGauge, gauge);

            assert.strictEqual(server.getMetric('does_not_exist'), undefined);

            const expectedLines = [
                '# HELP gizmo_counter Count gizmos',
                '# TYPE gizmo_counter counter',
                'gizmo_counter 11',
                '# HELP gizmo_gauge Measure gizmos',
                '# TYPE gizmo_gauge gauge',
                'gizmo_gauge 33',
            ];

            makeRequest('GET', '/_/monitoring/metrics')
                .on('response', res => {
                    assert(res.statusCode === 200);
                    const respBufs = [];
                    res.on('data', data => {
                        respBufs.push(data);
                    });
                    res.on('end', () => {
                        const respContents = respBufs.join('');
                        // check that each expected line is present in
                        // the response
                        const respLines = {};
                        respContents.split('\n').forEach(line => {
                            respLines[line.trimRight()] = true;
                        });
                        expectedLines.forEach(expectedLine => {
                            assert.notStrictEqual(
                                respLines[expectedLine], undefined,
                                'missing expected line in response ' +
                                    `'${expectedLine}'`);
                        });
                        done();
                    });
                    res.on('error', err => {
                        assert.ifError(err);
                        done();
                    });
                })
                .on('error', err => {
                    assert.ifError(err);
                    done();
                }).end();
        });
    });
});
