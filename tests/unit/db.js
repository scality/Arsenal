'use strict';// eslint-disable-line strict

const assert = require('assert');
const async = require('async');

const leveldb = require('level');
const temp = require('temp');
temp.track();

const db = require('../../index').db;
const errors = require('../../lib/errors');
const { ifNoneMatch } = require('../../lib/constants');

const IndexTransaction = db.IndexTransaction;
const key1 = 'key1';
const key2 = 'key2';
const key3 = 'key3';
const value1 = 'value1';
const value2 = 'value2';
const value3 = 'value3';

function createDb() {
    const indexPath = temp.mkdirSync();
    return leveldb(indexPath, { valueEncoding: 'json' });
}

function checkValueInDb(db, k, v, done) {
    db.get(k, (err, value) => {
        if (err) {
            return done(err);
        }

        if (value === v) {
            return done();
        }

        return done(new Error('values differ'));
    });
}

function checkValueNotInDb(db, k, done) {
    db.get(k, (err, value) => {
        if (!err || (err && !err.notFound)) {
            return done(new Error(`value still in db: ${value}`));
        }

        return done();
    });
}
function checkKeyInDB(db, key, cb) {
    return db.get(key, (err, value) => {
        if (value || (err && !err.stack.includes('Error: NotFound:'))) {
            return cb(errors.EntityAlreadyExists);
        }
        return cb();
    });
}


class ConditionalLevelDB {
    constructor() {
        this.db = createDb();
    }

    batch(conditionalOperations, writeOptions, cb) {
        const { db } = this.db;
        const operations = Array.from(conditionalOperations);
        return async.eachOfLimit(operations, 10, (op, index, asyncCallback) => {
            if (op.type !== 'cond_put') {
                return asyncCallback(null, true);
            }
            return async.series([
                next => checkKeyInDB(db, op.key, next),
                next => {
                    operations[index].type = 'put';
                    return next();
                },
            ], asyncCallback);
        }, err => {
            if (err) {
                return cb(err);
            }
            return this.db.batch(operations, writeOptions, cb);
        });
    }

    get client() {
        return this.db.db;
    }
}

describe('IndexTransaction', () => {
    it('should allow put', done => {
        const db = createDb();
        const transaction = new IndexTransaction(db);

        transaction.push({
            type: 'put',
            key: 'k',
            value: 'v',
        });

        transaction.commit(err => {
            if (err) {
                return done(err);
            }

            return checkValueInDb(db, 'k', 'v', done);
        });
    });

    it('should allow del', done => {
        const db = createDb();
        const transaction = new IndexTransaction(db);

        transaction.push({
            type: 'del',
            key: 'k',
        });

        db.put('k', 'v', err => {
            if (err) {
                return done(err);
            }

            return transaction.commit(err => {
                if (err) {
                    return done(err);
                }

                return checkValueNotInDb(db, 'k', done);
            });
        });
    });

    it('should allow conditional put', done => {
        const db = new ConditionalLevelDB();
        const { client } = db;
        const transaction = new IndexTransaction(db);
        transaction.push({
            type: 'cond_put',
            key: key1,
            value: value1,
            conditionOperation: ifNoneMatch,
            conditionValue: '*',
        });
        return async.series([
            next => transaction.commit(next),
            next => client.get(key1, next),
        ], (err, res) => {
            assert.ifError(err);
            assert.strictEqual(res[1], value1);
            return done();
        });
    });

    it('should commit put and del combined', done => {
        const db = createDb();
        const transaction = new IndexTransaction(db);

        transaction.push({
            type: 'del',
            key: 'k1',
        });

        transaction.push({
            type: 'put',
            key: 'k2',
            value: 'v3',
        });

        function commitTransactionAndCheck(err) {
            if (err) {
                return done(err);
            }

            return transaction.commit(err => {
                if (err) {
                    return done(err);
                }

                return checkValueNotInDb(db, 'k1', err => {
                    if (err) {
                        return done(err);
                    }

                    return checkValueInDb(db, 'k2', 'v3', done);
                });
            });
        }

        db.batch()
            .put('k1', 'v1')
            .put('k2', 'v2')
            .write(commitTransactionAndCheck);
    });

    it('should commit cond_put and del combined', done => {
        const db = new ConditionalLevelDB();
        const { client } = db;
        const transaction = new IndexTransaction(db);

        transaction.push({
            type: 'del',
            key: key1,
        });

        transaction.push({
            type: 'cond_put',
            key: key2,
            value: value2,
            conditionOperation: ifNoneMatch,
            conditionValue: '*',
        });

        function commitTransactionAndCheck(err) {
            if (err) {
                return done(err);
            }
            return async.series([
                next => transaction.commit(next),
                next => client.get(key2, next),
                next => client.get(key1, (err, value) => {
                    if (err && !err.stack.includes('Error: NotFound:')) {
                        return next(err);
                    }
                    if (value) {
                        return next(errors.EntityAlreadyExists);
                    }
                    return next();
                }),
            ], (err, res) => {
                assert.ifError(err);
                assert.strictEqual(res[1], value2);
                return done();
            });
        }

        client.batch()
            .put(key1, value1)
            .write(commitTransactionAndCheck);
    });

    it('should commit put and cond_put combined', done => {
        const db = new ConditionalLevelDB();
        const { client } = db;
        const transaction = new IndexTransaction(db);

        transaction.push({
            type: 'put',
            key: key1,
            value: value2,
        });

        transaction.push({
            type: 'cond_put',
            key: key2,
            value: value2,
            conditionOperation: ifNoneMatch,
            conditionValue: '*',
        });

        function commitTransactionAndCheck(err) {
            if (err) {
                return done(err);
            }
            return async.series([
                next => transaction.commit(next),
                next => client.get(key2, next),
                next => client.get(key1, next),
            ], (err, res) => {
                assert.ifError(err);
                assert.strictEqual(res[1], value2);
                assert.strictEqual(res[2], value2);
                return done();
            });
        }

        client.batch()
            .put(key1, value1)
            .write(commitTransactionAndCheck);
    });


    it('should commit put, cond_put and del combined', done => {
        const db = new ConditionalLevelDB();
        const { client } = db;
        const transaction = new IndexTransaction(db);

        transaction.push({
            type: 'put',
            key: key1,
            value: value2,
        });

        transaction.push({
            type: 'cond_put',
            key: key2,
            value: value2,
            conditionOperation: ifNoneMatch,
            conditionValue: '*',
        });

        transaction.push({
            type: 'del',
            key: key3,
        });

        function commitTransactionAndCheck(err) {
            if (err) {
                return done(err);
            }
            return async.series([
                next => transaction.commit(next),
                next => client.get(key1, next),
                next => client.get(key2, next),
                next => client.get(key3, (err, value) => {
                    if (err && !err.stack.includes('Error: NotFound:')) {
                        return next(err);
                    }
                    if (value) {
                        return next(errors.EntityAlreadyExists);
                    }
                    return next();
                }),
            ], (err, res) => {
                assert.ifError(err);
                assert.strictEqual(res[1], value2);
                assert.strictEqual(res[2], value2);
                return done();
            });
        }
        client.batch()
            .put(key1, value1)
            .put(key3, value3)
            .write(commitTransactionAndCheck);
    });

    it('should refuse a conditional put if key is already present', done => {
        const db = new ConditionalLevelDB();
        const { client } = db;
        const transaction = new IndexTransaction(db);

        function tryPushAgain(err) {
            if (err) {
                return done(err);
            }
            transaction.push({
                type: 'cond_put',
                key: key1,
                value: value2,
                conditionOperation: ifNoneMatch,
                conditionValue: '*',
            });
            return transaction.commit(err => {
                if (!err || !err.EntityAlreadyExists) {
                    return done(new Error('should not be able to conditional put for duplicate key'));
                }
                return done();
            });
        }

        client.batch()
            .put(key1, value1)
            .write(tryPushAgain);
    });

    it('should refuse types other than del, put and cond_put', done => {
        const transaction = new IndexTransaction();

        function tryPush() {
            transaction.push({
                type: 'append',
                key: 'k',
                value: 'v',
            });
        }

        function validateError(err) {
            if (err && err.invalidTransactionVerb) {
                done();
                return true;
            }

            return done(new Error('should have denied verb append'));
        }

        assert.throws(tryPush, validateError);
    });

    it('should refuse put without key', done => {
        const transaction = new IndexTransaction();

        function tryPush() {
            transaction.push({
                type: 'put',
                value: 'v',
            });
        }

        function validateError(err) {
            if (err && err.missingKey) {
                done();
                return true;
            }

            return done(new Error('should have detected missing key'));
        }

        assert.throws(tryPush, validateError);
    });

    it('should refuse cond_put without key', done => {
        const transaction = new IndexTransaction();
        try {
            transaction.push({
                type: 'cond_put',
                value: value1,
                conditionOperation: ifNoneMatch,
                conditionValue: '*',
            });
            return done(new Error('should have detected missing key'));
        } catch (err) {
            if (err && err.missingKey) {
                return done();
            }
            return done(err);
        }
    });
    it('should refuse cond_put without conditional put operation', done => {
        const transaction = new IndexTransaction();
        try {
            transaction.push({
                type: 'cond_put',
                key: key1,
                value: value1,
                conditionValue: '*',
            });
            return done(new Error('should have detected missing conditional put operation'));
        } catch (err) {
            if (err && err.missingConditionalPutOperation) {
                return done();
            }
            return done(err);
        }
    });
    it('should refuse cond_put without conditional put value', done => {
        const transaction = new IndexTransaction();
        try {
            transaction.push({
                type: 'cond_put',
                key: key1,
                value: value1,
                conditionOperation: ifNoneMatch,
            });
            return done(new Error('should have detected missing conditional put value'));
        } catch (err) {
            if (err && err.missingConditionalPutValue) {
                return done();
            }
            return done(err);
        }
    });
    it('should refuse conditional put without value', done => {
        const transaction = new IndexTransaction();
        try {
            transaction.push({
                type: 'cond_put',
                key: key1,
                conditionOperation: ifNoneMatch,
                conditionValue: '*',
            });
            return done(new Error('should have detected missing value for a conditional put'));
        } catch (err) {
            if (err && err.missingValue) {
                return done();
            }
            return done(err);
        }
    });

    it('should refuse del without key', done => {
        const transaction = new IndexTransaction();

        function tryPush() {
            transaction.push({
                type: 'del',
            });
        }

        function validateError(err) {
            if (err && err.missingKey) {
                done();
                return true;
            }

            return done(new Error('should have detected missing key'));
        }

        assert.throws(tryPush, validateError);
    });

    it('should refuse put without value', done => {
        const transaction = new IndexTransaction();

        function tryPush() {
            transaction.push({
                type: 'put',
                key: 'k',
            });
        }

        function validateError(err) {
            if (err && err.missingValue) {
                done();
                return true;
            }

            return done(new Error('should have detected missing value'));
        }

        assert.throws(tryPush, validateError);
    });

    it('should refuse to commit without any ops', done => {
        const transaction = new IndexTransaction();

        transaction.commit(err => {
            if (err && err.emptyTransaction) {
                return done();
            }

            return done(new Error('allowed to commit an empty transaction'));
        });
    });

    it('should refuse to commit twice', done => {
        const transaction = new IndexTransaction(createDb());

        transaction.push({
            type: 'put',
            key: 'k',
            value: 'v',
        });

        function tryCommitAgain(err) {
            if (err) {
                return done(err);
            }

            return transaction.commit(err2 => {
                if (err2 && err2.alreadyCommitted) {
                    return done();
                }

                return done(new Error('allowed to commit twice'));
            });
        }

        transaction.commit(tryCommitAgain);
    });

    it('should refuse add an op if already committed', done => {
        const transaction = new IndexTransaction(createDb());

        function push() {
            transaction.push({
                type: 'put',
                key: 'k',
                value: 'v',
            });
        }

        function validateError(err) {
            if (err && err.pushOnCommittedTransaction) {
                done();
                return true;
            }

            return done(new Error());
        }

        function tryPushAgain(err) {
            if (err) {
                return done(err);
            }

            return assert.throws(push, validateError);
        }

        push();
        transaction.commit(tryPushAgain);
    });

    it('should have a working put shortcut method', done => {
        const db = createDb();
        const transaction = new IndexTransaction(db);

        transaction.put('k', 'v');

        transaction.commit(err => {
            if (err) {
                return done(err);
            }

            return checkValueInDb(db, 'k', 'v', done);
        });
    });

    it('should have a working del shortcut method', done => {
        const db = createDb();
        const transaction = new IndexTransaction(db);

        transaction.del('k');

        db.put('k', 'v', err => {
            if (err) {
                return done(err);
            }

            return transaction.commit(err => {
                if (err) {
                    return done(err);
                }

                return checkValueNotInDb(db, 'k', done);
            });
        });
    });

    it('should have a working conditional put shortcut method', done => {
        const db = new ConditionalLevelDB();
        const { client } = db;
        const transaction = new IndexTransaction(db);
        transaction.condPut(key1, value1, ifNoneMatch, '*');
        transaction.commit(err => {
            if (err) {
                return done(err);
            }
            return checkValueInDb(client, key1, value1, done);
        });
    });
});
