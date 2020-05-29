const stream = require('stream');

class MergeStream extends stream.Readable {
    constructor(stream1, stream2, compare) {
        super({ objectMode: true });

        this._compare = compare;
        this._streams = [stream1, stream2];

        // peekItems elements represent the latest item consumed from
        // the respective input stream but not yet pushed. It can also
        // be one of the following special values:
        // - undefined: stream hasn't started emitting items
        // - null: EOF reached and no more item to peek
        this._peekItems = [undefined, undefined];
        this._streamEof = [false, false];
        this._streamToResume = null;

        stream1.on('data', item => this._onItem(stream1, item, 0, 1));
        stream1.once('end', () => this._onEnd(stream1, 0, 1));
        stream1.once('error', err => this._onError(stream1, err, 0, 1));

        stream2.on('data', item => this._onItem(stream2, item, 1, 0));
        stream2.once('end', () => this._onEnd(stream2, 1, 0));
        stream2.once('error', err => this._onError(stream2, err, 1, 0));
    }

    _read() {
        if (this._streamToResume) {
            this._streamToResume.resume();
            this._streamToResume = null;
        }
    }

    _destroy(err, callback) {
        for (let i = 0; i < 2; ++i) {
            if (!this._streamEof[i]) {
                this._streams[i].destroy();
            }
        }
        callback();
    }

    _onItem(myStream, myItem, myIndex, otherIndex) {
        this._peekItems[myIndex] = myItem;
        const otherItem = this._peekItems[otherIndex];
        if (otherItem === undefined) {
            // wait for the other stream to wake up
            return myStream.pause();
        }
        if (otherItem === null || this._compare(myItem, otherItem) <= 0) {
            if (!this.push(myItem)) {
                myStream.pause();
                this._streamToResume = myStream;
            }
            return undefined;
        }
        const otherStream = this._streams[otherIndex];
        const otherMore = this.push(otherItem);
        if (this._streamEof[otherIndex]) {
            this._peekItems[otherIndex] = null;
            return this.push(myItem);
        }
        myStream.pause();
        if (otherMore) {
            return otherStream.resume();
        }
        this._streamToResume = otherStream;
        return undefined;
    }

    _onEnd(myStream, myIndex, otherIndex) {
        this._streamEof[myIndex] = true;
        if (this._peekItems[myIndex] === undefined) {
            this._peekItems[myIndex] = null;
        }
        const myItem = this._peekItems[myIndex];
        const otherItem = this._peekItems[otherIndex];
        if (otherItem === undefined) {
            // wait for the other stream to wake up
            return undefined;
        }
        if (otherItem === null) {
            return this.push(null);
        }
        if (myItem === null || this._compare(myItem, otherItem) <= 0) {
            this.push(otherItem);
            this._peekItems[myIndex] = null;
        }
        if (this._streamEof[otherIndex]) {
            return this.push(null);
        }
        const otherStream = this._streams[otherIndex];
        return otherStream.resume();
    }

    _onError(myStream, err, myIndex, otherIndex) {
        myStream.destroy();
        if (this._streams[otherIndex]) {
            this._streams[otherIndex].destroy();
        }
        this.emit('error', err);
    }
}

module.exports = MergeStream;
