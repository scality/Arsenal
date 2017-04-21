'use strict'; // eslint-disable-line

const assert = require('assert');

const Logger = require('werelogs').Logger;

const rpc = require('../../../../lib/network/rpc/rpc');


const miscSyncCommands = {
    ping: function ping(env) {
        env.requestLogger.debug('received ping');
        return 'pong';
    },
};

const miscAsyncCommands = {
    pingAsync: function pingAsync(env, cb) {
        env.requestLogger.debug('received pingAsync');
        setImmediate(() => cb(null, 'pong'));
    },
    slowCommand: function slowCommand(env, cb) {
        env.requestLogger.debug('received slowCommand');
        setTimeout(() => cb(null, 'ok'), 2000);
    },
};


describe('rpc - generic client/server RPC system', () => {
    let server;
    let miscClient;
    const srvLogger = new Logger('rpc:test-server',
                                 { level: 'info', dump: 'error' });
    const cliLogger = new Logger('rpc:test-client',
                                 { level: 'info', dump: 'error' });
    const reqLogger = cliLogger.newRequestLoggerFromSerializedUids('foo');

    function setupRPC(done) {
        server = new rpc.RPCServer({ logger: srvLogger });
        server.listen(6677);

        const miscService = new rpc.BaseService({
            server,
            namespace: '/test/misc',
            logger: srvLogger });
        miscService.registerSyncAPI(miscSyncCommands);
        miscService.registerAsyncAPI(miscAsyncCommands);

        miscClient = new rpc.BaseClient({
            url: 'http://localhost:6677/test/misc',
            logger: cliLogger,
        });
        miscClient.connect(done);
    }

    before(done => {
        setupRPC(done);
    });

    after(done => {
        miscClient.once('disconnect', () => {
            server.close();
            done();
        });
        miscClient.disconnect();
    });

    describe('simple tests', () => {
        it('should ping an RPC server (sync on server)', done => {
            miscClient.withRequestLogger(reqLogger).ping((err, args) => {
                if (err) {
                    return done(err);
                }
                assert.strictEqual(args, 'pong');
                return done();
            });
        });
        it('should ping an RPC server (async on server)', done => {
            miscClient.withRequestLogger(reqLogger).pingAsync((err, args) => {
                if (err) {
                    return done(err);
                }
                assert.strictEqual(args, 'pong');
                return done();
            });
        });
    });

    describe('error tests', () => {
        it('should timeout if command is too long to respond', done => {
            // shorten the timeout to 200ms to speed up the test
            const oldTimeout = miscClient.getCallTimeout();
            miscClient.setCallTimeout(200);
            miscClient.withRequestLogger(reqLogger).slowCommand(err => {
                assert(err);
                assert.strictEqual(err.code, 'ETIMEDOUT');
                return done();
            });
            miscClient.setCallTimeout(oldTimeout);
        });
        it('should throw if last argument of call is not a callback', done => {
            assert.throws(() => {
                miscClient.withRequestLogger(reqLogger).pingAsync(
                    'not a callback');
            }, Error);
            done();
        });
    });
});
