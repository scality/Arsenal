const errors = require('../../../errors').default;
const {
    supportedOperators,
    validateConditionsObject,
} = require('../conditions');
const { DbPrefixes, BucketVersioningKeyFormat } = require('../../../versioning/constants').VersioningConstants;
const VID_SEP = require('../../../versioning/constants')
    .VersioningConstants.VersionId.Separator;

function escape(obj) {
    const _obj = {};
    Object.keys(obj).forEach(prop => {
        const _prop = prop.
            replace(/\$/g, '\uFF04').
            replace(/\./g, '\uFF0E');
        _obj[_prop] = obj[prop];
    });
    return _obj;
}

function unescape(obj) {
    const _obj = {};
    Object.keys(obj).forEach(prop => {
        const _prop = prop.
            replace(/\uFF04/g, '$').
            replace(/\uFF0E/g, '.');
        _obj[_prop] = obj[prop];
    });
    return _obj;
}

function serialize(objMD) {
    // Tags require special handling since dot and dollar are accepted
    if (objMD.tags) {
        // eslint-disable-next-line
        objMD.tags = escape(objMD.tags);
    }
}

function unserialize(objMD) {
    // Tags require special handling
    if (objMD.tags) {
        // eslint-disable-next-line
        objMD.tags = unescape(objMD.tags);
    }
}

function credPrefix(authCredentials) {
    let cred = '';

    if (authCredentials &&
        authCredentials.username &&
        authCredentials.password) {
        const username = encodeURIComponent(authCredentials.username);
        const password = encodeURIComponent(authCredentials.password);
        cred = `${username}:${password}@`;
    }

    return cred;
}

function _assignCondition(prefix, object, cond) {
    if (!validateConditionsObject(cond) || prefix === '') {
        throw errors.InternalError;
    }
    // eslint-disable-next-line no-param-reassign
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
function translateConditions(depth, prefix, object, cond) {
    if (depth < 0 || depth > 10) {
        throw errors.InternalError;
    }

    if (Array.isArray(cond) ||
        cond === null ||
        cond === undefined) {
        throw errors.InternalError;
    }

    if (typeof cond !== 'object') {
        _assignCondition(prefix, object, cond);
        return;
    }

    const fields = Object.keys(cond);
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
            translateConditions(depth + 1, nPrefix, object, cond[f]);
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
function formatMasterKeyV0(key) {
    return key;
}

/**
 * Adds new prefix to v0 key
 * @param {String} key object key
 * @return {String} formatted key
 */
function formatMasterKeyV1(key) {
    return `${DbPrefixes.Master}${key}`;
}

/**
 * format v0 version key
 * @param {String} key object key
 * @param {String} versionId object version
 * @return {String} formatted key
 */
function formatVersionKeyV0(key, versionId) {
    return `${key}${VID_SEP}${versionId}`;
}

/**
 * Adds new prefix to v0 key
 * @param {String} key object key
 * @param {String} versionId object version
 * @return {String} formatted key
 */
function formatVersionKeyV1(key, versionId) {
    return `${DbPrefixes.Version}${formatVersionKeyV0(key, versionId)}`;
}

/**
 * Formats master key according to bucket format version
 * @param {String} key object key
 * @param {String} vFormat bucket format version
 * @return {String} formatted key
 */
function formatMasterKey(key, vFormat) {
    if (vFormat === BucketVersioningKeyFormat.v1) {
        return formatMasterKeyV1(key);
    }
    return formatMasterKeyV0(key);
}

/**
 * Formats version key according to bucket format version
 * @param {String} key object key
 * @param {String} versionId object version
 * @param {String} vFormat bucket format version
 * @return {String} formatted key
 */
function formatVersionKey(key, versionId, vFormat) {
    if (vFormat === BucketVersioningKeyFormat.v1) {
        return formatVersionKeyV1(key, versionId);
    }
    return formatVersionKeyV0(key, versionId);
}


module.exports = {
    credPrefix,
    escape,
    serialize,
    unescape,
    unserialize,
    translateConditions,
    formatMasterKey,
    formatVersionKey,
};
