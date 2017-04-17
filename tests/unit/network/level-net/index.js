'use strict'; // eslint-disable-line

const level = require('level');
const sublevel = require('level-sublevel');
const temp = require('temp');
const assert = require('assert');
const levelNet = require('../../../../lib/network/level-net');
const async = require('async');
const Logger = require('werelogs').Logger;
const debug = require('debug')('level-net:test');

describe('level-net - LevelDB over network', () => {
    let db;
    let client;
    const params = { };
    const reqUids = 'foo';

    function setupLevelNet() {
        const server = levelNet.createServer(
            db, { logger: new Logger('level-net:test-server',
                                     { level: 'info', dump: 'error' }) });
        server.initMetadataService('/test');
        server.listen(6677);

        client = levelNet.client({ baseNs: '/test',
                                   logger: new Logger('level-net:test-client',
                                                      { level: 'info',
                                                        dump: 'error' }) });
        client.connect('localhost', 6677);
    }

    /**
     * create-read-update-delete simple test
     *
     * @param {Object} db database object
     * @param {String} crudSelect string containing one or more of
     * 'C', 'R', 'U' and 'D' letters to enable each type of test
     * @param {String} key object key to work with
     * @param {function} cb callback when done
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
                db.put(key, value, params, reqUids, err => {
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
                db.get(key, params, reqUids, (err, data) => {
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
                db.put(key, value, params, reqUids, err => {
                    debug(`END ${dbg} -> ${err}`);
                    done(err);
                });
            });
            // read after write to check contents have been updated
            opList.push(done => {
                const dbg = (`get (check) sub '${db.path.join(':')}' ` +
                             `key '${key}'`);
                debug(`BEGIN ${dbg}`);
                db.get(key, params, reqUids, (err, data) => {
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
                db.del(key, params, reqUids, err => {
                    debug(`END ${dbg} -> ${err}`);
                    done(err);
                });
            });
            // check that contents have effectively been deleted
            opList.push(done => {
                const dbg = (`get (check) sub '${db.path.join(':')}' ` +
                             `key '${key}'`);
                debug(`BEGIN ${dbg}`);
                db.get(key, params, reqUids, err => {
                    debug(`END ${dbg} -> ${err}`);
                    assert(err);
                    assert(err.ObjNotFound);
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
            setupLevelNet();
            return done();
        });
    });

    describe('simple tests', () => {
        it('should ping a level-net server (sync on server)', done => {
            client.ping((err, args) => {
                if (err) {
                    return done(err);
                }
                assert.strictEqual(args, 'pong');
                return done();
            });
        });
        it('should ping a level-net server (async on server)', done => {
            client.pingAsync((err, args) => {
                if (err) {
                    return done(err);
                }
                assert.strictEqual(args, 'pong');
                return done();
            });
        });
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
                    assert(err.ObjNotFound);
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
                    assert(err.ObjNotFound);
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
                client.put(keyOfIter(i), valueOfIter(i),
                           params, reqUids, putCb);
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
                client.get(keyOfIter(randI), params, reqUids, getCb);
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
                    client.put(entry.key,
                               `new data for key ${entry.key}`,
                               params, reqUids, err => {
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
                    assert(err.ObjNotFound);
                    ++nbGetDone;
                    if (nbGetDone === nbKeys) {
                        return done();
                    }
                    return undefined;
                }
                for (let i = 0; i < nbKeys; ++i) {
                    client.get(keyOfIter(i), params, reqUids, checkCb);
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
                client.del(keyOfIter(i), params, reqUids, delCb);
            }
        });
    });

    describe('error tests', () => {
        it('should timeout if command is too long to respond', done => {
            // shorten the timeout to 200ms to speed up the test
            const oldTimeout = client.getCallTimeout();
            client.setCallTimeout(200);
            client.slowCommand(err => {
                assert(err);
                assert.strictEqual(err.code, 'ETIMEDOUT');
                return done();
            });
            client.setCallTimeout(oldTimeout);
        });
        it('should throw if last argument of call is not a callback', done => {
            assert.throws(() => {
                client.pingAsync('not a callback');
            }, Error);
            done();
        });
    });
});
