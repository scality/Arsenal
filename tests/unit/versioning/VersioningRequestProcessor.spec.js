const assert = require('assert');
const async = require('async');

const Version = require('../../../lib/versioning/Version').Version;

const errors = require('../../../lib/errors').default;
const WGM = require('../../../lib/versioning/WriteGatheringManager').default;
const WriteCache = require('../../../lib/versioning/WriteCache').default;
const VRP = require('../../../lib/versioning/VersioningRequestProcessor').default;
const { VersioningConstants } = require('../../../lib/versioning/constants');
const VID = require('../../../lib/versioning/VersionID');

const DELAY_MIN = 1;
const DELAY_MAX = 5;
const OP_COUNT = 1000;
const THREADS = 5;

function batchDelayGen() {
    return Math.floor(Math.random() * (DELAY_MAX - DELAY_MIN) + DELAY_MIN);
}

/**
 * Increment the charCode of the last character of a valid string.
 *
 * @param {string} str - the input string
 * @return {string} - the incremented string
 *                    or the input if it is not valid
 */
function inc(str) {
    return str ? (str.slice(0, str.length - 1) +
            String.fromCharCode(str.charCodeAt(str.length - 1) + 1)) : str;
}

const VID_SEP = VersioningConstants.VersionId.Separator;
const VID_SEPPLUS = inc(VID_SEP);

const logger = {
    info: () => {},
    debug: () => {},
    error: () => {},
    addDefaultFields: () => {},
    getSerializedUids: () => 'foo',
};

const vcfg = { replicationGroupId: 'PARIS' };

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
const vrp = new VRP(writeCache, wgm, vcfg);

function batch(callback) {
    async.times(OP_COUNT, (i, next) => {
        const request = {
            db: 'foo',
            key: `bar${i}`,
            value: '{"qux":"quz"}',
            options: { versioning: true },
        };
        setTimeout(() => vrp.put(request, logger, next), i);
    }, callback);
}

function randkey(length = 15) {
    let key = '';
    for (let i = 0; i < length; i++) {
        key += String.fromCharCode(Math.floor(Math.random() * 94 + 32));
    }
    return key;
}

function getVersionKey(key, versionId) {
    return `${key}\0${versionId}`;
}

const fixedVersionId = '98512315901154999993SCALI 0.2eae83fb';


describe('test VRP', () => {
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
                vrp.put(putRequest, logger, next), (err, res) => {
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
                vrp.del(deleteRequest, logger, err => {
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
            (nextVID, callback) => vrp.get(getRequest, logger, (err, res) => {
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
            vrp.put(request, logger, next);
        },
        (res, next) => {
            v1 = Version.from(res).getVersionId();
            const request = {
                db: 'foo',
                key: 'bar',
                value: '{"qux":"quz2"}',
                options: { versioning: true },
            };
            vrp.put(request, logger, next);
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
            vrp.put(request, logger, next);
        },
        (res, next) => {
            const request = {
                db: 'foo',
                key: 'bar',
            };
            vrp.get(request, logger, next);
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
            vrp.put(request, logger, next);
        },
        (res, next) => {
            const request = {
                db: 'foo',
                key: 'bar',
            };
            vrp.get(request, logger, next);
        },
        (res, next) => {
            assert.strictEqual(JSON.parse(res).qux, 'quz2.1');
            next();
        }],
        done);
    });

    it('should be able to put Metadata on top of a standalone null version', done => {
        const versionId = '00000000000000999999PARIS  ';

        async.waterfall([next => {
            // simulate the creation of a standalone null version.
            const request = {
                db: 'foo',
                key: 'bar',
                value: '{"qux":"quz"}',
                options: {},
            };
            vrp.put(request, logger, next);
        },
        (res, next) => {
            // simulate a BackbeatClient.putMetadata
            const request = {
                db: 'foo',
                key: 'bar',
                value: `{"qux":"quz2","versionId":"${versionId}"}`,
                options: {
                    versioning: true,
                    versionId,
                    // isNull === false means Cloudserver supports the new "null key" logic.
                    isNull: false,
                },
            };
            vrp.put(request, logger, next);
        },
        (res, next) => {
            wgm.list({}, logger, next);
        },
        (res, next) => {
            const expectedListing = [
                // master version should have the provided version id
                {
                    key: 'bar',
                    value: `{"qux":"quz2","versionId":"${versionId}"}`,
                },
                // The null version will get the highest version number.
                // It should have "isNull" and "isNul2" set to true,
                // showing it's a null version made by Cloudserver that works with null keys.
                {
                    key: `bar${VID_SEP}`,
                    value: '{"qux":"quz","versionId":"99999999999999999999PARIS  ","isNull":true,"isNull2":true}',
                },
                // the new version
                {
                    key: `bar${VID_SEP}${versionId}`,
                    value: `{"qux":"quz2","versionId":"${versionId}"}`,
                },
            ];
            assert.deepStrictEqual(res, expectedListing);
            const request = {
                db: 'foo',
                key: 'bar',
            };
            vrp.get(request, logger, next);
        },
        (res, next) => {
            const expectedGet = {
                qux: 'quz2',
                versionId,
            };
            assert.deepStrictEqual(JSON.parse(res), expectedGet);
            next();
        }],
        done);
    });

    it('should be able to put Metadata on top of a standalone null version in backward compatibility mode', done => {
        const versionId = '00000000000000999999PARIS  ';

        async.waterfall([next => {
            // simulate the creation of a standalone null version.
            const request = {
                db: 'foo',
                key: 'bar',
                value: '{"qux":"quz"}',
                options: {},
            };
            vrp.put(request, logger, next);
        },
        (res, next) => {
            // simulate a BackbeatClient.putMetadata
            const request = {
                db: 'foo',
                key: 'bar',
                value: `{"qux":"quz2","versionId":"${versionId}"}`,
                options: {
                    versioning: true,
                    versionId,
                },
            };
            vrp.put(request, logger, next);
        },
        (res, next) => {
            wgm.list({}, logger, next);
        },
        (res, next) => {
            const expectedListing = [
                // master version should have the provided version id and a reference of the null version id.
                {
                    key: 'bar',
                    value: `{"qux":"quz2","versionId":"${versionId}","nullVersionId":"99999999999999999999PARIS  "}`,
                },
                // the "internal" master version should have the provided version id.
                {
                    key: `bar${VID_SEP}${versionId}`,
                    value: `{"qux":"quz2","versionId":"${versionId}"}`,
                },
                // should create a version that represents the old null master with the infinite version id and
                // the isNull property set to true.
                {
                    key: `bar${VID_SEP}99999999999999999999PARIS  `,
                    value: '{"qux":"quz","versionId":"99999999999999999999PARIS  ","isNull":true}',
                },
            ];
            assert.deepStrictEqual(res, expectedListing);
            const request = {
                db: 'foo',
                key: 'bar',
            };
            vrp.get(request, logger, next);
        },
        (res, next) => {
            const expectedGet = {
                qux: 'quz2',
                versionId,
                nullVersionId: '99999999999999999999PARIS  ',
            };
            assert.deepStrictEqual(JSON.parse(res), expectedGet);
            next();
        }],
        done);
    });

    it('should be able to put Metadata on top of a null suspended version', done => {
        const versionId = '00000000000000999999PARIS  ';
        let nullVersionId;

        async.waterfall([next => {
            // simulate the creation of a null suspended version.
            const request = {
                db: 'foo',
                key: 'bar',
                value: '{"qux":"quz","isNull":true}',
                options: {
                    versionId: '',
                },
            };
            vrp.put(request, logger, next);
        },
        (res, next) => {
            nullVersionId = JSON.parse(res).versionId;
            // simulate a BackbeatClient.putMetadata
            const request = {
                db: 'foo',
                key: 'bar',
                value: `{"qux":"quz2","versionId":"${versionId}"}`,
                options: {
                    versioning: true,
                    versionId,
                    // isNull === false means Cloudserver supports the new "null key" logic.
                    isNull: false,
                },
            };
            vrp.put(request, logger, next);
        },
        (res, next) => {
            wgm.list({}, logger, next);
        },
        (res, next) => {
            const expectedListing = [
                // master version should have the provided version id
                {
                    key: 'bar',
                    value: `{"qux":"quz2","versionId":"${versionId}"}`,
                },
                // The null version will get the highest version number.
                // It should have "isNull" and "isNul2" set to true,
                // showing it's a null version made by Cloudserver that works with null keys.
                {
                    key: `bar${VID_SEP}`,
                    value: `{"qux":"quz","isNull":true,"versionId":"${nullVersionId}","isNull2":true}`,
                },
                // the new version
                {
                    key: `bar${VID_SEP}${versionId}`,
                    value: `{"qux":"quz2","versionId":"${versionId}"}`,
                },
            ];
            assert.deepStrictEqual(res, expectedListing);
            const request = {
                db: 'foo',
                key: 'bar',
            };
            vrp.get(request, logger, next);
        },
        (res, next) => {
            const expectedGet = {
                qux: 'quz2',
                versionId,
            };
            assert.deepStrictEqual(JSON.parse(res), expectedGet);
            next();
        }],
        done);
    });

    it('should be able to put Metadata on top of a null suspended version in backward compatibility mode', done => {
        const versionId = '00000000000000999999PARIS  ';
        let nullVersionId;

        async.waterfall([next => {
            // simulate the creation of a null suspended version.
            const request = {
                db: 'foo',
                key: 'bar',
                value: '{"qux":"quz","isNull":true}',
                options: {
                    versionId: '',
                },
            };
            vrp.put(request, logger, next);
        },
        (res, next) => {
            nullVersionId = JSON.parse(res).versionId;
            // simulate a BackbeatClient.putMetadata
            const request = {
                db: 'foo',
                key: 'bar',
                value: `{"qux":"quz2","versionId":"${versionId}"}`,
                options: {
                    versioning: true,
                    versionId,
                },
            };
            vrp.put(request, logger, next);
        },
        (res, next) => {
            wgm.list({}, logger, next);
        },
        (res, next) => {
            const expectedListing = [
                // master version should have the provided version id and a reference of the null version id.
                {
                    key: 'bar',
                    value: `{"qux":"quz2","versionId":"${versionId}","nullVersionId":"${nullVersionId}"}`,
                },
                // the "internal" master version should have the provided version id.
                {
                    key: `bar${VID_SEP}${versionId}`,
                    value: `{"qux":"quz2","versionId":"${versionId}"}`,
                },
                // should create a version that represents the old null master with the infinite version id and
                // the isNull property set to true.
                {
                    key: `bar${VID_SEP}${nullVersionId}`,
                    value: `{"qux":"quz","isNull":true,"versionId":"${nullVersionId}"}`,
                },
            ];
            assert.deepStrictEqual(res, expectedListing);
            const request = {
                db: 'foo',
                key: 'bar',
            };
            vrp.get(request, logger, next);
        },
        (res, next) => {
            const expectedGet = {
                qux: 'quz2',
                versionId,
                nullVersionId,
            };
            assert.deepStrictEqual(JSON.parse(res), expectedGet);
            next();
        }],
        done);
    });

    it('should be able to update a null suspended version in backward compatibility mode', done => {
        let nullVersionId;

        async.waterfall([next => {
            // simulate the creation of a null suspended version.
            const request = {
                db: 'foo',
                key: 'bar',
                value: '{"qux":"quz","isNull":true}',
                options: {
                    versionId: '',
                },
            };
            vrp.put(request, logger, next);
        },
        (res, next) => {
            nullVersionId = JSON.parse(res).versionId;
            // simulate update null version with BackbeatClient.putMetadata
            const request = {
                db: 'foo',
                key: 'bar',
                value: '{"qux":"quz2","isNull":true}',
                options: {
                    versioning: true,
                    versionId: nullVersionId,
                },
            };
            vrp.put(request, logger, next);
        },
        (res, next) => {
            wgm.list({}, logger, next);
        },
        (res, next) => {
            const expectedListing = [
                // NOTE: should not set nullVersionId to the master version if updating a null version.
                {
                    key: 'bar',
                    value: '{"qux":"quz2","isNull":true}',
                },
                {
                    key: `bar\x00${nullVersionId}`,
                    value: `{"qux":"quz","isNull":true,"versionId":"${nullVersionId}"}`,
                },
            ];
            assert.deepStrictEqual(res, expectedListing);

            const request = {
                db: 'foo',
                key: 'bar',
            };
            vrp.get(request, logger, next);
        },
        (res, next) => {
            const expectedGet = {
                qux: 'quz2',
                isNull: true,
            };
            assert.deepStrictEqual(JSON.parse(res), expectedGet);
            next();
        }],
        done);
    });

    it('should delete the deprecated null key after put Metadata on top of an old null master', done => {
        const versionId = '00000000000000999999PARIS  ';
        let nullVersionId;

        async.waterfall([next => {
            // simulate the creation of a null suspended version.
            const request = {
                db: 'foo',
                key: 'bar',
                value: '{"qux":"quz","isNull":true}',
                options: {
                    versionId: '',
                },
            };
            vrp.put(request, logger, next);
        },
        (res, next) => {
            nullVersionId = JSON.parse(res).versionId;
            // update metadata of the same null version with compat mode (options.isNull not defined)
            // to generate a deprecated null key.
            const request = {
                db: 'foo',
                key: 'bar',
                value: `{"qux":"quz2","isNull":true,"versionId":"${nullVersionId}"}`,
                options: {
                    versionId: nullVersionId,
                },
            };
            vrp.put(request, logger, next);
        },
        (res, next) => {
            // put metadata with the new keys implementation (options.isNull defined)
            // on top of the null master with a deprecated null key.
            const request = {
                db: 'foo',
                key: 'bar',
                value: `{"qux":"quz3","versionId":"${versionId}"}`,
                options: {
                    versionId,
                    isNull: false,
                },
            };
            vrp.put(request, logger, next);
        },
        (res, next) => {
            wgm.list({}, logger, next);
        },
        (res, next) => {
            const expectedListing = [
                // master version should have the provided version id.
                {
                    key: 'bar',
                    value: `{"qux":"quz3","versionId":"${versionId}"}`,
                },
                // the null key
                {
                    key: `bar${VID_SEP}`,
                    value: `{"qux":"quz2","isNull":true,"versionId":"${nullVersionId}","isNull2":true}`,
                },
                // version key
                {
                    key: `bar${VID_SEP}${versionId}`,
                    value: `{"qux":"quz3","versionId":"${versionId}"}`,
                },
            ];
            assert.deepStrictEqual(res, expectedListing);
            const request = {
                db: 'foo',
                key: 'bar',
            };
            vrp.get(request, logger, next);
        },
        (res, next) => {
            const expectedGet = {
                qux: 'quz3',
                versionId,
            };
            assert.deepStrictEqual(JSON.parse(res), expectedGet);
            next();
        }],
        done);
    });

    it('should delete the deprecated null key after updating metadata of an old null master', done => {
        let nullVersionId;

        async.waterfall([next => {
            // simulate the creation of a null suspended version.
            const request = {
                db: 'foo',
                key: 'bar',
                value: '{"qux":"quz","isNull":true}',
                options: {
                    versionId: '',
                },
            };
            vrp.put(request, logger, next);
        },
        (res, next) => {
            nullVersionId = JSON.parse(res).versionId;
            // update metadata of the same null version with compat mode (options.isNull not defined)
            // to generate a deprecated null key.
            const request = {
                db: 'foo',
                key: 'bar',
                value: `{"qux":"quz2","isNull":true,"versionId":"${nullVersionId}"}`,
                options: {
                    versionId: nullVersionId,
                },
            };
            vrp.put(request, logger, next);
        },
        (res, next) => {
            // update the null version metadata with the new keys implementation (options.isNull defined)
            const request = {
                db: 'foo',
                key: 'bar',
                value: `{"qux":"quz3","isNull2":true,"isNull":true,"versionId":"${nullVersionId}"}`,
                options: {
                    versionId: nullVersionId,
                    isNull: true,
                },
            };
            vrp.put(request, logger, next);
        },
        (res, next) => {
            wgm.list({}, logger, next);
        },
        (res, next) => {
            const expectedListing = [
                // the internal null version should be deleted.
                {
                    key: 'bar',
                    value: `{"qux":"quz3","isNull2":true,"isNull":true,"versionId":"${nullVersionId}"}`,
                },
            ];
            assert.deepStrictEqual(res, expectedListing);
            const request = {
                db: 'foo',
                key: 'bar',
            };
            vrp.get(request, logger, next);
        },
        (res, next) => {
            const expectedGet = {
                qux: 'quz3',
                isNull2: true,
                isNull: true,
                versionId: nullVersionId,
            };
            assert.deepStrictEqual(JSON.parse(res), expectedGet);
            next();
        }],
        done);
    });

    it('should delete the deprecated null key after updating a non-latest null key', done => {
        const versionId = '00000000000000999999PARIS  ';
        let nullVersionId;

        async.waterfall([next => {
            // simulate the creation of a null suspended version.
            const request = {
                db: 'foo',
                key: 'bar',
                value: '{"qux":"quz","isNull":true}',
                options: {
                    versionId: '',
                },
            };
            vrp.put(request, logger, next);
        },
        (res, next) => {
            nullVersionId = JSON.parse(res).versionId;
            // simulate a BackbeatClient.putMetadata
            // null key is not the latest = master is not null.
            const request = {
                db: 'foo',
                key: 'bar',
                value: `{"qux":"quz2","versionId":"${versionId}"}`,
                options: {
                    versioning: true,
                    versionId,
                },
            };
            vrp.put(request, logger, next);
        },
        (res, next) => {
            // update the null version metadata with the new keys implementation (options.isNull defined)
            const request = {
                db: 'foo',
                key: 'bar',
                value: `{"qux":"quz3","isNull2":true,"isNull":true,"versionId":"${nullVersionId}"}`,
                options: {
                    versionId: nullVersionId,
                    isNull: true,
                },
            };
            vrp.put(request, logger, next);
        },
        (res, next) => {
            wgm.list({}, logger, next);
        },
        (res, next) => {
            const expectedListing = [
                {
                    key: 'bar',
                    value: `{"qux":"quz2","versionId":"${versionId}","nullVersionId":"${nullVersionId}"}`,
                },
                {
                    key: 'bar\x00',
                    value: `{"qux":"quz3","isNull2":true,"isNull":true,"versionId":"${nullVersionId}"}`,
                },
                {
                    key: `bar\x00${versionId}`,
                    value: `{"qux":"quz2","versionId":"${versionId}"}`,
                },
            ];
            assert.deepStrictEqual(res, expectedListing);

            const request = {
                db: 'foo',
                key: 'bar',
            };
            vrp.get(request, logger, next);
        },
        (res, next) => {
            const expectedGet = {
                qux: 'quz2',
                versionId,
                nullVersionId,
            };
            assert.deepStrictEqual(JSON.parse(res), expectedGet);
            next();
        }],
        done);
    });
});


class TestReplicator {
    constructor(expectedCalls, onLastExpectedCallCb) {
        this.expectedCalls = expectedCalls || [];
        this.testEnded = false;
        this.onLastExpectedCallCb = onLastExpectedCallCb;
    }

    getWriteCacheProxy() {
        return {
            get: this.writeCacheGet.bind(this),
            batch: this.writeCacheBatch.bind(this),
        };
    }

    getWGMProxy() {
        return {
            get: this.wgmGet.bind(this),
            list: this.wgmList.bind(this),
        };
    }

    _onCalled(method, request, callback) {
        if (this.testEnded) {
            return undefined;
        }
        const paramsDesc = JSON.stringify(request);
        const callDesc = `replicator::${method}(${paramsDesc})`;
        const expectedCall = this.expectedCalls.shift();
        assert.notStrictEqual(expectedCall, undefined, `unexpected call: ${callDesc}`);
        assert.strictEqual(method, expectedCall.method);
        assert.deepStrictEqual(request, expectedCall.request);

        if (this.onLastExpectedCallCb && this.expectedCalls.length === 0) {
            this.onLastExpectedCallCb();
        }
        ++this.pendingCalls;
        return setTimeout(
            () => callback(expectedCall.returnedError || null, expectedCall.returnedValue),
            expectedCall.returnDelay || 0);
    }

    writeCacheGet(request, logger, callback) {
        this._onCalled('WriteCache::get', request, callback);
    }

    writeCacheBatch(request, logger, callback) {
        this._onCalled('WriteCache::batch', request, callback);
    }

    wgmGet(request, logger, callback) {
        this._onCalled('WGM::get', request, callback);
    }

    wgmList(request, logger, callback) {
        this._onCalled('WGM::list', request, callback);
    }

    reset() {
    }

    onTestEnd() {
        assert.deepStrictEqual(this.expectedCalls, [],
            `missing calls: ${JSON.stringify(this.expectedCalls)}`);
        this.testEnded = true;
    }
}

describe('test versioning request processor', () => {
    let replicator;

    afterEach(() => {
        if (replicator) {
            replicator.onTestEnd();
        }
    });

    it('process versioning put request: creating new version', done => {
        const key = randkey();
        replicator = new TestReplicator();
        const pro = new VRP(
            replicator.getWriteCacheProxy(),
            replicator.getWGMProxy(),
            vcfg);
        const value = '{}';
        const options = { versioning: true };
        const req = { db: 'dbv0', key, value, options };
        pro.processNewVersionPut(req, logger, (err, ops, versionId) => {
            assert.ifError(err);
            const versionKey = getVersionKey(key, versionId);
            const versionValue = `{"versionId":"${versionId}"}`;
            assert.deepStrictEqual(ops, [
                { key, value: versionValue },
                { key: versionKey, value: versionValue },
            ]);
            done();
        });
    });

    it('process version specific put request: non-deleted versionId === ""', done => {
        const key = randkey();
        const value = '{"foo":"bar"}';
        const options = { versionId: '' };
        const req = { db: 'dbv0', key, value, options };
        replicator = new TestReplicator();
        const pro = new VRP(
            replicator.getWriteCacheProxy(),
            replicator.getWGMProxy(),
            vcfg);
        pro.processVersionSpecificPut(req, logger, (err, ops, versionId) => {
            assert.ifError(err);
            const versionValue = `{"foo":"bar","versionId":"${versionId}"}`;
            assert.deepStrictEqual(ops, [
                { key, value: versionValue },
            ]);
            done();
        });
    });

    it('process version specific put request: non-deleted versionId === "" ' +
    'with deleteNullKey=true', done => {
        const key = randkey();
        const value = '{"foo":"bar"}';
        const options = { versionId: '', deleteNullKey: true };
        const req = { db: 'dbv0', key, value, options };
        replicator = new TestReplicator();
        const pro = new VRP(
            replicator.getWriteCacheProxy(),
            replicator.getWGMProxy(),
            vcfg);
        pro.processVersionSpecificPut(req, logger, (err, ops, versionId) => {
            assert.ifError(err);
            const versionValue = `{"foo":"bar","versionId":"${versionId}"}`;
            assert.deepStrictEqual(ops, [
                { key, value: versionValue },
                { key: `${key}${VID_SEP}`, type: 'del' },
            ]);
            done();
        });
    });

    it('process versioning put request: versionId="null"', done => {
        const key = randkey();
        const value = '{"foo":"bar"}';
        const options = { versionId: 'null' };
        const req = { db: 'dbv0', key, value, options };
        replicator = new TestReplicator();
        const pro = new VRP(
            replicator.getWriteCacheProxy(),
            replicator.getWGMProxy(),
            vcfg);
        pro.processVersionSpecificPut(req, logger, (err, ops) => {
            assert.ifError(err);
            assert.deepStrictEqual(ops, [
                { key: `${key}${VID_SEP}`, value },
            ]);
            done();
        });
    });

    [
        {},
        { isNull: false },
        { isNull: true },
    ].forEach(extraParams => {
        let extraDesc = '';
        if (extraParams.isNull !== undefined) {
            extraDesc = ` with isNull=${extraParams.isNull.toString()}`;
        }
        it(`process version specific put request: latest version${extraDesc}`, done => {
            const key = randkey();
            const value = '{}';
            const versionId = fixedVersionId;
            const versionKey = getVersionKey(key, versionId);
            const options = Object.assign({ versionId }, extraParams);
            const req = { db: 'dbv0', key, value, options };
            replicator = new TestReplicator([{
                method: 'WriteCache::get',
                request: {
                    db: 'dbv0',
                    key,
                },
                returnedValue: `{"versionId":"${versionId}"}`,
            }]);
            const pro = new VRP(
                replicator.getWriteCacheProxy(),
                replicator.getWGMProxy(),
                vcfg);
            pro.processVersionSpecificPut(req, logger, (err, ops, versionId) => {
                assert.strictEqual(versionId, fixedVersionId);
                if (extraParams.isNull) {
                    assert.deepStrictEqual(ops, [
                        { key, value },
                    ]);
                } else {
                    assert.deepStrictEqual(ops, [
                        { key: versionKey, value },
                        { key, value },
                    ]);
                }
                done();
            });
        });
    });

    it('process vFormat=v0 version specific delete request: versionId="null"', done => {
        const key = randkey();
        const options = { versionId: 'null' };
        const req = { db: 'dbv0', key, type: 'del', options };
        replicator = new TestReplicator();
        const pro = new VRP(
            replicator.getWriteCacheProxy(),
            replicator.getWGMProxy(),
            vcfg);
        pro.processVersionSpecificDelete(req, logger, (err, ops) => {
            assert.ifError(err);
            assert.deepStrictEqual(ops, [
                { key: `${key}${VID_SEP}`, type: 'del' },
            ]);
            done();
        });
    });

    [
        {},
        { isNull: false },
        { isNull: true },
    ].forEach(extraParams => {
        let extraDesc = '';
        if (extraParams.isNull !== undefined) {
            extraDesc = ` with isNull=${extraParams.isNull.toString()}`;
        }
        it(`process version specific delete request: latest version${extraDesc}`, done => {
            const key = randkey();
            const versionId = fixedVersionId;
            const versionKey = getVersionKey(key, versionId);
            const options = Object.assign({ versionId }, extraParams);
            const req = { db: 'dbv0', key, type: 'del', options };
            replicator = new TestReplicator([{
                method: 'WriteCache::get',
                request: {
                    db: 'dbv0',
                    key,
                },
                params: { getTemporaryValue: true },
                returnedValue: `{"versionId":"${fixedVersionId}"}`,
            }]);
            const pro = new VRP(
                replicator.getWriteCacheProxy(),
                replicator.getWGMProxy(),
                vcfg);
            pro.processVersionSpecificDelete(req, logger, (err, ops, versionId) => {
                assert.ifError(err);
                // expected operation array:
                // [{ versionKey, type: 'del' },
                //  { key, PHDVersion }]
                assert.strictEqual(versionId, fixedVersionId);
                assert.strictEqual(ops.length, 2);
                if (extraParams.isNull) {
                    const nullKey = getVersionKey(key, '');
                    assert.deepStrictEqual(ops[0], { key: nullKey, type: 'del' });
                } else {
                    assert.deepStrictEqual(ops[0], { key: versionKey, type: 'del' });
                }
                assert.strictEqual(ops[1].key, key);
                assert(Version.isPHD(ops[1].value));
                done();
            });
        });

        it(`process version specific delete request: non-latest version${extraDesc}`, done => {
            const key = randkey();
            const versionId = VID.generateVersionId(
                Math.random().toString(16), vcfg.replicationGroupId);
            const versionKey = getVersionKey(key, versionId);
            const latestVersionId = VID.generateVersionId(
                Math.random().toString(16), vcfg.replicationGroupId);
            const options = Object.assign({ versionId }, extraParams);
            const req = { db: 'dbv0', key, type: 'del', options };
            replicator = new TestReplicator([{
                method: 'WriteCache::get',
                request: {
                    db: 'dbv0',
                    key,
                },
                params: { getTemporaryValue: true },
                returnedValue: `{"versionId":"${latestVersionId}"}`,
            }]);
            const pro = new VRP(
                replicator.getWriteCacheProxy(),
                replicator.getWGMProxy(),
                vcfg);
            pro.processVersionSpecificDelete(req, logger, (err, ops, _versionId) => {
                assert.ifError(err);
                assert.strictEqual(_versionId, versionId);
                if (extraParams.isNull) {
                    const nullKey = getVersionKey(key, '');
                    assert.deepStrictEqual(ops, [
                        { key: nullKey, type: 'del' },
                    ]);
                } else {
                    assert.deepStrictEqual(ops, [
                        { key: versionKey, type: 'del' },
                    ]);
                }
                done();
            });
        });
    });

    it('get: with versionId', done => {
        const key = randkey();
        replicator = new TestReplicator([{
            method: 'WGM::get',
            request: {
                db: 'dbv0',
                key: `${key}${VID_SEP}${fixedVersionId}`,
            },
            params: null,
            returnedValue: `{"versionId":"${fixedVersionId}"}`,
        }]);
        const pro = new VRP(
            replicator.getWriteCacheProxy(),
            replicator.getWGMProxy(),
            vcfg);
        const options = { versionId: fixedVersionId };
        const req = { db: 'dbv0', key, options };
        pro.get(req, logger, (err, data) => {
            assert.ifError(err);
            assert.strictEqual(data.indexOf(fixedVersionId) !== -1, true);
            done();
        });
    });

    it('get: with versionId="null"', done => {
        const key = randkey();
        replicator = new TestReplicator([{
            method: 'WGM::get',
            request: {
                db: 'dbv0',
                key: `${key}${VID_SEP}`,
            },
            params: null,
            returnedValue: `{"versionId":"${fixedVersionId}"}`,
        }]);
        const pro = new VRP(
            replicator.getWriteCacheProxy(),
            replicator.getWGMProxy(),
            vcfg);
        const options = { versionId: 'null' };
        const req = { db: 'dbv0', key, options };
        pro.get(req, logger, (err, data) => {
            assert.ifError(err);
            assert.strictEqual(data.indexOf(fixedVersionId) !== -1, true);
            done();
        });
    });

    describe('listVersionKeys helper', () => {
        [
            {
                desc: 'key does not exist',
                options: undefined,
                expectedListParams: {
                    gte: 'key',
                    lt: `key${VID_SEPPLUS}`,
                },
                listValues: [],
                expectedMaster: null,
                expectedVersions: [],
            },
            {
                desc: 'key does not exist',
                options: undefined,
                expectedListParams: {
                    gte: 'key',
                    lt: `key${VID_SEPPLUS}`,
                },
                listValues: [],
                expectedMaster: null,
                expectedVersions: [],
            },
            {
                desc: 'master key only',
                options: undefined,
                expectedListParams: {
                    gte: 'key',
                    lt: `key${VID_SEPPLUS}`,
                },
                listValues: [{
                    key: 'key',
                    value: '{}',
                }],
                expectedMaster: {
                    key: 'key',
                    value: '{}',
                },
                expectedVersions: [],
            },
            {
                desc: 'master key and one version key',
                options: undefined,
                expectedListParams: {
                    gte: 'key',
                    lt: `key${VID_SEPPLUS}`,
                },
                listValues: [{
                    key: 'key',
                    value: '{"versionId":"v1"}',
                }, {
                    key: `key${VID_SEP}v1`,
                    value: '{"versionId":"v1"}',
                }],
                expectedMaster: {
                    key: 'key',
                    value: '{"versionId":"v1"}',
                },
                expectedVersions: [{
                    key: `key${VID_SEP}v1`,
                    value: '{"versionId":"v1"}',
                }],
            },
            {
                desc: 'master key and one version key',
                options: {
                    limit: 0,
                },
                expectedListParams: {
                    gte: 'key',
                    lt: `key${VID_SEPPLUS}`,
                    limit: 2,
                },
                listValues: [{
                    key: 'key',
                    value: '{"versionId":"v1"}',
                }, {
                    key: `key${VID_SEP}v1`,
                    value: '{"versionId":"v1"}',
                }],
                expectedMaster: {
                    key: 'key',
                    value: '{"versionId":"v1"}',
                },
                expectedVersions: [],
            },
            {
                desc: 'master key and version keys',
                options: {
                    limit: 2,
                },
                expectedListParams: {
                    gte: 'key',
                    lt: `key${VID_SEPPLUS}`,
                    limit: 4,
                },
                listValues: [{
                    key: 'key',
                    value: '{"versionId":"v1"}',
                }, {
                    key: `key${VID_SEP}v1`,
                    value: '{"versionId":"v1"}',
                }, {
                    key: `key${VID_SEP}v2`,
                    value: '{"versionId":"v2"}',
                }, {
                    key: `key${VID_SEP}v3`,
                    value: '{"versionId":"v3"}',
                }],
                expectedMaster: {
                    key: 'key',
                    value: '{"versionId":"v1"}',
                },
                expectedVersions: [{
                    key: `key${VID_SEP}v1`,
                    value: '{"versionId":"v1"}',
                }, {
                    key: `key${VID_SEP}v2`,
                    value: '{"versionId":"v2"}',
                }],
            },
            {
                desc: 'PHD master key and null key',
                options: undefined,
                expectedListParams: {
                    gte: 'key',
                    lt: `key${VID_SEPPLUS}`,
                },
                listValues: [{
                    key: 'key',
                    value: '{"isPHD":true}',
                }, {
                    key: `key${VID_SEP}`,
                    value: '{"versionId":"v2","isNull":true}',
                }],
                expectedMaster: {
                    key: 'key',
                    value: '{"isPHD":true}',
                },
                expectedVersions: [{
                    key: `key${VID_SEP}v2`,
                    value: '{"versionId":"v2","isNull":true}',
                    isNullKey: true,
                }],
            },
            {
                desc: 'PHD master key, versions and newest null key',
                options: {
                    limit: 2,
                },
                expectedListParams: {
                    gte: 'key',
                    lt: `key${VID_SEPPLUS}`,
                    limit: 4,
                },
                listValues: [{
                    key: 'key',
                    value: '{"isPHD":true}',
                }, {
                    key: `key${VID_SEP}`,
                    value: '{"versionId":"v1","isNull":true}',
                }, {
                    key: `key${VID_SEP}v2`,
                    value: '{"versionId":"v2"}',
                }, {
                    key: `key${VID_SEP}v3`,
                    value: '{"versionId":"v3"}',
                }],
                expectedMaster: {
                    key: 'key',
                    value: '{"isPHD":true}',
                },
                expectedVersions: [{
                    key: `key${VID_SEP}v1`,
                    value: '{"versionId":"v1","isNull":true}',
                    isNullKey: true,
                }, {
                    key: `key${VID_SEP}v2`,
                    value: '{"versionId":"v2"}',
                }],
            },
            {
                desc: 'PHD master key, versions and oldest null key',
                options: {
                    limit: 2,
                },
                expectedListParams: {
                    gte: 'key',
                    lt: `key${VID_SEPPLUS}`,
                    limit: 4,
                },
                listValues: [{
                    key: 'key',
                    value: '{"isPHD":true}',
                }, {
                    key: `key${VID_SEP}`,
                    value: '{"versionId":"v3","isNull":true}',
                }, {
                    key: `key${VID_SEP}v1`,
                    value: '{"versionId":"v1"}',
                }, {
                    key: `key${VID_SEP}v2`,
                    value: '{"versionId":"v2"}',
                }],
                expectedMaster: {
                    key: 'key',
                    value: '{"isPHD":true}',
                },
                expectedVersions: [{
                    key: `key${VID_SEP}v1`,
                    value: '{"versionId":"v1"}',
                }, {
                    key: `key${VID_SEP}v2`,
                    value: '{"versionId":"v2"}',
                }],
            },
            {
                desc: 'PHD master key, versions and null key in between versions',
                options: {
                    limit: 2,
                },
                expectedListParams: {
                    gte: 'key',
                    lt: `key${VID_SEPPLUS}`,
                    limit: 4,
                },
                listValues: [{
                    key: 'key',
                    value: '{"isPHD":true}',
                }, {
                    key: `key${VID_SEP}`,
                    value: '{"versionId":"v2","isNull":true}',
                }, {
                    key: `key${VID_SEP}v1`,
                    value: '{"versionId":"v1"}',
                }, {
                    key: `key${VID_SEP}v3`,
                    value: '{"versionId":"v3"}',
                }],
                expectedMaster: {
                    key: 'key',
                    value: '{"isPHD":true}',
                },
                expectedVersions: [{
                    key: `key${VID_SEP}v1`,
                    value: '{"versionId":"v1"}',
                }, {
                    key: `key${VID_SEP}v2`,
                    value: '{"versionId":"v2","isNull":true}',
                    isNullKey: true,
                }],
            },
        ].forEach(testCase => {
            it(`${testCase.desc}, options=${JSON.stringify(testCase.options)}`,
                done => {
                    const db = 'dbv0';
                    replicator = new TestReplicator([{
                        method: 'WGM::list',
                        request: {
                            db,
                            params: testCase.expectedListParams,
                        },
                        returnedValue: testCase.listValues,
                    }]);
                    const pro = new VRP(
                        replicator.getWriteCacheProxy(),
                        replicator.getWGMProxy(),
                        vcfg);
                    const { options } = testCase;
                    pro.listVersionKeys(db, 'key', options, logger, (err, master, versions) => {
                        assert.ifError(err);
                        assert.deepStrictEqual(master, testCase.expectedMaster);
                        assert.deepStrictEqual(versions, testCase.expectedVersions);
                        done();
                    });
                });
        });
    });
});
