// fake backend for unit tests
const assert = require('assert');
const MemoryStream = require('memorystream');
const werelogs = require('werelogs');

werelogs.configure({
    level: 'info',
    dump: 'error',
});

class PersistMemInterface {

    constructor() {
        this.memoryStreams = {};
        this.offsets = {};
        this.logger = new werelogs.Logger('PersistMemInterface');
    }

    getOffset(filterName) {
        if (!this.offsets[filterName]) {
            return {};
        }
        return this.offsets[filterName];
    }

    setOffset(filterName, offset) {
        if (!this.memoryStreams[filterName]) {
            this.memoryStreams[filterName] = new MemoryStream();
        }
        if (!this.offsets[filterName]) {
            this.offsets[filterName] = {};
        }
        Object.assign(
            this.offsets[filterName],
            offset);
    }

    load(filterName, persistData, cb) {
        this.logger.info(`loading ${filterName}`);
        const stream = this.memoryStreams[filterName];
        const offset = this.offsets[filterName];
        if (stream === undefined) {
            this.logger.info(`${filterName} non-existent`);
            return cb(null, undefined);
        }
        assert(offset !== undefined);
        persistData.loadState(stream, err => {
            if (err) {
                return cb(err);
            }
            this.logger.info(`${filterName} loaded: offset ${offset}`);
            return cb(null, offset);
        });
        return undefined;
    }

    save(filterName, persistData, offset, cb) {
        this.logger.info(`saving ${filterName} offset ${JSON.stringify(offset)}`);
        const stream = new MemoryStream();
        this.memoryStreams[filterName] = stream;
        persistData.saveState(stream, err => {
            if (err) {
                return cb(err);
            }
            this.offsets[filterName] = offset;
            this.logger.info(`${filterName} saved: offset ${offset}`);
            return cb();
        });
    }
}

module.exports = PersistMemInterface;

