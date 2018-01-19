'use strict'; // eslint-disable-line

const stream = require('stream');
const mongoOplog = require('mongo-oplog');
const errors = require('../../../errors');


class ListRecordStream extends stream.Transform {
    constructor(logger) {
        super({ objectMode: true });
        this.logger = logger;
    }

    _transform(itemObj, encoding, callback) {
        itemObj.entries.forEach(entry => {
            // eslint-disable-next-line no-param-reassign
            entry.type = entry.type || 'put';
        });
        this.push(itemObj);
        callback();
    }
}

/**
 * @class
 * @classdesc Class to consume mongo oplog
 */
class LogConsumer {

    /**
     * @constructor
     *
     * @param {Object} params - constructor params
     * @param {String} params.host - mongo host
     * @param {String} params.port - mongo port
     * @param {werelogs.Logger} params.logger - werelogs logger
     */
    constructor(params) {
        const { host, port, logger } = params;
        this.moplog = mongoOplog(`mongodb://${host}:${port}/local`);
        this.logger = logger;
    }

    /**
     * Read a series of log records from mongo
     *
     * @param {Object} [params] - params object
     * @param {Number} [params.startSeq] - fetch starting from this
     *   sequence number
     * @param {Number} [params.limit] - maximum number of log records
     *   to return
     * @param {function} cb - callback function, called with an error
     *   object or null and an object as 2nd parameter
     * // CONTINUE HERE!!!
     *   object.info contains ...
     *   object.log contains ... (see recordstream below) and _processPrepareEntries function
     * in backbeat. batchState.logRes is object.log from here.
     *   
     * @return {undefined}
     */
    readRecords(params, cb) {

        this.moplog.tail();

        this.moplog.on('op', data => {
        console.log("op!! ", data);
        });

        this.moplog.on('insert', doc => {
        console.log("intert!! ", doc);
        });

        this.moplog.on('update', doc => {
        console.log("update!! ", doc);
        });

        this.moplog.on('delete', doc => {
        console.log("delete!! ", doc);
        });

        this.moplog.on('error', error => {
        console.log("error!!", error);
        });

        this.moplog.on('end', () => {
        console.log('On end. Stream ended');
        });

        // oplog.stop(() => {
        //   console.log('server stopped');
        // });


        // const recordStream = new ListRecordStream(this.logger);
        // const _params = params || {};

        // this.bucketClient.getRaftLog(
        //     this.raftSession, _params.startSeq, _params.limit,
        //     false, null, (err, data) => {
        //         if (err) {
        //             if (err.code === 404) {
        //                 // no such raft session, log and ignore
        //                 this.logger.warn('raft session does not exist yet',
        //                                  { raftId: this.raftSession });
        //                 return cb(null, { info: { start: null,
        //                     end: null } });
        //             }
        //             if (err.code === 416) {
        //                 // requested range not satisfiable
        //                 this.logger.debug('no new log record to process',
        //                                   { raftId: this.raftSession });
        //                 return cb(null, { info: { start: null,
        //                     end: null } });
        //             }
        //             this.logger.error(
        //                 'Error handling record log request', { error: err });
        //             return cb(err);
        //         }
        //         let logResponse;
        //         try {
        //             logResponse = JSON.parse(data);
        //         } catch (err) {
        //             this.logger.error('received malformed JSON',
        //                               { params });
        //             return cb(errors.InternalError);
        //         }
        //         logResponse.log.forEach(entry => recordStream.write(entry));
        //         recordStream.end();
        //         return cb(null, { info: logResponse.info,
        //             log: recordStream });
        //     }, this.logger.newRequestLogger());
    }
}

const tester = new LogConsumer({ host: 'localhost', port: '27018', logger: console })

tester.readRecords();

module.exports = LogConsumer;



sample put:

insert!!  { ts: Timestamp { _bsontype: 'Timestamp', low_: 1, high_: 1516323641 },
  t: 1,
  h: Long { _bsontype: 'Long', low_: -1207597211, high_: -1765392211 },
  v: 2,
  op: 'i',
  ns: 'metadata.hello',
  ui:
   Binary {
     _bsontype: 'Binary',
     sub_type: 4,
     position: 16,
     buffer: <Buffer 66 bd 4e 7d 0b 92 4a 12 b8 cc 77 b1 26 8a 94 cb> },
  wall: 2018-01-19T01:00:41.798Z,
  o:
   { _id: 'stuff4',
     value:
      { 'owner-display-name': 'Bart',
        'owner-id': '79a59df900b949e55d96a1e698fbacedfd6e09d98eacf8f8d5218e7cd47ef2be',
        'content-length': 508,
        'content-type': 'binary/octet-stream',
        'content-md5': '656c3fe292407ccfdc9b125b37cc1930',
        'x-amz-version-id': 'null',
        'x-amz-server-version-id': '',
        'x-amz-storage-class': 'STANDARD',
        'x-amz-server-side-encryption': '',
        'x-amz-server-side-encryption-aws-kms-key-id': '',
        'x-amz-server-side-encryption-customer-algorithm': '',
        'x-amz-website-redirect-location': '',
        acl: [Object],
        key: '',
        location: [Object],
        isDeleteMarker: false,
        tags: {},
        replicationInfo: [Object],
        dataStoreName: 'us-east-1',
        'last-modified': '2018-01-19T01:00:41.797Z',
        'md-model-version': 3,
        'x-amz-meta-s3cmd-attrs': 'uid:501/gname:staff/uname:lhs/gid:20/mode:33188/mtime:1508801827/atime:1516323377/md5:656c3fe292407ccfdc9b125b37cc1930/ctime:1508801827' } } }



        sample update:

        update!!  { ts: Timestamp { _bsontype: 'Timestamp', low_: 1, high_: 1516323702 },
  t: 1,
  h: Long { _bsontype: 'Long', low_: -1991728232, high_: -721376083 },
  v: 2,
  op: 'u',
  ns: 'metadata.hello',
  ui:
   Binary {
     _bsontype: 'Binary',
     sub_type: 4,
     position: 16,
     buffer: <Buffer 66 bd 4e 7d 0b 92 4a 12 b8 cc 77 b1 26 8a 94 cb> },
  o2: { _id: 'stuff4' },
  wall: 2018-01-19T01:01:42.050Z,
  o:
   { _id: 'stuff4',
     value:
      { 'owner-display-name': 'Bart',
        'owner-id': '79a59df900b949e55d96a1e698fbacedfd6e09d98eacf8f8d5218e7cd47ef2be',
        'content-length': 508,
        'content-type': 'binary/octet-stream',
        'content-md5': '656c3fe292407ccfdc9b125b37cc1930',
        'x-amz-version-id': 'null',
        'x-amz-server-version-id': '',
        'x-amz-storage-class': 'STANDARD',
        'x-amz-server-side-encryption': '',
        'x-amz-server-side-encryption-aws-kms-key-id': '',
        'x-amz-server-side-encryption-customer-algorithm': '',
        'x-amz-website-redirect-location': '',
        acl: [Object],
        key: '',
        location: [Object],
        isDeleteMarker: false,
        tags: {},
        replicationInfo: [Object],
        dataStoreName: 'us-east-1',
        'last-modified': '2018-01-19T01:01:42.022Z',
        'md-model-version': 3,
        'x-amz-meta-s3cmd-attrs': 'uid:501/gname:staff/uname:lhs/gid:20/mode:33188/mtime:1508801827/atime:1516323641/md5:656c3fe292407ccfdc9b125b37cc1930/ctime:1508801827' } } }



        sample delete:

        delete!!  { ts: Timestamp { _bsontype: 'Timestamp', low_: 1, high_: 1516323746 },
  t: 1,
  h: Long { _bsontype: 'Long', low_: 2036516563, high_: 689237179 },
  v: 2,
  op: 'd',
  ns: 'metadata.hello',
  ui:
   Binary {
     _bsontype: 'Binary',
     sub_type: 4,
     position: 16,
     buffer: <Buffer 66 bd 4e 7d 0b 92 4a 12 b8 cc 77 b1 26 8a 94 cb> },
  wall: 2018-01-19T01:02:26.962Z,
  o: { _id: 'stuff4' } }


