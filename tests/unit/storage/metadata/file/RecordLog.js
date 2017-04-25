'use strict'; //eslint-disable-line

const assert = require('assert');
const temp = require('temp');
const debug = require('debug')('record-log:test');
const level = require('level');
const sublevel = require('level-sublevel');

const Logger = require('werelogs').Logger;

const rpc = require('../../../../../lib/network/rpc/rpc');
const { RecordLogService, RecordLogProxy } =
          require('../../../../../lib/storage/metadata/file/RecordLog.js');

function randomName() {
    let text = '';
    const possible = ('ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
                      'abcdefghijklmnopqrstuvwxyz0123456789');

    for (let i = 0; i < 5; i++) {
        text += possible.charAt(Math.floor(Math.random()
                                           * possible.length));
    }
    return text;
}

function createScratchRecordLog(logger, done) {
    const name = randomName();
    debug(`creating scratch log ${name}`);
    const logProxy = new RecordLogProxy({
        url: 'http://localhost:6677/test/recordLog',
        logger,
        name,
    });
    logProxy.connect(err => {
        assert.ifError(err);
        done();
    });
    return logProxy;
}

function closeRecordLog(logProxy, done) {
    debug(`closing scratch log ${logProxy.name}`);
    logProxy.on('disconnect', done);
    logProxy.disconnect();
}

describe('record log - persistent log of metadata operations', () => {
    let server;
    const srvLogger = new Logger('recordLog:test-server',
                                 { level: 'info', dump: 'error' });
    const cliLogger = new Logger('recordLog:test-client',
                                 { level: 'info', dump: 'error' });
    let db;

    function setup(done) {
        server = new rpc.RPCServer({ logger: srvLogger });
        server.listen(6677);

        new RecordLogService({ // eslint-disable-line no-new
            server,
            namespace: '/test/recordLog',
            logger: srvLogger,
            rootDb: db,
        });
        done();
    }

    before(done => {
        temp.mkdir('record-log-testdir-', (err, dbDir) => {
            const rootDb = level(dbDir);
            db = sublevel(rootDb);
            setup(done);
        });
    });

    after(done => {
        server.close();
        done();
    });

    describe('simple tests', () => {
        // reinitialized for each test
        let logProxy;

        beforeEach(done => {
            logProxy = createScratchRecordLog(cliLogger, done);
        });
        afterEach(done => {
            if (logProxy) {
                closeRecordLog(logProxy, () => {
                    logProxy = undefined;
                    done();
                });
            } else {
                done();
            }
        });

        it('should list an empty record log', done => {
            logProxy.readRecords({}, (err, res) => {
                assert.ifError(err);
                const info = res.info;
                const recordStream = res.log;

                assert(info);
                assert.strictEqual(info.start, null);
                assert.strictEqual(info.end, null);
                assert(recordStream);
                recordStream.on('data', () => {
                    assert.fail('unexpected data event');
                });
                recordStream.on('end', done);
            });
        });
        it('should be able to add records and list them thereafter', done => {
            debug('going to append records');
            const ops = [{ type: 'put', key: 'foo', value: 'bar',
                           prefix: ['foobucket'] },
                         { type: 'del', key: 'baz',
                           prefix: ['foobucket'] },
                         { type: 'put',
                           key: 'Pâtisserie=中文-español-English',
                           value: 'yummy',
                           prefix: ['foobucket'] },
                        ];
            logProxy.createLogRecordOps(ops, (err, logEntries) => {
                assert.ifError(err);
                db.batch(ops.concat(logEntries), err => {
                    assert.ifError(err);
                    logProxy.readRecords({}, (err, res) => {
                        assert.ifError(err);
                        const info = res.info;
                        const recordStream = res.log;
                        assert(info);
                        assert.strictEqual(info.start, 1);
                        assert.strictEqual(info.end, 3);
                        assert(recordStream);
                        debug('readRecords: received new recordStream');
                        let nbRecords = 0;
                        recordStream.on('data', record => {
                            debug('readRecords: next record:', record);
                            if (nbRecords === 0) {
                                assert.deepStrictEqual(record.db,
                                                       'foobucket');
                                assert.strictEqual(typeof record.timestamp,
                                                   'string');
                                assert.strictEqual(record.entries.length, 1);
                                const entry = record.entries[0];
                                assert.strictEqual(entry.type, 'put');
                                assert.strictEqual(entry.key, 'foo');
                                assert.strictEqual(entry.value, 'bar');
                            } else if (nbRecords === 1) {
                                assert.deepStrictEqual(record.db,
                                                       'foobucket');
                                assert.strictEqual(typeof record.timestamp,
                                                   'string');
                                assert.strictEqual(record.entries.length, 1);
                                const entry = record.entries[0];
                                assert.strictEqual(entry.type, 'del');
                                assert.strictEqual(entry.key, 'baz');
                                assert.strictEqual(entry.value, undefined);
                            } else if (nbRecords === 2) {
                                assert.deepStrictEqual(record.db,
                                                       'foobucket');
                                assert.strictEqual(typeof record.timestamp,
                                                   'string');
                                assert.strictEqual(record.entries.length, 1);
                                const entry = record.entries[0];
                                assert.strictEqual(entry.type, 'put');
                                assert.strictEqual(
                                    entry.key,
                                    'Pâtisserie=中文-español-English');
                                assert.strictEqual(entry.value, 'yummy');
                            }
                            nbRecords += 1;
                        });
                        recordStream.on('end', () => {
                            debug('readRecords: stream end');
                            assert.strictEqual(nbRecords, 3);
                            done();
                        });
                    });
                });
            });
        });
    });

    describe('readRecords', () => {
        let logProxy;

        before(done => {
            logProxy = createScratchRecordLog(cliLogger, err => {
                assert.ifError(err);
                // fill the log with 1000 entries
                debug('going to append records');
                const recordsToAdd = [];
                for (let i = 1; i <= 1000; ++i) {
                    recordsToAdd.push(
                        { type: 'put', key: `foo${i}`, value: `bar${i}`,
                          prefix: ['foobucket'] });
                }
                logProxy.createLogRecordOps(recordsToAdd, (err, logRecs) => {
                    assert.ifError(err);
                    db.batch(recordsToAdd.concat(logRecs), err => {
                        assert.ifError(err);
                        done();
                    });
                });
            });
        });

        function checkRecord(record, seq) {
            assert.strictEqual(record.entries.length, 1);
            assert.deepStrictEqual(record.db, 'foobucket');
            assert.strictEqual(typeof record.timestamp, 'string');
            const entry = record.entries[0];
            assert.strictEqual(entry.type, 'put');
            assert.strictEqual(entry.key, `foo${seq}`);
            assert.strictEqual(entry.value, `bar${seq}`);
        }
        function checkReadRecords(res, params, done) {
            assert(res);
            const info = res.info;
            const recordStream = res.log;
            assert(info.start === params.startSeq);
            assert(info.end === params.endSeq);
            debug('readRecords: received new recordStream');
            let seq = params.startSeq;
            recordStream.on('data', record => {
                debug('readRecords: next record:', record);
                checkRecord(record, seq);
                seq += 1;
            });
            recordStream.on('end', () => {
                debug('readRecords: stream end');
                assert.strictEqual(seq, params.endSeq + 1);
                done();
            });
        }
        it('should list all entries', done => {
            logProxy.readRecords({}, (err, res) => {
                assert.ifError(err);
                checkReadRecords(res, { startSeq: 1, endSeq: 1000 }, done);
            });
        });

        it('should list all entries from a given startSeq', done => {
            logProxy.readRecords({ startSeq: 500 }, (err, res) => {
                assert.ifError(err);
                checkReadRecords(res, { startSeq: 500, endSeq: 1000 }, done);
            });
        });

        it('should list all entries up to a given endSeq', done => {
            logProxy.readRecords({ endSeq: 500 }, (err, res) => {
                assert.ifError(err);
                checkReadRecords(res, { startSeq: 1, endSeq: 500 }, done);
            });
        });

        it('should list all entries in a seq range', done => {
            logProxy.readRecords(
                { startSeq: 100, endSeq: 500 }, (err, res) => {
                    assert.ifError(err);
                    checkReadRecords(res, { startSeq: 100, endSeq: 500 },
                                     done);
                });
        });

        it('should list all entries from a given startSeq up to a limit',
        done => {
            logProxy.readRecords(
                { startSeq: 100, limit: 100 }, (err, res) => {
                    assert.ifError(err);
                    checkReadRecords(res, { startSeq: 100, endSeq: 199 },
                                     done);
                });
        });
    });
});
