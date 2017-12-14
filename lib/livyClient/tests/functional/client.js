'use strict'; // eslint-disable-line strict

const assert = require('assert');

const LivyClient = require('../../lib/client');

describe('LivyClient tests', function testClient() {
    this.timeout(0);
    let client;
    // even if a session is deleted, livy keeps incrementing for new
    // sesssions so keep track through the tests
    // TODO; refactor this so using this.sessionId in each test
    // rather than this global counter
    let sessionId = 0;

    before('Create the client', () => {
        client = new LivyClient('localhost');
    });

    describe('POST Sessions', () => {
        afterEach(done => {
            client.deleteSession(sessionId - 1, done);
        });

        it('should post a session', done => {
            client.postSession({}, (err, res) => {
                assert.ifError(err);
                const expectedResponse = {
                    id: 0, appId: null, owner: null,
                    proxyUser: null,
                    state: 'starting',
                    kind: 'spark',
                    appInfo: { driverLogUrl: null, sparkUiUrl: null },
                    log: [] };
                assert.deepStrictEqual(res, expectedResponse);
                sessionId++;
                done();
            });
        });
    });

    describe('GET Sessions', () => {
        it('should get interactive sessions', done => {
            client.getSessions(null, null, (err, res) => {
                assert.ifError(err);
                assert.deepStrictEqual(res, { from: 0, total: 0,
                    sessions: [] });
                done();
            });
        });

        it('should get interactive sessions starting from index 1', done => {
            client.getSessions(1, null, (err, res) => {
                assert.ifError(err);
                assert.deepStrictEqual(res, { from: 1, total: 0,
                    sessions: [] });
                done();
            });
        });

        describe('After sessions have been posted', () => {
            before(done => {
                client.postSession({}, err => {
                    if (err) {
                        return done(err);
                    }
                    sessionId++;
                    return done();
                });
            });

            after(done => client.deleteSession(sessionId - 1, done));

            it('should get interactive sessions with total limited to 1',
            done => {
                client.getSessions(null, 1, (err, res) => {
                    assert.ifError(err);
                    const expectedResponse = {
                        from: 0,
                        total: 1,
                        sessions: [{
                            id: 1,
                            appId: null,
                            owner: null,
                            proxyUser: null,
                            state: 'starting',
                            kind: 'spark',
                            appInfo: {
                                driverLogUrl: null,
                                sparkUiUrl: null,
                            },
                            log: [],
                        }] };
                    assert.deepStrictEqual(res, expectedResponse);
                    done();
                });
            });
        });
    });

    describe('POST and GET Session Statements', function statements() {
        before(done => {
            client.postSession({}, (err, res) => {
                assert.ifError(err);
                this.sessionId = res.id;
                done();
            });
        });

        after(done => {
            client.deleteSession(this.sessionId, done);
        });

        it('should post a session statement with a quick program', done => {
            const codeToExecute = '2 + 2';
            client.postStatement(this.sessionId, codeToExecute,
                (err, res) => {
                    this.quickStatementId = res.id;
                    assert.ifError(err);
                    assert.deepStrictEqual(res, { id: this.quickStatementId,
                        state: 'waiting',
                        output: null });
                    done();
                });
        });

        it('should get a session statement with quick execution', done => {
            client.getStatement(this.sessionId, this.quickStatementId,
                (err, res) => {
                    assert.ifError(err);
                    assert.deepStrictEqual(res,
                        { status: 'ok',
                        // eslint-disable-next-line
                        execution_count: 0,
                        data: { 'text/plain': 'res0: Int = 4' } });
                    done();
                });
        });

        it('should post a session statement with a long program', done => {
            const codeToExecute = 'for(n <- 1 to 100000) ' +
                '{ Range(2, n-1).filter(primeTester => n % primeTester == 0).' +
                'length == 0 }';
            client.postStatement(this.sessionId, codeToExecute,
                (err, res) => {
                    this.longStatementId = res.id;
                    assert.ifError(err);
                    assert.deepStrictEqual(res, { id: this.longStatementId,
                        state: 'waiting',
                        output: null });
                    done();
                });
        });

        it('should max out on retries getting a session statement with long ' +
        'execution', done => {
            client.getStatement(this.sessionId, this.longStatementId,
                err => {
                    assert(err);
                    assert.strictEqual(err.message, 'Attempted to ' +
                    'get statement from livy too many times');
                    done();
                });
        });
    });

    describe('GET batches', () => {
        it('should get active batches', done => {
            client.getBatches(null, null, (err, res) => {
                assert.ifError(err);
                assert.deepStrictEqual(res, { from: 0, total: 0,
                    sessions: [] });
                done();
            });
        });
    });

    describe('POST batch', function batches() {
        it('should post a jar file batch', done => {
            // Note for any test env: must add path to livy.conf whitelist
            // livy.file.local-dir-whitelist=<insert path here>
            client.postBatch({ file: `${__dirname}/../resources/` +
                'simplespark_2.11-0.1.jar',
            className: 'SimpleApp' },
            (err, res) => {
                assert.ifError(err);
                this.jarBatch = res.id;
                assert(res.state === 'running' || res.state === 'starting');
                done();
            });
        });

        it('should delete a jar batch', done => {
            client.deleteBatch(this.jarBatch, (err, res) => {
                assert.ifError(err);
                assert.deepStrictEqual(res, { msg: 'deleted' });
                done();
            });
        });

        it('should post a python file batch', done => {
            // Note for any test env: must add path to livy.conf whitelist
            // livy.file.local-dir-whitelist=<insert path here>
            client.postBatch({ file: `${__dirname}/../resources/` +
                'SimpleApp.py' },
            (err, res) => {
                assert.ifError(err);
                this.pythonBatch = res.id;
                assert(res.state === 'running' || res.state === 'starting');
                done();
            });
        });

        it('should delete a jar batch', done => {
            client.deleteBatch(this.pythonBatch, (err, res) => {
                assert.ifError(err);
                assert.deepStrictEqual(res, { msg: 'deleted' });
                done();
            });
        });
    });
});
