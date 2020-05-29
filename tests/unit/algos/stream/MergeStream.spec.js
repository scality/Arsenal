const assert = require('assert');
const stream = require('stream');
const MergeStream = require('../../../../lib/algos/stream/MergeStream');

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

function compareInt(a, b) {
    return Math.sign(a - b);
}

function testMergeStreamWithIntegers(contents1, contents2,
                                     usePauseResume, errorAtEnd, cb) {
    const expectedItems = contents1.concat(contents2).sort(compareInt);
    const mergeStream = new MergeStream(
        new Streamify(contents1, errorAtEnd)
            .on('error', () => {}),
        new Streamify(contents2)
            .on('error', () => {}),
        compareInt);
    readAll(mergeStream, usePauseResume, (err, readItems) => {
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
    return `${desc1} merged with ${desc2}`;
}

describe('MergeStream', () => {
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
            stream2: [0],
        },
        {
            stream1: [0, 1, 2, 3, 4],
            stream2: [5],
        },
        {
            stream1: [1, 2],
            stream2: [3, 4, 5],
        },
        {
            stream1: [1, 2, 3],
            stream2: [4, 5],
        },
        {
            stream1: [1, 3, 5, 7, 9],
            stream2: [2, 4, 6, 8, 10],
        },
        {
            stream1: [1, 4, 7],
            stream2: [0, 2, 3, 5, 6, 8, 9, 10],
        },
        {
            stream1: [0, 10],
            stream2: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        },
        {
            stream1: [4, 5, 6],
            stream2: [1, 2, 3, 7, 8, 9],
        },
        {
            stream1: [0],
            stream2: [0],
        },
        {
            stream1: [0, 1],
            stream2: [0, 1],
        },
        {
            stream1: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
            stream2: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
        },
        {
            stream1: [0, 2, 3, 4],
            stream2: [0, 1, 2, 4],
        },
        {
            stream1: [0, 1, 2, 3],
            stream2: [1, 2, 3, 4],
        },
        {
            stream1: [0, 1, 2, 3],
            stream2: [2, 3, 4, 5, 6, 7],
        },
        {
            stream1: [0, 1, 2, 3],
            stream2: [3, 4, 5, 6],
        },
        {
            stream1: [0, 1, 2, 3],
            stream2: [0, 3],
        },
    ].forEach(testCase => {
        [false, true].forEach(usePauseResume => {
            [false, true].forEach(errorAtEnd => {
                const testDesc =
                      `${testCasePretty(testCase, false)}` +
                      `${usePauseResume ? ' with pause/resume' : ''}` +
                      `${errorAtEnd ? ' with error' : ''}`;
                it(`should cover ${testDesc}`, done => {
                    testMergeStreamWithIntegers(
                        testCase.stream1, testCase.stream2,
                        usePauseResume, errorAtEnd, done);
                });
                it(`should cover ${testDesc}`, done => {
                    testMergeStreamWithIntegers(
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
                    it(`${nbEntries} sequential entries${fixtureDesc}`,
                    function bigMergeSequential(done) {
                        this.timeout(10000);
                        const stream1 = [];
                        const stream2 = [];
                        for (let i = 0; i < nbEntries; ++i) {
                            if (Math.floor(i / (nbEntries / 10)) % 2 === 0) {
                                stream1.push(i);
                            } else {
                                stream2.push(i);
                            }
                        }
                        testMergeStreamWithIntegers(
                            stream1, stream2, usePauseResume, errorAtEnd, done);
                    });
                    it(`${nbEntries} randomly mingled entries${fixtureDesc}`,
                    function bigMergeRandom(done) {
                        this.timeout(10000);
                        const stream1 = [];
                        const stream2 = [];
                        let accu = nbEntries;
                        for (let i = 0; i < nbEntries; ++i) {
                            // picked two large arbitrary prime numbers to get a
                            // deterministic random-looking series
                            accu = (accu * 1592760451) % 8448053;
                            if (accu % 2 === 0) {
                                stream1.push(i);
                            } else {
                                stream2.push(i);
                            }
                        }
                        testMergeStreamWithIntegers(
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
            const stream1 = new Streamify(new Array(nbItemsPerStream).fill().map((e, i) => 2 * i));
            const stream2 = new Streamify(new Array(nbItemsPerStream).fill().map((e, i) => 1 + 2 * i));
            const mergeStream = new MergeStream(stream1, stream2, compareInt);
            mergeStream.on('data', item => {
                if (item === 5) {
                    mergeStream.destroy();
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
            mergeStream.once('error', err => {
                assert.fail(`unexpected error: ${err.message}`);
            });
        });
    });
});
