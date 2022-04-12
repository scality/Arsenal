/*
 * Main interface for bucketd oplog management
 */
const async = require('async');
const { RESTClient: BucketClient } = require('bucketclient');
const { jsutil, errors } = require('arsenal');
const LogConsumer = require('arsenal/lib/storage/metadata/bucketclient/LogConsumer');
const { isMasterKey } = require('arsenal/lib/versioning/Version');
const OplogInterface = require('./OplogInterface');

class BucketdOplogInterface extends OplogInterface {

    constructor(params) {
        super(params);
        this.backendRetryTimes = 3;
        this.backendRetryInterval = 300;
        this.bucketdOplogQuerySize = 20;
        this.stopAt = params?.stopAt ?? -1;
        const bkBootstrap = params?.bootstrap ?? ['localhost:9000'];
        this.bkClient = new BucketClient(bkBootstrap);
    }

    start(filter, cb) {
        if (!(filter.filterType === 'bucket' ||
              filter.filterType === 'raftSession')) {
            return cb(errors.NotImplemented);
        }
        const filterName = filter.filterName;
        async.waterfall([
            /*
             * In this step we get the raftId for filterName
             */
            next => {
                if (filter.filterType === 'raftSession') {
                    return next(null, filter.raftSession.raftId);
                }
                this.logger.info('obtaining raftId',
                                 { filterName });
                async.retry(
                    {
                        times: this.backendRetryTimes,
                        interval: this.backendRetryInterval,
                    },
                    done => {
                        this.bkClient.getBucketInformation(
                            filter.bucket.bucketName,
                            null,
                            (err, info) => {
                                if (err) {
                                    this.logger.info('retrying getBucketInformation', { err, filterName });
                                    return done(err);
                                }
                                return done(null, JSON.parse(info));
                            });
                    },
                    (err, res) => {
                        if (err) {
                            this.logger.error('getBucketInformation too many failures', { err, filterName });
                            return next(err);
                        }
                        return next(null, res.raftSessionId);
                    });
                return undefined;
            },
            /*
             * In this step we get the stored offset if we have it
             */
            (raftId, next) => {
                let cseq = undefined;
                this.persist.load(filterName, this.persistData, (err, offset) => {
                    if (err) {
                        return next(err);
                    }
                    cseq = offset;
                    return next(null, raftId, cseq);
                });
            },
            /*
             * In this step we acquire the offset if we don't already have it
             */
            (raftId, cseq, next) => {
                if (cseq !== undefined) {
                    this.logger.info(`skipping cseq acquisition (cseq=${cseq})`,
                                     { filterName });
                    return next(null, raftId, cseq, true);
                }
                this.logger.info('cseq acquisition',
                                 { filterName });
                async.retry(
                    {
                        times: this.backendRetryTimes,
                        interval: this.backendRetryInterval,
                    },
                    done => {
                        this.bkClient.getRaftLog(
                            raftId,
                            1,
                            1,
                            true,
                            null,
                            (err, stream) => {
                                if (err) {
                                    this.logger.info('retrying getRaftLog', { err, filterName });
                                    return done(err);
                                }
                                const chunks = [];
                                stream.on('data', chunk => {
                                    chunks.push(chunk);
                                });
                                stream.on('end', () => {
                                    const info = JSON.parse(Buffer.concat(chunks));
                                    return done(null, info);
                                });
                                return undefined;
                            });
                    },
                    (err, res) => {
                        if (err) {
                            this.logger.error('getRaftLog too many failures', { err, filterName });
                            return next(err);
                        }
                        return next(null, raftId, res.info.cseq, false);
                    });
                return undefined;
            },
            /*
             * In this step we init the state (e.g. scan)
             */
            (raftId, cseq, skipInit, next) => {
                if (skipInit) {
                    this.logger.info(`skipping state initialization cseq=${cseq}`,
                                     { filterName });
                    return next(null, raftId, cseq);
                }
                this.logger.info(`initializing state cseq=${cseq}`,
                                 { filterName });
                this.persistData.initState(err => {
                    if (err) {
                        return next(err);
                    }
                    this.persist.save(
                        filterName, this.persistData, cseq, err => {
                            if (err) {
                                return next(err);
                            }
                            return next(null, raftId, cseq);
                        });
                    return undefined;
                });
                return undefined;
            },
            /*
             * In this step we loop over the oplog
             */
            (raftId, cseq, next) => {
                this.logger.info(`reading oplog raftId=${raftId} cseq=${cseq}`,
                                 { filterName });
                // only way to get out of the loop in all cases
                const nextOnce = jsutil.once(next);
                let doStop = false;
                // resume reading the oplog from cseq. changes are idempotent
                const logConsumer = new LogConsumer({
                    bucketClient: this.bkClient,
                    raftSession: raftId,
                });
                let _cseq = cseq;
                async.until(
                    () => doStop,
                    _next => {
                        logConsumer.readRecords({
                            startSeq: _cseq,
                            limit: this.bucketdOplogQuerySize,
                        }, (err, record) => {
                            if (err) {
                                this.logger.error('readRecords error', { err, filterName });
                                return setTimeout(() => _next(), 5000);
                            }
                            if (!record.log) {
                                // nothing to read
                                return setTimeout(() => _next(), 5000);
                            }
                            const seqs = [];
                            record.log.on('data', chunk => {
                                seqs.push(chunk);
                            });
                            record.log.on('end', () => {
                                const addQueue = [];
                                const delQueue = [];
                                for (let i = 0; i < seqs.length; i++) {
                                    if (filter.filterType === 'raftSession' ||
                                        (filter.filterType === 'bucket' &&
                                         seqs[i].db === filter.bucket.bucketName)) {
                                        for (let j = 0; j < seqs[i].entries.length; j++) {
                                            const _item = {};
                                            _item.bucketName = seqs[i].db;
                                            _item.key = seqs[i].entries[j].key;
                                            if (seqs[i].entries[j].type !== undefined &&
                                                seqs[i].entries[j].type === 'del') {
                                                if (!isMasterKey(_item.key)) {
                                                    // ignore for now
                                                    return;
                                                }
                                                delQueue.push(_item);
                                            } else {
                                                _item.value = Object.assign({}, seqs[i].entries[j].value);
                                                addQueue.push(_item);
                                            }
                                        }
                                    }
                                }
                                this.persistData.updateState(
                                    addQueue, delQueue, err => {
                                        if (err) {
                                            return _next(err);
                                        }
                                        _cseq += seqs.length;
                                        this.persist.save(
                                            filterName, this.persistData, _cseq, err => {
                                                if (err) {
                                                    return _next(err);
                                                }
                                                if (_cseq > this.stopAt) {
                                                    doStop = true;
                                                }
                                                return _next();
                                            });
                                        return undefined;
                                    });
                            });
                            return undefined;
                        });
                    }, err => {
                        if (err) {
                            return nextOnce(err);
                        }
                        return nextOnce();
                    });
            },
        ], err => {
            if (err) {
                return cb(err);
            }
            this.logger.info('returning',
                             { filterName });
            return cb();
        });
        return undefined;
    }
}

module.exports = BucketdOplogInterface;
