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
 * @param propName - the property name.
 * @param message - the Error message.
 * @returns the Error object.
 */
function propError(propName: string, message: string): Error {
    const err = new Error(message);
    err[propName] = true;
    // @ts-ignore
    err.is = { [propName]: true };
    return err;
}

/**
 * Running transaction with multiple updates to be committed atomically
 */
export class IndexTransaction {
    operations: { type: 'put' | 'del'; key: string; value?: any }[];
    db: any;
    closed: boolean;
    conditions: { [key: string]: string }[];

    /**
     * Builds a new transaction
     *
     * @argument {Leveldb} db an open database to which the updates
     *                     will be applied
     *
     * @returns a new empty transaction
     */
    constructor(db: any) {
        this.operations = [];
        this.db = db;
        this.closed = false;
        this.conditions = [];
    }

    /**
     * Adds a new operation to participate in this running transaction
     *
     * @argument op an object with the following attributes:
     *                    {
     *                      type: 'put' or 'del',
     *                      key: the object key,
     *                      value: (optional for del) the value to store,
     *                    }
     *
     * @throws an error described by the following properties
     *                 - invalidTransactionVerb if op is not put or del
     *                 - pushOnCommittedTransaction if already committed
     *                 - missingKey if the key is missing from the op
     *                 - missingValue if putting without a value
     */
    push(op: { type: 'put'; key: string; value: any }): void;
    push(op: { type: 'del'; key: string }): void;
    push(op: { type: 'put' | 'del'; key: string; value?: any }): void {
        if (this.closed) {
            throw propError(
                'pushOnCommittedTransaction',
                'can not add ops to already committed transaction'
            );
        }

        if (op.type !== 'put' && op.type !== 'del') {
            throw propError(
                'invalidTransactionVerb',
                `unknown action type: ${op.type}`
            );
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
     * @see push
     */
    put(key: string, value: any) {
        this.push({ type: 'put', key, value });
    }

    /**
     * Adds a new del operation to this running transaction
     *
     * @argument key - the key of the object to delete
     *
     * @throws an error described by the following properties
     *                 - pushOnCommittedTransaction if already committed
     *                 - missingKey if the key is missing from the op
     *
     * @see push
     */
    del(key: string) {
        this.push({ type: 'del', key });
    }

    /**
     * Adds a condition for the transaction
     *
     * @argument condition an object with the following attributes:
     *                    {
     *                      <condition>: the object key
     *                    }
     *                    example: { notExists: 'key1' }
     *
     * @throws an error described by the following properties
     *                 - pushOnCommittedTransaction if already committed
     *                 - missingCondition if the condition is empty
     *
     */
    addCondition(condition: { [key: string]: string }) {
        if (this.closed) {
            throw propError(
                'pushOnCommittedTransaction',
                'can not add conditions to already committed transaction'
            );
        }
        if (condition === undefined || Object.keys(condition).length === 0) {
            throw propError(
                'missingCondition',
                'missing condition for conditional put'
            );
        }
        if (typeof condition.notExists !== 'string') {
            throw propError(
                'unsupportedConditionalOperation',
                'missing key or supported condition'
            );
        }
        this.conditions.push(condition);
    }

    /**
     * Applies the queued updates in this transaction atomically.
     *
     * @argument cb function to be called when the commit
     *              finishes, taking an optional error argument
     *
     */
    commit(cb: (error: Error | null, data?: any) => void) {
        if (this.closed) {
            return cb(
                propError(
                    'alreadyCommitted',
                    'transaction was already committed'
                )
            );
        }

        if (this.operations.length === 0) {
            return cb(
                propError(
                    'emptyTransaction',
                    'tried to commit an empty transaction'
                )
            );
        }

        this.closed = true;
        const options = { sync: true, conditions: this.conditions };

        // The array-of-operations variant of the `batch` method
        // allows passing options such has `sync: true` whereas the
        // chained form does not.
        return this.db.batch(this.operations, options, cb);
    }
}
