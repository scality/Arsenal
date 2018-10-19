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

    put(path, dataStream, size, log, callback) {
        let key;
        if (path) {
            key = this.getFilePath(path);
        } else {
            key = crypto.pseudoRandomBytes(20).toString('hex');
        }
        const filePath = this.getFilePath(key);
        log.debug('starting to write data', { method: 'put', key, filePath });
        dataStream.pause();
        fs.open(filePath, 'wx', (err, fd) => {
            let ret = 0;
            if (err) {
                log.error('error opening filePath',
                        { method: 'put', key, filePath, error: err });
                return callback(errors.InternalError.customizeDescription(
                  `filesystem error: open() returned ${err.code}`));
            }
            const cbOnce = jsutil.once(callback);
          // disable autoClose so that we can close(fd) only after
          // fsync() has been called
            const fileStream = fs.createWriteStream(filePath,
              { fd,
                  autoClose: false });

            fileStream.on('finish', () => {
                function ok() {
                    log.debug('finished writing data',
                            { method: 'put', key, filePath });
                    return cbOnce(null, key);
                }
                if (this.noSync) {
                    fs.close(fd);
                    return ok();
                }
                fs.fsync(fd, err => {
                  /*
                   * Disabling the caching of stored files is
                   * temporary fix for
                   * https://github.com/kubernetes/kubernetes/issues/43916
                   * that causes cache memory to be accounted as RSS memory
                   * for the pod and can potentially cause the pod
                   * to be killed under memory pressure:
                   */
                    ret = posixFadvise(fd, 0, size, 4);
                    if (ret !== 0) {
                        log.warning(
                          `error fadv_dontneed ${filePath} returned ${ret}`);
                    }
                    fs.close(fd);
                    if (err) {
                        log.error('fsync error',
                          { method: 'put', key, filePath,
                              error: err });
                        return cbOnce(
                          errors.InternalError.customizeDescription(
                              'filesystem error: fsync() returned ' +
                                  `${err.code}`));
                    }
                    return ok();
                });
                return undefined;
            }).on('error', err => {
                log.error('error streaming data on write',
                        { method: 'put', key, filePath, error: err });
              // destroying the write stream forces a close(fd)
                fileStream.destroy();
                return cbOnce(errors.InternalError.customizeDescription(
                  `write stream error: ${err.code}`));
            });
            dataStream.resume();
            dataStream.pipe(fileStream);
            dataStream.on('error', err => {
                log.error('error streaming data on read',
                  { method: 'put', key, filePath, error: err });
              // destroying the write stream forces a close(fd)
                fileStream.destroy();
                return cbOnce(errors.InternalError.customizeDescription(
                  `read stream error: ${err.code}`));
            });
            dataStream.on('close', () => {
              // this means the underlying socket has been closed
                log.debug('Client closed socket while streaming',
                        { method: 'put', key, filePath });
              // destroying the write stream forces a close(fd)
                fileStream.destroy();
              // we need to unlink the file ourselves
                fs.unlinkSync(filePath);
            });
            return undefined;
        });
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
