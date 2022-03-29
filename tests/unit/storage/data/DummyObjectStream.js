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
        let cont = true;
        while (cont) {
            while (this.pendingSize < size && this.remainingSize > 0) {
                this._pushNextChunk();
            }
            let consolidated = this.pendingChunks.join('');
            if (this.remainingSize < 0) {
                // remove as many bytes from the end as remainingSize overflowed
                consolidated = consolidated.slice(0, this.remainingSize);
                this.remainingSize = 0;
            }
            cont = this.push(consolidated);
            this.pendingChunks = [];
            this.pendingSize = 0;
            if (this.remainingSize === 0) {
                this.push(null);
                cont = false;
            }
        }
    }
}

module.exports = DummyObjectStream;
