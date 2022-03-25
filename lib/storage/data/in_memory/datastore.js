const stream = require('stream');
const werelogs = require('werelogs');

const errors = require('../../../errors').default;

const logger = new werelogs.Logger('MemDataBackend');

function createLogger(reqUids) {
    return reqUids ?
        logger.newRequestLoggerFromSerializedUids(reqUids) :
        logger.newRequestLogger();
}

const ds = [];
let count = 1; // keys are assessed with if (!key)

function resetCount() {
    count = 1;
}

const backend = {
    toObjectGetInfo: function toObjectGetInfo(objectKey) {
        return { key: objectKey };
    },

    put: function putMem(request, size, keyContext, reqUids, callback) {
        const log = createLogger(reqUids);
        const value = Buffer.alloc(size);
        let cursor = 0;
        let exceeded = false;
        request.on('data', data => {
            if (cursor + data.length > size) {
                exceeded = true;
            }
            if (!exceeded) {
                data.copy(value, cursor);
            }
            cursor += data.length;
        })
            .on('end', () => {
                if (exceeded) {
                    log.error('data stream exceed announced size',
                        { size, overflow: cursor });
                    callback(errors.InternalError);
                } else {
                    ds[count] = { value, keyContext };
                    callback(null, count++);
                }
            });
    },

    get: function getMem(objectGetInfo, range, reqUids, callback) {
        const key = objectGetInfo.key ? objectGetInfo.key : objectGetInfo;
        process.nextTick(() => {
            if (!ds[key]) { return callback(errors.NoSuchKey); }
            const storedBuffer = ds[key].value;
            // If a range was sent, use the start from the range.
            // Otherwise, start at 0
            let start = range ? range[0] : 0;
            // If a range was sent, use the end from the range.
            // End of range should be included so +1
            // Otherwise, get the full length
            const end = range ? range[1] + 1 : storedBuffer.length;
            const chunkSize = 64 * 1024; // 64KB
            const val = new stream.Readable({
                read: function read() {
                    // sets this._read under the hood
                    // push data onto the read queue, passing null
                    // will signal the end of the stream (EOF)
                    while (start < end) {
                        const finish =
                            Math.min(start + chunkSize, end);
                        this.push(storedBuffer.slice(start, finish));
                        start += chunkSize;
                    }
                    if (start >= end) {
                        this.push(null);
                    }
                },
            });
            return callback(null, val);
        });
    },

    delete: function delMem(objectGetInfo, reqUids, callback) {
        const key = objectGetInfo.key ? objectGetInfo.key : objectGetInfo;
        process.nextTick(() => {
            delete ds[key];
            return callback(null);
        });
    },
};

module.exports = {
    backend,
    ds,
    resetCount,
};
