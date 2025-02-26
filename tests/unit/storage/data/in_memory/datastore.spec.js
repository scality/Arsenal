const { backend, ds, resetCount } = require('../../../../../lib/storage/data/in_memory/datastore');
const stream = require('stream');
const sinon = require('sinon');
const assert = require('assert');
const { default: errors } = require('../../../../../lib/errors');

jest.mock('werelogs', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        newRequestLoggerFromSerializedUids: jest.fn().mockReturnValue({
            error: jest.fn(),
        }),
        newRequestLogger: jest.fn().mockReturnValue({
            error: jest.fn(),
        }),
    })),
}));

describe('MemDataBackend', () => {
    beforeEach(() => {
        Object.keys(ds).forEach(key => delete ds[key]);
        resetCount();
    });

    describe('toObjectGetInfo', () => {
        it('should convert object key to object get info format', () => {
            const result = backend.toObjectGetInfo('testKey');
            assert.deepStrictEqual(result, { key: 'testKey' });
        });
    });

    describe('put', () => {
        it('should store data and return a key', done => {
            const testData = Buffer.from('test data');
            const size = testData.length;
            const keyContext = { some: 'context' };
            const request = new stream.Readable();

            const callback = sinon.spy((err, key) => {
                assert.strictEqual(err, null);
                assert.strictEqual(key, 1);
                assert.deepStrictEqual(ds[1].value.toString(), testData.toString());
                assert.deepStrictEqual(ds[1].keyContext, keyContext);
                done();
            });

            backend.put(request, size, keyContext, null, callback);
            request.push(testData);
            request.push(null);
        });

        it('should return error if data exceeds announced size', done => {
            const testData = Buffer.from('test data too long');
            const size = 5;
            const keyContext = { some: 'context' };
            const request = new stream.Readable();

            const callback = sinon.spy(err => {
                assert.strictEqual(err.code, errors.InternalError.code);
                done();
            });

            backend.put(request, size, keyContext, null, callback);
            request.push(testData);
            request.push(null);
        });
    });

    describe('get', () => {
        it('should retrieve stored data by object get info', done => {
            const testData = Buffer.from('test data');
            ds[1] = { value: testData, keyContext: { some: 'context' } };

            const objectGetInfo = { key: 1 };

            backend.get(objectGetInfo, null, null, (err, stream) => {
                assert.strictEqual(err, null);

                let receivedData = Buffer.alloc(0);
                stream.on('data', chunk => {
                    receivedData = Buffer.concat([receivedData, chunk]);
                });

                stream.on('end', () => {
                    assert.deepStrictEqual(receivedData.toString(), testData.toString());
                    done();
                });
            });
        });

        it('should retrieve stored data by direct key', done => {
            const testData = Buffer.from('test data');
            ds[1] = { value: testData, keyContext: { some: 'context' } };

            backend.get(1, null, null, (err, stream) => {
                assert.strictEqual(err, null);

                let receivedData = Buffer.alloc(0);
                stream.on('data', chunk => {
                    receivedData = Buffer.concat([receivedData, chunk]);
                });

                stream.on('end', () => {
                    assert.deepStrictEqual(receivedData.toString(), testData.toString());
                    done();
                });
            });
        });

        it('should return error if key not found', done => {
            backend.get(999, null, null, err => {
                assert.strictEqual(err.code, errors.NoSuchKey.code);
                done();
            });
        });

        it('should retrieve data within specified range', done => {
            const testData = Buffer.from('0123456789');
            ds[1] = { value: testData, keyContext: { some: 'context' } };

            const range = [2, 5];

            backend.get(1, range, null, (err, stream) => {
                assert.strictEqual(err, null);

                let receivedData = Buffer.alloc(0);
                stream.on('data', chunk => {
                    receivedData = Buffer.concat([receivedData, chunk]);
                });

                stream.on('end', () => {
                    assert.deepStrictEqual(receivedData.toString(), '2345');
                    done();
                });
            });
        });
    });

    describe('delete', () => {
        it('should delete data by object get info', done => {
            ds[1] = { value: Buffer.from('test'), keyContext: {} };
            const objectGetInfo = { key: 1 };

            backend.delete(objectGetInfo, null, err => {
                assert.strictEqual(err, null);
                assert.strictEqual(ds[1], undefined);
                done();
            });
        });

        it('should delete data by direct key', done => {
            ds[1] = { value: Buffer.from('test'), keyContext: {} };

            backend.delete(1, null, err => {
                assert.strictEqual(err, null);
                assert.strictEqual(ds[1], undefined);
                done();
            });
        });

        it('should not return error when deleting non-existent key', done => {
            backend.delete(999, null, err => {
                assert.strictEqual(err, null);
                done();
            });
        });
    });

    describe('head', () => {
        it('should return key context by object get info array', done => {
            const keyContext = { some: 'metadata' };
            ds[1] = { value: Buffer.from('test'), keyContext };
            const objectGetInfos = [{ key: 1 }];

            backend.head(objectGetInfos, null, (err, result) => {
                assert.strictEqual(err, null);
                assert.deepStrictEqual(!!result.keyContext, true);
                assert.deepStrictEqual(!!result.lastModified, true);
                done();
            });
        });

        it('should return key context by array of direct keys', done => {
            const keyContext = { some: 'metadata' };
            ds[1] = { value: Buffer.from('test'), keyContext };
            const objectGetInfos = [1];

            backend.head(objectGetInfos, null, (err, result) => {
                assert.strictEqual(err, null);
                assert.deepStrictEqual(!!result.keyContext, true);
                assert.deepStrictEqual(!!result.lastModified, true);
                done();
            });
        });

        it('should return error if key not found', done => {
            backend.head([999], null, err => {
                assert.strictEqual(err.code, errors.NoSuchKey.code);
                done();
            });
        });
    });

    describe('Count management', () => {
        it('should increment count for each put operation', done => {
            const request1 = new stream.Readable();
            const request2 = new stream.Readable();

            backend.put(request1, 5, {}, null, (err1, key1) => {
                assert.strictEqual(key1, 1);

                backend.put(request2, 5, {}, null, (err2, key2) => {
                    assert.strictEqual(key2, 2);
                    done();
                });

                request2.push(Buffer.from('test2'));
                request2.push(null);
            });

            request1.push(Buffer.from('test1'));
            request1.push(null);
        });

        it('should reset count to 1', () => {
            for (let i = 0; i < 5; i++) {
                ds[i + 1] = { value: Buffer.from('test'), keyContext: {} };
            }

            resetCount();

            const request = new stream.Readable();

            return new Promise(resolve => {
                backend.put(request, 5, {}, null, (err, key) => {
                    assert.strictEqual(key, 1);
                    resolve();
                });

                request.push(Buffer.from('test'));
                request.push(null);
            });
        });
    });
});
