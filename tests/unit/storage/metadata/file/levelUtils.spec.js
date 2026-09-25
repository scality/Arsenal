'use strict'; //eslint-disable-line

const assert = require('assert');
const temp = require('temp');
const { ClassicLevel } = require('classic-level');

const {
    openSubLevel,
    createReadStream,
    createKeyStream,
    resolveBatchSubLevels,
} = require('../../../../../lib/storage/metadata/file/levelUtils');

temp.track();

function collect(stream, cb) {
    const entries = [];
    stream.on('data', entry => entries.push(entry));
    stream.on('error', cb);
    stream.on('end', () => cb(null, entries));
}

describe('levelUtils - level-sublevel compatibility', () => {
    let rootDb;

    beforeAll(done => {
        temp.mkdir('leveldb-testdir-', (err, dbDir) => {
            assert.ifError(err);
            rootDb = new ClassicLevel(dbDir);
            done();
        });
    });

    afterAll(() => rootDb.close());

    describe('on-disk key encoding', () => {
        // Databases written by level-sublevel must stay readable: keys are
        // '!<path joined with #>!<key>', whatever the sublevel depth.
        it('should encode keys the way level-sublevel did', async () => {
            await openSubLevel(rootDb, []).put('rootKey', 'v');
            await openSubLevel(rootDb, ['..recordLogs']).put('logsKey', 'v');
            await openSubLevel(rootDb, ['..recordLogs', 's3-recordlog']).put('nestedKey', 'v');

            const keys = await rootDb.keys().all();
            assert(keys.includes('!!rootKey'));
            assert(keys.includes('!..recordLogs!logsKey'));
            assert(keys.includes('!..recordLogs#s3-recordlog!nestedKey'));
        });

        it('should hide the prefix from sublevel readers', done => {
            const sub = openSubLevel(rootDb, ['bucket1']);
            sub.put('obj', 'v').then(() => {
                collect(createReadStream(sub), (err, entries) => {
                    assert.ifError(err);
                    assert.deepStrictEqual(entries, [{ key: 'obj', value: 'v' }]);
                    done();
                });
            }, done);
        });
    });

    describe('resolveBatchSubLevels', () => {
        it('should honour the per-operation sublevel prefix', async () => {
            await rootDb.batch(
                resolveBatchSubLevels(rootDb, [
                    { type: 'put', prefix: ['..recordLogs', 'other'], key: 'batched', value: 'v' },
                ]),
            );
            const value = await openSubLevel(rootDb, ['..recordLogs', 'other']).get('batched');
            assert.strictEqual(value, 'v');
        });
    });

    describe('streams', () => {
        let ranged;

        beforeAll(() => {
            ranged = openSubLevel(rootDb, ['ranged']);
            return ranged.batch([
                { type: 'put', key: 'k1', value: 'v' },
                { type: 'put', key: 'k2', value: 'v' },
                { type: 'put', key: 'k3', value: 'v' },
            ]);
        });

        it('should clamp to the requested range', done => {
            collect(createKeyStream(ranged, { gte: 'k2', lte: 'k3' }), (err, keys) => {
                assert.ifError(err);
                assert.deepStrictEqual(keys, ['k2', 'k3']);
                done();
            });
        });

        it('should support reverse listing', done => {
            collect(createKeyStream(ranged, { reverse: true, limit: 1 }), (err, keys) => {
                assert.ifError(err);
                assert.deepStrictEqual(keys, ['k3']);
                done();
            });
        });

        it('should release the iterator when the reader stops early', done => {
            const stream = createKeyStream(ranged);
            stream.once('data', () => stream.destroy());
            stream.on('close', () => {
                assert.strictEqual(stream.iteratorClosed, true);
                done();
            });
        });
    });
});
