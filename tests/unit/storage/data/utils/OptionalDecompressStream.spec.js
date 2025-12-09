const assert = require('assert');
const async = require('async');
const zstd = require('zstd-napi');

const OptionalDecompressStream =
      require('../../../../../lib/storage/data/utils/OptionalDecompressStream');

function sendDataInRandomSizedChunks(stream, data, callback) {
    let bytePos = 0;
    async.whilst(
        () => bytePos < data.length,
        next => {
            const chunkSize = Math.floor(Math.random() * 4321);
            stream.write(data.subarray(bytePos, bytePos + chunkSize));
            bytePos += chunkSize;
            setImmediate(next);
        },
        callback);
}

describe('OptionalDecompressStream', () => {
    it('should decompress input data that has been compressed with Zstandard', done => {
        // result of: echo 'hello' | zstd -c
        const compressedData = Buffer.from([
            0x28, 0xb5, 0x2f, 0xfd, 0x04, 0x58, 0x31, 0x00,
            0x00, 0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x0a, 0x53,
            0x88, 0xbd, 0x91]);
        const stream = new OptionalDecompressStream();
        const decompressedChunks = [];
        stream
            .on('data', chunk => {
                decompressedChunks.push(chunk);
            })
            .on('end', () => {
                const result = Buffer.concat(decompressedChunks).toString();
                assert.strictEqual(result, 'hello\n');
                done();
            });
        stream.end(compressedData);
    });

    it('should pass uncompressed data through unchanged', done => {
        const inputData = Buffer.from('hello\n');
        const stream = new OptionalDecompressStream();
        const outputChunks = [];
        stream
            .on('data', chunk => {
                outputChunks.push(chunk);
            })
            .on('end', () => {
                const result = Buffer.concat(outputChunks).toString();
                assert.strictEqual(result, 'hello\n');
                done();
            });
        stream.end(inputData);
    });

    it('should handle empty input correctly', done => {
        const inputData = Buffer.from('');
        const stream = new OptionalDecompressStream();
        const outputChunks = [];
        stream
            .on('data', chunk => {
                outputChunks.push(chunk);
            })
            .on('end', () => {
                const result = Buffer.concat(outputChunks).toString();
                assert.strictEqual(result, '');
                done();
            });
        stream.end(inputData);
    });

    it('should handle input smaller than the magic number length correctly', done => {
        const inputData = Buffer.from('abc');
        const stream = new OptionalDecompressStream();
        const outputChunks = [];
        stream
            .on('data', chunk => {
                outputChunks.push(chunk);
            })
            .on('end', () => {
                const result = Buffer.concat(outputChunks).toString();
                assert.strictEqual(result, 'abc');
                done();
            });
        stream.end(inputData);
    });

    it('should detect the compression magic number even if it is split across multiple writes', done => {
        // result of: echo 'hello' | zstd -c
        const compressedData = Buffer.from([
            0x28, 0xb5, 0x2f, 0xfd, 0x04, 0x58, 0x31, 0x00,
            0x00, 0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x0a, 0x53,
            0x88, 0xbd, 0x91]);
        const stream = new OptionalDecompressStream();
        const decompressedChunks = [];
        stream
            .on('data', chunk => {
                decompressedChunks.push(chunk);
            })
            .on('end', () => {
                const result = Buffer.concat(decompressedChunks).toString();
                assert.strictEqual(result, 'hello\n');
                done();
            });
        // Write the magic number in two parts
        stream.write(compressedData.slice(0, 2));
        setTimeout(() => {
            stream.write(compressedData.slice(2));
            stream.end();
        }, 10);
    });

    it('should forward large uncompressed data correctly', done => {
        // generate 10MB of random data
        const inputData = Buffer.from(
            new Array(10 * 1024 * 1024)
                .fill()
                .map(() => Math.floor(Math.random() * 256)));
        const stream = new OptionalDecompressStream();
        const outputChunks = [];
        stream
            .on('data', chunk => {
                outputChunks.push(chunk);
            })
            .on('end', () => {
                const result = Buffer.concat(outputChunks);
                assert.strictEqual(Buffer.compare(result, inputData), 0);
                done();
            });
        sendDataInRandomSizedChunks(stream, inputData, () => stream.end());
    });

    it('should uncompress and forward large compressed data correctly', done => {
        // generate 10MB of random data
        const uncompressedInputData = Buffer.from(
            new Array(10 * 1024 * 1024)
                .fill()
                .map(() => Math.floor(Math.random() * 256)));
        const compressedInputData = zstd.compress(uncompressedInputData);
        const stream = new OptionalDecompressStream();
        const outputChunks = [];
        stream
            .on('data', chunk => {
                outputChunks.push(chunk);
            })
            .on('end', () => {
                const result = Buffer.concat(outputChunks);
                assert.strictEqual(Buffer.compare(result, uncompressedInputData), 0);
                done();
            });
        sendDataInRandomSizedChunks(stream, compressedInputData, () => stream.end());
    });

    it('should emit an error on truncated compressed data', done => {
        // Invalid compressed data: missing last byte
        const invalidCompressedData = Buffer.from([
            0x28, 0xb5, 0x2f, 0xfd, 0x04, 0x58, 0x31, 0x00,
            0x00, 0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x0a, 0x53,
            0x88, 0xbd]);
        const stream = new OptionalDecompressStream();
        stream
            .on('data', () => {})
            .on('error', err => {
                assert.ok(err);
                done();
            })
            .on('end', () => {
                assert.fail('Stream ended without error on invalid compressed data');
            });
        stream.end(invalidCompressedData);
    });
});
