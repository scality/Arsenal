const stream = require('stream');

class SerialStream extends stream.Readable {
    constructor(stream1, stream2) {
        super({ objectMode: true });

        this._streams = [stream1, stream2];
        this._currentStream = stream1;
        this._streamToResume = null;

        stream1.on('data', item => this._onItem(stream1, item));
        stream1.once('end', () => this._onEndStream1());
        stream1.once('error', err => this._onError(stream1, err));
    }

    _read() {
        if (this._streamToResume) {
            this._streamToResume.resume();
            this._streamToResume = null;
        }
    }

    _destroy(err, callback) {
        this._currentStream.destroy();
        if (this._currentStream === this._streams[0]) {
            this._streams[1].destroy();
        }
        callback();
    }

    _onItem(myStream, item) {
        if (!this.push(item)) {
            myStream.pause();
            this._streamToResume = myStream;
        }
    }

    _onEndStream1() {
        // stream1 is done, now move on with data from stream2
        const stream2 = this._streams[1];
        stream2.on('data', item => this._onItem(stream2, item));
        stream2.once('end', () => this._onEnd());
        stream2.once('error', err => this._onError(stream2, err));
    }

    _onEnd() {
        this.push(null);
    }

    _onError(myStream, err) {
        this.emit('error', err);
        this._destroy(err, () => {});
    }
}

module.exports = SerialStream;
