'use strict'; // eslint-disable-line

const fs = require('fs');
const os = require('os');
const assert = require('assert');

function trySetDirSyncFlag(path) {
    // may throw if ioctl is not available
    const ioctl = require('ioctl');

    const GETFLAGS = 2148034049;
    const SETFLAGS = 1074292226;
    const FS_DIRSYNC_FL = 65536;
    const buffer = Buffer.alloc(8, 0);
    const pathFD = fs.openSync(path, 'r');
    const status = ioctl(pathFD, GETFLAGS, buffer);
    assert.strictEqual(status, 0);
    const currentFlags = buffer.readUIntLE(0, 8);
    const flags = currentFlags | FS_DIRSYNC_FL;
    buffer.writeUIntLE(flags, 0, 8);
    const status2 = ioctl(pathFD, SETFLAGS, buffer);
    assert.strictEqual(status2, 0);
    fs.closeSync(pathFD);
    const pathFD2 = fs.openSync(path, 'r');
    const confirmBuffer = Buffer.alloc(8, 0);
    ioctl(pathFD2, GETFLAGS, confirmBuffer);
    assert.strictEqual(confirmBuffer.readUIntLE(0, 8),
        currentFlags | FS_DIRSYNC_FL, 'FS_DIRSYNC_FL not set');
    fs.closeSync(pathFD2);
}


let loggedWarning = false;

module.exports.setDirSyncFlag = function setDirSyncFlag(path, logger) {
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
};
