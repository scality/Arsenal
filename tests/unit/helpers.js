'use strict'; // eslint-disable-line strict

const AuthInfo = require('../../lib/auth/AuthInfo');
const constants = require('../../lib/constants');

function makeid(size) {
    let text = '';
    const possible =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < size; i += 1) {
        text += possible
            .charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

function timeDiff(startTime) {
    const timeArray = process.hrtime(startTime);
    // timeArray[0] is whole seconds
    // timeArray[1] is remaining nanoseconds
    const milliseconds = (timeArray[0] * 1000) + (timeArray[1] / 1e6);
    return milliseconds;
}

function makeAuthInfo(accessKey) {
    const canonicalID = accessKey === constants.publicId ?
        constants.publicId : `${accessKey}canonicalID`;
    return new AuthInfo({
        canonicalID,
        shortid: 'shortid',
        email: `${accessKey}@l.com`,
        accountDisplayName: `${accessKey}displayName`,
    });
}

function createAlteredRequest(alteredItems, objToAlter,
    baseOuterObj, baseInnerObj) {
    const alteredRequest = Object.assign({}, baseOuterObj);
    const alteredNestedObj = Object.assign({}, baseInnerObj);
    Object.keys(alteredItems).forEach(key => {
        alteredNestedObj[key] = alteredItems[key];
    });
    alteredRequest[objToAlter] = alteredNestedObj;
    return alteredRequest;
}

/**
 * Create a zero left padded string with the default length of 15 bytes.
 * The default value represents the estimated average object key length.
 *
 * @param {any} key - the key to be zero padded
 * @param {number} length - the length of the key
 * @return {string} - the zero padded string
 */
function zpad(key, length = 15) {
    return `${'0'.repeat(length + 1)}${key}`.slice(-length);
}

class DummyRequestLogger {

    constructor() {
        this.ops = [];
        this.counts = {
            trace: 0,
            debug: 0,
            info: 0,
            warn: 0,
            error: 0,
            fatal: 0,
        };
        this.defaultFields = {};
    }

    trace(msg) {
        this.ops.push(['trace', [msg]]);
        this.counts.trace += 1;
    }

    debug(msg) {
        this.ops.push(['debug', [msg]]);
        this.counts.debug += 1;
    }

    info(msg) {
        this.ops.push(['info', [msg]]);
        this.counts.info += 1;
    }

    warn(msg) {
        this.ops.push(['warn', [msg]]);
        this.counts.warn += 1;
    }

    error(msg) {
        this.ops.push(['error', [msg]]);
        this.counts.error += 1;
    }

    fatal(msg) {
        this.ops.push(['fatal', [msg]]);
        this.counts.fatal += 1;
    }

    getSerializedUids() {
        return 'dummy:Serialized:Uids';
    }

    addDefaultFields(fields) {
        Object.assign(this.defaultFields, fields);
    }
}

module.exports = { makeid, timeDiff, makeAuthInfo,
                   createAlteredRequest, zpad, DummyRequestLogger };
