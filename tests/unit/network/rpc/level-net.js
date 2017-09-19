'use strict'; // eslint-disable-line

const level = require('level');
const sublevel = require('level-sublevel');
const temp = require('temp');
const assert = require('assert');
const async = require('async');
const debug = require('debug')('level-net:test');

const Logger = require('werelogs').Logger;

const rpc = require('../../../../lib/network/rpc/rpc');
const levelNet = require('../../../../lib/network/rpc/level-net');


// simply forward the API calls to the db as-is
const dbAsyncAPI = {
    put: (env, ...args) => {
        env.subDb.put(...args);
    },
    del: (env, ...args) => {
        env.subDb.del(...args);
    },
    get: (env, ...args) => {
        env.subDb.get(...args);
    },
    batch: (env, ...args) => {
        env.subDb.batch(...args);
    },
};
const dbSyncAPI = {
    createReadStream:
    (env, ...args) => env.subDb.createReadStream(args),
};

describe('level-net - LevelDB over network', () => {
    let db;
    let server;
    let client;
    const params = { };
    const srvLogger = new Logger('level-net:test-server',
                                 { level: 'info', dump: 'error' });
    const cliLogger = new Logger('level-net:test-client',
                                 { level: 'info', dump: 'error' });
    const reqLogger = cliLogger.newRequestLoggerFromSerializedUids('foo');

    function setupLevelNet(done) {
        server = new rpc.RPCServer({ logger: srvLogger });
        server.listen(6677);

        const dbService = new levelNet.LevelDbService({
            server,
            rootDb: db,
            namespace: '/test/db',
            logger: srvLogger });
        dbService.registerSyncAPI(dbSyncAPI);
        dbService.registerAsyncAPI(dbAsyncAPI);

        client = new levelNet.LevelDbClient({
            url: 'http://localhost:6677/test/db',
            logger: cliLogger,
        });
        client.connect(done);
    }

    /**
     * create-read-update-delete simple test
     *
     * @param {Object} db - database object
     * @param {String} crudSelect - string containing one or more of
     * 'C', 'R', 'U' and 'D' letters to enable each type of test
     * @param {String} key - object key to work with
     * @param {function} cb - callback when done
     * @return {undefined}
     */
    function doCRUDTest(db, crudSelect, key, cb) {
        const crudList = crudSelect.split('');
        const opList = [];
        if (crudList.includes('U')) {
            crudList.push('C'); // force creation before update
        }
        if (crudList.includes('C')) {
            const value = `${key}:testvalue1`;
            opList.push(done => {
                const dbg = (`put sub '${db.path.join(':')}' ` +
                             `key '${key}' value '${value}'`);
                debug(`BEGIN ${dbg}`);
                db.withRequestLogger(reqLogger)
                    .put(key, value, params, err => {
                        debug(`END ${dbg} -> ${err}`);
                        done(err);
                    });
            });
        }
        if (crudList.includes('R')) {
            const expectedValue = `${key}:testvalue1`;
            opList.push(done => {
                const dbg = `get sub '${db.path.join(':')}' key '${key}'`;
                debug(`BEGIN ${dbg}`);
                db.withRequestLogger(reqLogger)
                    .get(key, params, (err, data) => {
                        if (!err) {
                            assert.strictEqual(data, expectedValue);
                        }
                        debug(`END ${dbg} -> (${err},'${data}')`);
                        done(err);
                    });
            });
        }
        if (crudList.includes('U')) {
            const value = `${key}:testvalue2`;
            opList.push(done => {
                const dbg = (`update sub '${db.path.join(':')}' ` +
                             `key '${key}' value '${value}'`);
                debug(`BEGIN ${dbg}`);
                db.withRequestLogger(reqLogger)
                    .put(key, value, params, err => {
                        debug(`END ${dbg} -> ${err}`);
                        done(err);
                    });
            });
            // read after write to check contents have been updated
            opList.push(done => {
                const dbg = (`get (check) sub '${db.path.join(':')}' ` +
                             `key '${key}'`);
                debug(`BEGIN ${dbg}`);
                db.withRequestLogger(reqLogger)
                    .get(key, params, (err, data) => {
                        debug(`END ${dbg} -> (${err},'${data}')`);
                        assert.ifError(err);
                        assert.strictEqual(data, value);
                        done();
                    });
            });
        }
        if (crudList.includes('D')) {
            opList.push(done => {
                const dbg = `del sub '${db.path.join(':')}' key '${key}'`;
                debug(`BEGIN ${dbg}`);
                db.withRequestLogger(reqLogger)
                    .del(key, params, err => {
                        debug(`END ${dbg} -> ${err}`);
                        done(err);
                    });
            });
            // check that contents have effectively been deleted
            opList.push(done => {
                const dbg = (`get (check) sub '${db.path.join(':')}' ` +
                             `key '${key}'`);
                debug(`BEGIN ${dbg}`);
                db.withRequestLogger(reqLogger)
                    .get(key, params, err => {
                        debug(`END ${dbg} -> ${err}`);
                        assert(err);
                        assert(err.notFound);
                        done();
                    });
            });
        }

        async.series(opList, cb);
    }

    before(done => {
        temp.mkdir('level-net-testdb-', (err, dbDir) => {
            const rootDb = level(dbDir);
            db = sublevel(rootDb);
            setupLevelNet(done);
        });
    });

    after(done => {
        client.once('disconnect', () => {
            server.close();
            done();
        });
        client.disconnect();
    });

    describe('simple tests', () => {
        it('should be able to perform a complete CRUD test', done => {
            doCRUDTest(client, 'CRUD', 'testkey', done);
        });
    });
    describe('sublevel tests', () => {
        it('should be able to do CRUD on sublevel', done => {
            const subLevel = client.openSub('sub1');
            assert(subLevel);
            doCRUDTest(subLevel, 'CRUD', 'subkey', done);
        });
        it('should be able to re-open a sublevel', done => {
            const subLevel = client.openSub('sub2');
            doCRUDTest(subLevel, 'C', 'subkey', err => {
                assert.ifError(err);
                const subLevel2 = client.openSub('sub2');
                doCRUDTest(subLevel2, 'RD', 'subkey', done);
            });
        });
        it('should separate sublevel namespaces correctly', done => {
            const subLevel = client.openSub('sub3');
            doCRUDTest(subLevel, 'C', 'subkey', err => {
                assert.ifError(err);
                const otherSub = client.openSub('sub4');
                doCRUDTest(otherSub, 'RD', 'subkey', err => {
                    assert(err);
                    assert(err.notFound);
                    return done();
                });
            });
        });
        it('should be able to nest multiple sub-levels', done => {
            const subLevel = client.openSub('sub4');
            const nestedSub1 = subLevel.openSub('sub4-nested1');
            const nestedSub2 = nestedSub1.openSub('nested-nested');
            doCRUDTest(nestedSub2, 'CRU', 'key', err => {
                assert.ifError(err);
                const nestedSub22 = nestedSub1.openSub('nested-nested2');
                doCRUDTest(nestedSub22, 'R', 'key', err => {
                    // expect get error, it's another sub-level
                    assert(err);
                    assert(err.notFound);
                    done();
                });
            });
        });
    });
    describe('multiple keys tests', () => {
        const nbKeys = 100;

        function keyOfIter(i) {
            return `key of ${i}`;
        }
        function valueOfIter(i) {
            return `value of key ${i}`;
        }
        function prefillKeys(done) {
            let nbPutDone = 0;

            function putCb(err) {
                assert.ifError(err);
                ++nbPutDone;
                if (nbPutDone === nbKeys) {
                    return done();
                }
                return undefined;
            }
            for (let i = 0; i < nbKeys; ++i) {
                client.withRequestLogger(reqLogger)
                    .put(keyOfIter(i), valueOfIter(i), params, putCb);
            }
        }
        before(done => {
            prefillKeys(done);
        });
        it('should be able to read keys back at random', done => {
            const nbGet = 100;
            let nbGetDone = 0;

            for (let i = 0; i < nbGet; ++i) {
                const randI = Math.floor(Math.random() * nbKeys);
                // linter complains with 'no-loop-func' but we need a
                // new randI each time
                function getCb(err, data) { // eslint-disable-line
                    assert.ifError(err);
                    assert.strictEqual(data, valueOfIter(randI));
                    ++nbGetDone;
                    if (nbGetDone === nbGet) {
                        return done();
                    }
                }
                client.withRequestLogger(reqLogger)
                    .get(keyOfIter(randI), params, getCb);
            }
        });
        it('should be able to list all keys through a stream and ' +
           'rewrite them on-the-fly', done => {
            client.createReadStream((err, keyStream) => {
                assert.ifError(err);

                let nbKeysListed = 0;
                let nbPutDone = 0;
                let prevKey = undefined;
                let receivedEnd = false;
                keyStream.on('error', err => {
                    debug('stream error:', err);
                    assert.ifError(err);
                });
                keyStream.on('data', entry => {
                    debug('next key:', entry);
                    ++nbKeysListed;
                    assert(entry.key);
                    assert(!prevKey || entry.key > prevKey);
                    prevKey = entry.key;
                    client.withRequestLogger(reqLogger)
                        .put(entry.key, `new data for key ${entry.key}`,
                             params, err => {
                                 assert.ifError(err);
                                 ++nbPutDone;
                                 if (nbPutDone === nbKeys && receivedEnd) {
                                     done();
                                 }
                                 return undefined;
                             });
                });
                keyStream.on('end', () => {
                    receivedEnd = true;
                    assert.strictEqual(nbKeysListed, nbKeys);
                    if (nbPutDone === nbKeys) {
                        done();
                    }
                });
            });
        });
        it('should be able to abort key listing properly when client ' +
           'destroys the stream', done => {
            client.createReadStream((err, keyStream) => {
                assert.ifError(err);

                let nbKeysListed = 0;
                keyStream.on('error', err => {
                    assert.ifError(err);
                });
                keyStream.on('data', entry => {
                    debug('next key:', entry);
                    // guard against further 'data' events after
                    // destroy() has been called
                    assert(nbKeysListed < nbKeys / 2);
                    ++nbKeysListed;
                    if (nbKeysListed === nbKeys / 2) {
                        debug('calling destroy() on read stream');
                        keyStream.destroy();
                        // wait 100ms to make sure no further data is issued
                        setTimeout(() => {
                            assert(nbKeysListed === nbKeys / 2);
                            debug('after abort: keyStream._readState=',
                                  keyStream._readState);
                            done();
                        }, 100);
                    }
                });
                keyStream.on('end', () => {
                    // should not reach end of stream
                    assert.fail("'end' event received after destroy()");
                });
            });
        });
        it('should delete all keys successfully', done => {
            let nbDelDone = 0;

            function checkAllDeleted(done) {
                let nbGetDone = 0;

                function checkCb(err) {
                    assert(err.notFound);
                    ++nbGetDone;
                    if (nbGetDone === nbKeys) {
                        return done();
                    }
                    return undefined;
                }
                for (let i = 0; i < nbKeys; ++i) {
                    client.withRequestLogger(reqLogger)
                        .get(keyOfIter(i), params, checkCb);
                }
            }
            function delCb(err) {
                assert.ifError(err);
                ++nbDelDone;
                if (nbDelDone === nbKeys) {
                    checkAllDeleted(done);
                }
            }
            for (let i = 0; i < nbKeys; ++i) {
                client.withRequestLogger(reqLogger)
                    .del(keyOfIter(i), params, delCb);
            }
        });
    });
});
