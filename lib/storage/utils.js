'use strict'; // eslint-disable-line

const fs = require('fs');
const os = require('os');
const assert = require('assert');
const { errorInstances } = require('../errors');

function trySetDirSyncFlag(path) {
    // may throw if ioctl is not available
    const ioctl = require('ioctl');

    const GETFLAGS = 2148034049;
    const SETFLAGS = 1074292226;
    const FS_DIRSYNC_FL = 65536;
    const buffer = Buffer.alloc(4, 0);
    const pathFD = fs.openSync(path, 'r');
    const status = ioctl(pathFD, GETFLAGS, buffer);
    assert.strictEqual(status, 0);
    const currentFlags = buffer.readUInt32LE(0);
    const flags = currentFlags | FS_DIRSYNC_FL;
    buffer.writeUInt32LE(flags, 0);
    const status2 = ioctl(pathFD, SETFLAGS, buffer);
    assert.strictEqual(status2, 0);
    fs.closeSync(pathFD);
    const pathFD2 = fs.openSync(path, 'r');
    const confirmBuffer = Buffer.alloc(4, 0);
    ioctl(pathFD2, GETFLAGS, confirmBuffer);
    assert.strictEqual(confirmBuffer.readUInt32LE(0),
        currentFlags | FS_DIRSYNC_FL, 'FS_DIRSYNC_FL not set');
    fs.closeSync(pathFD2);
}


let loggedWarning = false;

function setDirSyncFlag(path, logger) {
    const warning =
              'WARNING: Synchronization directory updates are not ' +
              'supported on this platform. Newly written data could ' +
              'be lost if your system crashes before the operating ' +
              'system is able to write directory updates.';
    let doLog = false;
    let error;

    if (os.type() === 'Linux' && os.endianness() === 'LE') {
        try {
            trySetDirSyncFlag(path);
        } catch (err) {
            doLog = !loggedWarning;
            error = err;
        }
    } else {
        doLog = !loggedWarning;
    }
    if (doLog) {
        if (error) {
            logger.warn(warning, { error: error.message,
                errorStack: error.stack });
        } else {
            logger.warn(warning);
        }
        loggedWarning = true;
    }
}

// custom serializer function for JSON stringify to avoid circular JSON error
// this code is a modified version of json-stringify-safe npm package found at
// https://github.com/moll/json-stringify-safe/blob/master/stringify.js
function serializeCircJSON() {
    const stack = [];
    const keys = [];

    function cycleReplacer(value) {
        if (stack[0] === value) {
            return '[Circular ~]';
        }
        return '[Circular ~. ' +
            `${keys.slice(0, stack.indexOf(value)).join('.')}]`;
    }

    return function parseJSON(key, value) {
        if (stack.length > 0) {
            const thisPos = stack.indexOf(this);
            if (~thisPos) {
                stack.splice(thisPos + 1);
                keys.splice(thisPos, Infinity, key);
            } else {
                stack.push(this);
                keys.push(key);
            }
            if (~stack.indexOf(value)) {
                // eslint-disable-next-line no-param-reassign
                value = cycleReplacer.call(this, key, value);
            }
        } else {
            stack.push(value);
        }
        return value;
    };
}

/**
 * Get disk usage information using Node.js native fs.statfs function
 * 
 * @param {String} path - Path to check disk usage for
 * @param {Function} callback - Callback to return result
 * @return {undefined}
 */
function getDiskUsage(path, callback) {
    if (typeof fs.statfs !== 'function') {
        return callback(errorInstances.InternalError
            .customizeDescription('fs.statfs is not available on this system'));
    }

    fs.statfs(path, (err, stats) => {
        if (err) {
            return callback(err);
        }
        
        const result = {
            available: stats.bavail * stats.bsize,
            free: stats.bfree * stats.bsize,
            total: stats.blocks * stats.bsize
        };
        
        return callback(null, result);
    });
}

module.exports = {
    setDirSyncFlag,
    serializeCircJSON,
    getDiskUsage,
};
