import {
    supportedOperators,
    validateConditionsObject,
} from '../conditions';
import { VersioningConstants } from '../../../versioning/constants';
import errors from '../../../errors';

interface AuthCredentials {
    username?: string;
    password?: string;
}

interface ObjectMetadata {
    tags?: Record<string, string>;
    [key: string]: any;
}

interface IndexKey {
    key: string;
    order: number;
}

interface Index {
    name: string;
    keys: IndexKey[];
}

type Condition = string | number | boolean | Record<string, any>;

function escape(obj: Record<string, string>): Record<string, string> {
    const _obj: Record<string, string> = {};
    Object.keys(obj).forEach(prop => {
        const _prop = prop
            .replace(/\$/g, '\uFF04')
            .replace(/\./g, '\uFF0E');
        _obj[_prop] = obj[prop];
    });
    return _obj;
}

function unescape(obj: Record<string, string>): Record<string, string> {
    const _obj: Record<string, string> = {};
    Object.keys(obj).forEach(prop => {
        const _prop = prop
            .replace(/\uFF04/g, '$')
            .replace(/\uFF0E/g, '.');
        _obj[_prop] = obj[prop];
    });
    return _obj;
}

function serialize(objMD: ObjectMetadata): void {
    // Tags require special handling since dot and dollar are accepted
    if (objMD.tags) {
        objMD.tags = escape(objMD.tags);
    }
}

function unserialize(objMD: ObjectMetadata): void {
    if (objMD.tags) {
        objMD.tags = unescape(objMD.tags);
    }
}

function credPrefix(authCredentials?: AuthCredentials): string {
    if (authCredentials?.username && authCredentials?.password) {
        const username = encodeURIComponent(authCredentials.username);
        const password = encodeURIComponent(authCredentials.password);
        return `${username}:${password}@`;
    }
    return '';
}

function _assignCondition(prefix: string, object: Record<string, any>, cond: Condition): void {
    if (!validateConditionsObject(cond) || prefix === '') {
        throw errors.InternalError;
    }
    object[prefix] = cond;
}

/*
 * converts conditions object into mongodb-usable filters
 * Ex:
 *  {                              {
 *      hello: {
 *          world: 42   ====>           'hello.world': 42,
 *      }
 *  }                              }
 *
 *  {                              {
 *      hello: {
 *          world: {
 *              '$eq': 42  ====>        'hello.world': { '$eq': 42 },
 *          }
 *      }
 *  }                              }
 */
function translateConditions(
    depth: number,
    prefix: string,
    object: Record<string, any>,
    cond: Condition
): void {
    if (depth < 0 || depth > 10) {
        throw errors.InternalError;
    }

    if (Array.isArray(cond) || cond === null || cond === undefined) {
        throw errors.InternalError;
    }

    if (typeof cond !== 'object') {
        _assignCondition(prefix, object, cond);
        return;
    }

    const fields = Object.keys(cond as Record<string, any>);
    const opFields = fields.filter(f => supportedOperators[f]);
    
    if (fields.length === opFields.length) {
        _assignCondition(prefix, object, cond);
        return;
    }
    
    if (opFields.length === 0) {
        for (const f of fields) {
            if (f.startsWith('$')) {
                throw errors.InternalError;
            }
            const nPrefix = !prefix ? f : `${prefix}.${f}`;
            translateConditions(depth + 1, nPrefix, object, (cond as Record<string, any>)[f]);
        }
        return;
    }
    
    // mix of operators and nested fields
    throw errors.InternalError;
}

/**
 * format v0 master key
 * @param {String} key object key
 * @return {String} formatted key
 */
function formatMasterKeyV0(key: string): string {
    return key;
}

/**
 * Adds new prefix to v0 key
 * @param {String} key object key
 * @return {String} formatted key
 */
function formatMasterKeyV1(key: string): string {
    return `${VersioningConstants.DbPrefixes.Master}${key}`;
}

/**
 * format v0 version key
 * @param {String} key object key
 * @param {String} versionId object version
 * @return {String} formatted key
 */
function formatVersionKeyV0(key: string, versionId: string): string {
    return `${key}${VersioningConstants.VersionId.Separator}${versionId}`;
}

/**
 * Adds new prefix to v0 key
 * @param {String} key object key
 * @param {String} versionId object version
 * @return {String} formatted key
 */
function formatVersionKeyV1(key: string, versionId: string): string {
    return `${VersioningConstants.DbPrefixes.Version}${formatVersionKeyV0(key, versionId)}`;
}

/**
 * Formats master key according to bucket format version
 * @param {String} key object key
 * @param {String} vFormat bucket format version
 * @return {String} formatted key
 */
function formatMasterKey(key: string, vFormat: string): string {
    return vFormat === VersioningConstants.BucketVersioningKeyFormat.v1
        ? formatMasterKeyV1(key)
        : formatMasterKeyV0(key);
}

/**
 * Formats version key according to bucket format version
 * @param {String} key object key
 * @param {String} versionId object version
 * @param {String} vFormat bucket format version
 * @return {String} formatted key
 */
function formatVersionKey(key: string, versionId: string, vFormat: string): string {
    return vFormat === VersioningConstants.BucketVersioningKeyFormat.v1
        ? formatVersionKeyV1(key, versionId)
        : formatVersionKeyV0(key, versionId);
}

interface MongoIndex {
    name: string;
    key: Map<string, number> | Record<string, number>;
    [key: string]: any;
}

function indexFormatMongoArrayToObject(mongoIndexArray: MongoIndex[]): Index[] {
    return mongoIndexArray.map(idx => {
        const entries = idx.key instanceof Map
            ? Array.from(idx.key.entries())
            : Object.entries(idx.key);

        return {
            name: idx.name,
            keys: entries.map(([key, order]) => ({ key, order }))
        };
    });
}

function indexFormatObjectToMongoArray(indexObj: Index[]): MongoIndex[] {
    return indexObj.map(idx => {
        const key = new Map();
        idx.keys.forEach(k => key.set(k.key, k.order));

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { keys: _, ...toCopy } = idx;
        return { ...toCopy, name: idx.name, key };
    });
}

export {
    AuthCredentials,
    ObjectMetadata,
    IndexKey,
    Index,
    Condition,
    MongoIndex,
    credPrefix,
    escape,
    serialize,
    unescape,
    unserialize,
    translateConditions,
    formatMasterKey,
    formatVersionKey,
    indexFormatMongoArrayToObject,
    indexFormatObjectToMongoArray,
};
