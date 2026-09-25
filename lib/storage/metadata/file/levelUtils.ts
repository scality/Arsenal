import { Readable } from 'stream';

// level-sublevel stored a nested path as a single '!a#b!key' section, where
// abstract-level nests them as '!a!!b!key'. Flattening the path into one
// sublevel name reproduces the historical layout, so databases written by
// previous versions stay readable.
const PATH_SEP = '#';

/** Iterator subset used here, as returned by abstract-level databases. */
export interface LevelIterator<T> {
    next(): Promise<T | undefined>;
    close(): Promise<void>;
}

/**
 * Database subset used here: `classic-level` at runtime, or any of its
 * sublevels, which expose the same interface.
 */
export interface LevelDatabase {
    sublevel(name: string, options: { keyEncoding: unknown; valueEncoding: unknown }): LevelDatabase;
    iterator(options?: Record<string, unknown>): LevelIterator<[string, string]>;
    keys(options?: Record<string, unknown>): LevelIterator<string>;
    keyEncoding(): unknown;
    valueEncoding(): unknown;
}

/** Batch operation as received over RPC, targetting a sublevel by path. */
export type BatchOperation = {
    prefix?: string[];
    sublevel?: LevelDatabase;
    [field: string]: unknown;
};

const subLevelCaches = new WeakMap<LevelDatabase, Map<string, LevelDatabase>>();

/**
 * Open the sublevel at the given path, from the root of the database.
 *
 * Sublevels are looked up on every request so they are cached, and encodings
 * are not inherited from the parent database so they have to be passed along.
 *
 * @param rootDb - database holding the sublevel hierarchy
 * @param path - sublevel path, empty for the root sublevel
 * @return the sublevel handle
 */
export function openSubLevel(rootDb: LevelDatabase, path: string[]): LevelDatabase {
    let cache = subLevelCaches.get(rootDb);
    if (cache === undefined) {
        cache = new Map();
        subLevelCaches.set(rootDb, cache);
    }
    const name = path.join(PATH_SEP);
    let subDb = cache.get(name);
    if (subDb === undefined) {
        subDb = rootDb.sublevel(name, {
            keyEncoding: rootDb.keyEncoding(),
            valueEncoding: rootDb.valueEncoding(),
        });
        cache.set(name, subDb);
    }
    return subDb;
}

/**
 * Expose an abstract-level iterator as a readable stream: the RPC layer
 * detects streams to pipe them back to the client, and cannot do so with an
 * async iterator.
 */
class IteratorStream<TEntry, TOutput> extends Readable {
    // not named `iterator`, which Readable already defines
    dbIterator: LevelIterator<TEntry>;
    mapEntry: (entry: TEntry) => TOutput;
    iteratorClosed: boolean;

    constructor(iterator: LevelIterator<TEntry>, mapEntry: (entry: TEntry) => TOutput) {
        super({ objectMode: true });
        this.dbIterator = iterator;
        this.mapEntry = mapEntry;
        this.iteratorClosed = false;
    }

    _read() {
        if (this.iteratorClosed) {
            return;
        }
        this.dbIterator
            .next()
            .then(entry => {
                if (entry === undefined) {
                    return this._closeIterator(() => this.push(null));
                }
                return this.push(this.mapEntry(entry));
            })
            .catch(err => this.destroy(err));
    }

    _destroy(err: Error | null, cb: (error?: Error | null) => void) {
        this._closeIterator(() => cb(err));
    }

    _closeIterator(cb: (err?: Error | null) => void) {
        if (this.iteratorClosed) {
            return cb();
        }
        this.iteratorClosed = true;
        return this.dbIterator.close().then(
            () => cb(),
            err => cb(err),
        );
    }
}

/** Stream the entries of a database as { key, value } objects. */
export function createReadStream(db: LevelDatabase, options?: Record<string, unknown>) {
    return new IteratorStream(db.iterator(options), ([key, value]) => ({ key, value }));
}

/** Stream the keys of a database. */
export function createKeyStream(db: LevelDatabase, options?: Record<string, unknown>) {
    return new IteratorStream(db.keys(options), key => key);
}

/**
 * Resolve the sublevel each operation of a batch targets. Operations come
 * from RPC clients and from the record log, so they carry a sublevel path
 * rather than a database handle.
 *
 * @param rootDb - database holding the sublevel hierarchy
 * @param ops - batch operations, with a `prefix` path
 * @return batch operations targetting a sublevel
 */
export function resolveBatchSubLevels(rootDb: LevelDatabase, ops: BatchOperation[]): BatchOperation[] {
    return ops.map(op => {
        if (!op.prefix) {
            return op;
        }
        const operation: BatchOperation = Object.assign({}, op, {
            sublevel: openSubLevel(rootDb, op.prefix),
        });
        delete operation.prefix;
        return operation;
    });
}
