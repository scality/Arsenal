const assert = require('assert');
const { Timestamp } = require('bson');

const ListRecordStream = require(
    '../../../../../lib/storage/metadata/mongoclient/ListRecordStream');
const DummyRequestLogger = require('./utils/DummyRequestLogger');

const logger = new DummyRequestLogger();

const mongoProcessedLogEntries = {
    insert: {
        h: -42,
        ts: Timestamp.fromNumber(42),
        op: 'i',
        ns: 'metadata.replicated-bucket',
        o: {
            _id: 'replicated-key\u000098467518084696999999RG001  19.3',
            value: {
                someField: 'someValue',
            },
        },
    },
    updateObject: {
        h: -42,
        ts: Timestamp.fromNumber(42),
        op: 'u',
        ns: 'metadata.replicated-bucket',
        o2: {
            _id: 'replicated-key\u000098467518084696999999RG001  19.3',
        },
        o: {
            $set: {
                value: {
                    someField: 'someUpdatedValue',
                },
            },
        },
    },
    deleteObject: {
        h: -42,
        ts: Timestamp.fromNumber(42),
        op: 'd',
        ns: 'metadata.replicated-bucket',
        o: {
            _id: 'replicated-key\u000098467518084696999999RG001  19.3',
        },
    },
    putBucketAttributes: {
        h: -42,
        ts: Timestamp.fromNumber(42),
        op: 'u',
        ns: 'metadata.__metastore',
        o2: {
            _id: 'new-bucket',
        }, o: {
            _id: 'new-bucket',
            value: {
                someField: 'someValue',
            },
        },
    },
    deleteBucket: {
        h: -42,
        ts: Timestamp.fromNumber(42),
        op: 'd',
        ns: 'metadata.__metastore',
        o: {
            _id: 'new-bucket',
        },
    },
};

const mongoIgnoredLogEntries = {
    createBucket: {
        h: -42,
        ts: Timestamp.fromNumber(42),
        op: 'c',
        ns: 'metadata.$cmd',
        o: {
            create: 'new-bucket',
            idIndex: {
                v: 2,
                key: { _id: 1 },
                name: '_id_',
                ns: 'metadata.new-bucket',
            },
        },
    },
    dropBucketDb: {
        h: -42,
        ts: Timestamp.fromNumber(42),
        op: 'c',
        ns: 'metadata.$cmd',
        o: {
            drop: 'new-bucket',
        },
    },
};

const expectedStreamEntries = {
    insert: {
        db: 'replicated-bucket',
        entries: [
            {
                key: 'replicated-key\u000098467518084696999999RG001  19.3',
                type: 'put',
                value: '{"someField":"someValue"}',
            },
        ],
        timestamp: new Date(42000),
    },
    updateObject: {
        db: 'replicated-bucket',
        entries: [
            {
                key: 'replicated-key\u000098467518084696999999RG001  19.3',
                type: 'put',
                value: '{"someField":"someUpdatedValue"}',
            },
        ],
        timestamp: new Date(42000),
    },
    deleteObject: {
        db: 'replicated-bucket',
        entries: [
            {
                key: 'replicated-key\u000098467518084696999999RG001  19.3',
                type: 'delete',
            },
        ],
        timestamp: new Date(42000),
    },
    putBucketAttributes: {
        db: '__metastore',
        entries: [
            {
                key: 'new-bucket',
                type: 'put',
                value: '{"someField":"someValue"}',
            },
        ],
        timestamp: new Date(42000),
    },
    deleteBucket: {
        db: '__metastore',
        entries: [
            {
                key: 'new-bucket',
                type: 'delete',
            },
        ],
        timestamp: new Date(42000),
    },
    dropBucketDb: {
        h: -42,
        op: 'c',
        ns: 'metadata.$cmd',
        o: {
            drop: 'new-bucket',
        },
    },
};

class MongoCursorMock {
    constructor(itemsToYield, errorAtPos) {
        this.itemsToYield = itemsToYield;
        this.pos = 0;
        this.errorAtPos = errorAtPos;
    }

    next(cb) {
        // if there's no more item, just hang out there waiting for
        // items that will never come (this is how the real mongo
        // tailable cursor would behave)
        if (this.pos === this.errorAtPos) {
            return process.nextTick(() => cb(new Error('boo')));
        }
        if (!this.hasSentAllItems()) {
            const pos = this.pos;
            this.pos += 1;
            return process.nextTick(() => cb(null, this.itemsToYield[pos]));
        }
        return undefined;
    }
    hasSentAllItems() {
        return this.pos === this.itemsToYield.length;
    }
}

describe('mongoclient.ListRecordStream', () => {
    const lastEndIDEntry = {
        h: -43,
        ts: Timestamp.fromNumber(42),
    };
    Object.keys(mongoProcessedLogEntries).forEach(entryType => {
        it(`should transform ${entryType}`, done => {
            // first write will be ignored by ListRecordStream because
            // of the last end ID (-42), it's needed though to bootstrap it
            const cursor = new MongoCursorMock([
                lastEndIDEntry,
                mongoProcessedLogEntries[entryType],
            ]);
            const lrs = new ListRecordStream(cursor, logger,
                                             lastEndIDEntry.h.toString());
            let hasReceivedData = false;
            lrs.on('data', entry => {
                assert.strictEqual(hasReceivedData, false);
                hasReceivedData = true;
                assert.deepStrictEqual(entry, expectedStreamEntries[entryType]);
                if (cursor.hasSentAllItems()) {
                    assert.strictEqual(hasReceivedData, true);
                    assert.deepStrictEqual(JSON.parse(lrs.getOffset()),
                                           { uniqID: '-42' });
                    done();
                }
            });
        });
    });
    it('should ignore other entry types', done => {
        // first write will be ignored by ListRecordStream because
        // of the last end ID (-43), it's needed though to bootstrap it
        const logEntries = [lastEndIDEntry];
        Object.keys(mongoIgnoredLogEntries).forEach(entryType => {
            logEntries.push(mongoIgnoredLogEntries[entryType]);
        });
        const cursor = new MongoCursorMock(logEntries);
        const lrs = new ListRecordStream(cursor, logger,
                                         lastEndIDEntry.h.toString());
        lrs.on('data', entry => {
            assert(false, `ListRecordStream did not ignore entry ${entry}`);
        });
        setTimeout(() => {
            assert.strictEqual(cursor.hasSentAllItems(), true);
            assert.deepStrictEqual(JSON.parse(lrs.getOffset()),
                                   { uniqID: '-42' });
            done();
        }, 200);
    });
    it('should skip entries until uniqID is encountered', done => {
        const logEntries = [
            Object.assign({}, mongoProcessedLogEntries.insert,
                          { h: 1234, ts: Timestamp.fromNumber(45) }),
            Object.assign({}, mongoProcessedLogEntries.insert,
                          { h: 5678, ts: Timestamp.fromNumber(44) }),
            Object.assign({}, mongoProcessedLogEntries.insert,
                          { h: -1234, ts: Timestamp.fromNumber(42) }),
            Object.assign({}, mongoProcessedLogEntries.insert,
                          { h: 2345, ts: Timestamp.fromNumber(42) }),
        ];
        const cursor = new MongoCursorMock(logEntries);
        const lrs = new ListRecordStream(cursor, logger, '5678');
        assert.strictEqual(lrs.reachedUnpublishedListing(), false);
        let nbReceivedEntries = 0;
        lrs.on('data', entry => {
            assert.deepStrictEqual(entry, expectedStreamEntries.insert);
            assert.strictEqual(lrs.reachedUnpublishedListing(), true);
            ++nbReceivedEntries;
            if (cursor.hasSentAllItems()) {
                assert.strictEqual(nbReceivedEntries, 2);
                assert.deepStrictEqual(JSON.parse(lrs.getOffset()),
                                       { uniqID: '2345' });
                assert.strictEqual(lrs.getSkipCount(), 2);
                assert.strictEqual(lrs.reachedUnpublishedListing(), true);
                done();
            }
        });
    });

    it('should start after latest entry if uniqID is not encountered', done => {
        const logEntries = [
            Object.assign({}, mongoProcessedLogEntries.insert,
                          { h: 1234, ts: Timestamp.fromNumber(45) }),
            Object.assign({}, mongoProcessedLogEntries.insert,
                          { h: 5678, ts: Timestamp.fromNumber(44) }),
            Object.assign({}, mongoProcessedLogEntries.insert,
                          { h: -1234, ts: Timestamp.fromNumber(42) }),
            Object.assign({}, mongoProcessedLogEntries.insert,
                          { h: 2345, ts: Timestamp.fromNumber(42) }),
        ];
        const cursor = new MongoCursorMock(logEntries);
        const lrs = new ListRecordStream(cursor, logger, '4242', '-1234');
        let nbReceivedEntries = 0;
        lrs.on('data', entry => {
            assert.deepStrictEqual(entry, expectedStreamEntries.insert);
            ++nbReceivedEntries;
            if (cursor.hasSentAllItems()) {
                assert.strictEqual(nbReceivedEntries, 1);
                assert.deepStrictEqual(JSON.parse(lrs.getOffset()),
                                       { uniqID: '2345' });
                assert.strictEqual(lrs.getSkipCount(), 3);
                assert.strictEqual(lrs.reachedUnpublishedListing(), true);
                done();
            }
        });
    });
    it('should consume from the first entry if there is no saved ID', done => {
        const logEntries = [
            Object.assign({}, mongoProcessedLogEntries.insert,
                          { h: 1234, ts: Timestamp.fromNumber(42) }),
            Object.assign({}, mongoProcessedLogEntries.insert,
                          { h: 5678, ts: Timestamp.fromNumber(42) }),
            Object.assign({}, mongoProcessedLogEntries.insert,
                          { h: -1234, ts: Timestamp.fromNumber(42) }),
            Object.assign({}, mongoProcessedLogEntries.insert,
                          { h: 2345, ts: Timestamp.fromNumber(42) }),
        ];
        const cursor = new MongoCursorMock(logEntries);
        const lrs = new ListRecordStream(cursor, logger, undefined, '-1234');
        let nbReceivedEntries = 0;
        lrs.on('data', entry => {
            assert.deepStrictEqual(entry, expectedStreamEntries.insert);
            ++nbReceivedEntries;
            if (cursor.hasSentAllItems()) {
                assert.strictEqual(nbReceivedEntries, 4);
                assert.deepStrictEqual(JSON.parse(lrs.getOffset()),
                                       { uniqID: '2345' });
                assert.strictEqual(lrs.getSkipCount(), 0);
                assert.strictEqual(lrs.reachedUnpublishedListing(), true);
                done();
            }
        });
    });
    it('should emit an error event when cursor returns an error', done => {
        const cursor = new MongoCursorMock([], 0);
        const lrs = new ListRecordStream(cursor, logger, '4242', '-1234');
        lrs.on('data', () => {
            assert(false, 'did not expect data');
        });
        lrs.on('error', () => done());
    });

    it('should support bucket names with dots', done => {
        const logEntry = {
            h: -42,
            ts: Timestamp.fromNumber(42),
            op: 'i',
            ns: 'metadata.some.bucket.with.dots',
            o: {
                _id: 'replicated-key\u000098467518084696999999RG001  19.3',
                value: {
                    someField: 'someValue',
                },
            },
        };
        const expectedLogEntry = {
            db: 'some.bucket.with.dots',
            entries: [
                {
                    key: 'replicated-key\u000098467518084696999999RG001  19.3',
                    type: 'put',
                    value: '{"someField":"someValue"}',
                },
            ],
            timestamp: new Date(42000),
        };
        const cursor = new MongoCursorMock([
            lastEndIDEntry,
            logEntry,
        ]);
        const lrs = new ListRecordStream(cursor, logger,
                                         lastEndIDEntry.h.toString());
        lrs.on('data', entry => {
            assert.deepStrictEqual(entry, expectedLogEntry);
            done();
        });
    });

    it('should support tags with dots and dollars', done => {
        const logEntry = {
            h: -42,
            ts: Timestamp.fromNumber(42),
            op: 'i',
            ns: 'some-bucket',
            o: {
                _id: 'replicated-key\u000098467518084696999999RG001  19.3',
                value: {
                    tags: {
                        'some\uFF04weird\uFF0Ekey':
                        'some\uFF04weird\uFF0Evalue',
                    },
                },
            },
        };
        const expectedLogEntry = {
            db: 'some-bucket',
            entries: [
                {
                    key: 'replicated-key\u000098467518084696999999RG001  19.3',
                    type: 'put',
                    value: '{"tags":{"some$weird.key":"some$weird.value"}}',
                },
            ],
            timestamp: new Date(42000),
        };
        const cursor = new MongoCursorMock([
            lastEndIDEntry,
            logEntry,
        ]);
        const lrs = new ListRecordStream(cursor, logger,
                                         lastEndIDEntry.h.toString());
        lrs.on('data', entry => {
            assert.deepStrictEqual(entry, expectedLogEntry);
            done();
        });
    });
});
