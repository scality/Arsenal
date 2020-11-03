const assert = require('assert');
const stream = require('stream');

/**
 * Test stream used to retrieve a GET result
 *
 * The whole virtual object retrieved is a concatenation of 8-byte
 * strings where each 8-byte string is a space followed by a
 * zero-padded, 7 digit hexadecimal representation of the byte offset
 * of the chunk inside the object data.
 *
 * So the object data starts with: " 0000000 0000008 0000010", and so
 * on, until the object size is reached (the last 8-byte chunk may be
 * truncated if the object size is not a multiple of 8). After the
 * chunk ffffff8, it wraps around to 0000000 again (so at offsets
 * multiple of 0x10000000 or 256MB)
 *
 * This pattern allows to generate significant amounts of "real" data
 * without having to store it, and simplifies debugging.
 *
 * We support range requests by providing a start byte offset to read
 * from, so we can consider writing more thorough tests for external
 * backends.
 */
class DummyObjectStream extends stream.Readable {
    /**
     * @constructor
     * @param {number} startByteOffset - initial byte offset in
     * virtual object contents to start streaming from
     * @param {number} streamSize - size in bytes to stream from
     * virtual object contents
     */
    constructor(startByteOffset, streamSize) {
        super();
        this.streamSize = streamSize;
        this.pendingChunks = [];
        this.pendingSize = 0;
        this.remainingSize = streamSize;
        // determine the first chunk's value that we need to include
        // in the stream, possibly truncated
        const startChunkValue = Math.floor(startByteOffset / 8) * 8;
        this.nextChunkValue = startChunkValue;
        this._pushNextChunk();
        // truncate the first chunk if need be
        const truncateBytes = startByteOffset - startChunkValue;
        if (truncateBytes !== 0) {
            this.pendingChunks[0] = this.pendingChunks[0].slice(truncateBytes);
            this.pendingSize -= truncateBytes;
            this.remainingSize += truncateBytes;
        }
    }

    _pushNextChunk() {
        const chunkContents = ` ${`000000${this.nextChunkValue.toString(16)}`.slice(-7)}`;
        this.pendingChunks.push(chunkContents);
        this.nextChunkValue += 8;
        this.pendingSize += chunkContents.length;
        this.remainingSize -= chunkContents.length;
    }

    _read(size) {
        while (this.pendingSize < size && this.remainingSize > 0) {
            this._pushNextChunk();
        }
        let consolidated = this.pendingChunks.join('');
        if (this.remainingSize < 0) {
            // remove as many bytes from the end as remainingSize overflowed
            consolidated = consolidated.slice(0, this.remainingSize);
            this.remainingSize = 0;
        }
        if (this.pendingSize > size) {
            this.push(consolidated.slice(0, size));
            this.pendingChunks = [consolidated.slice(size)];
            this.pendingSize -= size;
        } else {
            this.push(consolidated);
            this.push(null);
            this.pendingChunks = [];
            this.pendingSize = 0;
        }
    }
}

async function testStream(startByteOffset, streamSize, expectedData) {
    const p = new Promise((resolve, reject) => {
        const dos = new DummyObjectStream(startByteOffset, streamSize);
        const readChunks = [];
        dos
            .on('data', chunk => readChunks.push(chunk))
            .on('error', err => reject(err))
            .on('end', () => {
                assert.strictEqual(readChunks.join(''), expectedData);
                resolve();
            });
    });
    return p;
}

describe('DummyObjectStream', () => {
    it('should return a stream of 8-byte hex-encoded blocks', async () => {
        // FIXME we likely need an eslint update
        /* eslint-disable no-unused-expressions */
        await testStream(0, 0, '');
        await testStream(50, 0, '');
        await testStream(0, 1, ' ');
        await testStream(1, 1, '0');
        await testStream(1, 7, '0000000');
        await testStream(0, 8, ' 0000000');
        await testStream(1, 8, '0000000 ');
        await testStream(0, 10, ' 0000000 0');
        await testStream(1, 10, '0000000 00');
        await testStream(7, 5, '0 000');
        await testStream(7, 12, '0 0000008 00');
        await testStream(8, 12, ' 0000008 000');
        await testStream(9, 12, '0000008 0000');
        await testStream(40, 16, ' 0000028 0000030');
        // check that offsets wrap around after 256MB
        await testStream(256 * 1024 * 1024 - 8, 16, ' ffffff8 0000000');
        await testStream(567890123, 30, '950c8 1d950d0 1d950d8 1d950e0 ');

        // test a larger stream with slightly more than 8MiB of contents
        const expectedLarge =
              ['950c8']
              .concat(new Array(1024 * 1024).fill()
                      .map((x, i) => ` ${Number(0x1d950d0 + i * 8).toString(16)}`))
              .concat([' 25'])
              .join('');
        await testStream(567890123, 5 + 8 * 1024 * 1024 + 3, expectedLarge);
        /* eslint-enable no-unused-expressions */
    }).timeout(30000);
});

module.exports = DummyObjectStream;
