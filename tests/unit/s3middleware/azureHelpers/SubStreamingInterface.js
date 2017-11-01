const assert = require('assert');
const stream = require('stream');
const SubStreamInterface =
    require('../../../../lib/s3middleware/azureHelpers/SubStreamInterface');

describe('s3middleware SubStreamInterface.stopStreaming()', () => {
    const eventsEmitted = {
        sourceStreamUnpiped: false,
        currentStreamStopStreamingToAzure: false,
        currentStreamEnded: false,
    };
    const expectedSequence = {
        sourceStreamUnpiped: 0,
        currentStreamStopStreamingToAzure: 1,
        currentStreamEnded: 2,
    };
    const data = Buffer.alloc(100);
    let dataMarker = 0;
    let eventSequence = 0;
    const mockRequest = new stream.Readable({
        read: () => {
            if (dataMarker >= data.length) {
                return mockRequest.push(null);
            }
            mockRequest.push(data.slice(dataMarker, dataMarker + 1));
            dataMarker += 1;
            return undefined;
        },
    });
    const sourceStream = new stream.PassThrough();
    const subStreamInterface = new SubStreamInterface(sourceStream);
    sourceStream.on('unpipe', () => {
        eventsEmitted.sourceStreamUnpiped = eventSequence++;
    });
    subStreamInterface._currentStream.on('stopStreamingToAzure', () => {
        eventsEmitted.currentStreamStopStreamingToAzure = eventSequence++;
    });
    subStreamInterface._currentStream.on('finish', () => {
        eventsEmitted.currentStreamEnded = eventSequence++;
    });
    it('should stop streaming data and end current stream', done => {
        sourceStream.on('data', chunk => {
            const currentLength = subStreamInterface.getLengthCounter();
            if (currentLength === 10) {
                Object.keys(eventsEmitted).forEach(key => {
                    assert.strictEqual(eventsEmitted[key], false);
                });
                assert.strictEqual(mockRequest._readableState.pipesCount, 1);
                return subStreamInterface.stopStreaming(mockRequest);
            }
            return subStreamInterface.write(chunk);
        });
        mockRequest.pipe(sourceStream);
        setTimeout(() => {
            Object.keys(eventsEmitted).forEach(key => {
                assert.strictEqual(eventsEmitted[key], expectedSequence[key]);
            });
            assert.strictEqual(subStreamInterface.getLengthCounter(), 10);
            assert.strictEqual(mockRequest._readableState.pipesCount, 0);
            return done();
        }, 1000);
    });
});
