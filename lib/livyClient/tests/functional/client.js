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

        it('should post a session statement', done => {
            const codeToExecute = '2 + 2';
            client.postStatement(this.sessionId, codeToExecute,
                (err, res) => {
                    this.statementId = res.id;
                    assert.ifError(err);
                    assert.deepStrictEqual(res, { id: 0, state: 'waiting',
                        output: null });
                    done();
                });
        });

        it('should get a session statement', done => {
            client.getStatement(this.sessionId, this.statementId,
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

    describe('POST batch', () => {
        it('should post a batch', done => {
            // TODO: replace with a simple test jar within the project
            // Note: must add path to livy.conf whitelist
            // livy.file.local-dir-whitelist=<insert path here>
            client.postBatch({ file: '/Users/lhs/Documents/sparkingKafka/' +
                'target/scala-2.11/sparkingKafka-assembly-1.0.jar',
            className: 'pi' },
            (err, res) => {
                assert.ifError(err);
                const expectedResponse = {
                    id: 0, appId: null,
                    state: 'running',
                    appInfo: { driverLogUrl: null, sparkUiUrl: null },
                    log: [] };
                assert.deepStrictEqual(res, expectedResponse);
                done();
            });
        });

        it('should delete a batch', done => {
            client.deleteBatch(0, (err, res) => {
                assert.ifError(err);
                assert.deepStrictEqual(res, { msg: 'deleted' });
                done();
            });
        });
    });
});
