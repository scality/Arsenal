'use strict'; // eslint-disable-line

const temp = require('temp');
const assert = require('assert');
const async = require('async');
const stream = require('stream');
const werelogs = require('werelogs');

const DataFileStore = require(
    '../../../../lib/storage/data/file/DataFileStore');
const RESTClient = require('../../../../lib/network/rest/RESTClient');
const RESTServer = require('../../../../lib/network/rest/RESTServer');

function createReadStream(contents) {
    const rs = new stream.Readable();
    rs._read = function nop() {};
    if (contents) {
        rs.push(contents);
    }
    rs.push(null);
    return rs;
}

const clientLogApi = new werelogs.Werelogs({
    level: 'info',
    dump: 'error',
});

describe('REST interface for blob data storage', () => {
    let dataStore;
    let server;
    let client;

    function setup(done) {
        temp.mkdir('test-REST-data-dir', (err, tempDir) => {
            dataStore = new DataFileStore({ dataPath: tempDir,
                noSync: true,
                logApi: clientLogApi,
            });
            server = new RESTServer({ port: 6677,
                dataStore,
                log: { logLevel: 'info',
                    dumpLevel: 'error' },
            });
            server.setup(() => {
                server.start();
                client = new RESTClient({ host: 'localhost',
                    port: 6677,
                    logApi: clientLogApi,
                });
                done();
            });
        });
    }

    before(done => {
        setup(done);
    });

    after(done => {
        server.stop();
        done();
    });

    describe('simple tests', () => {
        it('should be able to PUT, GET and DELETE an object', done => {
            const contents = 'This is the contents of the new object';
            let objKey;

            async.series([
                subDone => {
                    const rs = createReadStream(contents);
                    client.put(rs, contents.length, '1', (err, key) => {
                        assert.ifError(err);
                        assert(key !== undefined);
                        const hexChars = '0123456789abcdefABCDEF';
                        for (const c of key) {
                            assert(hexChars.includes(c));
                        }
                        objKey = key;
                        subDone();
                    });
                },
                subDone => {
                    client.get(objKey, null, '2', (err, resp) => {
                        assert.ifError(err);
                        const value = resp.read();
                        assert.strictEqual(value.toString(), contents);
                        subDone();
                    });
                },
                subDone => {
                    client.delete(objKey, '3', err => {
                        assert.ifError(err);
                        subDone();
                    });
                },
                subDone => {
                    client.get(objKey, null, '4', err => {
                        assert(err);
                        assert(err.code === 404);
                        subDone();
                    });
                },
                subDone => {
                    client.getAction('diskUsage', null, (err, res) => {
                        assert.ifError(err);
                        const usage = JSON.parse(res);
                        assert(Number.isSafeInteger(usage.free));
                        assert(usage.free > 0);
                        assert(Number.isSafeInteger(usage.available));
                        assert(usage.available > 0);
                        assert(Number.isSafeInteger(usage.total));
                        assert(usage.total > 0);
                        subDone();
                    });
                }],
                         err => {
                             done(err);
                         });
        });
    });

    describe('GET with range tests', () => {
        const contents = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let objKey;
        let emptyObjKey;

        function checkContentRange(resp, expectedStart, expectedEnd) {
            assert(resp.headers['content-range']);
            assert.strictEqual(
                resp.headers['content-range'],
                `bytes ${expectedStart}-${expectedEnd}/${contents.length}`);
        }

        before(done => {
            const rs = createReadStream(contents);
            client.put(rs, contents.length, '1', (err, key) => {
                assert.ifError(err);
                objKey = key;
                const emptyRs = createReadStream(null);
                client.put(emptyRs, 0, '2', (err, key) => {
                    assert.ifError(err);
                    emptyObjKey = key;
                    done();
                });
            });
        });

        // successful range queries

        [{ range: [10, 20],
            sliceArgs: [10, 21], contentRange: [10, 20] },
        { range: [10, undefined],
            sliceArgs: [10], contentRange: [10, contents.length - 1] },
        { range: [10, 1000],
            sliceArgs: [10], contentRange: [10, contents.length - 1] },
        { range: [undefined, 10],
            sliceArgs: [-10], contentRange: [contents.length - 10,
                contents.length - 1] },
        { range: [undefined, contents.length + 2],
            sliceArgs: [-(contents.length + 2)],
            contentRange: [0, contents.length - 1] },
        { range: [contents.length - 1, undefined],
            sliceArgs: [-1], contentRange: [contents.length - 1,
                contents.length - 1] }]
            .forEach((test, i) => {
                const { range, sliceArgs, contentRange } = test;
                it(`should get the correct range ${range[0]}-${range[1]}`,
                   done => {
                       client.get(
                           objKey, range,
                           (1000 + i).toString(), (err, resp) => {
                               assert.ifError(err);
                               const value = resp.read();
                               assert.strictEqual(
                                   value.toString(),
                                   contents.slice(...sliceArgs));
                               checkContentRange(resp, contentRange[0],
                                                 contentRange[1]);
                               done();
                           });
                   });
            });

        // queries returning 416 Requested Range Not Satisfiable

        [{ range: [1000, undefined], emptyObject: false },
         { range: [contents.length, undefined], emptyObject: false },
         { range: [0, undefined], emptyObject: true },
         { range: [0, 10], emptyObject: true },
         { range: [undefined, 0], emptyObject: true }]
            .forEach((test, i) => {
                const { range, emptyObject } = test;
                it(`should get error 416 on ${range[0]}-${range[1]}` +
                   `${emptyObject ? ' (empty object)' : ''}`,
                   done => {
                       const key = (emptyObject ? emptyObjKey : objKey);
                       client.get(
                           key, range,
                           (2000 + i).toString(), err => {
                               assert(err);
                               assert.strictEqual(err.code, 416);
                               done();
                           });
                   });
            });

        it('should get 200 OK on both range boundaries undefined', done => {
            client.get(objKey, [undefined, undefined], '3001', (err, resp) => {
                assert.ifError(err);
                const value = resp.read();
                assert.strictEqual(value.toString(), contents);
                done();
            });
        });
        it('should get 200 OK on range query "bytes=-10" of empty object',
           done => {
               client.get(emptyObjKey, [undefined, 10], '3002', (err, resp) => {
                   assert.ifError(err);
                   const value = resp.read();
                   assert.strictEqual(value, null);
                   done();
               });
           });
    });
});
