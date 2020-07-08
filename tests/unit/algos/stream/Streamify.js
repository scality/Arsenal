const stream = require('stream');

class Streamify extends stream.Readable {
    constructor(objectsToSend, errorAtEnd) {
        super({ objectMode: true });
        this._remaining = Array.from(objectsToSend);
        this._remaining.reverse();
        this._errorAtEnd = errorAtEnd || false;
        this._ended = false;
        this._destroyed = false;
    }

    _read() {
        process.nextTick(() => {
            while (this._remaining.length > 0) {
                const item = this._remaining.pop();
                if (!this.push(item)) {
                    return undefined;
                }
            }
            if (this._errorAtEnd) {
                return this.emit('error', new Error('OOPS'));
            }
            this._ended = true;
            return this.push(null);
        });
    }

    _destroy(err, callback) {
        this._destroyed = true;
        callback();
    }
}

module.exports = Streamify;
