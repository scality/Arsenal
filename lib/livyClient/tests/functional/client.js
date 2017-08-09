'use strict'; // eslint-disable-line strict

const assert = require('assert');

const LivyClient = require('../../lib/client');

describe('LivyClient tests', function testClient() {
    this.timeout(0);
    let client;
    // even if a session is deleted, livy keeps incrementing for new
    // sesssions so keep track through the tests
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
                assert.deepStrictEqual(JSON.parse(res), expectedResponse);
                sessionId++;
                done();
            });
        });
    });

    describe('GET Sessions', () => {
        it('should get interactive sessions', done => {
            client.getSessions(null, null, (err, res) => {
                assert.ifError(err);
                assert.deepStrictEqual(JSON.parse(res), { from: 0, total: 0,
                    sessions: [] });
                done();
            });
        });

        it('should get interactive sessions starting from index 1', done => {
            client.getSessions(1, null, (err, res) => {
                assert.ifError(err);
                assert.deepStrictEqual(JSON.parse(res), { from: 1, total: 0,
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
                    assert.deepStrictEqual(JSON.parse(res), expectedResponse);
                    done();
                });
            });
        });
    });

    describe('GET batches', () => {
        it('should get active batches', done => {
            client.getBatches(null, null, (err, res) => {
                assert.ifError(err);
                assert.deepStrictEqual(JSON.parse(res), { from: 0, total: 0,
                    sessions: [] });
                done();
            });
        });
    });

    describe.only('POST batch', () => {
        it('should post a batch', done => {
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
                assert.deepStrictEqual(JSON.parse(res), expectedResponse);
                sessionId++;
                done();
            });
        });

        it('should delete a batch', done => {
            client.deleteBatch(0, (err, res) => {
                assert.ifError(err);
                assert.deepStrictEqual(JSON.parse(res), { msg: 'deleted' });
                done();
            });
        });
    });
});
