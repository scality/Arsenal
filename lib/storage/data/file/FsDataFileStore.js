'use strict';

const fs = require('fs');
const path = require('path');
const werelogs = require('werelogs');
const diskusage = require('diskusage');

const errors = require('../../../errors');
const jsutil = require('../../../jsutil');
const storageUtils = require('../../utils');

class FsDataFileStore {
    constructor(dataConfig, logApi) {
        this.logger = new (logApi || werelogs).Logger('FsDataFileStore');
        this.dataPath = dataConfig.dataPath;
        this.noSync = dataConfig.noSync || false;
    }

    setup(callback) {
        fs.access(this.dataPath, fs.F_OK | fs.R_OK | fs.W_OK, err => {
            if (err) {
                this.logger.error('Data path is not readable or writable',
                                { error: err });
                return callback(err);
            }
            if (!this.noSync) {
                storageUtils.setDirSyncFlag(this.dataPath, this.logger);
            }
            return callback();
        });
    }

    getFilePath(key) {
        const absolute = path.resolve(this.dataPath, key);
        if (absolute.startsWith(path.resolve(this.dataPath))) {
            return absolute;
        }
        return '';
    }

    put(dataSteam, size, log, callback) {
        return callback();
    }

    delete(key, log, callback) {
        return callback();
    }

    stat(key, log, callback) {
        const filePath = this.getFilePath(key);
        log.debug('stat file', { key, filePath });
        fs.stat(filePath, (err, stat) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    return callback(errors.ObjNotFound);
                }
                log.error('error on \'stat\' of file',
                        { key, filePath, error: err });
                return callback(errors.InternalError.customizeDescription(
                  `filesystem error: stat() returned ${err.code}`));
            }
            const info = { objectSize: stat.size };
            return callback(null, info);
        });
    }

    getDiskUsage(callback) {
        diskusage.check(this.dataPath, callback);
    }

    get(key, byteRange, log, callback) {
        const filePath = this.getFilePath(key);
        const readStreamOptions = {
            flags: 'r',
            encoding: null,
            fd: null,
            autoClose: true,
        };
        if (byteRange) {
            readStreamOptions.start = byteRange[0];
            readStreamOptions.end = byteRange[1];
        }
        log.debug('opening readStream to get data', {
            method: 'get',
            key, filePath,
            byteRange,
        });
        const cbOnce = jsutil.once(callback);
        const rs = fs.createReadStream(filePath, readStreamOptions)
                  .on('error', err => {
                      if (err.code === 'ENOENT') {
                          return cbOnce(errors.ObjNotFound);
                      }
                      log.error('error retrieving file',
                          { method: 'get', key, filePath,
                              error: err });
                      return cbOnce(
                          errors.InternalError.customizeDescription(
                              `filesystem read error: ${err.code}`));
                  })
                  .on('open', () => { cbOnce(null, rs); });
    }
}

module.exports = FsDataFileStore;
