import errors, { ArsenalError } from '../errors';
import { Version } from './Version';
import { generateVersionId as genVID } from './VersionID';
import WriteCache from './WriteCache';
import WriteGatheringManager from './WriteGatheringManager';

// some predefined constants
import { VersioningConstants } from './constants';
const VID_SEP = VersioningConstants.VersionId.Separator;

/**
 * Increment the charCode of the last character of a valid string.
 *
 * @param prefix - the input string
 * @return - the incremented string, or the input if it is not valid
 */
function getPrefixUpperBoundary(prefix: string): string {
    if (prefix) {
        return prefix.slice(0, prefix.length - 1) +
            String.fromCharCode(prefix.charCodeAt(prefix.length - 1) + 1);
    }
    return prefix;
}

function formatVersionKey(key: string, versionId: string): string {
    return `${key}${VID_SEP}${versionId}`;
}

function formatCacheKey(db: string, key: string): string {
    // using double VID_SEP to make sure the cache key is unique
    return `${db}${VID_SEP}${VID_SEP}${key}`;
}

const VID_SEPPLUS = getPrefixUpperBoundary(VID_SEP);

export default class VersioningRequestProcessor {
    writeCache: WriteCache;
    wgm: WriteGatheringManager;
    replicationGroupId: string;
    uidCounter: number;
    queue: {};
    repairing: {};

    /**
     * This class takes a random string generator as additional input.
     * @param writeCache - the WriteCache to which this
     *   will forward the cachable processed requests
     * @param writeGatheringManager - the
     *   WriteGatheringManager to which this will forward the
     *   non-cachable processed requests
     * @param versioning - versioning configurations
     * @param versioning.replicationGroupId - replication group id
     * @constructor
     */
    constructor(
        writeCache: WriteCache,
        writeGatheringManager: WriteGatheringManager,
        versioning: { replicationGroupId: string },
    ) {
        this.writeCache = writeCache;
        this.wgm = writeGatheringManager;
        this.replicationGroupId = versioning.replicationGroupId;
        // internal state
        this.uidCounter = 0;
        this.queue = {};
        this.repairing = {};
    }

    generateVersionId() {
        const info = this.uidCounter++;
        return genVID(info.toString(), this.replicationGroupId);
    }

    /**
     * Get a version of an object. If it is a place holder for
     * deletion, search by listing for the latest version then repair
     * it.
     *
     * @param request - the request in original
     *                           RepdConnection format { db, key
     *                           [, value][, type], method, options }
     * @param logger - logger
     * @param callback - callback function
     * @return - to finish the call
     */
    get(
        request: any,
        logger: RequestLogger,
        callback: (error: ArsenalError | null, data?: any) => void,
    ) {
        const { db, key, options } = request;
        logger.addDefaultFields({ bucket: db, key, options });
        if (options && options.versionId) {
            const keyVersionId = options.versionId === 'null' ? '' : options.versionId;
            const versionKey = formatVersionKey(key, keyVersionId);
            return this.wgm.get({ db, key: versionKey }, logger, callback);
        }
        return this.wgm.get(request, logger, (err, data) => {
            if (err) {
                return callback(err);
            }
            // answer if value is not a place holder for deletion
            if (!Version.isPHD(data)) {
                return callback(null, data);
            }
            logger.debug('master version is a PHD, getting the latest version');
            // otherwise, need to search for the latest version
            return this.getByListing(request, logger, callback);
        });
    }

    /**
     * Helper that lists version keys for a certain object key,
     * sorted by version ID. If a null key exists for this object, it is
     * sorted at the appropriate position by its internal version ID and
     * its key will be appended its internal version ID.
     *
     * @param {string} db - bucket name
     * @param {string} key - object key
     * @param {object} [options] - options object
     * @param {number} [options.limit] - max version keys returned
     * (returns all object version keys if not specified)
     * @param {object} logger - logger of the request
     * @param {function} callback - callback(err, {object|null} master, {array} versions)
     *                              master: { key, value }
     *                              versions: [{ key, value }, ...]
     * @return {undefined}
     */
    listVersionKeys(db, key, options, logger, callback) {
        const { limit } = options || {};
        const listingParams: any = {};
        let nullKeyLength;
        // include master key in v0 listing
        listingParams.gte = key;
        listingParams.lt = `${key}${VID_SEPPLUS}`;
        if (limit !== undefined) {
            // may have to skip master + null key, so 2 extra to list in the worst case
            listingParams.limit = limit + 2;
        }
        nullKeyLength = key.length + 1;
        return this.wgm.list({
            db,
            params: listingParams,
        }, logger, (err, rawVersions) => {
            if (err) {
                return callback(err);
            }
            if (rawVersions.length === 0) {
                // object does not have any version key
                return callback(null, null, []);
            }
            let versions = rawVersions;
            let master;
            // in v0 there is always a master key before versions
            master = versions.shift();
            if (versions.length === 0) {
                return callback(null, master, []);
            }
            const firstItem = versions[0];
            if (firstItem.key.length === nullKeyLength) {
                // first version is the null key
                const nullVersion = Version.from(firstItem.value);
                const nullVersionKey = formatVersionKey(key, <string> nullVersion.getVersionId());
                // find null key's natural versioning order in the list
                let nullPos = versions.findIndex(item => item.key > nullVersionKey);
                if (nullPos === -1) {
                    nullPos = versions.length;
                }
                // move null key at the correct position and append its real version ID to the key
                versions = versions.slice(1, nullPos)
                    .concat([{ key: nullVersionKey, value: firstItem.value, isNullKey: true }])
                    .concat(versions.slice(nullPos));
            }
            if (limit !== undefined) {
                // truncate versions to 'limit' entries
                versions.splice(limit);
            }
            return callback(null, master, versions);
        });
    }

    /**
     * Get the latest version of an object when the master version is a place
     * holder for deletion. For any given pair of db and key, only a
     * single process is performed at any moment. Subsequent get-by-listing
     * requests are queued up and these requests will have the same response.
     *
     * @param request - the request in original
     *                           RepdConnection format { db, key
     *                           [, value][, type], method, options }
     * @param logger - logger
     * @param callback - callback function
     * @return - to finish the call
     */
    getByListing(
        request: any,
        logger: RequestLogger,
        callback: (error: ArsenalError | null, data?: any) => void,
    ) {
        // enqueue the get entry; do nothing if another is processing it
        // this is to manage the number of expensive listings when there
        // are multiple concurrent gets on the same key which is a PHD version
        if (!this.enqueueGet(request, logger, callback)) {
            return null;
        }
        logger.info('start listing latest versions');
        // otherwise, search for the latest version
        const cacheKey = formatCacheKey(request.db, request.key);
        clearTimeout(this.repairing[cacheKey]);
        delete this.repairing[cacheKey];
        return this.listVersionKeys(request.db, request.key, {
            limit: 1,
        }, logger, (err, master, versions) => {
            logger.info('listing latest versions done', { err, master, versions });
            if (err) {
                return this.dequeueGet(request, err);
            }
            if (!master) {
                return this.dequeueGet(request, errors.ObjNotFound);
            }
            if (!Version.isPHD(master.value)) {
                return this.dequeueGet(request, null, master.value);
            }
            if (versions.length === 0) {
                logger.info('no other versions');
                this.dequeueGet(request, errors.ObjNotFound);
                return this.repairMaster(request, logger,
                    { type: 'del', value: master.value });
            }
            // need repair
            logger.info('update master by the latest version');
            const next = {
                value: versions[0].value,
                isNullKey: versions[0].isNullKey,
            };
            this.dequeueGet(request, null, next.value);
            return this.repairMaster(request, logger,
                { type: 'put', value: master.value, next });
        });
    }

    /**
     * Enqueue a get-by-listing request.
     *
     * @param request - the request in original
     *                           RepdConnection format { db, key
     *                           [, value][, type], method, options }
     * @param logger - logger
     * @param callback - callback function
     * @return - this request is the first in the queue or not
     */
    enqueueGet(
        request: any,
        logger: RequestLogger,
        callback: (error: ArsenalError | null, data?: any) => void,
    ): boolean {
        const cacheKey = formatCacheKey(request.db, request.key);
        // enqueue the get entry if another is processing it
        if (this.queue[cacheKey]) {
            this.queue[cacheKey].push({ request, logger, callback });
            return false;
        }
        // otherwise, create a queue and enqueue itself
        this.queue[cacheKey] = [{ request, logger, callback }];
        return true;
    }

    /**
     * Dequeue all pending get-by-listing requests by the result of the first
     * request in the queue.
     *
     * @param request - the request in original
     *                           RepdConnection format { db, key
     *                           [, value][, type], method, options }
     * @param err - resulting error of the first request
     * @param value - resulting value of the first request
     * @return
     */
    dequeueGet(request: any, err: ArsenalError | null, value?: string) {
        const cacheKey = formatCacheKey(request.db, request.key);
        if (this.queue[cacheKey]) {
            this.queue[cacheKey].forEach(entry => {
                if (err || value) {
                    return entry.callback(err, value);
                }
                return this.wgm.get(entry.request, entry.logger,
                    entry.callback);
            });
            delete this.queue[cacheKey];
        }
    }

    /**
     * Search for the latest version of an object to update its master version
     * in an atomic manner when the master version is a PHD.
     *
     * @param request - the request in original
     *                           RepdConnection format { db, key
     *                           [, value][, type], method, options }
     * @param logger - logger
     * @param {object} data - storing reparing hints
     * @param {string} data.value - existing value of the master version (PHD)
     * @param {object} data.next - the suggested latest version
     * @param {string} data.next.value - the suggested latest version value
     * @param {boolean} data.next.isNullKey - whether the suggested
     * latest version is a null key
     * @return - to finish the call
     */
    repairMaster(request: any, logger: RequestLogger, data: {
        type: 'put' | 'del';
        value: string;
        next?: {
            value: string;
            isNullKey: boolean;
        };
    }) {
        const { db, key } = request;
        logger.info('start repair process');
        this.writeCache.get({ db, key }, logger, (err, value) => {
            // error or the new version is not a place holder for deletion
            if (err) {
                if (err.is.ObjNotFound) {
                    return logger.debug('did not repair master: PHD was deleted');
                } else {
                    return logger.error('error repairing', { error: err });
                }
            }
            if (!Version.isPHD(value)) {
                return logger.debug('master is updated already');
            }
            // the latest version is the same place holder for deletion
            if (data.value === value) {
                // update the latest version with the next version
                const ops: any = [];
                if (data.next) {
                    ops.push({ key, value: data.next.value });
                    // cleanup the null key if it is the new master
                    if (data.next.isNullKey) {
                        ops.push({ key: formatVersionKey(key, ''), type: 'del' });
                    }
                } else {
                    ops.push({ key, type: 'del' });
                }
                const repairRequest = {
                    db,
                    array: ops,
                };
                logger.info('replicate repair request', { repairRequest });
                return this.writeCache.batch(repairRequest, logger, () => {});
            }
            // The latest version is an updated place holder for deletion,
            // repeat the repair process from listing for latest versions.
            // The queue will ensure single repair process at any moment.
            logger.info('latest version is an updated PHD');
            return this.getByListing(request, logger, () => {});
        });
    }

    /**
     * Process the request if it is a versioning request, or send it to the
     * next level replicator if it is not.
     *
     * @param request - the request in original
     *                           RepdConnection format { db, key
     *                           [, value][, type], method, options }
     * @param logger - logger
     * @param callback - expect callback(err, data)
     * @return - to finish the call
     */
    put(
        request: any,
        logger: RequestLogger,
        callback: (error: ArsenalError | null, data?: any) => void,
    ) {
        const { db, key, value, options } = request;
        logger.addDefaultFields({ bucket: db, key, options });
        // valid combinations of versioning options:
        // - !versioning && !versionId: normal non-versioning put
        // - versioning && !versionId: create a new version
        // - versionId: update (PUT/DELETE) an existing version, and
        //              also update master version in case the put
        //              version is newer or same version than master.
        //              if versionId === '' update master version
        const versioning = options &&
            (options.versioning || options.versioning === '');
        const versionId = options &&
            (options.versionId || options.versionId === '');

        const versioningCb = (err, array, vid) => {
            if (err) {
                return callback(err);
            }
            return this.writeCache.batch({ db, array, options },
                logger, err => callback(err, `{"versionId":"${vid}"}`));
        };

        if (versionId) {
            return this.processVersionSpecificPut(request, logger,
                versioningCb);
        }
        if (versioning) {
            return this.processNewVersionPut(request, logger, versioningCb);
        }
        // no versioning or versioning configuration off
        return this.writeCache.batch({ db, array: [{ key, value }] },
            logger, callback);
    }

    /**
     * Processes a versioning putObject request. This will create a batch of
     * operations for updating the master version and creating the specific
     * version.
     *
     * @param request - the request in original
     *                           RepdConnection format { db, key
     *                           [, value][, type], method, options }
     * @param logger - logger
     * @param callback - expect callback(err, batch, versionId)
     * @return - to finish the call
     */
    processNewVersionPut(
        request: any,
        logger: RequestLogger,
        callback: (
            error: null,
            data: { key: string; value: string }[],
            versionId: string,
        ) => void,
    ) {
        logger.info('process new version put');
        // making a new versionId and a new version key
        const versionId = this.generateVersionId();
        const versionKey = formatVersionKey(request.key, versionId);
        const versionValue = Version.appendVersionId(request.value, versionId);
        const ops = [
            { key: request.key, value: versionValue },
            { key: versionKey, value: versionValue },
        ];
        return callback(null, ops, versionId);
    }

    /**
     * Processes a version specific putObject request. This will create a batch
     * of operations for updating the target version, and the master version if
     * the target version is the latest.
     *
     * @param request - the request in original
     *                           RepdConnection format { db, key
     *                           [, value][, type], method, options }
     * @param logger - logger
     * @param callback - expect callback(err, batch, versionId)
     * @return - to finish the call
     */
    processVersionSpecificPut(
        request: any,
        logger: RequestLogger,
        callback: (err: ArsenalError | null, data?: any, versionId?: string) => void,
    ) {
        logger.info('process version specific put');
        const { db, key } = request;
        // versionId is empty: update the master version
        if (request.options.versionId === '') {
            const versionId = this.generateVersionId();
            const value = Version.appendVersionId(request.value, versionId);
            const ops: any = [{ key, value }];
            if (request.options.deleteNullKey) {
                const nullKey = formatVersionKey(key, '');
                ops.push({ key: nullKey, type: 'del' });
            }
            return callback(null, ops, versionId);
        }
        if (request.options.versionId === 'null') {
            const nullKey = formatVersionKey(key, '');
            return callback(null, [{ key: nullKey, value: request.value }], 'null');
        }
        // need to get the master version to check if this is the master version
        this.writeCache.get({ db, key }, logger, (err, data) => {
            if (err && !err.is.ObjNotFound) {
                return callback(err);
            }
            const versionId = request.options.versionId;
            const versionKey = formatVersionKey(key, versionId);
            const ops: any = [];
            if (!request.options.isNull) {
                ops.push({ key: versionKey, value: request.value });
            }
            if (data === undefined ||
                (Version.from(data).getVersionId() ?? '') >= versionId) {
                // master does not exist or is not newer than put
                // version and needs to be updated as well.
                // Note that older versions have a greater version ID.
                ops.push({ key: request.key, value: request.value });
            } else if (request.options.isNull) {
                logger.debug('create or update null key');
                const nullKey = formatVersionKey(key, '');
                ops.push({ key: nullKey, value: request.value });
            }
            return callback(null, ops, versionId);
        });
        return null;
    }


    del(
        request: any,
        logger: RequestLogger,
        callback: (err: ArsenalError | null, data?: any) => void,
    ) {
        const { db, key, options } = request;
        logger.addDefaultFields({ bucket: db, key, options });
        // no versioning or versioning configuration off
        if (!(options && options.versionId)) {
            logger.info('process non-versioned delete');
            return this.writeCache.batch({ db,
                array: [{ key, type: 'del' }] },
            logger, callback);
        }
        // version specific DELETE
        return this.processVersionSpecificDelete(request, logger,
            (err, array, vid) => {
                if (err) {
                    return callback(err);
                }
                return this.writeCache.batch({ db, array }, logger,
                    err => callback(err, `{"versionId":"${vid}"}`));
            });
    }

    /**
     * Processes a version specific deleteObject request. This will create a
     * batch of operations for deleting the specific version and marking the
     * master version of the object as a place holder for deletion if the
     * specific version is also the master version.
     *
     * @param request - the request in original
     *                           RepdConnection format { db, key
     *                           [, value][, type], method, options }
     * @param logger - logger
     * @param callback - expect callback(err, batch, versionId)
     * @return - to finish the call
     */
    processVersionSpecificDelete(
        request: any,
        logger: RequestLogger,
        callback: (
            error: ArsenalError | null,
            batch?: any,
            versionId?: string,
        ) => void,
    ) {
        logger.info('process version specific delete');
        const { db, key, options } = request;
        if (options.versionId === 'null') {
            const nullKey = formatVersionKey(key, '');
            return callback(null, [{ key: nullKey, type: 'del' }], 'null');
        }
        // deleting a specific version
        this.writeCache.get({ db, key }, logger, (err, data) => {
            if (err && !err.is.ObjNotFound) {
                return callback(err);
            }
            // delete the specific version
            const versionId = options.versionId;
            const keyVersionId = options.isNull ? '' : versionId;
            const versionKey = formatVersionKey(key, keyVersionId);
            const ops: any = [{ key: versionKey, type: 'del' }];
            // update the master version as PHD if it is the deleting version
            if (Version.isPHD(data) ||
                Version.from(data).getVersionId() === versionId) {
                const _vid = this.generateVersionId();
                ops.push({ key, value: Version.generatePHDVersion(_vid) });
                // start the repair process later
                const cacheKey = formatCacheKey(db, key);
                clearTimeout(this.repairing[cacheKey]);
                this.repairing[cacheKey] = setTimeout(() =>
                    this.getByListing(request, logger, () => {}), 15000);
            }
            return callback(null, ops, versionId);
        });
    }
}
