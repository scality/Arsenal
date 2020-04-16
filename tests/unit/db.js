'use strict';// eslint-disable-line strict

const assert = require('assert');

const leveldb = require('level');
const temp = require('temp');
temp.track();

const db = require('../../index').db;

const IndexTransaction = db.IndexTransaction;

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

    it('should refuse types other than del and put', done => {
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
});
