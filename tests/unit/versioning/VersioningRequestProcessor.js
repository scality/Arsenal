const assert = require('assert');
const async = require('async');

const Version = require('../../../lib/versioning/Version').Version;

const errors = require('../../../lib/errors');
const WGM = require('../../../lib/versioning/WriteGatheringManager');
const WriteCache = require('../../../lib/versioning/WriteCache');
const VSP = require('../../../lib/versioning/VersioningRequestProcessor');

const DELAY_MIN = 1;
const DELAY_MAX = 5;
const OP_COUNT = 1000;
const THREADS = 5;

function batchDelayGen() {
    return Math.floor(Math.random() * (DELAY_MAX - DELAY_MIN) + DELAY_MIN);
}

const logger = {
    info: () => {},
    debug: () => {},
    error: () => {},
    getSerializedUids: () => 'foo',
};

let keyValueStore = {};

function _cleanupKeyValueStore() {
    keyValueStore = {};
}

const dbapi = {
    get: (request, logger, callback) =>
        setTimeout(() => {
            const value = keyValueStore[request.key];
            if (value !== undefined) {
                callback(null, value);
            } else {
                callback(errors.ObjNotFound);
            }
        }),
    list: (request, logger, callback) =>
        setTimeout(() => {
            const allKeys = Object.keys(keyValueStore).filter(k => {
                if (request.gte !== undefined && request.gte > k) {
                    return false;
                }
                if (request.gt !== undefined && request.gt >= k) {
                    return false;
                }
                if (request.lte !== undefined && request.lte < k) {
                    return false;
                }
                if (request.lt !== undefined && request.lt <= k) {
                    return false;
                }
                return true;
            }).sort();
            const res = [];
            allKeys.forEach(k => res.push({ key: k, value: keyValueStore[k] }));
            callback(null, res);
        }),
    batch: (request, log, callback) =>
        setTimeout(() => {
            const { array } = request;
            array.forEach(op => {
                if (op.type && op.type === 'del') {
                    delete keyValueStore[op.key];
                } else {
                    keyValueStore[op.key] = op.value;
                }
            });
            callback(null);
        }, batchDelayGen()),
};
const wgm = new WGM(dbapi);
const writeCache = new WriteCache(wgm);
const vsp = new VSP(writeCache, wgm, { replicationGroupId: 'PARIS' });

function batch(callback) {
    async.times(OP_COUNT, (i, next) => {
        const request = {
            db: 'foo',
            key: `bar${i}`,
            value: '{"qux":"quz"}',
            options: { versioning: true },
        };
        setTimeout(() => vsp.put(request, logger, next), i);
    }, callback);
}

describe('test VSP', () => {
    afterEach(() => _cleanupKeyValueStore());

    it('should run a batch of operations correctly', done => {
        async.times(THREADS,
            (i, next) => setTimeout(() => batch(next), i), done);
    });

    it('should be able to repair a PHD master version', done => {
        const putRequest = {
            db: 'foo',
            key: 'bar',
            value: '{"qux":"quz"}',
            options: { versioning: true },
        };
        const getRequest = { db: 'foo', key: 'bar' };
        async.waterfall([
            callback => async.times(OP_COUNT, (i, next) =>
                vsp.put(putRequest, logger, next), (err, res) => {
                    assert.strictEqual(err, null);
                    const vidCount = res.sort().reverse().length;
                    assert.strictEqual(vidCount, OP_COUNT);
                    const latestVID = JSON.parse(res[vidCount - 1]).versionId;
                    const nextVID = JSON.parse(res[vidCount - 2]).versionId;
                    callback(null, latestVID, nextVID);
                }),
            (latestVID, nextVID, callback) => {
                const deleteRequest = { db: 'foo', key: 'bar',
                    options: { versionId: latestVID }, type: 'del' };
                vsp.del(deleteRequest, logger, err => {
                    assert.strictEqual(err, null);
                    callback(null, nextVID);
                });
            },
            (nextVID, callback) => wgm.list({}, logger, (err, list) => {
                assert.strictEqual(err, null);
                // listing result has the master version
                assert.strictEqual(list.length, OP_COUNT);
                assert(Version.isPHD(list[0].value),
                        'latest version must be a PHD version');
                // force repairing using a get request so that
                // we do not need to wait the scheduled repair
                callback(null, nextVID);
            }),
            (nextVID, callback) => vsp.get(getRequest, logger, (err, res) => {
                assert.strictEqual(err, null);
                assert.strictEqual(Version.from(res).getVersionId(), nextVID);
                // repairing using a get still takes time so we
                // just need to wait a bit
                setTimeout(() => wgm.list({}, logger, (err, list) => {
                    assert.strictEqual(err, null);
                    // listing result has the master version
                    assert.strictEqual(list.length, OP_COUNT);
                    assert.strictEqual(list[0].value, res,
                            'latest version is not repaired');
                    callback();
                }), 1000);
            }),
        ], done);
    });
    it('should allow to write a specific version + update master', done => {
        let v1;
        let v2;

        async.waterfall([next => {
            const request = {
                db: 'foo',
                key: 'bar',
                value: '{"qux":"quz"}',
                options: { versioning: true },
            };
            vsp.put(request, logger, next);
        },
        (res, next) => {
            v1 = Version.from(res).getVersionId();
            const request = {
                db: 'foo',
                key: 'bar',
                value: '{"qux":"quz2"}',
                options: { versioning: true },
            };
            vsp.put(request, logger, next);
        },
        (res, next) => {
            v2 = Version.from(res).getVersionId();

            // overwriting v1: master should not be updated
            const request = {
                db: 'foo',
                key: 'bar',
                value: '{"qux":"quz1.1"}',
                options: { versioning: true,
                           versionId: v1 },
            };
            vsp.put(request, logger, next);
        },
        (res, next) => {
            const request = {
                db: 'foo',
                key: 'bar',
            };
            vsp.get(request, logger, next);
        },
        (res, next) => {
            assert.strictEqual(JSON.parse(res).qux, 'quz2');

            // overwriting v2: master should be updated
            const request = {
                db: 'foo',
                key: 'bar',
                value: '{"qux":"quz2.1"}',
                options: { versioning: true,
                           versionId: v2 },
            };
            vsp.put(request, logger, next);
        },
        (res, next) => {
            const request = {
                db: 'foo',
                key: 'bar',
            };
            vsp.get(request, logger, next);
        },
        (res, next) => {
            assert.strictEqual(JSON.parse(res).qux, 'quz2.1');
            next();
        }],
                     done);
    });
});
