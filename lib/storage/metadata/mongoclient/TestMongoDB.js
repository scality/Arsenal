const async = require('async');
const stream = require('stream');
const MongoClient = require('mongodb').MongoClient;
const mongoOplog = require('mongo-oplog');
const errors = require('../../../errors');

MongoClient.connect(`mongodb://localhost:27018,localhost:27017,localhost:27019/local`, { replicaSet: 'rs0' }, (err, res) => {
    let db = res.db('local');
    let coll = db.collection('oplog.rs');

    async.waterfall([
        next => {
            return coll.find({}, { ts: 1 })
                .sort({ $natural: -1 })
                .limit(1)
                .toArray((err, cursor) => {
            // .sort({ $natural: -1 })
            // .limit(1)
            // .nextObject((err, cursor) => {
            //     console.log('err', err);
            //     console.log('cursor', cursor);
            //     return next(null, cursor);
                console.log('INITIAL CURSOR', cursor);
                console.log('INITIAL CURSOR TS', cursor.ts);
                return next(null, cursor.ts);
            });
        },
        (cursor, next) => {
            console.log('CURSOR IS', cursor);
            return coll.find({cursor, ns: /metadata.+/}, {
                tailable: true,
                awaitData: true,
                noCursorTimeout: true,
                OplogReplay: true,
                numberOfRetries: Number.MAX_VALUE
            }, (err, res) => {
                // console.log('err from cursor find', err);
                let stream = res.stream();
                stream.on('data', data => {
                    console.log('data for tailing', data);
                });
                stream.on('error', data => {
                    console.log('ERROR', data);
                })
                stream.on('end', data => {
                    console.log('stream ended');
                });
                return next(null, res.stream());
            });
        },
        (stream, next) => {
            stream.on('data', data => {
                console.log('data for tailing', data);
            });

            stream.on('end', data => {
                return next();
            });
        },
    ], () => {});
//    console.log('val from coll find', val);

    // coll.find({}, {
    //     tailable: true,
    //     awaitData: true,
    //     oplogReplace: true,
    //     noCursorTimeout: true,
    //     numberOfRetries: Number.MAX_VALUE
    // }).stream();
    // stream.on('data', function(val) {
    //     console.log('Doc: %j',val);
    // });
    // stream.on('error', function(val) {
    //     console.log('Error: %j', val);
    // });
    //
    // stream.on('end', function(){
    //     console.log('End of stream');
    // });
    // db.collection('oplog.rs', function (err, coll) {
    //     console.log('COLL', coll);
    //     var seekCursor = coll.find({}).sort({$natural: -1}).limit(1);
    //
    //     seekCursor.nextObject((err, latest) => {
    //         // if (latest) {
    //         //     filter._id = { $gt: latest._id }
    //         // }
    //
    //         var cursorOptions = {
    //             tailable: true,
    //             awaitdata: true,
    //             numberOfRetries: Number.MAX_VALUE
    //         };
    //
    //         var stream = coll.find({}, cursorOptions).stream();
    //

    //     });
});
