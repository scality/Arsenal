import { Transform } from 'stream';
import * as crypto from 'crypto';

/**
 * This class is design to compute md5 hash at the same time as sending
 * data through a stream
 */
export default class MD5Sum extends Transform {
    hash: ReturnType<typeof crypto.createHash>;
    completedHash?: string;

    constructor() {
        super({});
        this.hash = crypto.createHash('md5');
        this.completedHash = undefined;
    }

    /**
     * This function will update the current md5 hash with the next chunk
     *
     * @param chunk - Chunk to compute
     * @param encoding - Data encoding
     * @param callback - Callback(err, chunk, encoding)
     */
    _transform(
        chunk: string,
        encoding: crypto.Encoding,
        callback: (
            err: Error | null,
            chunk: string,
            encoding: crypto.Encoding,
        ) => void,
    ) {
        this.hash.update(chunk, encoding);
        callback(null, chunk, encoding);
    }

    /**
     * This function will end the hash computation
     *
     * @param callback(err)
     */
    _flush(callback: (err: Error | null) => void) {
        this.completedHash = this.hash.digest('hex');
        this.emit('hashed');
        callback(null);
    }
}
