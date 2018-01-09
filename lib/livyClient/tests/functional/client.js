'use strict'; // eslint-disable-line strict

const assert = require('assert');

const LivyClient = require('../../lib/client');

describe('LivyClient tests', function testClient() {
    this.timeout(0);
    let client;

    before('Create the client', () => {
        client = new LivyClient({ host: 'localhost' });
    });

    describe('POST Sessions', function postSession() {
        this.sessionId = undefined;
        afterEach(done => {
            client.deleteSessionOrBatch('session', this.sessionId, done);
        });

        it('should post a session', done => {
            client.postSession({}, (err, res) => {
                assert.ifError(err);
                this.sessionId = res.id;
                assert(res.id !== undefined && res.id !== null);
                assert.strictEqual(res.state, 'starting');
                assert.strictEqual(res.kind, 'spark');
                done();
            });
        });
    });

    describe('GET Sessions', () => {
        it('should get interactive sessions', done => {
            client.getSessionsOrBatches('session', null, null, (err, res) => {
                assert.ifError(err);
                assert(res.from !== undefined);
                assert(res.total !== undefined);
                assert(res.sessions !== undefined);
                done();
            });
        });

        it('should get interactive sessions starting from index 1', done => {
            client.getSessionsOrBatches('session', 1, null, (err, res) => {
                assert.ifError(err);
                assert.strictEqual(res.from, 1);
                assert(res.total !== undefined);
                assert(res.sessions !== undefined);
                done();
            });
        });

        describe('After sessions have been posted', () => {
            beforeEach(function beforeE(done) {
                return client.postSession({}, (err, res) => {
                    if (err) {
                        return done(err);
                    }
                    this.sessionId = res.id;
                    return done();
                });
            });

            it('should get interactive sessions with total limited to 1',
            done => {
                client.getSessionsOrBatches('session', null, 1, (err, res) => {
                    assert.ifError(err);
                    assert(res.from !== undefined);
                    assert(res.total !== undefined);
                    assert(res.sessions !== undefined);
                    assert.strictEqual(res.sessions.length, 1);
                    assert(res.sessions[0].state === 'idle' ||
                        res.sessions[0].state === 'starting');
                    assert.strictEqual(res.sessions[0].kind, 'spark');
                    done();
                });
            });

            it('should get session by id', function itF(done) {
                client.getSessionOrBatch('session', this.sessionId,
                (err, res) => {
                    assert.ifError(err);
                    assert.strictEqual(res.id, this.sessionId);
                    assert(res.appId !== undefined);
                    assert(res.owner !== undefined);
                    assert(res.proxyUser !== undefined);
                    assert(res.state !== undefined);
                    assert.strictEqual(res.kind, 'spark');
                    assert(res.appInfo !== undefined);
                    assert(res.log !== undefined);
                    done();
                });
            });

            it('should get state of session', function itF(done) {
                client.getSessionOrBatchState('session', this.sessionId,
                (err, res) => {
                    assert.ifError(err);
                    assert.strictEqual(res.id, this.sessionId);
                    assert(res.state !== undefined &&
                        typeof res.state === 'string');
                    done();
                });
            });

            it('should get log of session', function itF(done) {
                client.getSessionOrBatchLog('session', this.sessionId,
                (err, res) => {
                    assert.ifError(err);
                    assert.strictEqual(res.id, this.sessionId);
                    assert(res.from !== undefined);
                    assert(res.total !== undefined);
                    assert(res.log !== undefined);
                    done();
                });
            });
        });
    });

    describe('POST and GET Session Statements', () => {
        before(function beforeE(done) {
            client.postSession({}, (err, res) => {
                assert.ifError(err);
                this.sessionId = res.id;
                done();
            });
        });

        after(function afterE(done) {
            client.deleteSessionOrBatch('session', this.sessionId, done);
        });

        it('should post a session statement with a quick program',
        function itF(done) {
            const codeToExecute = '2 + 2';
            client.postStatement(this.sessionId, codeToExecute,
                (err, res) => {
                    assert.ifError(err);
                    this.quickStatementId = res.id;
                    assert.strictEqual(res.id, this.quickStatementId);
                    assert.strictEqual(res.state, 'waiting');
                    assert.strictEqual(res.output, null);
                    assert.strictEqual(res.code, codeToExecute);
                    done();
                });
        });

        it('should get a session statement with quick execution',
        function itF(done) {
            client.getStatement(this.sessionId, this.quickStatementId,
                (err, res) => {
                    assert.ifError(err);
                    assert.strictEqual(res.status, 'ok');
                    assert.strictEqual(res.execution_count, 0);
                    assert.deepStrictEqual(res.data,
                        { 'text/plain': 'res0: Int = 4' });
                    done();
                });
        });

        it('should post a session statement with a long program',
        function itF(done) {
            const codeToExecute = 'for(n <- 1 to 1000000) ' +
                '{ Range(2, n-1).filter(primeTester => n % primeTester == 0).' +
                'length == 0 }';
            client.postStatement(this.sessionId, codeToExecute,
                (err, res) => {
                    this.longStatementId = res.id;
                    assert.ifError(err);
                    assert.strictEqual(res.state, 'waiting');
                    assert.strictEqual(res.output, null);
                    assert.strictEqual(res.code, codeToExecute);
                    done();
                });
        });

        it('should max out on retries getting a session statement with long ' +
        'execution', function itF(done) {
            client.getStatement(this.sessionId, this.longStatementId,
                err => {
                    assert(err);
                    assert.strictEqual(err.message, 'Attempted to ' +
                    'get statement from livy too many times');
                    done();
                });
        });

        it('should cancel in-progress statement', function itF(done) {
            const codeToExecute = 'for(n <- 1 to 1000000) ' +
                '{ Range(2, n-1).filter(primeTester => n % primeTester == 0).' +
                'length == 0 }';
            client.postStatement(this.sessionId, codeToExecute,
            (err, res) => {
                client.cancelStatement(this.sessionId, res.id, (err, res) => {
                    assert.ifError(err);
                    assert.strictequal(res.msg, 'canceled');
                    done();
                });
            });
        });
    });

    describe('POST, GET, and DELETE batch', function batches() {
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

        it('should get active batches', done => {
            client.getSessionsOrBatches('batch', null, null, (err, res) => {
                assert.ifError(err);
                assert(res.from !== undefined);
                assert(res.total !== undefined);
                assert(res.sessions !== undefined);
                done();
            });
        });

        it('should get a jar batch by id', done => {
            client.getSessionOrBatch('batch', this.jarBatch, (err, res) => {
                assert.ifError(err);
                assert.strictEqual(res.id, this.jarBatch);
                assert(res.state !== undefined &&
                    typeof res.state === 'string');
                assert(res.appId !== undefined);
                assert(res.appInfo !== undefined);
                assert(res.log !== undefined);
                done();
            });
        });

        it('should get a python file batch by id', done => {
            client.getSessionOrBatch('batch', this.pythonBatch, (err, res) => {
                assert.ifError(err);
                assert.strictEqual(res.id, this.pythonBatch);
                assert(res.state !== undefined &&
                    typeof res.state === 'string');
                assert(res.appId !== undefined);
                assert(res.appInfo !== undefined);
                assert(res.log !== undefined);
                done();
            });
        });

        it('should get a jar batch state', done => {
            client.getSessionOrBatchState('batch', this.jarBatch,
            (err, res) => {
                assert.ifError(err);
                assert.strictEqual(res.id, this.jarBatch);
                assert(res.state !== undefined && typeof
                    res.state === 'string');
                done();
            });
        });

        it('should get a python file batch state', done => {
            client.getSessionOrBatchState('batch', this.jarBatch,
            (err, res) => {
                assert.ifError(err);
                assert.strictEqual(res.id, this.jarBatch);
                assert(res.state !== undefined && typeof
                    res.state === 'string');
                done();
            });
        });

        it('should get the log of a jar batch', done => {
            client.getSessionOrBatchLog('batch', this.jarBatch, (err, res) => {
                assert.ifError(err);
                assert.strictEqual(res.id, this.jarBatch);
                assert(res.log !== undefined);
                assert(res.from !== undefined && Number.isInteger(res.total));
                assert(res.total !== undefined && Number.isInteger(res.total));
                done();
            });
        });

        it('should get the log of a python file batch', done => {
            client.getSessionOrBatchLog('batch', this.pythonBatch,
            (err, res) => {
                assert.ifError(err);
                assert.strictEqual(res.id, this.pythonBatch);
                assert(res.log !== undefined);
                assert(res.from !== undefined && Number.isInteger(res.total));
                assert(res.total !== undefined && Number.isInteger(res.total));
                done();
            });
        });

        it('should delete a python file batch', done => {
            client.deleteSessionOrBatch('batch', this.pythonBatch,
            (err, res) => {
                assert.ifError(err);
                assert.deepStrictEqual(res, { msg: 'deleted' });
                done();
            });
        });

        it('should delete a jar batch', done => {
            client.deleteSessionOrBatch('batch', this.jarBatch, (err, res) => {
                assert.ifError(err);
                assert.deepStrictEqual(res, { msg: 'deleted' });
                done();
            });
        });
    });
});
