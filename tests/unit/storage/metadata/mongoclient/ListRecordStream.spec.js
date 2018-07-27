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

describe('mongoclient.ListRecordStream', () => {
    const lastEndIDEntry = {
        h: -43,
        ts: Timestamp.fromNumber(42),
    };
    Object.keys(mongoProcessedLogEntries).forEach(entryType => {
        it(`should transform ${entryType}`, done => {
            const lrs = new ListRecordStream(logger,
                                             lastEndIDEntry.h.toString());
            let dataReceived = false;
            lrs.on('info', info => {
                assert(dataReceived);
                const parsedInfo = info;
                parsedInfo.end = JSON.parse(parsedInfo.end);
                assert.deepStrictEqual(parsedInfo, {
                    end: { ts: 42, uniqID: '-42' },
                });
                return done();
            });
            lrs.on('data', entry => {
                assert.deepStrictEqual(entry, expectedStreamEntries[entryType]);
                dataReceived = true;
            });
            // first write will be ignored by ListRecordStream because
            // of the last end ID (-42), it's needed though to bootstrap it
            lrs.write(lastEndIDEntry);
            lrs.write(mongoProcessedLogEntries[entryType]);
            lrs.end();
        });
    });
    it('should ignore other entry types', done => {
        const lrs = new ListRecordStream(logger, lastEndIDEntry.h.toString());
        let infoEmitted = false;
        lrs.on('info', info => {
            const parsedInfo = info;
            parsedInfo.end = JSON.parse(parsedInfo.end);
            assert.deepStrictEqual(parsedInfo, {
                end: { ts: 42, uniqID: '-42' },
            });
            infoEmitted = true;
        });
        lrs.on('data', entry => {
            assert(false, `ListRecordStream did not ignore entry ${entry}`);
        });
        lrs.on('end', () => {
            assert(infoEmitted);
            done();
        });
        // first write will be ignored by ListRecordStream because
        // of the last end ID (-43), it's needed though to bootstrap it
        lrs.write(lastEndIDEntry);
        Object.keys(mongoIgnoredLogEntries).forEach(entryType => {
            lrs.write(mongoIgnoredLogEntries[entryType]);
        });
        lrs.end();
    });
    it('should emit info even if no entry consumed', done => {
        const lrs = new ListRecordStream(logger, lastEndIDEntry.h.toString());
        let infoEmitted = false;
        lrs.on('info', info => {
            const parsedInfo = info;
            parsedInfo.end = JSON.parse(parsedInfo.end);
            assert.deepStrictEqual(parsedInfo, {
                end: { ts: 0, uniqID: null },
            });
            infoEmitted = true;
        });
        lrs.on('data', () => {
            assert(false, 'did not expect data from ListRecordStream');
        });
        lrs.on('end', () => {
            assert(infoEmitted);
            done();
        });
        lrs.end();
    });
    it('should skip entries until uniqID is encountered', done => {
        const logEntries = [
            Object.assign({}, mongoProcessedLogEntries.insert,
                          { h: 1234 }),
            Object.assign({}, mongoProcessedLogEntries.insert,
                          { h: 5678 }),
            Object.assign({}, mongoProcessedLogEntries.insert,
                          { h: -1234 }),
            Object.assign({}, mongoProcessedLogEntries.insert,
                          { h: 2345 }),
        ];
        const lrs = new ListRecordStream(logger, '5678');
        let nbReceivedEntries = 0;
        let infoEmitted = false;
        lrs.on('info', info => {
            infoEmitted = true;
            const parsedInfo = info;
            parsedInfo.end = JSON.parse(parsedInfo.end);
            assert.deepStrictEqual(parsedInfo, {
                end: { ts: 42, uniqID: '2345' },
            });
        });
        lrs.on('data', entry => {
            assert.deepStrictEqual(entry, expectedStreamEntries.insert);
            ++nbReceivedEntries;
        });
        lrs.on('end', () => {
            assert.strictEqual(nbReceivedEntries, 2);
            assert(infoEmitted);
            done();
        });
        logEntries.forEach(entry => lrs.write(entry));
        lrs.end();
    });
});
