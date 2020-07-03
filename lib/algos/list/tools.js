const { DbPrefixes } = require('../../versioning/constants').VersioningConstants;

// constants for extensions
const SKIP_NONE = undefined; // to be inline with the values of NextMarker
const FILTER_ACCEPT = 1;
const FILTER_SKIP = 0;
const FILTER_END = -1;

/**
 * This function check if number is valid
 * To be valid a number need to be an Integer and be lower than the limit
 *                  if specified
 * If the number is not valid the limit is returned
 * @param {Number} number - The number to check
 * @param {Number} limit - The limit to respect
 * @return {Number} - The parsed number || limit
 */
function checkLimit(number, limit) {
    const parsed = Number.parseInt(number, 10);
    const valid = !Number.isNaN(parsed) && (!limit || parsed <= limit);
    return valid ? parsed : limit;
}

/**
 * Increment the charCode of the last character of a valid string.
 *
 * @param {string} str - the input string
 * @return {string} - the incremented string
 *                    or the input if it is not valid
 */
function inc(str) {
    return str ? (str.slice(0, str.length - 1) +
            String.fromCharCode(str.charCodeAt(str.length - 1) + 1)) : str;
}

/**
 * Transform listing parameters for v0 versioning key format to make
 * it compatible with v1 format
 *
 * @param {object} v0params - listing parameters for v0 format
 * @return {object} - listing parameters for v1 format
 */
function listingParamsMasterKeysV0ToV1(v0params) {
    const v1params = Object.assign({}, v0params);
    if (v0params.gt !== undefined) {
        v1params.gt = `${DbPrefixes.Master}${v0params.gt}`;
    } else if (v0params.gte !== undefined) {
        v1params.gte = `${DbPrefixes.Master}${v0params.gte}`;
    } else {
        v1params.gte = DbPrefixes.Master;
    }
    if (v0params.lt !== undefined) {
        v1params.lt = `${DbPrefixes.Master}${v0params.lt}`;
    } else if (v0params.lte !== undefined) {
        v1params.lte = `${DbPrefixes.Master}${v0params.lte}`;
    } else {
        v1params.lt = inc(DbPrefixes.Master); // stop after the last master key
    }
    return v1params;
}

function listingParamsV0ToV0Mig(v0params) {
    if ((v0params.gt !== undefined && v0params.gt >= inc(DbPrefixes.V1))
        || (v0params.gte !== undefined && v0params.gte >= inc(DbPrefixes.V1))
        || (v0params.lt !== undefined && v0params.lt <= DbPrefixes.V1)) {
        return v0params;
    }
    if ((v0params.gt !== undefined && v0params.gt >= DbPrefixes.V1)
        || (v0params.gte !== undefined && v0params.gte >= DbPrefixes.V1)) {
        const v0migParams = Object.assign({}, v0params);
        let greaterParam;
        if (v0params.gt !== undefined) {
            v0migParams.gt = inc(DbPrefixes.V1);
            greaterParam = v0migParams.gt;
        }
        if (v0params.gte !== undefined) {
            v0migParams.gte = inc(DbPrefixes.V1);
            greaterParam = v0migParams.gte;
        }
        if (v0params.lt !== undefined && greaterParam !== undefined
            && v0params.lt <= greaterParam) {
            // we annihilated the valid range during our v0mig
            // transform to skip V1 prefix: return an empty range with
            // a trick instead of an invalid combo
            return { lt: '' };
        }
        return v0migParams;
    }
    const rangeParams1 = {
        lt: DbPrefixes.V1,
    };
    if (v0params.gt !== undefined) {
        rangeParams1.gt = v0params.gt;
    }
    if (v0params.gte !== undefined) {
        rangeParams1.gte = v0params.gte;
    }
    const rangeParams2 = {
        gte: inc(DbPrefixes.V1),
        // tell RepdServer._listObject() that the second listing is to
        // be done after the first, not in parallel
        serial: true,
    };
    if (v0params.lt !== undefined) {
        rangeParams2.lt = v0params.lt;
    }
    return [rangeParams1, rangeParams2];
}

module.exports = {
    checkLimit,
    inc,
    listingParamsMasterKeysV0ToV1,
    listingParamsV0ToV0Mig,
    SKIP_NONE,
    FILTER_END,
    FILTER_SKIP,
    FILTER_ACCEPT,
};
