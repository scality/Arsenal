const assert = require('assert');
const PersistMemInterface = require('../../../../../lib/storage/metadata/oplog/PersistMemInterface');

class PersistDataInterface {

    constructor(obj) {
        this.obj = obj;
    }

    loadState(stream, cb) {
        const chunks = [];
        stream.on('data', chunk => {
            chunks.push(chunk);
        });
        stream.on('end', () => {
            this.obj = JSON.parse(Buffer.concat(chunks));
            return cb();
        });
    }

    saveState(stream, cb) {
        stream.write(JSON.stringify(this.obj));
        stream.end();
        return cb();
    }
}

describe('Persist Mem', () => {
    const persist = new PersistMemInterface();
    const filterName = 'foo';

    it('basic operations', done => {
        const pd1 = new PersistDataInterface({
            foo: 'bar',
            bar: {
                qux: 42,
                quuux: false,
            },
        });
        const pd2 = new PersistDataInterface();
        persist.save(filterName, pd1, 42, err => {
            if (err) {
                return done(err);
            }
            persist.load(filterName, pd2, err => {
                if (err) {
                    return done(err);
                }
                assert.deepEqual(pd1.obj, pd2.obj);
                return done();
            });
            return undefined;
        });
    });
});
