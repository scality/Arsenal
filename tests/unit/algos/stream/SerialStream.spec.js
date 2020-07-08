const assert = require('assert');
const SerialStream = require('../../../../lib/algos/stream/SerialStream');
const Streamify = require('./Streamify');

function readAll(stream, usePauseResume, cb) {
    const result = [];
    stream.on('data', item => {
        result.push(item);
        if (usePauseResume) {
            stream.pause();
            setTimeout(() => stream.resume(), 1);
        }
    });
    stream.once('end', () => cb(null, result));
    stream.once('error', err => cb(err));
}

function testSerialStreamWithIntegers(contents1, contents2,
                                     usePauseResume, errorAtEnd, cb) {
    const expectedItems = contents1.concat(contents2);
    const serialStream = new SerialStream(
        new Streamify(contents1, errorAtEnd)
            .on('error', () => {}),
        new Streamify(contents2)
            .on('error', () => {}));
    readAll(serialStream, usePauseResume, (err, readItems) => {
        if (errorAtEnd) {
            assert(err);
        } else {
            assert.ifError(err);
            assert.deepStrictEqual(readItems, expectedItems);
        }
        cb();
    });
}

function testCasePretty(testCase, reversed) {
    const desc1 = JSON.stringify(
        reversed ? testCase.stream2 : testCase.stream1);
    const desc2 = JSON.stringify(
        reversed ? testCase.stream1 : testCase.stream2);
    return `${desc1} concatenated with ${desc2}`;
}

describe('SerialStream', () => {
    [
        {
            stream1: [],
            stream2: [],
        },
        {
            stream1: [0],
            stream2: [],
        },
        {
            stream1: [0, 1, 2, 3, 4],
            stream2: [],
        },
        {
            stream1: [0],
            stream2: [1],
        },
        {
            stream1: [1, 2, 3, 4, 5],
            stream2: [6],
        },
        {
            stream1: [1, 2, 3, 4, 5],
            stream2: [6, 7, 8, 9, 10],
        },
    ].forEach(testCase => {
        [false, true].forEach(usePauseResume => {
            [false, true].forEach(errorAtEnd => {
                const testDesc =
                      `${testCasePretty(testCase, false)}` +
                      `${usePauseResume ? ' with pause/resume' : ''}` +
                      `${errorAtEnd ? ' with error' : ''}`;
                const testDescRev =
                      `${testCasePretty(testCase, true)}` +
                      `${usePauseResume ? ' with pause/resume' : ''}` +
                      `${errorAtEnd ? ' with error' : ''}`;
                it(`should cover ${testDesc}`, done => {
                    testSerialStreamWithIntegers(
                        testCase.stream1, testCase.stream2,
                        usePauseResume, errorAtEnd, done);
                });
                it(`should cover ${testDescRev}`, done => {
                    testSerialStreamWithIntegers(
                        testCase.stream2, testCase.stream1,
                        usePauseResume, errorAtEnd, done);
                });
            });
        });
    });
    [100, 1000, 10000, 100000].forEach(nbEntries => {
        [false, true].forEach(usePauseResume => {
            [false, true].forEach(errorAtEnd => {
                if ((!usePauseResume && !errorAtEnd) || nbEntries <= 1000) {
                    const fixtureDesc =
                          `${usePauseResume ? ' with pause/resume' : ''}` +
                          `${errorAtEnd ? ' with error' : ''}`;
                    it(`${nbEntries} entries${fixtureDesc}`,
                    function bigConcatSequential(done) {
                        this.timeout(10000);
                        const stream1 = [];
                        const stream2 = [];
                        for (let i = 0; i < nbEntries / 2; ++i) {
                            stream1.push(i);
                        }
                        for (let i = nbEntries / 2; i < nbEntries; ++i) {
                            stream2.push(i);
                        }
                        testSerialStreamWithIntegers(
                            stream1, stream2, usePauseResume, errorAtEnd, done);
                    });
                }
            });
        });
    });
    // with 3 items per input stream, we reach the end of stream even
    // though destroy() has been called (due to buffering), while with
    // 100 items input streams are aborted before emitting the 'end'
    // event, so it's useful to test both cases
    [3, 100].forEach(nbItemsPerStream => {
        it(`destroy() should destroy both inner streams with ${nbItemsPerStream} items per stream`,
        done => {
            const stream1 = new Streamify(new Array(nbItemsPerStream).fill()
                                          .map((e, i) => i));
            const stream2 = new Streamify(new Array(nbItemsPerStream).fill()
                                          .map((e, i) => nbItemsPerStream + i));
            const serialStream = new SerialStream(stream1, stream2);
            serialStream.on('data', item => {
                if (item === 5) {
                    serialStream.destroy();
                    const s1ended = stream1._ended;
                    const s2ended = stream2._ended;
                    setTimeout(() => {
                        if (!s1ended) {
                            assert(stream1._destroyed);
                        }
                        if (!s2ended) {
                            assert(stream2._destroyed);
                        }
                        done();
                    }, 10);
                }
            });
            serialStream.once('error', err => {
                assert.fail(`unexpected error: ${err.message}`);
            });
        });
    });
});
