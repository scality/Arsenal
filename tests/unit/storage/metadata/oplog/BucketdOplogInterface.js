const async = require('async');
const fakeBucketInfo = require('../FakeBucketInfo.json');
const MetadataWrapper = require('../../../../../lib/storage/metadata/MetadataWrapper');
const BucketdOplogInterface = require('../../../../../lib/storage/metadata/oplog/BucketdOplogInterface');
const PersistMemInterface = require('../../../../../lib/storage/metadata/oplog/PersistMemInterface');
const Injector = require('../Injector');
const http = require('http');
const url = require('url');
const werelogs = require('werelogs');

werelogs.configure({
    level: 'info',
    dump: 'error',
});

class PersistDataInterface {

    constructor() {
        this.data = null;
    }

    initState(cb) {
        this.data = {};
        return process.nextTick(cb);
    }

    loadState(stream, cb) {
        const chunks = [];
        stream.on('data', chunk => {
            chunks.push(chunk);
        });
        stream.on('end', () => {
            this.data = JSON.parse(Buffer.concat(chunks));
            return process.nextTick(cb);
        });
    }

    saveState(stream, cb) {
        stream.write(JSON.stringify(this.data));
        stream.end();
        return process.nextTick(cb);
    }

    updateState(addQueue, deleteQueue, cb) {
        return process.nextTick(cb);
    }
}

describe('BucketdOplogInterface', () => {
    const logger = new werelogs.Logger('BucketOplogInterface');

    const fakePort = 9090;
    const fakeBucket = 'fake';
    const fakeRaftId = 2;
    const numObjs = 20000;
    const fakeCseq = 20001;
    let oplogInjected = false;
    const numOplogSeqs = 100;
    const oplogBatchSize = 2;
    const endCseq = fakeCseq + numOplogSeqs;
    const maxLimit = 2;
    const oplogKeys = [];
    const oplogValues = [];
    let oplogKeysIdx = 0;

    const memBackend = new MetadataWrapper(
        'mem', {}, null, logger);
    const injector = new Injector(memBackend, logger);

    const requestListener = (req, res) => {
        const _url = url.parse(req.url, true);
        if (_url.pathname === `/_/buckets/${fakeBucket}`) {
            res.writeHead(200);
            res.end(JSON.stringify(
                {
                    raftSessionId: fakeRaftId,
                    creating: false,
                    deleting: false,
                    version: 0,
                }));
        } else if (_url.pathname === `/_/raft_sessions/${fakeRaftId}/log`) {
            const begin = _url.query.begin;
            const limit = _url.query.limit;
            if (begin === '1' && limit === '1') {
                res.writeHead(200);
                res.end(JSON.stringify(
                    {
                        info: {
                            start: 1,
                            cseq: fakeCseq,
                            prune: 1,
                        },
                    }));
            } else {
                const realLimit = Math.min(limit, maxLimit);
                async.until(
                    () => oplogInjected,
                    next => {
                        // inject similar but different random objects
                        injector.inject(
                            fakeBucket,
                            {
                                numKeys: numOplogSeqs * oplogBatchSize,
                                maxSeq: numObjs,
                                op: injector.opPut,
                                randomSeq: true,
                                prefix: 'obj_',
                                suffix: '_bis',
                            },
                            null,
                            oplogKeys,
                            oplogValues,
                            err => {
                                if (err) {
                                    return next(err);
                                }
                                oplogInjected = true;
                                return next();
                            });
                    }, err => {
                        if (err) {
                            res.writeHead(404);
                            res.end('error', err);
                            return undefined;
                        }
                        if (begin < endCseq) {
                            res.writeHead(200);
                            const resp = {};
                            resp.info = {
                                start: begin,
                                cseq: endCseq,
                                prune: 1,
                            };
                            resp.log = [];
                            for (let i = 0; i < realLimit; i++) {
                                resp.log[i] = {};
                                resp.log[i].db = fakeBucket;
                                resp.log[i].method = 8;
                                resp.log[i].entries = [];
                                for (let j = 0; j < oplogBatchSize; j++) {
                                    resp.log[i].entries[j] = {};
                                    resp.log[i].entries[j].key = oplogKeys[oplogKeysIdx];
                                    resp.log[i].entries[j].value = oplogValues[oplogKeysIdx];
                                    oplogKeysIdx++;
                                }
                            }
                            res.end(JSON.stringify(resp));
                        }
                        return undefined;
                    });
            }
        } else if (_url.pathname === `/default/bucket/${fakeBucket}`) {
            const marker = _url.query.marker === '' ? null : _url.query.marker;
            const maxKeys = parseInt(_url.query.maxKeys, 10);
            memBackend.listObjects(fakeBucket, {
                listingType: 'Delimiter',
                marker,
                maxKeys,
            }, (err, result) => {
                if (err) {
                    res.writeHead(404);
                    res.end('error', err);
                    return undefined;
                }
                res.writeHead(200);
                res.end(JSON.stringify(result));
                return undefined;
            });
        }
    };

    before(done => {
        const server = http.createServer(requestListener);
        server.listen(fakePort);
        async.waterfall([
            next => memBackend.createBucket(fakeBucket, fakeBucketInfo, logger, next),
            next => injector.inject(
                fakeBucket,
                {
                    numKeys: numObjs,
                    maxSeq: numObjs,
                    op: injector.opPut,
                    randomSeq: false,
                    prefix: 'obj_',
                    suffix: '',
                },
                null,
                null,
                null,
                next),
        ], done);
    });

    after(done => {
        memBackend.deleteBucket(fakeBucket, logger, done);
    });

    it('simulation', done => {
        const params = {
            bootstrap: [`localhost:${fakePort}`],
            persist: new PersistMemInterface(),
            persistData: new PersistDataInterface(),
            stopAt: numObjs + numOplogSeqs,
        };
        const bucketdOplog = new BucketdOplogInterface(params);
        bucketdOplog.start(
            {
                filterName: fakeBucket,
                filterType: 'bucket',
                bucket: {
                    bucketName: fakeBucket,
                },
            },
            done);
    });
});
