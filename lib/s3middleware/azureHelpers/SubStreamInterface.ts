const stream = require('stream');

class SubStream extends stream.PassThrough {
    constructor(options) {
        super(options);

        this.on('stopStreamingToAzure', function stopStreamingToAzure() {
            this._abortStreaming();
        });
    }

    _abortStreaming() {
        this.push(null);
        this.end();
    }
}

/**
 * Interface for streaming subparts.
 * @class SubStreamInterface
 */
class SubStreamInterface {
    /**
     * @constructor
     * @param {stream.Readable} sourceStream - stream to read for data
     */
    constructor(sourceStream) {
        this._sourceStream = sourceStream;
        this._totalLengthCounter = 0;
        this._lengthCounter = 0;
        this._subPartIndex = 0;
        this._currentStream = new SubStream();
        this._streamingAborted = false;
    }

    /**
     * SubStreamInterface.pauseStreaming - pause data flow
     * @return {undefined}
     */
    pauseStreaming() {
        this._sourceStream.pause();
    }

    /**
     * SubStreamInterface.resumeStreaming - resume data flow
     * @return {undefined}
     */
    resumeStreaming() {
        this._sourceStream.resume();
    }

    /**
     * SubStreamInterface.endStreaming - signal end of data for last stream,
     * to be called when source stream has ended
     * @return {undefined}
     */
    endStreaming() {
        this._totalLengthCounter += this._lengthCounter;
        this._currentStream.end();
    }

    /**
     * SubStreamInterface.stopStreaming - destroy streams,
     * to be called when streaming must be stopped externally
     * @param {stream.Readable} [piper] - a stream that is piping data into
     * source stream
     * @return {undefined}
     */
    stopStreaming(piper) {
        this._streamingAborted = true;
        if (piper) {
            piper.unpipe();
        }
        this._currentStream.emit('stopStreamingToAzure');
    }

    /**
     * SubStreamInterface.getLengthCounter - return length of bytes streamed
     * for current subpart
     * @return {number} - this._lengthCounter
     */
    getLengthCounter() {
        return this._lengthCounter;
    }

    /**
     * SubStreamInterface.getTotalBytesStreamed - return total bytes streamed
     * @return {number} - this._totalLengthCounter
     */
    getTotalBytesStreamed() {
        return this._totalLengthCounter;
    }

    /**
     * SubStreamInterface.getCurrentStream - return subpart stream currently
     * being written to from source stream
     * @return {number} - this._currentStream
     */
    getCurrentStream() {
        return this._currentStream;
    }

    /**
     * SubStreamInterface.transitionToNextStream - signal end of data for
     * current stream, generate a new stream and start streaming to new stream
     * @return {object} - return object containing new current stream and
     * subpart index of current subpart
     */
    transitionToNextStream() {
        this.pauseStreaming();
        this._currentStream.end();
        this._totalLengthCounter += this._lengthCounter;
        this._lengthCounter = 0;
        this._subPartIndex++;
        this._currentStream = new SubStream();
        this.resumeStreaming();
        return {
            nextStream: this._currentStream,
            subPartIndex: this._subPartIndex,
        };
    }

    /**
     * SubStreamInterface.write - write to the current stream
     * @param {Buffer} chunk - a chunk of data
     * @return {undefined}
     */
    write(chunk) {
        if (this._streamingAborted) {
            // don't write
            return;
        }
        const ready = this._currentStream.write(chunk);

        if (!ready) {
            this.pauseStreaming();
            this._currentStream.once('drain', () => {
                this.resumeStreaming();
            });
        }
        this._lengthCounter += chunk.length;
    }
}

module.exports = SubStreamInterface;
