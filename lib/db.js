'use strict'; // eslint-disable-line strict

const writeOptions = { sync: true };

/**
 * Like Error, but with a property set to true.
 * TODO: this is copied from kineticlib, should consolidate with the
 * future errors module
 *
 * Example: instead of:
 *     const err = new Error("input is not a buffer");
 *     err.badTypeInput = true;
 *     throw err;
 * use:
 *     throw propError("badTypeInput", "input is not a buffer");
 *
 * @param {String} propName - the property name.
 * @param {String} message - the Error message.
 * @returns {Error} the Error object.
 */
function propError(propName, message) {
    const err = new Error(message);
    err[propName] = true;
    return err;
}

/**
 * Running transaction with multiple updates to be committed atomically
 */
class IndexTransaction {
    /**
     * Builds a new transaction
     *
     * @argument {Leveldb} db an open database to which the updates
     *                     will be applied
     *
     * @returns {IndexTransaction} a new empty transaction
     */
    constructor(db) {
        this.operations = [];
        this.db = db;
        this.closed = false;
    }

    /**
     * Adds a new operation to participate in this running transaction
     *
     * @argument {object} op an object with the following attributes:
     *                    {
     *                      type: 'put' or 'del',
     *                      key: the object key,
     *                      value: (optional for del) the value to store,
     *                    }
     *
     * @throws {Error} an error described by the following properties
     *                 - invalidTransactionVerb if op is not put or del
     *                 - pushOnCommittedTransaction if already committed
     *                 - missingKey if the key is missing from the op
     *                 - missingValue if putting without a value
     *
     * @returns {undefined}
     */
    push(op) {
        if (this.closed) {
            throw propError('pushOnCommittedTransaction',
                            'can not add ops to already committed transaction');
        }

        if (op.type !== 'put' && op.type !== 'del') {
            throw propError('invalidTransactionVerb',
                            `unknown action type: ${op.type}`);
        }

        if (op.key === undefined) {
            throw propError('missingKey', 'missing key');
        }

        if (op.type === 'put' && op.value === undefined) {
            throw propError('missingValue', 'missing value');
        }

        this.operations.push(op);
    }

    /**
     * Adds a new put operation to this running transaction
     *
     * @argument {string} key - the key of the object to put
     * @argument {string} value - the value to put
     *
     * @throws {Error} an error described by the following properties
     *                 - pushOnCommittedTransaction if already committed
     *                 - missingKey if the key is missing from the op
     *                 - missingValue if putting without a value
     *
     * @returns {undefined}
     *
     * @see push
     */
    put(key, value) {
        this.push({ type: 'put', key, value });
    }

    /**
     * Adds a new del operation to this running transaction
     *
     * @argument {string} key - the key of the object to delete
     *
     * @throws {Error} an error described by the following properties
     *                 - pushOnCommittedTransaction if already committed
     *                 - missingKey if the key is missing from the op
     *
     * @returns {undefined}
     *
     * @see push
     */
    del(key) {
        this.push({ type: 'del', key });
    }

    /**
     * Applies the queued updates in this transaction atomically.
     *
     * @argument {function} cb function to be called when the commit
     *              finishes, taking an optional error argument
     *
     * @returns {undefined}
     */
    commit(cb) {
        if (this.closed) {
            return cb(propError('alreadyCommitted',
                                'transaction was already committed'));
        }

        if (this.operations.length === 0) {
            return cb(propError('emptyTransaction',
                                'tried to commit an empty transaction'));
        }

        this.closed = true;

        // The array-of-operations variant of the `batch` method
        // allows passing options such has `sync: true` whereas the
        // chained form does not.
        return this.db.batch(this.operations, writeOptions, cb);
    }
}

module.exports = {
    IndexTransaction,
};
