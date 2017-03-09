'use strict'; // eslint-disable-line

const level = require('level');
const sublevel = require('level-sublevel');
const temp = require('temp');
const assert = require('assert');
const levelNet = require('../../../../lib/network/level-net');

describe('level-net - LevelDB over network', () => {
    let db;
    let client;

    function setupLevelNet() {
        const server = levelNet.createServer(db);
        server.of('/testnsp');
        server.listen(6677);
        client = levelNet.client();
        client.connect('localhost', 6677, 'testnsp');
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
        it('should be able to put data and read it back', done => {
            client.put('testkey1', 'value of testkey1', err => {
                assert.ifError(err);
                client.get('testkey1', (err, data) => {
                    assert.ifError(err);
                    assert.strictEqual(data, 'value of testkey1');
                    return done();
                });
            });
        });
        it('should timeout if command is too long to respond', done => {
            // shorten the timeout to 200ms to speed up the test
            const oldTimeout = client.getTimeout();
            client.setTimeout(200);
            client.slowCommand(err => {
                assert(err);
                assert(err.timeout);
                return done();
            });
            client.setTimeout(oldTimeout);
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
                client.put(keyOfIter(i), valueOfIter(i), putCb);
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
                client.get(keyOfIter(randI), getCb);
            }
        });
        it('should be able to list all keys through a stream and rewrite' +
           'them on-the-fly', done => {
            client.createReadStream((err, keyStream) => {
                assert.ifError(err);

                let nbKeysListed = 0;
                let nbPutDone = 0;
                let prevKey = undefined;
                keyStream.on('data', entry => {
                    ++nbKeysListed;
                    assert(!prevKey || entry.key > prevKey);
                    prevKey = entry.key;
                    client.put(entry.key,
                               `new data for key ${entry.key}`, err => {
                                   assert.ifError(err);
                                   ++nbPutDone;
                                   if (nbPutDone === nbKeys) {
                                       return done();
                                   }
                                   return undefined;
                               });
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
                    client.get(keyOfIter(i), checkCb);
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
                client.del(keyOfIter(i), delCb);
            }
        });
    });
});
