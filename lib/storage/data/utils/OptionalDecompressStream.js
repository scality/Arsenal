const stream = require('stream');
const zstd = require('zstd-napi');

// ZSTD magic number, little-endian convention
const ZSTD_FRAME_MAGIC = 0xFD2FB528;

/**
 * This stream helper checks whether its input is compressed by checking the magic header:
 * - If compressed, forwards the decompressed payload to its readable end
 * - If not compressed, forwards the payload as is to its readable end
 *
 * It allows to transparently decompress a payload without having to know whether it's
 * compressed or not by other means (but see note 2).
 *
 * Note 1: Currently only supports ZSTD compression, but we could consider supporting more
 * compression schemes if needed, as long as they can be identified by a unique magic header.
 *
 * Note 2: There is a possibility that the uncompressed input collides with a known
 * supported compression magic number, making the stream think it's compressed while
 * it's actually not. However for practical purposes, it shouldn't be an issue as long as
 * the input is an internal format that we have control on, but the stream shouldn't be
 * fed with data that could potentially be any set of bytes, to avoid this risk (e.g.
 * data coming directly from customer applications, which may have compressed their
 * payload on their own, or have a header resembling a compression scheme for any reason).
 */
class OptionalDecompressStream extends stream.Transform {
    constructor() {
        super();
        this._headerChunks = [];
        this._headerSize = 0;
        this._decompressor = null;
    }

    _transform(chunk, encoding, callback) {
        if (this._headerChunks) {
            this._headerChunks.push(chunk);
            this._headerSize += chunk.byteLength;
            if (this._headerSize >= 4) {
                const header = this._headerChunks.length > 1 ?
                      Buffer.concat(this._headerChunks) : this._headerChunks[0];
                this._headerChunks = null;

                if (header.readUInt32LE() === ZSTD_FRAME_MAGIC) {
                    this._decompressor = new zstd.DecompressStream();
                    this._decompressor
                        .on('data', chunk => {
                            this.push(chunk);
                        })
                        .on('end', () => {
                            this.push(null);
                        })
                        .on('error', err => {
                            this.destroy(err);
                        });
                    this._decompressor.write(header);
                } else {
                    this.push(header);
                }
            }
            return callback();
        }
        if (this._decompressor) {
            if (this._decompressor.write(chunk)) {
                return callback();
            }
            return this._decompressor.once('drain', callback);
        }
        this.push(chunk);
        return callback();
    }

    _flush(callback) {
        if (this._decompressor) {
            this._decompressor.end();
        } else {
            if (this._headerChunks) {
                this.push(Buffer.concat(this._headerChunks));
            }
            this.push(null);
        }
        callback();
    }
}

module.exports = OptionalDecompressStream;
