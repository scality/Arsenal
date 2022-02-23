import { Readable } from 'stream';


/**
 * This class is used to produce zeros filled buffers for a reader consumption
 */
export default class NullStream extends Readable {
    /**
     * Construct a new zeros filled buffers producer that will
     * produce as much bytes as specified by the range parameter, or the size
     * parameter if range is null or not constituted of 2 elements
     * @constructor
     * @param {integer} size - the number of null bytes to produce
     * @param {array} range - a range specification to override to size
     */
    constructor(size, range) {
        super({});
        if (Array.isArray(range) && range.length === 2) {
            this.bytesToRead = range[1] - range[0] + 1;
        } else {
            this.bytesToRead = size;
        }
    }

    /**
     * This function generates the stream of null bytes
     *
     * @param {integer} size - advisory amount of data to produce
     * @returns {undefined}
     */
    _read(size) {
        const toRead = Math.min(size, this.bytesToRead);
        const buffer = toRead > 0
            ? Buffer.alloc(toRead, 0)
            : null;
        this.bytesToRead -= toRead;
        this.push(buffer);
    }
}
