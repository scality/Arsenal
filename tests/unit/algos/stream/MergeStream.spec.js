const assert = require('assert');
const stream = require('stream');
const MergeStream = require('../../../../lib/algos/stream/MergeStream');

class Streamify extends stream.Readable {
    constructor(objectsToSend, errorAtEnd) {
        super({ objectMode: true });
        this._remaining = Array.from(objectsToSend);
        this._remaining.reverse();
        this._errorAtEnd = errorAtEnd || false;
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
            return this.push(null);
        });
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

function testMergeStreamWithIntegers(contents1, contents2,
                                     usePauseResume, errorAtEnd, cb) {
    const compareInt = (a, b) => {
        if (a < b) {
            return -1;
        }
        if (a > b) {
            return 1;
        }
        return 0;
    };
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
});
