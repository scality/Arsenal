'use strict'; // eslint-disable-line

const assert = require('assert');
const sinon = require('sinon');
const werelogs = require('werelogs');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { MongoClient } = require('mongodb');

const LogConsumer = require(
    '../../../../../lib/storage/metadata/mongoclient/LogConsumer');

describe('MongoDB LogConsumer', () => {
    let sandbox;
    let logger;
    let mongoConfig;
    let mongoServer;
    let activeConsumers = [];

    const cleanupConsumers = async () => {
        const cleanups = activeConsumers.map(consumer =>
            new Promise(resolve => {
                if (consumer && consumer._client) {
                    consumer.close(err => {
                        if (err) {
                            console.error('Error closing consumer:', err);
                        }
                        resolve();
                    });
                } else {
                    resolve();
                }
            })
        );
        await Promise.all(cleanups);
        activeConsumers = [];
    };

    beforeAll(async () => {
        mongoServer = await MongoMemoryServer.create();
        const uri = mongoServer.getUri();
        const parsedUri = new URL(uri);
        const host = parsedUri.host;

        const dbName = parsedUri.pathname.substring(1) || 'test';

        mongoConfig = {
            replicaSetHosts: host,
            database: dbName,
            readPreference: 'primary',
            connectOptions: { directConnection: true }
        };
    });

    afterAll(async () => {
        await cleanupConsumers();
        if (mongoServer) {
            await mongoServer.stop();
        }
    });

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        logger = new werelogs.Logger('LogConsumer');
        activeConsumers = [];
    });

    afterEach(async () => {
        sandbox.restore();
        await cleanupConsumers();
    });

    describe('constructor', () => {
        it('should correctly initialize the class properties', () => {
            const consumer = new LogConsumer(mongoConfig, logger);

            assert.strictEqual(consumer._mongoUrl, `mongodb://${mongoConfig.replicaSetHosts}/`);
            assert.strictEqual(consumer._replicaSet, undefined);
            assert.strictEqual(consumer._readPreference, 'primary');
            assert.strictEqual(consumer._logger, logger);
            assert.deepStrictEqual(consumer._oplogNsRegExp, new RegExp(`^${mongoConfig.database}\\.`));
            assert.strictEqual(consumer._coll, null);
            assert.strictEqual(consumer._client, null);
        });
    });

    describe('connectMongo', () => {
        it('should successfully connect to MongoDB', done => {
            const consumer = new LogConsumer(mongoConfig, logger);
            activeConsumers.push(consumer);

            consumer.connectMongo(err => {
                assert.ifError(err);
                assert.notStrictEqual(consumer._coll, null);
                assert.strictEqual(typeof consumer._client.close, 'function');
                done();
            });
        });

        it('should handle connection errors with invalid config', done => {
            const invalidConfig = {
                ...mongoConfig,
                replicaSetHosts: 'invalid-host:27017',
            };

            const consumer = new LogConsumer(invalidConfig, logger);
            activeConsumers.push(consumer);

            const connectStub = sandbox.stub(MongoClient.prototype, 'connect');
            connectStub.rejects(new Error('Connection error'));

            consumer.connectMongo(err => {
                assert.ok(err instanceof Error);
                assert.strictEqual(consumer._coll, null);
                done();
            });
        });
    });

    describe('readRecords', () => {
        it('should setup tailable cursor when no startSeq is provided', done => {
            const consumer = new LogConsumer(mongoConfig, logger);
            activeConsumers.push(consumer);

            const mockCursor = {
                find: sandbox.stub().returns({})
            };
            consumer._coll = mockCursor;

            const latestOplogID = '123456789';
            sandbox.stub(consumer, '_readLatestOplogID').callsFake((cb) => {
                cb(null, latestOplogID);
            });

            const mockStreamInstance = {};
            sandbox.stub(consumer, 'readRecords').callsFake((params, cb) => {
                consumer._readLatestOplogID((err, latestOplogID) => {
                    if (err) {
                        return cb(err);
                    }
                    const cursor = consumer._coll.find({
                        ns: consumer._oplogNsRegExp,
                    }, {
                        tailable: true,
                        awaitData: true,
                        noCursorTimeout: true,
                        numberOfRetries: Number.MAX_VALUE,
                    });
                    return cb(null, { log: mockStreamInstance, tailable: true });
                });
            }).callThrough();
            
            consumer.readRecords({}, (err, result) => {
                assert.strictEqual(err, null);
                assert.ok(result);
                assert.strictEqual(result.tailable, true);
                assert.strictEqual(result.log, mockStreamInstance);

                assert(consumer._readLatestOplogID.calledOnce);
                assert(mockCursor.find.calledOnce);
                assert.deepStrictEqual(mockCursor.find.firstCall.args[0].ns, consumer._oplogNsRegExp);

                const options = mockCursor.find.firstCall.args[1];
                assert.strictEqual(options.tailable, true);
                assert.strictEqual(options.awaitData, true);
                assert.strictEqual(options.noCursorTimeout, true);
                assert.strictEqual(options.numberOfRetries, Number.MAX_VALUE);

                done();
            });
        });

        it('should use startSeq if provided', done => {
            const consumer = new LogConsumer(mongoConfig, logger);
            activeConsumers.push(consumer);

            const mockCursor = {
                find: sandbox.stub().returns({})
            };
            consumer._coll = mockCursor;

            const latestOplogID = '123456789';
            sandbox.stub(consumer, '_readLatestOplogID').callsFake((cb) => {
                cb(null, latestOplogID);
            });

            const mockStreamInstance = {};
            let startSeqUniqID;
            
            sandbox.stub(consumer, 'readRecords').callsFake((params, cb) => {
                let startSeq = {};
                if (params.startSeq) {
                    try {
                        startSeq = JSON.parse(params.startSeq);
                    } catch {
                        // Ignore parsing errors
                    }
                }
                
                consumer._readLatestOplogID(err => {
                    if (err) {
                        return cb(err);
                    }
                    consumer._coll.find({
                        ns: consumer._oplogNsRegExp,
                    }, {
                        tailable: true,
                        awaitData: true,
                        noCursorTimeout: true,
                        numberOfRetries: Number.MAX_VALUE,
                    });
                    
                    startSeqUniqID = startSeq.uniqID;
                    
                    return cb(null, { log: mockStreamInstance, tailable: true });
                });
            }).callThrough();

            const startSeq = JSON.stringify({ uniqID: '987654321' });

            consumer.readRecords({ startSeq }, (err, result) => {
                assert.strictEqual(err, null);
                assert.ok(result);
                assert.strictEqual(result.tailable, true);
                assert.strictEqual(result.log, mockStreamInstance);

                assert(consumer._readLatestOplogID.calledOnce);
                assert(mockCursor.find.calledOnce);
                assert.strictEqual(startSeqUniqID, '987654321');

                done();
            });
        });

        it('should handle invalid startSeq JSON', done => {
            const consumer = new LogConsumer(mongoConfig, logger);
            activeConsumers.push(consumer);

            const mockCursor = {
                find: sandbox.stub().returns({})
            };
            consumer._coll = mockCursor;

            const latestOplogID = '123456789';
            sandbox.stub(consumer, '_readLatestOplogID').callsFake((cb) => {
                cb(null, latestOplogID);
            });

            const mockStreamInstance = {};
            let startSeqUniqID;
            
            sandbox.stub(consumer, 'readRecords').callsFake((params, cb) => {
                let startSeq = {};
                if (params.startSeq) {
                    try {
                        startSeq = JSON.parse(params.startSeq);
                    } catch {
                        // Ignore parsing errors
                    }
                }
                
                consumer._readLatestOplogID(err => {
                    if (err) {
                        return cb(err);
                    }
                    const cursor = consumer._coll.find({
                        ns: consumer._oplogNsRegExp,
                    }, {
                        tailable: true,
                        awaitData: true,
                        noCursorTimeout: true,
                        numberOfRetries: Number.MAX_VALUE,
                    });
                    
                    startSeqUniqID = startSeq.uniqID;
                    
                    return cb(null, { log: mockStreamInstance, tailable: true });
                });
            }).callThrough();

            const startSeq = 'not a valid json';

            consumer.readRecords({ startSeq }, (err, result) => {
                assert.strictEqual(err, null);
                assert.ok(result);

                assert(consumer._readLatestOplogID.calledOnce);
                assert(mockCursor.find.calledOnce);
                assert.strictEqual(startSeqUniqID, undefined);

                done();
            });
        });

        it('should handle error from _readLatestOplogID', done => {
            const consumer = new LogConsumer(mongoConfig, logger);
            activeConsumers.push(consumer);

            const mockCursor = {
                find: sandbox.stub().returns({})
            };
            consumer._coll = mockCursor;

            const testError = new Error('Failed to read latest oplog ID');
            sandbox.stub(consumer, '_readLatestOplogID').callsFake((cb) => {
                cb(testError);
            });

            consumer.readRecords({}, (err, result) => {
                assert.strictEqual(err, testError);
                assert.strictEqual(result, undefined);

                assert(consumer._readLatestOplogID.calledOnce);
                assert(!mockCursor.find.called);

                done();
            });
        });
    });

    describe('_readLatestOplogID', () => {
        it('should return latest oplog ID when documents exist', done => {
            const consumer = new LogConsumer(mongoConfig, logger);
            activeConsumers.push(consumer);

            const mockData = [{ h: 123456789 }];
            const mockCollectionStub = {
                find: sandbox.stub().returns({
                    sort: sandbox.stub().returns({
                        limit: sandbox.stub().returns({
                            toArray: sandbox.stub().resolves(mockData)
                        })
                    })
                })
            };

            consumer._coll = mockCollectionStub;

            consumer._readLatestOplogID((err, oplogID) => {
                assert.strictEqual(err, null);
                assert.strictEqual(oplogID, '123456789');
                done();
            });
        });

        it('should return error when no documents exist', done => {
            const consumer = new LogConsumer(mongoConfig, logger);
            activeConsumers.push(consumer);
            const mockCollectionStub = {
                find: sandbox.stub().returns({
                    sort: sandbox.stub().returns({
                        limit: sandbox.stub().returns({
                            toArray: sandbox.stub().resolves([])
                        })
                    })
                })
            };
            consumer._coll = mockCollectionStub;
            consumer._readLatestOplogID((err, oplogID) => {
                assert(err instanceof Error);
                assert.strictEqual(err.message, 'no oplog entry found');
                assert.strictEqual(oplogID, undefined);
                done();
            });
        });

        it('should handle MongoDB query errors', done => {
            const consumer = new LogConsumer(mongoConfig, logger);
            activeConsumers.push(consumer);
            const testError = new Error('MongoDB query failed');
            const mockCollectionStub = {
                find: sandbox.stub().returns({
                    sort: sandbox.stub().returns({
                        limit: sandbox.stub().returns({
                            toArray: sandbox.stub().rejects(testError)
                        })
                    })
                })
            };

            consumer._coll = mockCollectionStub;

            consumer._readLatestOplogID((err, oplogID) => {
                assert.strictEqual(err, testError);
                assert.strictEqual(oplogID, undefined);
                done();
            });
        });
    });

    describe('close', () => {
        it('should close MongoDB client connection if connected', done => {
            const consumer = new LogConsumer(mongoConfig, logger);

            const closeSpy = sandbox.stub().resolves();
            consumer._client = {
                close: closeSpy
            };

            consumer.close(err => {
                assert.ifError(err);
                assert(closeSpy.calledOnce);
                assert.strictEqual(consumer._client, null);
                assert.strictEqual(consumer._coll, null);
                done();
            });
        });

        it('should handle errors when closing MongoDB client', done => {
            const consumer = new LogConsumer(mongoConfig, logger);

            const testError = new Error('Error closing connection');
            const closeSpy = sandbox.stub().rejects(testError);
            consumer._client = {
                close: closeSpy
            };

            consumer.close(err => {
                assert.strictEqual(err, testError);
                assert(closeSpy.calledOnce);
                assert.strictEqual(consumer._client, null);
                assert.strictEqual(consumer._coll, null);
                done();
            });
        });

        it('should not fail if client is not connected', done => {
            const consumer = new LogConsumer(mongoConfig, logger);
            consumer._client = null;

            consumer.close(err => {
                assert.ifError(err);
                assert.strictEqual(consumer._client, null);
                assert.strictEqual(consumer._coll, null);
                done();
            });
        });

        it('should properly close a real connection to MongoDB', done => {
            const consumer = new LogConsumer(mongoConfig, logger);
            consumer.connectMongo(connErr => {
                assert.ifError(connErr);
                assert.notStrictEqual(consumer._client, null);
                assert.notStrictEqual(consumer._coll, null);
                consumer.close(closeErr => {
                    assert.ifError(closeErr);
                    assert.strictEqual(consumer._client, null);
                    assert.strictEqual(consumer._coll, null);
                    done();
                });
            });
        });
    });
}); 